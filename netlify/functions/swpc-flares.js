/* Netlify Function — GET /.netlify/functions/swpc-flares
 *
 * Server-side proxy for NOAA SWPC's GOES X-ray flare list. SWPC normally sends
 * CORS headers so the browser fetches it directly; this proxy is the fallback
 * (and what the auto-poster could use). Returns the raw SWPC JSON unchanged,
 * with a short cache and open CORS.
 */
const SRC = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json';

exports.handler = async () => {
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=120',
  };
  try {
    const r = await fetch(SRC, { headers: { 'user-agent': 'globelabo/1.0 (+https://globelabo.netlify.app)' } });
    if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'swpc ' + r.status }) };
    const text = await r.text();
    return { statusCode: 200, headers, body: text };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
