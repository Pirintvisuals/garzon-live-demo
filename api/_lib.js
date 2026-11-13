/*
 * Közös segédfüggvények a két végponthoz (a fájlnév aláhúzással kezdődik, ezért a Vercel nem teszi ki útvonalként).
 * Alapelv: a kód olvas és számol, a modell csak értelmez. A modell minden állításához szó szerinti idézetet kérünk,
 * amit a böngészőben a forrásszöveggel összevetünk.
 */
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

function guard(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Csak POST kérés.' }); return false; }
  const pw = process.env.DEMO_PASSWORD;
  if (pw && req.headers['x-demo-key'] !== pw) { res.status(401).json({ error: 'Hibás jelszó.' }); return false; }
  if (!process.env.GEMINI_API_KEY) { res.status(500).json({ error: 'Nincs beállítva a GEMINI_API_KEY környezeti változó.' }); return false; }
  return true;
}

async function gemini({ system, user, schema, maxOutputTokens = 32000 }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema }
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(API + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(body)
      });
      const txt = await r.text();
      if (!r.ok) {
        const err = new Error('Gemini hiba ' + r.status + ': ' + txt.slice(0, 400));
        err.retry = r.status === 429 || r.status >= 500;
        throw err;
      }
      const j = JSON.parse(txt);
      const cand = j.candidates && j.candidates[0];
      const out = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
      if (!out) throw Object.assign(new Error('Üres válasz a modelltől (' + ((cand && cand.finishReason) || 'ismeretlen ok') + ').'), { retry: true });
      return { data: JSON.parse(out), model, usage: j.usageMetadata || null };
    } catch (e) {
      lastErr = e;
      if (e.retry === false || attempt === 2) break;
      if (e.retry === undefined && !(e instanceof SyntaxError)) break;
      await new Promise(ok => setTimeout(ok, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const S = { str: { type: 'STRING' }, int: { type: 'INTEGER' }, arr: items => ({ type: 'ARRAY', items }) };

module.exports = { guard, gemini, S };
