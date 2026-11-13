/*
 * POST /api/items
 * Egy rész (munkalap) tételeinek értelmezése. A tételek szövegét a böngésző olvassa ki a táblázatból,
 * a modell csak oszlopokra bontja és besorolja. Mennyiséget, sorszámot a modell nem ad vissza.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön egy magyar bútor- és fémipari gyártó, belsőépítészeti kivitelező cég ajánlat-előkészítő munkatársa.
A feladat: egy ajánlatkérés tételjegyzékének tételeit oszlopokra bontani és besorolni, hogy az árajánlatadó azonnal árazni tudjon.

Szabályok:
- Csak azt írja le, ami a tétel szövegében szerepel. Semmit ne találjon ki, ne egészítsen ki szakmai feltételezéssel. Ami nincs megadva, az üres szöveg vagy 0.
- Méretek milliméterben, egész számként. A szöveg gyakran cm-ben adja meg, ezt váltsa át. Ha a méretek sorrendje (magasság, szélesség, mélység) a szövegből nem egyértelmű, vagy a megadott sorrend láthatóan nem illik a bútorra, jelezze észrevételként, és a legvalószínűbb értelmezést adja meg alacsonyabb biztonsággal.
- gyarto (ki készíti):
  "fa" = lapanyagból készülő bútor (laminált bútorlap, MDF, furnér): szekrény, polc, pult, lapvázas asztal.
  "fem" = tisztán fémszerkezet (cső- vagy zártszelvény váz, lemez), faipari rész nélkül.
  "fa_fem" = fémváz és lapanyag együtt (például csővázas asztal bútorlap lappal, fémvázas szék rétegelt lemez ülőlappal).
  "karpit" = kárpitozott tétel, ahol a kárpitos munka a meghatározó.
  "beszallitoi" = jellemzően készen vásárolt kereskedelmi termék (forgószék gázrugóval, műanyag szék, tábla, szőnyeg, gép, lámpa).
- gyarto_indok: egy rövid mondat, a tétel szövegére hivatkozva.
- biztonsag: 0-100, mennyire egyértelmű a tétel leírása az árazáshoz.
- eszrevetelek: csak valódi, az árazást érintő gond. Típusok:
  "ellentmondas" = a szöveg önmagának mond ellent (két eltérő méret, anyag vagy vastagság).
  "hiany" = árazáshoz szükséges adat hiányzik (méret, anyag, vastagság, szín, mennyiségi egység).
  "pontatlan" = elírás, értelmezhetetlen vagy kétértelmű megfogalmazás.
  Minden észrevételhez adjon "idezet" mezőt: szó szerinti, változtatás nélküli részlet a tétel szövegéből (legfeljebb 120 karakter). Hiány esetén az idezet lehet üres.
- Ha a tétel leírása rendben van, az eszrevetelek üres tömb.
- A válasz nyelve magyar. Minden kapott tételhez pontosan egy elemet adjon vissza, ugyanazzal az id-val.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    tetelek: S.arr({
      type: 'OBJECT',
      properties: {
        id: S.str,
        kategoria: { type: 'STRING', description: 'Rövid terméktípus, például: szék, asztal, szekrény, polc, pad, tábla, fogas, egyéb' },
        szelesseg_mm: S.int, melyseg_mm: S.int, magassag_mm: S.int,
        meret_megjegyzes: S.str,
        anyag: { type: 'STRING', description: 'Fő anyagok vastagsággal, ahogy a szövegben áll' },
        vaz: { type: 'STRING', description: 'Fémváz leírása (szelvény, felületkezelés), ha van' },
        szin: S.str,
        elzaras: S.str,
        vasalat: { type: 'STRING', description: 'Zár, pánt, fogantyú, görgő, végzáró stb.' },
        karpit: S.str,
        gyarto: { type: 'STRING', enum: ['fa', 'fem', 'fa_fem', 'karpit', 'beszallitoi'] },
        gyarto_indok: S.str,
        biztonsag: S.int,
        eszrevetelek: S.arr({
          type: 'OBJECT',
          properties: { tipus: { type: 'STRING', enum: ['ellentmondas', 'hiany', 'pontatlan'] }, szoveg: S.str, idezet: S.str },
          required: ['tipus', 'szoveg', 'idezet']
        })
      },
      required: ['id', 'kategoria', 'szelesseg_mm', 'melyseg_mm', 'magassag_mm', 'anyag', 'gyarto', 'gyarto_indok', 'biztonsag', 'eszrevetelek']
    })
  },
  required: ['tetelek']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { part, items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Nincs tétel a kérésben.' });
    if (items.length > 80) return res.status(400).json({ error: 'Egy kérésben legfeljebb 80 tétel küldhető.' });
    const user = 'Rész: ' + (part || '') + '\n\nTételek (JSON):\n' +
      JSON.stringify(items.map(i => ({ id: i.id, megnevezes: i.name, leiras: i.spec, mennyiseg: i.qty, egyseg: i.unit })), null, 1);
    const out = await gemini({ system: SYSTEM, user, schema: SCHEMA });
    res.status(200).json({ tetelek: out.data.tetelek || [], model: out.model, usage: out.usage });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
