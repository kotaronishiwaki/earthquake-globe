#!/usr/bin/env node
/* Globe Weekly — step 1: aggregate the past 7 days of activity.
 *
 *   USGS (quakes) + NOAA SWPC (flares) + USGS HANS / JMA (volcanoes)
 *     -> out/data.json   (raw facts; localization + dialogue happen in script.mjs)
 *
 * Run: node aggregate.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT } from './config.mjs';

const ENV = process.env;
const MIN_MAG = Number(ENV.MIN_MAG || 5.5);
const FLARE_CLASS = (ENV.MIN_FLARE_CLASS || 'M1').toUpperCase();
const log = (...a) => console.log(new Date().toISOString(), ...a);

const WEEK_MS = 7 * 24 * 3600e3;
const now = Date.now();

// ---- approximate sub-solar point (for an illustrative flare marker) ----
function subSolar(date) {
  const d = new Date(date);
  const secs = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  const lon = 180 - (secs / 86400) * 360;                 // local-noon longitude
  const dayOfYear = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)); // solar declination
  return [Number(lon.toFixed(1)), Number(decl.toFixed(1))];
}

// ---- earthquakes (USGS) ----
async function quakes() {
  try {
    const gj = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson').then(r => r.json());
    const feats = (gj.features || []).filter(f => (f.properties.mag || 0) >= 4.5 && now - f.properties.time <= WEEK_MS);
    const total = feats.length;
    const top = feats
      .filter(f => f.properties.mag >= MIN_MAG)
      .sort((a, b) => b.properties.mag - a.properties.mag)
      .slice(0, 4)
      .map(f => ({
        mag: Number(f.properties.mag.toFixed(1)),
        place: f.properties.place || '',
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
        depth: Math.round(f.geometry.coordinates[2] == null ? 10 : f.geometry.coordinates[2]),
        time: f.properties.time,
        tsunami: !!f.properties.tsunami,
        alert: (f.properties.alert || '').toUpperCase() || null,   // USGS PAGER impact color
      }));
    return { total, top };
  } catch (e) { log('quakes failed', e.message); return { total: 0, top: [] }; }
}

// ---- solar flares (NOAA SWPC GOES X-ray) ----
const CLASS_RANK = c => ({ A: 0, B: 1, C: 2, M: 3, X: 4 }[c[0]] || 0) * 100 + parseFloat(c.slice(1) || '0');
async function flares() {
  try {
    const list = await fetch('https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json').then(r => r.json());
    const minRank = CLASS_RANK(FLARE_CLASS);
    const valid = (list || [])
      .filter(f => f.max_class && CLASS_RANK(f.max_class) >= minRank)
      .map(f => ({ cls: f.max_class, region: f.active_region ? ('AR' + f.active_region) : '—',
        peak: f.max_time || f.end_time || f.begin_time }));
    const mCount = valid.filter(f => f.cls[0] === 'M').length;
    const xCount = valid.filter(f => f.cls[0] === 'X').length;
    const strongest = valid.sort((a, b) => CLASS_RANK(b.cls) - CLASS_RANK(a.cls))[0] || null;
    if (strongest) strongest.coords = subSolar(strongest.peak);
    return { mCount, xCount, strongest };
  } catch (e) { log('flares failed', e.message); return { mCount: 0, xCount: 0, strongest: null }; }
}

// ---- volcanoes (USGS HANS elevated + optional JMA proxy) ----
async function volcanoes() {
  const out = [];
  try {
    // getElevatedVolcanoes carries status/alert but NO coordinates — they live in
    // getUSVolcanoes, matched by vnum (same approach as the main site).
    const [elev, us] = await Promise.all([
      fetch('https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes').then(r => r.json()),
      fetch('https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes').then(r => r.json()),
    ]);
    const coordOf = {};
    (Array.isArray(us) ? us : []).forEach(v => {
      const lat = parseFloat(v.latitude), lon = parseFloat(v.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) coordOf[String(v.vnum)] = [lon, lat];
    });
    (Array.isArray(elev) ? elev : [])
      .filter(v => ['ORANGE', 'RED'].includes((v.color_code || v.colorCode || '').toUpperCase())
        || ['WATCH', 'WARNING'].includes((v.alert_level || v.alertLevel || '').toUpperCase()))
      .map(v => {
        const c = coordOf[String(v.vnum)] || null;
        return {
          name: v.volcano_name || v.volcanoName, country: v.subregion || 'USA',
          lat: c ? c[1] : null, lon: c ? c[0] : null,
          aviation: (v.color_code || v.colorCode || '').toUpperCase(),
          alert: (v.alert_level || v.alertLevel || '').toUpperCase(), source: 'USGS',
        };
      })
      .filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lon))   // drop ones we couldn't locate
      .slice(0, 3)
      .forEach(v => out.push(v));
  } catch (e) { log('USGS volcano failed', e.message); }
  if (ENV.JMA_VOLCANO_URL) {
    try {
      const jma = await fetch(ENV.JMA_VOLCANO_URL).then(r => r.json());
      (jma || []).filter(v => Number(v.level) >= 2).slice(0, 2).forEach(v => out.push({
        name: v.name, country: 'Japan', lat: Number(v.lat), lon: Number(v.lon),
        level: Number(v.level), source: 'JMA',
      }));
    } catch (e) { log('JMA volcano failed', e.message); }
  }
  return out.slice(0, 3);
}

// ---- official impact context (USGS PAGER + GDACS) ----
// GDACS (gdacs.org, run by the EU/UN JRC) is an official multi-hazard alert
// system. We use its alert level + one-line summary as trustworthy, citable
// impact context for the events we already cover — never raw media headlines.
// USGS PAGER's alert colour rides along on the quake feed. Everything here is
// best-effort: if a feed's shape changes we simply skip it.
async function gdacs(fromISO, toISO) {
  const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH'
    + '?eventlist=EQ;VO;TC;FL&alertlevel=Orange;Red'
    + '&fromDate=' + fromISO + '&toDate=' + toISO;
  try {
    const j = await fetch(url, { headers: { accept: 'application/json' } }).then(r => r.json());
    const feats = (j && j.features) || [];
    const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return feats.map(f => {
      const p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
      return {
        type: (p.eventtype || '').toUpperCase(),
        alert: (p.alertlevel || '').toUpperCase(),
        country: p.country || '', name: p.name || p.eventname || '',
        lat: Number(c[1]), lon: Number(c[0]),
        summary: strip(p.htmldescription || p.description).slice(0, 200),
        url: (p.url && (p.url.report || p.url.details)) || p.report || 'https://www.gdacs.org/',
      };
    }).filter(x => x.alert === 'ORANGE' || x.alert === 'RED');
  } catch (e) { log('GDACS failed', e.message); return []; }
}
function nearest(list, lat, lon, maxDeg) {
  let best = null, bd = Infinity;
  for (const x of list) {
    if (!Number.isFinite(x.lat) || !Number.isFinite(x.lon)) continue;
    const d = Math.hypot(x.lat - lat, x.lon - lon);
    if (d < bd) { bd = d; best = x; }
  }
  return bd <= (maxDeg || 2.5) ? best : null;
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const [q, f, v] = await Promise.all([quakes(), flares(), volcanoes()]);
  const start = new Date(now - WEEK_MS), end = new Date(now);

  // attach official impact context to the events we'll talk about
  const gd = await gdacs(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  const eqGd = gd.filter(x => x.type === 'EQ'), voGd = gd.filter(x => x.type === 'VO');
  q.top.forEach(t => {
    const m = nearest(eqGd, t.lat, t.lon, 2.0);
    if (m) t.impact = { source: 'GDACS', alert: m.alert, summary: m.summary, url: m.url };
    else if (t.alert) t.impact = { source: 'USGS PAGER', alert: t.alert };
  });
  v.forEach(t => {
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lon)) return;
    const m = nearest(voGd, t.lat, t.lon, 1.5);
    if (m) t.impact = { source: 'GDACS', alert: m.alert, summary: m.summary, url: m.url };
  });
  const data = {
    generatedAt: new Date(now).toISOString(),
    week: {
      start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10),
      year: end.getUTCFullYear(),
      no: Math.ceil((((end - Date.UTC(end.getUTCFullYear(), 0, 1)) / 864e5) + 1) / 7),
    },
    quakes: q, flares: f, volcanoes: v,
  };
  await writeFile(join(OUT, 'data.json'), JSON.stringify(data, null, 2));
  log(`data.json  quakes:${q.top.length}/${q.total}  flares:M${f.mCount}/X${f.xCount}  volcanoes:${v.length}`);
})();
