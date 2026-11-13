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

async function gemini({ system, user, parts, schema, json = true, maxOutputTokens = 32000, thinking, modelOverride }) {
  // A beállított modellnév tisztítása ("Gemini 2.5 Pro", "models/gemini-2.5-pro" is működjön); hibás névnél az alapértelmezett.
  const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
  let model = String(process.env.GEMINI_MODEL || '').trim().toLowerCase().replace(/^models\//, '').replace(/\s+/g, '-');
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) model = DEFAULT_MODEL;
  if (modelOverride && /^gemini-[a-z0-9.-]+$/.test(modelOverride)) model = modelOverride;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: parts || [{ text: user }] }],
    generationConfig: json ? { temperature: 0.1, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema } : { temperature: 0, maxOutputTokens }
  };
  // Gyorsabb válasz: a tételek értelmezéséhez elég az alacsony gondolkodási szint.
  if (thinking) body.generationConfig.thinkingConfig = { thinkingLevel: thinking };
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
        if (r.status === 400 && body.generationConfig.thinkingConfig && /thinking/i.test(txt)) { delete body.generationConfig.thinkingConfig; attempt--; continue; }
        // Ismeretlen modellnévnél egyszer újrapróbáljuk az alapértelmezettel.
        if ((r.status === 404 || r.status === 400) && model !== DEFAULT_MODEL && /model/i.test(txt)) { model = DEFAULT_MODEL; attempt--; continue; }
        const err = new Error('Gemini hiba ' + r.status + ' (' + model + '): ' + txt.slice(0, 400));
        err.retry = r.status === 429 || r.status >= 500;
        throw err;
      }
      const j = JSON.parse(txt);
      const cand = j.candidates && j.candidates[0];
      const out = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
      if (!out) throw Object.assign(new Error('Üres válasz a modelltől (' + ((cand && cand.finishReason) || 'ismeretlen ok') + ').'), { retry: true });
      return { data: json ? JSON.parse(out) : out, model, usage: j.usageMetadata || null };
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
