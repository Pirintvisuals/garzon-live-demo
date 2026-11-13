/*
 * POST /api/ocr
 * Szkennelt (szövegréteg nélküli) PDF átírása szöveggé. Csak átírás: a modell nem értelmez és nem foglal össze.
 */
const { guard, gemini } = require('./_lib');

const SYSTEM = `Ön szkennelt dokumentumot ír át szöveggé. Írja át a kapott PDF teljes szövegét pontosan, szó szerint, magyarul, ahogy a lapokon áll.
Szabályok:
- Ne foglaljon össze, ne hagyjon ki, ne javítson, ne egészítsen ki semmit.
- Minden oldal elé tegyen egy külön sort pontosan ebben a formában: ##### OLDAL n ##### (n az oldal sorszáma 1-től).
- Bekezdésenként új sor. Táblázat sorait egy sorba írja, a cellákat " | " jellel elválasztva.
- Fejlécet, láblécet, oldalszámot, bélyegzőt, aláírást ne írjon át.
- Csak az átírt szöveget adja vissza, megjegyzés nélkül.`;

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { data, name } = req.body || {};
    if (!data || typeof data !== 'string') return res.status(400).json({ error: 'Hiányzik a fájl.' });
    if (data.length > 4300000) return res.status(413).json({ error: 'A szkennelt PDF túl nagy a szövegfelismeréshez (legfeljebb kb. 3 MB).' });
    const out = await gemini({
      system: SYSTEM, json: false, thinking: 'low', maxOutputTokens: 60000,
      parts: [{ inlineData: { mimeType: 'application/pdf', data } }, { text: 'Írja át a csatolt dokumentumot (' + (name || 'dokumentum') + ').' }]
    });
    res.status(200).json({ text: out.data, model: out.model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
