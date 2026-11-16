/*
 * POST /api/score
 * Második, szkeptikus kör: az első körben felvetett lehetséges hibákat egy külön hívás pontozza újra,
 * hogy a valószínűség ne a felvető lelkesedését tükrözze. Új hibát nem vesz fel, csak értékel.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön egy tapasztalt magyar bútorgyártó cég vezető árajánlatadója, aki egy kolléga által felvetett lehetséges hibákat ellenőriz egy ajánlatkérésben.
Minden felvetésnél megkapja: mit állít a kolléga, a szó szerinti idézetet, a tétel vagy a dokumentum vonatkozó szövegét, és a legjobb ártatlan magyarázatot.
Feladat: adjon "valoszinuseg" értéket (0-100): mennyire valószínű, hogy ez tényleg hiba vagy olyan kétértelműség, amit az ajánlatkérőtől meg kell kérdezni, mert a válasz az árat érinti.

Legyen szkeptikus. A kollégák hajlamosak túlbecsülni. Kalibrálás:
- 90-100: fizikailag lehetetlen, nyilvánvaló mértékegység-elírás, a megnevezés és a leírás egyértelműen más terméket mond, hivatkozott melléklet hiányzik. Ártatlan magyarázat nincs.
- 60-89: valódi kétértelműség, amit tisztázni kell, és az ártatlan magyarázat kevésbé valószínű.
- 30-59: az ártatlan magyarázat is hihető; érdemes megnézni.
- 0-29: inkább nem hiba (szokásos megfogalmazás, a kiírás szándékosan enged választást, a két adat a bútor más részére vonatkozik, egyértelmű kötelezettség, ami csak teendő).
Mintaértékek:
- 70 cm széles szekrénybe 3 oszlop műanyag fiók: 90.
- Polc mélysége 600 cm, a sáv 550-700 mm: 95.
- Megnevezés „Fotel”, leírás „3 személyes kanapé”: 90.
- Leírás „szövettel kárpitozva”, szín „műbőr-türkíz”: 45 (a szín oszlop gyakran a színkártya nevét adja; meg kell kérdezni, de nem biztos hiba).
- Leírás „laminált bútorlap”, szín „Fémváz: RAL 1015”: 15.
- Szűk, de nem lehetetlen méret: 45-65.
- Saját becslésre (például „egy dosszié kb. 320 mm”) épülő állítás: legfeljebb 65, hacsak a számolás minden adata a szövegben szerepel.
- Számolási állítás: számolja újra; ha a számolás helyes és nincs ellentmondás, 0-10.
indok: egy rövid mondat, miért ennyi. A válasz nyelve magyar. Minden kapott felvetéshez pontosan egy elemet adjon vissza, ugyanazzal az id-val.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    pontok: S.arr({
      type: 'OBJECT',
      properties: { id: S.str, indok: S.str, valoszinuseg: S.int },
      required: ['id', 'indok', 'valoszinuseg'],
      propertyOrdering: ['id', 'indok', 'valoszinuseg']
    })
  },
  required: ['pontok']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const list = (req.body && req.body.findings) || [];
    if (!list.length || list.length > 80) return res.status(400).json({ error: 'Egy kérésben 1 és 80 közötti felvetés küldhető.' });
    const cut = (x, n) => String(x || '').slice(0, n);
    const user = list.map(f => `[${f.id}]\nFELVETÉS: ${cut(f.allitas, 600)}\nIDÉZET: ${cut(f.idezet, 300)}\nSZÖVEG: ${cut(f.kontextus, 2500)}\nÁRTATLAN MAGYARÁZAT: ${cut(f.ha_megsem_hiba, 400)}`).join('\n\n');
    const out = await gemini({ system: SYSTEM, user, schema: SCHEMA, thinking: 'medium', maxOutputTokens: 16000 });
    res.status(200).json({ pontok: out.data.pontok || [], model: out.model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
