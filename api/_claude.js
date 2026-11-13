/*
 * Claude (Anthropic) szolgáltató. Akkor aktív, ha az ANTHROPIC_API_KEY környezeti változó be van állítva.
 * Két modell: a gyors, olcsó modell a tömeges munkára (tételek, oszlopok, revízió, csevegés, szövegfelismerés),
 * az erősebb modell az egyetlen összevető hívásra (feltételek és tételjegyzék).
 */
const FAST = () => process.env.CLAUDE_FAST_MODEL || 'claude-haiku-5-5';
const STRONG = () => process.env.CLAUDE_STRONG_MODEL || 'claude-sonnet-5-5';

let client;
function getClient() {
  if (!client) {
    const mod = require('@anthropic-ai/sdk');
    const Anthropic = mod.Anthropic || mod.default || mod;
    client = new Anthropic(); // az ANTHROPIC_API_KEY változóból olvas
  }
  return client;
}

// A végpontok sémái a Gemini formátumában vannak (nagybetűs típusnevek). Átalakítás szabványos JSON-sémává:
// kisbetűs típus, és minden objektumon additionalProperties: false (a strukturált kimenet ezt megköveteli).
function toJsonSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.properties) {
    out.properties = {};
    for (const k of Object.keys(s.properties)) out.properties[k] = toJsonSchema(s.properties[k]);
    out.required = s.required || [];
    out.additionalProperties = false;
  }
  return out;
}

// Gemini-formátumú részek (szöveg, kép, PDF) átalakítása Claude tartalomblokkokká.
function toBlocks(parts) {
  return parts.map(p => {
    if (p.text !== undefined) return { type: 'text', text: p.text };
    const d = p.inlineData;
    if (d && d.mimeType === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.data } };
    return { type: 'image', source: { type: 'base64', media_type: d.mimeType, data: d.data } };
  });
}

async function claude({ system, user, stable, parts, schema, json = true, maxOutputTokens = 32000, thinking, tier }) {
  const strong = tier === 'strong';
  const model = strong ? STRONG() : FAST();
  // A változatlan rész (dokumentumok, tételjegyzék) gyorsítótárba kerül: ismételt kérdésnél töredék áron olvasható.
  const content = parts ? toBlocks(parts)
    : stable ? [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }, { type: 'text', text: user }]
      : [{ type: 'text', text: user }];
  const params = {
    model,
    max_tokens: Math.min(maxOutputTokens, 64000),
    system,
    messages: [{ role: 'user', content }],
    output_config: { effort: strong ? 'medium' : (thinking === 'medium' ? 'medium' : 'low') }
  };
  if (json) params.output_config.format = { type: 'json_schema', schema: toJsonSchema(schema) };

  const c = getClient();
  let msg;
  if (strong) {
    // Az erősebb modellnél szerveroldali tartalék, ha a biztonsági szűrő tévesen elutasítana egy kérést.
    try {
      msg = await c.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
    } catch (e) {
      if (e && e.status === 400 && /fallback|beta/i.test(String(e.message))) msg = await c.messages.stream(params).finalMessage();
      else throw e;
    }
  } else {
    msg = await c.messages.stream(params).finalMessage();
  }
  if (msg.stop_reason === 'refusal') throw new Error('A modell elutasította a kérést' + (msg.stop_details && msg.stop_details.category ? ' (' + msg.stop_details.category + ')' : '') + '.');
  if (msg.stop_reason === 'max_tokens') throw new Error('A válasz túl hosszú lett, és félbeszakadt.');
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('Üres válasz a modelltől.');
  return { data: json ? JSON.parse(text) : text, model: msg.model || model, usage: msg.usage || null };
}

function explain(e) {
  const st = e && e.status;
  if (st === 401) return 'Érvénytelen ANTHROPIC_API_KEY.';
  if (st === 429) return 'Túl sok kérés vagy elfogyott a keret az Anthropic fióknál. Kérjük, próbálja újra később.';
  if (st === 400 && /credit|balance/i.test(String(e.message))) return 'Nincs elég egyenleg az Anthropic fiókon.';
  return 'Claude hiba' + (st ? ' ' + st : '') + ': ' + String((e && e.message) || e).slice(0, 300);
}

module.exports = { claude, explain };
