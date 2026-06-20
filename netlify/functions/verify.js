/* Netlify Function — POST /.netlify/functions/verify
 *
 * Exchanges a completed Stripe Checkout session_id for a signed pass token.
 * The token is an HMAC-signed { exp } payload that explain.js trusts without
 * any database. Default validity 31 days (renew by buying again, or wire a
 * Stripe webhook for true subscription lifecycle).
 *
 * Required env:
 *   STRIPE_SECRET_KEY   sk_live_… / sk_test_…
 *   PASS_SECRET         long random string (shared with explain.js)
 * Optional env:
 *   PASS_DAYS           pass validity in days, default 31
 */
const crypto = require('crypto');
const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function mintPass(secret, days) {
  const payload = JSON.stringify({ exp: Date.now() + days * 86400000, iat: Date.now() });
  const body = b64url(payload);
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return body + '.' + sig;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type' } };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: JSON_HEADERS, body: '{"error":"method"}' };
  if (!process.env.STRIPE_SECRET_KEY || !process.env.PASS_SECRET) return { statusCode: 500, headers: JSON_HEADERS, body: '{"error":"server not configured"}' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const sid = body.session_id;
  if (!sid) return { statusCode: 400, headers: JSON_HEADERS, body: '{"error":"missing session_id"}' };

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sid), {
      headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY },
    });
    const s = await r.json();
    if (!r.ok) return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: (s.error && s.error.message) || 'stripe error' }) };
    if (s.payment_status !== 'paid' && s.status !== 'complete') {
      return { statusCode: 402, headers: JSON_HEADERS, body: '{"error":"not paid"}' };
    }
    const days = parseInt(process.env.PASS_DAYS || '31', 10);
    const pass = mintPass(process.env.PASS_SECRET, days);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ pass, exp: Date.now() + days * 86400000 }) };
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
