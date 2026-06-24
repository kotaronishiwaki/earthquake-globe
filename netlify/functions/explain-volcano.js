/* Netlify Function — POST /.netlify/functions/explain-volcano
 *
 * Generates a bilingual, plain-language explanation of a volcano's current
 * activity with Claude. The Anthropic API key NEVER leaves the server.
 * Mirrors explain.js (earthquakes) — same entitlement model, same pass/quota.
 *
 * Required env:  ANTHROPIC_API_KEY, PASS_SECRET
 * Optional env:  ANTHROPIC_MODEL, FREE_PER_DAY, UPSTASH_REDIS_REST_URL+TOKEN
 */
const crypto = require('crypto');

const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}
function verifyPass(token, secret) {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false;
  try { const p = JSON.parse(b64urlDecode(body)); return !p.exp || p.exp > Date.now(); }
  catch (e) { return false; }
}

async function freeLimitOk(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL, tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return true;
  const cap = parseInt(process.env.FREE_PER_DAY || '3', 10);
  const day = new Date().toISOString().slice(0, 10);
  const key = `exfree:${day}:${ip}`;   // shared bucket with quake explanations
  try {
    const r = await fetch(`${url}/incr/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${tok}` } });
    const { result } = await r.json();
    if (result === 1) await fetch(`${url}/expire/${encodeURIComponent(key)}/172800`, { headers: { Authorization: `Bearer ${tok}` } });
    return result <= cap;
  } catch (e) { return true; }
}

// JMA 噴火警戒レベル — what each level means (fed to the model for accuracy)
const JMA_LEVELS = {
  1: 'Level 1 (平常 / Normal) — it is an active volcano; no entry restriction.',
  2: 'Level 2 (火口周辺規制 / Near-crater restriction) — do not approach the crater.',
  3: 'Level 3 (入山規制 / Do not approach the volcano) — climbing/entry restricted, hazard may reach near residential areas.',
  4: 'Level 4 (高齢者等避難 / Prepare to evacuate) — elderly and vulnerable people in danger areas should evacuate.',
  5: 'Level 5 (避難 / Evacuate) — residents in danger areas must evacuate.',
};

function buildPrompt(v, lang) {
  const wantReg = lang !== 'en';
  const langName = { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang];
  const nm = v.nameEn || v.name || 'this volcano';
  let statusLine;
  if (v.source === 'jma' && v.level) {
    statusLine = `Monitoring agency: Japan Meteorological Agency (JMA).\nCurrent 噴火警戒レベル (Volcanic Alert Level): ${v.level}. ${JMA_LEVELS[v.level] || ''}\nWarning type issued: ${v.kind || 'n/a'}.`;
  } else if (v.source === 'usgs') {
    statusLine = `Monitoring agency: USGS Volcano Hazards Program.\nAviation Colour Code: ${v.color || 'n/a'}. Volcano Alert Level: ${v.alert || 'n/a'}. Observatory: ${v.obs || 'n/a'}.`;
  } else {
    statusLine = `Source: Smithsonian Global Volcanism Program (open eruptive activity reported). No numeric alert level supplied.`;
  }

  return `You are a volcanologist writing a warm, clear explanation of a volcano's CURRENT activity for ordinary members of the public — people with no science background.

Volcano facts:
- Name: ${nm}${v.name && v.name !== nm ? ` (${v.name})` : ''}
- Location: latitude ${v.lat}, longitude ${v.lon} (use this, plus your knowledge of this specific named volcano, to ground the answer)
- ${statusLine}
- Report time: ${v.date || 'recent'}

Use your knowledge of THIS specific, real, named volcano — its typical eruptive style, edifice type and history — together with the current alert status above. Be factual and specific to this volcano; do not give generic boilerplate.

Return ONLY raw JSON (no markdown) with EXACTLY this shape:
{
  "edifice": "stratovolcano" | "caldera" | "shield" | "lava-dome" | "complex",
  "edificeLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "mechanism": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "whyNow": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "levelChange": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "impacts": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "outlook": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "hazards": ["ashfall" | "pyroclastic" | "lava" | "lahar" | "ballistics" | "gas", ...]
}

Write for a NON-EXPERT. Plain everyday words, full sentences. Avoid jargon; if you must use a term, explain it in a few words. Be calm and factual, never alarmist.
- "edifice": the volcano's structural type (best fit). "edificeLabel": that type in friendly words (e.g. "Stratovolcano (steep cone)").
- "mechanism": how THIS volcano works — what feeds it (which plate/subduction or hotspot), why magma rises, and its usual eruptive style. <= 42 words.
- "whyNow": what is driving the current unrest or eruption and why the alert sits where it does. <= 42 words.
- "levelChange": explain what the current alert level means in practice and, if known, how it recently changed (raised/lowered/held) and what that implies. <= 42 words.
- "impacts": the realistic effects on people nearby and downwind — ashfall, small explosions, exclusion zones, aviation, etc. Honest, specific, not frightening. <= 42 words.
- "outlook": what to watch for and sensible preparedness, in a calm tone. <= 38 words.
- "hazards": 2–4 hazards genuinely relevant to this volcano's current state, from the allowed list only.
- ${wantReg ? `Every "reg" value MUST be written in ${langName}, in the same warm plain style.` : 'Set every "reg" to null.'}
- LANGUAGE SEPARATION IS ABSOLUTE: every "en" value is 100% natural English; NEVER insert a non-English word into "en". The localized wording belongs ONLY in "reg".
- In each "reg" value use that language's standard public term for a tectonic plate where relevant: Japanese プレート, Simplified Chinese 板块, Hindi टेक्टोनिक प्लेट, Spanish placa, Arabic صفيحة.
- Do NOT restate the volcano name or the raw alert number inside the text fields.`;
}

