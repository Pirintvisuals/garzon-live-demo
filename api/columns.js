/*
 * POST /api/columns
 * Ismeretlen szerkezetű táblázat: a modell csak azt mondja meg, melyik sor a fejléc és melyik oszlop mit tartalmaz.
 * A tételeket ezután a böngésző olvassa ki a táblázatból, változtatás nélkül.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön táblázatok szerkezetét ismeri fel. Kap egy Excel munkafüzet munkalapjainak első sorait (soronként a cellák, az oszlopok 0-tól számozva, a sorok 0-tól számozva).
A feladat munkalaponként eldönteni, hogy az tételjegyzék-e (bútor, berendezés, belsőépítészeti vagy kivitelezési tételek listája mennyiséggel), és ha igen, megadni a szerkezetét.

Szabályok:
- van_tetel: igaz, ha a munkalapon tételek listája van megnevezéssel és mennyiséggel. Fedlap, összesítő, útmutató, üres lap: hamis.
- fejlec_sor: annak a sornak a száma, amelyben az oszlopfejlécek vannak. Ha a fejléc két sorból áll, az alsó sor száma.
- oszlop_megnevezes: a tétel megnevezésének oszlopa.
- oszlop_mennyiseg: a mennyiség (darabszám) oszlopa. Ha több mennyiség oszlop van (például szintenként), az összesen oszlop.
- oszlop_egyseg: a mennyiségi egység oszlopa, ha nincs, -1.
- oszlop_sorszam: a tétel sorszámának vagy kódjának oszlopa, ha nincs, -1.
- oszlopok_leiras: minden olyan oszlop, amely a tétel műszaki tartalmát írja le (leírás, méret, szélesség, mélység, magasság, anyag, felület, szín, élzárás, vasalat, rajzszám, megjegyzés, helyiség). Ár, érték, ÁFA és az ajánlattevő által kitöltendő oszlopok NEM tartoznak ide.
- Ha valami nem található, -1 vagy üres tömb. Csak a kapott sorokból dolgozzon.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    lapok: S.arr({
      type: 'OBJECT',
      properties: {
        nev: S.str, van_tetel: { type: 'BOOLEAN' }, fejlec_sor: S.int,
        oszlop_sorszam: S.int, oszlop_megnevezes: S.int, oszlop_mennyiseg: S.int, oszlop_egyseg: S.int,
        oszlopok_leiras: { type: 'ARRAY', items: S.int }
      },
      required: ['nev', 'van_tetel', 'fejlec_sor', 'oszlop_sorszam', 'oszlop_megnevezes', 'oszlop_mennyiseg', 'oszlop_egyseg', 'oszlopok_leiras']
    })
  },
  required: ['lapok']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const sheets = (req.body && req.body.sheets) || [];
    if (!sheets.length || sheets.length > 40) return res.status(400).json({ error: 'A kérésben 1 és 40 közötti munkalap lehet.' });
    const user = sheets.map(s => 'MUNKALAP: ' + s.name + '\n' + (s.rows || []).slice(0, 40).map((r, i) => i + ': ' + JSON.stringify(r)).join('\n')).join('\n\n');
    const out = await gemini({ system: SYSTEM, user, schema: SCHEMA, thinking: 'low', maxOutputTokens: 8000 });
    res.status(200).json({ lapok: out.data.lapok || [], model: out.model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
