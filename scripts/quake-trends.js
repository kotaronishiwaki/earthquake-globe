// Generates trends.json — M2.5+ earthquake counts for the same 7-day window
// one week / one month / one year ago. Feeds the "vs. prior period" panel on
// the site (Globe Loader.html).
//
// Why server-side? The USGS feed files are CORS-enabled, but the fdsnws *count*
// API (which lets us query arbitrary historical windows) is NOT — the browser
// can't call it. So this runs in GitHub Actions (no CORS limits), writes
// trends.json to the site root, and commits it. Node 20+ (global fetch) only,
// no dependencies, no secrets (the data is public).

const fs = require('fs');
const path = require('path');

const API = 'https://earthquake.usgs.gov/fdsnws/event/1.0/count';
const MINMAG = 2.5;
const D = 86400e3; // one day in ms

const iso = ms => new Date(ms).toISOString().slice(0, 19);

async function count(startMs, endMs) {
  const url = `${API}?format=text&minmagnitude=${MINMAG}&starttime=${iso(startMs)}&endtime=${iso(endMs)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS responded ${res.status} for ${url}`);
  const n = parseInt((await res.text()).trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`Unexpected count response for ${url}`);
  return n;
}

(async () => {
  const now = Date.now();
  // Same length (7-day) windows as the live "past 7 days" count, shifted back.
  const [week, month, year] = await Promise.all([
    count(now - 14 * D, now - 7 * D),    // the 7 days before this week
    count(now - 37 * D, now - 30 * D),   // same 7-day window ~1 month ago
    count(now - 372 * D, now - 365 * D), // same 7-day window ~1 year ago
  ]);

  const out = { generated: now, minmag: MINMAG, window_days: 7, week, month, year };

  // Write to the repo root, next to Globe Loader.html, so the site serves it
  // same-origin at /trends.json.
  const dest = path.join(__dirname, '..', 'trends.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote trends.json:', out);
})().catch(err => { console.error(err); process.exit(1); });