const HAZ = ['ashfall', 'pyroclastic', 'lava', 'lahar', 'ballistics', 'gas'];

function parseContent(raw, lang) {
  let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
  const o = JSON.parse(txt);
  const wantReg = lang !== 'en';
  const norm = f => f ? { en: f.en || '', reg: wantReg ? (f.reg || '') : null } : null;
  const hazards = Array.isArray(o.hazards) ? o.hazards.filter(h => HAZ.indexOf(h) >= 0).slice(0, 4) : [];
  return {
    edifice: ['stratovolcano', 'caldera', 'shield', 'lava-dome', 'complex'].indexOf(o.edifice) >= 0 ? o.edifice : 'stratovolcano',
    edificeLabel: norm(o.edificeLabel) || { en: 'Stratovolcano', reg: null },
    mechanism: norm(o.mechanism) || { en: '', reg: null },
    whyNow: norm(o.whyNow) || { en: '', reg: null },
    levelChange: norm(o.levelChange) || { en: '', reg: null },
    impacts: norm(o.impacts) || { en: '', reg: null },
    outlook: norm(o.outlook) || { en: '', reg: null },
    hazards,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type' } };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: JSON_HEADERS, body: '{"error":"method"}' };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers: JSON_HEADERS, body: '{"error":"server not configured"}' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers: JSON_HEADERS, body: '{"error":"bad json"}' }; }
  const v = body.volcano, lang = body.lang || 'en';
  if (!v || v.lat == null || v.lon == null) return { statusCode: 400, headers: JSON_HEADERS, body: '{"error":"bad volcano"}' };

  const paid = verifyPass(body.pass, process.env.PASS_SECRET);
  if (!paid) {
    const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || '0.0.0.0');
    const ok = await freeLimitOk(ip);
    if (!ok) return { statusCode: 402, headers: JSON_HEADERS, body: '{"error":"payment_required"}' };
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: buildPrompt(v, lang) }] }),
    });
    if (!r.ok) return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: 'anthropic ' + r.status }) };
    const data = await r.json();
    const content = parseContent(data.content && data.content[0] ? data.content[0].text : '', lang);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(content) };
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
