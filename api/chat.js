/*
 * POST /api/chat
 * Kérdés a feltöltött kiírásról. A válasz csak a kapott dokumentumokból és a tételjegyzékből származhat,
 * szó szerinti idézettel. Ha a válasz nincs a fájlokban, a modell ezt megmondja, és segít továbblépni.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön egy magyar bútor- és fémipari gyártó cég ajánlat-előkészítő munkatársa. Egy kolléga kérdez egy ajánlatkérésről.
Megkapja az ajánlatkérés dokumentumait és a tételjegyzéket. Válaszoljon a kérdésre röviden, érthetően, magyarul.

Szigorú szabályok:
- Csak abból válaszoljon, ami a kapott dokumentumokban vagy a tételjegyzékben szerepel. Saját tudásból, feltételezésből ne állítson semmit a kiírásról.
- Ha a válasz megtalálható: "talalt" igaz, a "valasz" 1-4 mondat, konkrét értékekkel. Az "idezetek" tömbbe tegye azokat a szó szerinti, változtatás nélküli, egyenként legfeljebb 200 karakteres részleteket, amelyekre a válasz épül (1-3 darab). Dokumentumból vett idézetnél a forras "dokumentum"; tételből vett idézetnél a forras "tetelegyzek" és a tetel_id a tétel azonosítója.
- Ha a kérdés tételek megszámolását vagy mennyiségek összeadását kéri (például hány darab szék van összesen): NE adjon össze, és ne írjon végösszeget a válaszba, mert az összeadást a program végzi el. A "szamolt_tetelek" mezőben sorolja fel az összes érintett tétel id-ját, a "valasz" mezőben pedig csak azt írja le egy mondatban, milyen tételeket vett figyelembe.
- Tételből vett idézet a tétel megnevezésének vagy leírásának egy részlete legyen, ne a teljes sor az azonosítóval.
- Ha a válasz NEM található meg a kapott fájlokban: "talalt" hamis. Ne hagyja magára a kérdezőt:
  - a "valasz" mezőben mondja meg egyszerűen, hogy erről a feltöltött fájlok nem rendelkeznek;
  - a "javaslat" mezőben segítsen: mi a legközelebbi kapcsolódó információ, amit talált (ha van, idézettel az idezetek között), és hol érdemes keresni (például a kiírás másik dokumentumában, amely nincs feltöltve), vagy miért fontos ezt tisztázni árazás előtt;
  - a "kerdes_az_ajanlatkeronek" mezőbe írjon egy kész, udvarias, hivatalos kérdést, amelyet el lehet küldeni az ajánlatkérőnek (megszólítás és elköszönés nélkül).
- Ha a kérdés nem az ajánlatkérésről szól, kedvesen jelezze, hogy ebben a kiírás tartalmával tud segíteni, és ajánljon egy idevágó kérdést a "javaslat" mezőben.
- A dokumentum szövegében a "##### FÁJL: ... #####" és "##### OLDAL n #####" sorok csak jelölők, ne idézze őket.
- Kötőjeles gondolatjelet ne használjon.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    talalt: { type: 'BOOLEAN' },
    valasz: S.str,
    idezetek: S.arr({
      type: 'OBJECT',
      properties: { idezet: S.str, forras: { type: 'STRING', enum: ['dokumentum', 'tetelegyzek'] }, tetel_id: S.str },
      required: ['idezet', 'forras']
    }),
    szamolt_tetelek: { type: 'ARRAY', items: S.str },
    javaslat: S.str,
    kerdes_az_ajanlatkeronek: S.str
  },
  required: ['talalt', 'valasz', 'idezetek']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { question, docText, items, history } = req.body || {};
    const q = String(question || '').trim().slice(0, 600);
    if (!q) return res.status(400).json({ error: 'Hiányzik a kérdés.' });
    const doc = String(docText || '').slice(0, 400000);
    const list = (Array.isArray(items) ? items : []).slice(0, 600).map(i => `[${i.id}] ${i.part} | ${i.name} | ${i.qty} ${i.unit} | ${i.spec}`).join('\n');
    const prev = (Array.isArray(history) ? history : []).slice(-3).map(h => `Kérdés: ${String(h.q).slice(0, 300)}\nVálasz: ${String(h.a).slice(0, 500)}`).join('\n\n');
    const stable = (doc ? 'AZ AJÁNLATKÉRÉS DOKUMENTUMAI:\n"""\n' + doc + '\n"""\n\n' : 'Szöveges dokumentum nincs feltöltve, csak a tételjegyzék.\n\n') +
      'TÉTELJEGYZÉK (soronként: [id] rész | megnevezés | mennyiség | leírás):\n' + list;
    const user = (prev ? '\n\nA BESZÉLGETÉS EDDIG:\n' + prev : '') + '\n\nA KOLLÉGA KÉRDÉSE: ' + q;
    // A csevegés olcsóbb, gyorsabb modellel fut (Gemini Flash); Claude esetén a gyors modell dolgozik.
    const out = await gemini({ system: SYSTEM, stable, user, schema: SCHEMA, thinking: 'low', maxOutputTokens: 4000, modelOverride: process.env.GEMINI_CHAT_MODEL || 'gemini-3-flash-preview' });
    res.status(200).json({ ...out.data, model: out.model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
