// Generates trends.json — M2.5+ earthquake counts for the same 7-day window
// one week / one month / one year ago. Feeds the "vs. prior period" panel on
// the site (Globe Loader.html).
//
// Why server-side? The USGS feed files are CORS-enabled, but the fdsnws query
// API (which lets us query arbitrary historical windows) is NOT — the browser
// can't call it. So this runs in GitHub Actions (no CORS limits), writes
// trends.json to the site root, and commits it. Node 20+ (global fetch) only,
// no dependencies, no secrets (the data is public).

const fs = require('fs');
const path = require('path');

const API = 'https://earthquake.usgs.gov/fdsnws/event/1.0/query';
const MINMAG = 2.5;
const D = 86400e3; // one day in ms

const iso = ms => new Date(ms).toISOString().slice(0, 19);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// USGS fdsnws intermittently returns 404/429/5xx (especially under concurrent
// load), so fetch one window at a time, with retries and backoff.
async function count(startMs, endMs, tries = 4) {
  const url = `${API}?format=geojson&minmagnitude=${MINMAG}&starttime=${iso(startMs)}&endtime=${iso(endMs)}&nodata=204`;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.status === 204) return 0;                  // no events in window
      if (res.ok) {
        const j = await res.json();
        const n = Number(j && j.metadata && j.metadata.count);
        if (!Number.isFinite(n)) throw new Error(`no metadata.count in ${JSON.stringify(j).slice(0, 160)}`);
        return n;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < tries - 1) await sleep(2000 * (i + 1));      // 2s, 4s, 6s backoff
  }
  throw new Error(`failed after ${tries} tries for ${url}: ${lastErr && lastErr.message}`);
}

// Returns the count, or null if the window can't be fetched (so one bad window
// doesn't sink the whole job — we keep the previous value for it instead).
async function safeCount(label, startMs, endMs) {
  try { return await count(startMs, endMs); }
  catch (e) { console.warn(`WARN: ${label} window failed — keeping previous value. ${e.message}`); return null; }
}

(async () => {
  const now = Date.now();
  const dest = path.join(__dirname, '..', 'trends.json');

  // Same length (7-day) windows as the live "past 7 days" count, shifted back.
  const week  = await safeCount('week',  now - 14 * D,  now - 7 * D);    // 7 days before this week
  const month = await safeCount('month', now - 37 * D,  now - 30 * D);   // same window ~1 month ago
  const year  = await safeCount('year',  now - 372 * D, now - 365 * D);  // same window ~1 year ago

  if (week == null && month == null && year == null) {
    throw new Error('All windows failed — leaving trends.json untouched.');
  }

  // Preserve the last good value for any window that failed this run.
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(dest, 'utf8')); } catch { /* no prior file */ }

  const out = {
    generated: now,
    minmag: MINMAG,
    window_days: 7,
    week:  week  != null ? week  : (prev.week  != null ? prev.week  : null),
    month: month != null ? month : (prev.month != null ? prev.month : null),
    year:  year  != null ? year  : (prev.year  != null ? prev.year  : null),
  };

  // Write to the repo root, next to Globe Loader.html, so the site serves it
  // same-origin at /trends.json.
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log('Wrote trends.json:', out);
})().catch(err => { console.error(err); process.exit(1); });
