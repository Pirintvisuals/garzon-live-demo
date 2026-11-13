/*
 * POST /api/tender
 * A kiírás szöveges dokumentumának feldolgozása a tételjegyzékkel együtt:
 * vezetői összefoglaló, a dokumentum és a tételjegyzék összevetése, tisztázó kérdések.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön egy magyar bútor- és fémipari gyártó, belsőépítészeti kivitelező cég ajánlat-előkészítő munkatársa.
Kap egy ajánlatkérési (közbeszerzési vagy generálkivitelezői) dokumentumot és a hozzá tartozó tételjegyzéket.
Három dolgot készít elő a cégvezetésnek és az árajánlatadónak.

1. osszefoglalo: egyoldalas vezetői összefoglaló arról, érdemes-e és milyen feltételekkel ajánlatot adni.
   A "feltetelek" tömbben minden, az árat vagy a kockázatot érintő feltétel külön sor (például: ajánlattételi határidő, teljesítési határidő, teljesítés helye, fizetési feltétel, előleg, kötbér, jótállás, értékelési szempont, részajánlat, szállítás és szerelés, kötelező igazolások, minták, alkalmassági követelmény).
   A "kockazatok" tömbben azok a pontok, amelyek egy gyártó cégnek pénzbe vagy kockázatba kerülnek (rövid határidő, magas kötbér, előleg hiánya, sok helyszín, bizonytalan műszaki tartalom).
2. ellenorzes: a dokumentum és a tételjegyzék összevetése. Olyan megállapítások, ahol
   - a dokumentum olyan követelményt ír elő, amelyet a tételek leírása nem tartalmaz, vagy amely több tétel árát érinti;
   - a dokumentum és a tételjegyzék eltér egymástól (darabszám, részek száma, megnevezés, műszaki tartalom);
   - azonos terméknek látszó tételek leírása a tételjegyzéken belül eltér (például más lapvastagság, más szelvény, más méret ugyanarra a korcsoportra);
   - a tételjegyzék valamit nem határoz meg, amit a dokumentum sem pótol.
   Csak érdemi, az árat, a gyártást vagy az ajánlat érvényességét érintő megállapítást írjon. Ne ismételje a tételenkénti elírásokat.
3. kerdesek: az ajánlatkérőnek elküldhető kiegészítő tájékoztatás-kérés kérdései, udvarias, hivatalos magyar megfogalmazásban, önállóan érthetően.

Szigorú szabályok:
- Csak azt állítsa, ami a kapott szövegekben szerepel. Ne találjon ki adatot, dátumot, összeget, jogszabályhelyet.
- Minden feltételhez, kockázathoz és megállapításhoz adjon "idezet" mezőt: szó szerinti, változtatás nélküli, legfeljebb 200 karakteres részlet a dokumentumból. Ha a megállapítás a tételjegyzéken alapul, az idezet a tétel leírásából származzon, és az "erintett_tetelek" mezőben sorolja fel a tételek id-ját.
- Ha valamit nem talál a dokumentumban (például nincs ajánlattételi határidő), ne írja be feltételként; ha fontos, tegye fel kérdésként.
- A válasz nyelve magyar, tömör, szakmai. Kötőjeles gondolatjelet ne használjon.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    osszefoglalo: {
      type: 'OBJECT',
      properties: {
        targy: S.str,
        ajanlatkero: S.str,
        eljaras: { type: 'STRING', description: 'Az eljárás típusa és azonosítója, ha szerepel' },
        rovid_leiras: { type: 'STRING', description: 'Két-három mondat: mit kérnek, hány részben, hová' },
        feltetelek: S.arr({
          type: 'OBJECT',
          properties: { nev: S.str, ertek: S.str, idezet: S.str },
          required: ['nev', 'ertek', 'idezet']
        }),
        kockazatok: S.arr({
          type: 'OBJECT',
          properties: { cim: S.str, leiras: S.str, sulyossag: { type: 'STRING', enum: ['magas', 'kozepes', 'alacsony'] }, idezet: S.str },
          required: ['cim', 'leiras', 'sulyossag', 'idezet']
        }),
        csatolando: { type: 'ARRAY', items: S.str, description: 'Az ajánlathoz csatolandó dokumentumok, nyilatkozatok listája' }
      },
      required: ['targy', 'ajanlatkero', 'rovid_leiras', 'feltetelek', 'kockazatok', 'csatolando']
    },
    ellenorzes: S.arr({
      type: 'OBJECT',
      properties: {
        cim: S.str,
        leiras: S.str,
        tipus: { type: 'STRING', enum: ['dokumentum_kovetelmeny', 'elteres', 'tetelek_kozti_elteres', 'meghatarozatlan'] },
        sulyossag: { type: 'STRING', enum: ['magas', 'kozepes', 'alacsony'] },
        forras: { type: 'STRING', enum: ['dokumentum', 'tetelegyzek'] },
        idezet: S.str,
        erintett_tetelek: { type: 'ARRAY', items: S.str }
      },
      required: ['cim', 'leiras', 'tipus', 'sulyossag', 'forras', 'idezet', 'erintett_tetelek']
    }),
    kerdesek: S.arr({
      type: 'OBJECT',
      properties: { kerdes: S.str, miert: S.str, erintett_tetelek: { type: 'ARRAY', items: S.str } },
      required: ['kerdes', 'miert', 'erintett_tetelek']
    })
  },
  required: ['osszefoglalo', 'ellenorzes', 'kerdesek']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { docText, docName, items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Nincs tétel a kérésben.' });
    const doc = String(docText || '').slice(0, 400000);
    const list = items.map(i => `[${i.id}] ${i.part} | ${i.name} | ${i.qty} ${i.unit} | ${i.spec}`).join('\n');
    const user = (doc
      ? 'AJÁNLATKÉRÉSI DOKUMENTUM (' + (docName || 'dokumentum') + '):\n"""\n' + doc + '\n"""\n\n'
      : 'Szöveges dokumentum nem érkezett, csak a tételjegyzék. Az összefoglalót és az ellenőrzést a tételjegyzék alapján készítse, az idézetek a tételek leírásából származzanak.\n\n') +
      'TÉTELJEGYZÉK (soronként: [id] rész | megnevezés | mennyiség | leírás):\n' + list;
    const out = await gemini({ system: SYSTEM, user, schema: SCHEMA, maxOutputTokens: 40000 });
    res.status(200).json({ ...out.data, model: out.model, usage: out.usage });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
