/* Netlify Function — POST /.netlify/functions/checkout
 *
 * Creates a Stripe Checkout Session and returns its URL. The browser
 * redirects there; on success Stripe sends the user back to your site with
 * ?session_id=… which verify.js exchanges for a signed pass.
 *
 * Required env:
 *   STRIPE_SECRET_KEY      sk_live_… or sk_test_…
 *   STRIPE_PRICE_ID        price_…  (a recurring or one-time Price in Stripe)
 * Optional env:
 *   CHECKOUT_MODE          'subscription' (default) or 'payment' (one-time)
 */
const JSON_HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type' } };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: JSON_HEADERS, body: '{"error":"method"}' };
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return { statusCode: 500, headers: JSON_HEADERS, body: '{"error":"stripe not configured"}' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const ret = (body.return_url || '').split('?')[0].split('#')[0] || 'https://globelabo.netlify.app/';
  const mode = process.env.CHECKOUT_MODE || 'subscription';

  const form = new URLSearchParams();
  form.set('mode', mode);
  form.set('line_items[0][price]', process.env.STRIPE_PRICE_ID);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', ret + '?session_id={CHECKOUT_SESSION_ID}');
  form.set('cancel_url', ret);
  if (body.lang) form.set('locale', { ja: 'ja', zh: 'zh', hi: 'en', es: 'es', ar: 'ar', en: 'en' }[body.lang] || 'auto');

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await r.json();
    if (!r.ok) return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: (data.error && data.error.message) || 'stripe error' }) };
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ url: data.url }) };
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
