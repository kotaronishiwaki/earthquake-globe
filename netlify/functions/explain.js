/* Netlify Function — POST /.netlify/functions/explain
 *
 * Generates a bilingual earthquake-mechanism explanation with Claude.
 * The Anthropic API key NEVER leaves the server.
 *
 * Entitlement:
 *   • a valid signed pass (from verify.js)  → unlimited
 *   • no pass                               → served, but optionally rate-
 *                                             limited per IP/day if you wire
 *                                             up Upstash Redis (see below).
 *
 * Required env:
 *   ANTHROPIC_API_KEY      your Anthropic key
 *   PASS_SECRET            any long random string (shared with verify.js)
 * Optional env:
 *   ANTHROPIC_MODEL        default claude-3-5-haiku-latest
 *   FREE_PER_DAY           default 3  (only enforced if Upstash is set)
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  → hard per-IP free limit
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
  if (!url || !tok) return true; // no store configured → rely on client-side soft limit
  const cap = parseInt(process.env.FREE_PER_DAY || '3', 10);
  const day = new Date().toISOString().slice(0, 10);
  const key = `exfree:${day}:${ip}`;
  try {
    const r = await fetch(`${url}/incr/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${tok}` } });
    const { result } = await r.json();
    if (result === 1) await fetch(`${url}/expire/${encodeURIComponent(key)}/172800`, { headers: { Authorization: `Bearer ${tok}` } });
    return result <= cap;
  } catch (e) { return true; }
}

function buildPrompt(q, lang) {
  const wantReg = lang !== 'en';
  const dc = q.depth < 70 ? 'shallow' : q.depth < 300 ? 'intermediate' : 'deep';
  const focalTxt = q.focal && q.focal.rake1 != null
    ? `Focal mechanism nodal plane: strike ${q.focal.strike1}°, dip ${q.focal.dip1}°, rake ${q.focal.rake1}°.`
    : 'No focal-mechanism solution available; infer from regional tectonics.';
  const langName = { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang];
  return `You are a seismologist writing a concise, accurate public explanation of an earthquake's mechanism.

Earthquake facts:
- Magnitude: M${q.mag}
- Location: ${q.place} (lat ${q.lat}, lon ${q.lon})
- Depth: ${Math.round(q.depth)} km (${dc})
- Tsunami flag from USGS: ${q.tsunami ? 'yes' : 'no'}
- ${focalTxt}

Determine the most likely faulting mechanism and tectonic setting from this location's known tectonics (and any focal data).

Return ONLY raw JSON (no markdown) with EXACTLY this shape:
{
  "faultType": "strike-slip" | "normal" | "reverse" | "subduction" | "intraplate",
  "faultTypeLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "mainCause": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "nature": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "continuity": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "tsunamiNote": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} } or null
}

Rules:
- "mainCause": the driving plate/tectonic cause. <= 24 words.
- "nature": shallow vs deep + energy/scale character and what it means for shaking. <= 24 words.
- "continuity": aftershock expectation and how long the sequence may persist. <= 24 words.
- "tsunamiNote": include only with genuine tsunami relevance (offshore/coastal + sufficient size), else null. <= 18 words.
- ${wantReg ? `Every "reg" value MUST be written in ${langName}.` : 'Set every "reg" to null.'}
- Be factual and specific to this region's tectonics. Do NOT restate the magnitude or place name in the text fields. Professional tone.`;
}

function parseContent(raw, lang) {
  let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
  const o = JSON.parse(txt);
  const wantReg = lang !== 'en';
  const norm = f => f ? { en: f.en || '', reg: wantReg ? (f.reg || '') : null } : null;
  return {
    faultType: o.faultType || 'intraplate',
    faultTypeLabel: norm(o.faultTypeLabel) || { en: 'Tectonic fault', reg: null },
    mainCause: norm(o.mainCause) || { en: '', reg: null },
    nature: norm(o.nature) || { en: '', reg: null },
    continuity: norm(o.continuity) || { en: '', reg: null },
    tsunamiNote: o.tsunamiNote ? norm(o.tsunamiNote) : null,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type' } };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: JSON_HEADERS, body: '{"error":"method"}' };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers: JSON_HEADERS, body: '{"error":"server not configured"}' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers: JSON_HEADERS, body: '{"error":"bad json"}' }; }
  const q = body.quake, lang = body.lang || 'en';
  if (!q || q.mag == null || q.lat == null || q.lon == null) return { statusCode: 400, headers: JSON_HEADERS, body: '{"error":"bad quake"}' };

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
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: buildPrompt(q, lang) }] }),
    });
    if (!r.ok) return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: 'anthropic ' + r.status }) };
    const data = await r.json();
    const content = parseContent(data.content && data.content[0] ? data.content[0].text : '', lang);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(content) };
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
