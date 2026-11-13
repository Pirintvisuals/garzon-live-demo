/*
 * POST /api/revision
 * Módosított tételek: mi változott, és érinti-e az árat vagy a gyártást. A változást a kód találja meg;
 * a modell csak összefoglalja a régi és az új szöveg különbségét.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön egy magyar bútor- és fémipari gyártó cég árajánlatadója. Az ajánlatkérő módosított tételjegyzéket adott ki.
Minden tételhez megkapja a régi és az új változatot. Feladat tételenként:
- mi_valtozott: egy rövid mondat, konkrét értékekkel (például: "Szélesség 70 cm helyett 100-110 cm." vagy "A lábak színe: a piros kikerült, fekete vagy fém szín maradt."). Csak azt írja, ami ténylegesen eltér a két szöveg között.
- arat_erinti: "igen", ha a változás anyagot, méretet, mennyiséget, szerkezetet vagy munkát érint; "nem", ha csak pontosítás, elírásjavítás vagy szövegezés, ami a már helyesen értelmezett tartalmat nem változtatja; "lehet", ha a hatás a gyártótól függ (például több választható megoldás).
- indok: egy rövid mondat, miért.
Ne találjon ki semmit, ami a két szövegben nincs. A válasz nyelve magyar. Minden kapott tételhez pontosan egy elemet adjon vissza, ugyanazzal az id-val.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    valtozasok: S.arr({
      type: 'OBJECT',
      properties: { id: S.str, mi_valtozott: S.str, arat_erinti: { type: 'STRING', enum: ['igen', 'nem', 'lehet'] }, indok: S.str },
      required: ['id', 'mi_valtozott', 'arat_erinti', 'indok']
    })
  },
  required: ['valtozasok']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const list = (req.body && req.body.changes) || [];
    if (!list.length || list.length > 20) return res.status(400).json({ error: 'Egy kérésben 1 és 20 közötti tétel küldhető.' });
    const user = list.map(c => `[${c.id}] ${c.name}\nRÉGI: ${String(c.before || '').slice(0, 4000)}\nÚJ: ${String(c.after || '').slice(0, 4000)}`).join('\n\n');
    const out = await gemini({ system: SYSTEM, user, schema: SCHEMA, thinking: 'low', maxOutputTokens: 8000 });
    res.status(200).json({ valtozasok: out.data.valtozasok || [], model: out.model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
