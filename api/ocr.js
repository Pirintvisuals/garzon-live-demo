/*
 * POST /api/ocr
 * Szkennelt (szövegréteg nélküli) oldalak átírása szöveggé. Csak átírás: a modell nem értelmez és nem foglal össze.
 * A böngésző az oldalakat képként, néhány oldalas adagokban küldi, hogy az adagok párhuzamosan fussanak.
 */
const { guard, gemini } = require('./_lib');

const SYSTEM = `Ön szkennelt dokumentum oldalait írja át szöveggé. Írja át a kapott oldalképek teljes szövegét pontosan, szó szerint, magyarul, ahogy a lapokon áll.
Szabályok:
- Ne foglaljon össze, ne hagyjon ki, ne javítson, ne egészítsen ki semmit.
- Minden oldal elé tegyen egy külön sort pontosan ebben a formában: ##### OLDAL n ##### (n az oldalkép előtt megadott oldalszám).
- Bekezdésenként új sor. Táblázat sorait egy sorba írja, a cellákat " | " jellel elválasztva.
- Fejlécet, láblécet, oldalszámot, bélyegzőt, aláírást ne írjon át.
- Csak az átírt szöveget adja vissza, megjegyzés nélkül.`;

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const pages = (req.body && req.body.pages) || [];
    if (!pages.length || pages.length > 6) return res.status(400).json({ error: 'Egy kérésben 1 és 6 közötti oldal küldhető.' });
    if (pages.reduce((s, p) => s + String(p.data || '').length, 0) > 4000000) return res.status(413).json({ error: 'Az oldalképek túl nagyok.' });
    const parts = [];
    for (const p of pages) {
      parts.push({ text: 'Oldalszám: ' + Number(p.n) });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: String(p.data) } });
    }
    // Az átíráshoz gyorsabb modell is elég; ha a megadott név nem létezik, a közös kód az alapértelmezettre vált.
    const out = await gemini({ system: SYSTEM, json: false, thinking: 'low', maxOutputTokens: 16000, parts, modelOverride: process.env.GEMINI_OCR_MODEL || 'gemini-3-flash-preview' });
    res.status(200).json({ text: out.data, model: out.model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
