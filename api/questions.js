/*
 * POST /api/questions
 * A kolléga által jóváhagyott hibákból (és a saját, kézzel felvett észrevételeiből) kérdéseket ír a levélhez.
 * Csak a megkapott problémákra kérdez: új hibát nem talál ki. Az azonos dologra vonatkozó problémákat egy kérdésbe vonja.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön egy magyar bútorgyártó cég árajánlatadója. A kollégája átnézte egy ajánlatkérés lehetséges hibáit, és jóváhagyta azokat, amelyek valóban tisztázandók; néhányat saját maga vett fel.
Feladat: írjon ezekből kérdéseket a címzettnek, egy hivatalos levélbe.

Szabályok:
- Csak a megkapott problémákra kérdezzen. Új problémát ne találjon ki, és egyet se hagyjon ki.
- Ha több probléma ugyanarra a dologra vonatkozik (ugyanaz a tétel és ugyanaz a kérdés), vonja össze egy kérdésbe.
- Minden kérdés önállóan érthető legyen: nevezze meg a tételt (sorszám, alaprajzi jel vagy megnevezés, ahogy a problémánál szerepel), mondja ki röviden az eltérést, és kérdezze meg, melyik az irányadó, vagy kérje a hiányzó adatot.
- Udvarias, hivatalos magyar megfogalmazás ("Kérjük megerősíteni…", "Kérjük megadni…"). Megszólítás, aláírás és köszönés nélkül: csak a kérdések.
- Sorrend: elöl azok, amelyek az árat leginkább érintik (mennyiség, méret, hiányzó tétel), a végén a pontosítások.
- forras: azoknak a problémáknak az azonosítói, amelyekből a kérdés készült.
A válasz nyelve magyar.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    kerdesek: S.arr({
      type: 'OBJECT',
      properties: { kerdes: S.str, forras: S.arr(S.str) },
      required: ['kerdes', 'forras'],
      propertyOrdering: ['kerdes', 'forras']
    })
  },
  required: ['kerdesek']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const b = req.body || {};
    const list = b.problems || [];
    if (!list.length || list.length > 120) return res.status(400).json({ error: 'Egy kérésben 1 és 120 közötti probléma küldhető.' });
    const cut = (x, n) => String(x || '').slice(0, n);
    const cimzett = b.cimzett === 'gk'
      ? 'A címzett a generálkivitelező: a kérdések az árazás előtti tisztázást szolgálják (a rajz, a konszignáció és a tételjegyzék eltérései, hiányzó adatok).'
      : 'A címzett az ajánlatkérő: a kérdések kiegészítő tájékoztatás-kérésként mennek ki egy közbeszerzési eljárásban.';
    const user = `${cimzett}\nPROJEKT: ${cut(b.projekt, 200)}\n\nJÓVÁHAGYOTT PROBLÉMÁK:\n\n` +
      list.map(p => `[${cut(p.id, 40)}] (${cut(p.forras, 30)})\nTÉTEL: ${cut(p.tetel, 300) || 'általános'}\nPROBLÉMA: ${cut(p.cim, 200)}${p.leiras ? ' – ' + cut(p.leiras, 700) : ''}${p.idezet ? '\nIDÉZET: ' + cut(p.idezet, 300) : ''}`).join('\n\n');
    const out = await gemini({ system: SYSTEM, user, schema: SCHEMA, thinking: 'low', maxOutputTokens: 12000, tier: 'strong' });
    res.status(200).json({ kerdesek: (out.data.kerdesek || []).filter(q => q && q.kerdes && q.kerdes.trim()), model: out.model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
