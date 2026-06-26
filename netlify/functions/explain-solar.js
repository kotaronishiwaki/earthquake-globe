/* Netlify Function — POST /.netlify/functions/explain-solar
 *
 * Generates a bilingual, plain-language explanation of ONE solar flare with
 * Claude. The Anthropic API key NEVER leaves the server. Mirrors
 * explain-volcano.js — same entitlement model, same shared pass/quota.
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
  const key = `exfree:${day}:${ip}`;   // shared bucket with quake & volcano explanations
  try {
    const r = await fetch(`${url}/incr/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${tok}` } });
    const { result } = await r.json();
    if (result === 1) await fetch(`${url}/expire/${encodeURIComponent(key)}/172800`, { headers: { Authorization: `Bearer ${tok}` } });
    return result <= cap;
  } catch (e) { return true; }
}

// NOAA radio-blackout scale → what each level means (fed to the model for accuracy)
const R_LEVELS = {
  1: 'R1 (Minor) — ≥M1 flare. Weak/brief HF radio degradation on the sunlit side; minor navigation signal effects.',
  2: 'R2 (Moderate) — ≥M5 flare. Limited HF radio blackout on the sunlit side for tens of minutes; degraded low-frequency navigation.',
  3: 'R3 (Strong) — ≥X1 flare. Wide-area HF radio blackout on the entire sunlit side for ~an hour; navigation outages.',
  4: 'R4 (Severe) — ≥X10 flare. HF radio blackout on most of the sunlit side for 1–2 hours; navigation degraded for hours.',
  5: 'R5 (Extreme) — ≥X20 flare. Complete HF radio blackout on the entire sunlit side for hours; navigation out for hours.',
};
function rScaleOf(flux) {
  if (!Number.isFinite(flux)) return 0;
  if (flux >= 2e-3) return 5;
  if (flux >= 1e-3) return 4;
  if (flux >= 1e-4) return 3;
  if (flux >= 5e-5) return 2;
  if (flux >= 1e-5) return 1;
  return 0;
}

function buildPrompt(f, lang) {
  const wantReg = lang !== 'en';
  const langName = { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang];
  const r = f.rScale || rScaleOf(f.flux);
  return `You are a solar physicist and space-weather forecaster writing a warm, clear explanation of ONE specific solar flare for ordinary members of the public — people with no science background.

Flare facts:
- GOES soft X-ray class: ${f.class} (peak 1–8 Å X-ray flux of the flare).
- NOAA radio-blackout level: R${r}. ${R_LEVELS[r] || 'Below R1 — minimal radio effect.'}
- Peak time (UTC): ${f.peak || 'recent'}.
- Sub-solar point at peak: latitude ${f.lat != null ? f.lat : '?'}, longitude ${f.lon != null ? f.lon : '?'} — i.e. the Sun was overhead there, the centre of the HF radio blackout on Earth's sunlit hemisphere.

Use your knowledge of solar flares, magnetically complex sunspot groups (active regions), the NOAA R-scale and typical space-weather impacts. Be factual and specific to a flare of THIS class; do not give generic boilerplate.

Return ONLY raw JSON (no markdown) with EXACTLY this shape:
{
  "regionType": "simple" | "moderate" | "complex",
  "regionLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "mechanism": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "source": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "levelMeaning": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "impacts": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "outlook": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "effects": ["radio" | "gps" | "satellite" | "grid" | "aurora" | "cme" | "aviation", ...]
}

Write for a NON-EXPERT. Plain everyday words, full sentences. Avoid jargon; if you must use a term (corona, ionosphere, CME), explain it in a few words. Calm and factual, never alarmist.
- "regionType": likely complexity of the sunspot group that produced an ${f.class} flare ("complex" for X-class, usually "moderate" for mid/strong M, "simple" only for small flares).
- "regionLabel": that source in friendly words (e.g. "Large, magnetically complex sunspot group").
- "mechanism": what a solar flare is — a sudden release of magnetic energy in the Sun's atmosphere — and what a ${f.class} flare emits (a burst of X-rays/EUV reaching Earth in ~8 minutes). <= 42 words.
- "source": flares erupt from active regions (sunspot groups) with tangled magnetic fields; describe the kind that makes a flare this size. <= 42 words.
- "levelMeaning": what radio-blackout level R${r} means in practice — who is affected (HF/shortwave radio, aviation, mariners, ham radio), where (sunlit side), and roughly how long. <= 42 words.
- "impacts": the realistic effects at Earth for THIS class — HF radio fade/blackout on the daylit side, possible GPS/navigation and satellite effects. Honest, specific, not frightening. <= 42 words.
- "outlook": whether a flare this size may be accompanied by a coronal mass ejection (CME), and the chance of a geomagnetic storm and auroras a day or two later. Calm. <= 38 words.
- "effects": 2–4 effects genuinely relevant to a ${f.class} flare, from the allowed list only ("radio" almost always applies; add "gps"/"satellite"/"aviation"/"cme"/"aurora"/"grid" as warranted by the size).
- ${wantReg ? `Every "reg" value MUST be written in ${langName}, in the same warm plain style.` : 'Set every "reg" to null.'}
- LANGUAGE SEPARATION IS ABSOLUTE: every "en" value is 100% natural English; NEVER insert a non-English word into "en". The localized wording belongs ONLY in "reg".
- Do NOT restate the raw class code (e.g. "${f.class}") inside the text fields.`;
}

const EFF = ['radio', 'gps', 'satellite', 'grid', 'aurora', 'cme', 'aviation'];

function parseContent(raw, lang) {
  let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
  const o = JSON.parse(txt);
  const wantReg = lang !== 'en';
  const norm = f => f ? { en: f.en || '', reg: wantReg ? (f.reg || '') : null } : null;
  const effects = Array.isArray(o.effects) ? o.effects.filter(h => EFF.indexOf(h) >= 0).slice(0, 4) : [];
  return {
    regionType: ['simple', 'moderate', 'complex'].indexOf(o.regionType) >= 0 ? o.regionType : 'moderate',
    regionLabel: norm(o.regionLabel) || { en: 'Active region', reg: null },
    mechanism: norm(o.mechanism) || { en: '', reg: null },
    source: norm(o.source) || { en: '', reg: null },
    levelMeaning: norm(o.levelMeaning) || { en: '', reg: null },
    impacts: norm(o.impacts) || { en: '', reg: null },
    outlook: norm(o.outlook) || { en: '', reg: null },
    effects,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type' } };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: JSON_HEADERS, body: '{"error":"method"}' };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers: JSON_HEADERS, body: '{"error":"server not configured"}' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers: JSON_HEADERS, body: '{"error":"bad json"}' }; }
  const f = body.flare, lang = body.lang || 'en';
  if (!f || !f.class) return { statusCode: 400, headers: JSON_HEADERS, body: '{"error":"bad flare"}' };

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
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: buildPrompt(f, lang) }] }),
    });
    if (!r.ok) return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: 'anthropic ' + r.status }) };
    const data = await r.json();
    const content = parseContent(data.content && data.content[0] ? data.content[0].text : '', lang);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(content) };
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
