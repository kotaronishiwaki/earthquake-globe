#!/usr/bin/env node
/* Globe — M6+ earthquake mechanism auto-poster.
 *
 *   USGS feed ──▶ filter new M6+ ──▶ Claude (bilingual mechanism JSON)
 *            ──▶ render Globe Hero card (Playwright screenshot of the studio page)
 *            ──▶ post text + card image to Bluesky + Mastodon
 *
 * Run:  node poster.mjs --once     (single pass; ideal for cron / GitHub Actions)
 *       node poster.mjs            (daemon, polls every POLL_MINUTES)
 *       node poster.mjs --dry      (generate + render, write PNG to ./out, do NOT post)
 *
 * Reads config from environment (.env not auto-loaded — use `node --env-file=.env poster.mjs`
 * on Node 20+, or export the vars yourself / let CI inject them).
 */
import { chromium } from 'playwright';
import { BskyAgent, RichText } from '@atproto/api';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = pathToFileURL(join(__dirname, '..', 'Earthquake Mechanism Cards.html')).href;
const STATE = join(__dirname, 'posted.json');
const OUT = join(__dirname, 'out');

const ENV = process.env;
const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has('--dry');
const ONCE = ARGS.has('--once') || DRY;
const MIN_MAG = Number(ENV.MIN_MAG || 6.0);
const MAX_AGE = Number(ENV.MAX_AGE_HOURS || 24) * 3600e3;

const LANGS = { ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar' };
const DISC_EN = 'Automated explanation from USGS data for general awareness — not an official hazard assessment. Mechanism and aftershock outlook are estimates and may be revised. Follow your local authority for safety guidance.';

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ── state ───────────────────────────────────────────────────────────
async function loadState() { try { return new Set(JSON.parse(await readFile(STATE, 'utf8'))); } catch { return new Set(); } }
async function saveState(set) { await writeFile(STATE, JSON.stringify([...set], null, 0)); }

// ── USGS ────────────────────────────────────────────────────────────
async function fetchNewQuakes(posted) {
  const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
  const gj = await r.json();
  const now = Date.now();
  return (gj.features || [])
    .filter(f => (f.properties.mag || 0) >= MIN_MAG)
    .filter(f => now - f.properties.time <= MAX_AGE)
    .filter(f => !posted.has(f.id))
    .map(f => {
      const c = f.geometry.coordinates;
      return { id: f.id, mag: f.properties.mag, place: f.properties.place || '',
        lon: c[0], lat: c[1], depth: c[2] == null ? 10 : c[2], time: f.properties.time,
        tsunami: f.properties.tsunami };
    })
    .sort((a, b) => a.time - b.time);
}

// ── Claude ──────────────────────────────────────────────────────────
function depthClass(d) { return d < 70 ? 'shallow' : d < 300 ? 'intermediate' : 'deep'; }

async function generateContent(q) {
  const prompt = `You are a seismologist writing a warm, clear explanation of an earthquake for ordinary members of the public — people with no science background. It will appear on a social media card.

Earthquake facts:
- Magnitude: M${q.mag}
- Location: ${q.place} (lat ${q.lat}, lon ${q.lon})
- Depth: ${Math.round(q.depth)} km (${depthClass(q.depth)})
- Tsunami flag from USGS: ${q.tsunami ? 'yes' : 'no'}

Tasks:
1. Work out the most likely faulting mechanism and tectonic setting from this location's known plate tectonics, then judge the tsunami risk.
2. Choose ONE regional language matching the epicenter, from: ja (Japan), zh (China/Taiwan), hi (South Asia — India, Nepal, Pakistan, Bangladesh), es (Spanish-speaking Americas & Spain), ar (Middle East & North Africa). If none clearly applies, use null.

Return ONLY raw JSON (no markdown) with EXACTLY this shape:
{
  "faultType": one of "strike-slip" | "normal" | "reverse" | "subduction" | "intraplate",
  "faultTypeLabel": { "en": "...", "reg": "..." },
  "mainCause": { "en": "...", "reg": "..." },
  "nature": { "en": "...", "reg": "..." },
  "continuity": { "en": "...", "reg": "..." },
  "tsunamiRisk": "none" | "low" | "moderate" | "high",
  "tsunamiNote": { "en": "...", "reg": "..." } or null,
  "localeTags": ["...", "..."],
  "regionLang": "ja"|"zh"|"hi"|"es"|"ar"|null
}

Write for a NON-EXPERT. Use plain everyday words and full sentences. Avoid jargon; if you must use a term, explain it in a few words. Be calm and reassuring, never alarmist. Keep each text field SHORT — it must fit on a card.
- "faultTypeLabel": the fault type in friendly words (e.g. "Subduction thrust", "Strike-slip"). Keep it short.
- "mainCause": which plates or forces moved, and why, in plain language. <= 22 words.
- "nature": what the depth and size meant for how strong and widespread the shaking was. <= 22 words.
- "continuity": whether aftershocks are likely, how strong, and for how long — plainly and calmly. <= 22 words.
- "tsunamiRisk": judge honestly. Offshore + shallow + subduction/reverse + roughly M7 or larger => "high". Offshore + moderate size or less direct => "moderate". Onshore, deep, small, or strike-slip => "low" or "none".
- "tsunamiNote": one plain sentence explaining WHY the risk is at that level. Always provide. <= 24 words.
- "localeTags": exactly two short hashtag words written IN the chosen regionLang — the nearest well-known place and the country (NO # symbol, no spaces), e.g. Japanese ["能登","日本"], Chinese ["敦煌","中国"]. If regionLang is null, use [].
- If regionLang is null, set every "reg" value to null. Otherwise write each "reg" in that language, same warm plain style, using its standard public word for a tectonic plate.
- Keep every "en" value 100% natural English. Be factual and specific to this region. Do NOT restate the magnitude or place name in the text fields.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ENV.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ENV.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  let txt = (data.content?.[0]?.text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
  const o = JSON.parse(txt);
  const rl = o.regionLang && LANGS[o.regionLang] ? o.regionLang : null;
  const norm = f => f ? { en: f.en || '', reg: rl ? (f.reg || '') : null } : null;
  return {
    faultType: o.faultType || 'intraplate',
    faultTypeLabel: norm(o.faultTypeLabel) || { en: 'Tectonic fault', reg: null },
    mainCause: norm(o.mainCause) || { en: '', reg: null },
    nature: norm(o.nature) || { en: '', reg: null },
    continuity: norm(o.continuity) || { en: '', reg: null },
    tsunamiRisk: ['none', 'low', 'moderate', 'high'].indexOf(o.tsunamiRisk) >= 0 ? o.tsunamiRisk : null,
    tsunamiNote: o.tsunamiNote ? norm(o.tsunamiNote) : null,
    localeTags: rl && Array.isArray(o.localeTags) ? o.localeTags.filter(Boolean).slice(0, 3) : [],
    regionLang: rl,
    disclaimer: { en: DISC_EN, reg: null },
  };
}

// ── post text (English + region language, fitted to a char limit) ───
const HASHTAGS = {
  en: ['#earthquake', '#seismology'],
  ja: ['#地震', '#防災'],
  zh: ['#地震', '#防灾'],
  hi: ['#भूकंप', '#भूविज्ञान'],
  es: ['#sismo', '#terremoto'],
  ar: ['#زلزال', '#زلازل'],
};
function placeTags(place) {
  if (!place) return [];
  let s = place;
  const m = s.toLowerCase().lastIndexOf(' of ');
  if (m >= 0) s = s.slice(m + 4);
  const parts = s.split(',').map(t => t.trim().replace(/^the\s+/i, '')).filter(Boolean);
  const seen = new Set(), tags = [];
  const push = t => {
    const h = t.replace(/[^\p{L}\p{N}]+/gu, '');
    if (h && !seen.has(h.toLowerCase())) { seen.add(h.toLowerCase()); tags.push('#' + h); }
  };
  if (parts.length > 1) push(parts[0]);
  if (parts.length) push(parts[parts.length - 1]);
  return tags;
}
function buildPost(q, content, limit) {
  const url = `https://globelabo.netlify.app/#eq=${q.id}`;
  const head = `M${q.mag.toFixed(1)} earthquake · ${q.place}`;
  let names;
  if (content.regionLang && content.localeTags && content.localeTags.length) {
    const seen = new Set();
    names = content.localeTags.map(t => '#' + String(t).replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter(h => h.length > 1 && !seen.has(h) && seen.add(h));
  } else {
    names = placeTags(q.place);
  }
  const tags = [...(HASHTAGS[content.regionLang] || HASHTAGS.en), ...names].join(' ');
  const tail = `\nLive map: ${url}\n${tags}`;
  let body = `\n${content.faultTypeLabel.en} — ${content.nature.en}`;
  let reg = (content.regionLang && content.faultTypeLabel.reg)
    ? `\n${content.faultTypeLabel.reg}／${content.continuity.reg || ''}`.trimEnd() : '';
  // trim to fit: drop reg line first, then shorten the english body
  const fit = () => head + body + reg + tail;
  if (fit().length > limit && reg) reg = '';
  if (fit().length > limit) {
    const room = limit - (head + '\n' + reg + tail).length - 3;
    body = '\n' + content.faultTypeLabel.en + ' — ' + content.nature.en;
    if (body.length > room) body = body.slice(0, Math.max(0, room)) + '…';
  }
  return { text: fit(), url };
}

// ── render the Globe Hero card to a PNG buffer ──────────────────────
async function renderCard(browser, q, content) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 });
  await page.goto(HTML + '?export=globe-hero', { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__studioReady === true', { timeout: 20000 });
  await page.evaluate(({ qr, c }) => window.__studio.render(qr, c), { qr: q, c: content });
  await page.waitForTimeout(2500);            // globe canvas + ripples settle
  await page.evaluate(() => document.fonts.ready);
  const el = await page.waitForSelector('[data-export-card="globe-hero"]');
  const buf = await el.screenshot({ type: 'png' });
  await page.close();
  return buf;
}

// ── Bluesky ─────────────────────────────────────────────────────────
async function postBluesky(text, png, q, content) {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: ENV.BLUESKY_IDENTIFIER, password: ENV.BLUESKY_APP_PASSWORD });
  const up = await agent.uploadBlob(png, { encoding: 'image/png' });
  const rt = new RichText({ text });
  await rt.detectFacets(agent);              // makes the URL + hashtags clickable
  const langs = ['en']; if (content.regionLang) langs.push(content.regionLang);
  await agent.post({
    text: rt.text,
    facets: rt.facets,
    langs,
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{ image: up.data.blob, alt: `Globe earthquake mechanism card — M${q.mag.toFixed(1)} ${q.place}` }],
    },
  });
  log('  ✓ Bluesky posted');
}

// ── Mastodon ────────────────────────────────────────────────────────
async function postMastodon(text, png, q, content) {
  const base = ENV.MASTODON_INSTANCE.replace(/\/$/, '');
  const auth = { Authorization: 'Bearer ' + ENV.MASTODON_ACCESS_TOKEN };
  const media = new FormData();
  media.append('file', new Blob([png], { type: 'image/png' }), 'card.png');
  media.append('description', `Globe earthquake mechanism card — M${q.mag.toFixed(1)} ${q.place}`);
  const mres = await fetch(base + '/api/v2/media', { method: 'POST', headers: auth, body: media });
  if (!mres.ok) throw new Error('Mastodon media ' + mres.status + ' ' + (await mres.text()).slice(0, 200));
  const mediaId = (await mres.json()).id;

  const form = new URLSearchParams();
  form.set('status', text);
  form.append('media_ids[]', mediaId);
  if (content.regionLang) form.set('language', content.regionLang); else form.set('language', 'en');
  const sres = await fetch(base + '/api/v1/statuses', {
    method: 'POST', headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' }, body: form,
  });
  if (!sres.ok) throw new Error('Mastodon status ' + sres.status + ' ' + (await sres.text()).slice(0, 200));
  log('  ✓ Mastodon posted');
}

// ── one pass ────────────────────────────────────────────────────────
async function pass(browser) {
  const posted = await loadState();
  const quakes = await fetchNewQuakes(posted);
  if (!quakes.length) { log('No new M6+ events.'); return; }
  log(`${quakes.length} new M6+ event(s).`);

  for (const q of quakes) {
    log(`• M${q.mag} ${q.place} [${q.id}]`);
    try {
      const content = await generateContent(q);
      log(`  mechanism: ${content.faultTypeLabel.en} · region ${content.regionLang || 'en-only'}`);
      const png = await renderCard(browser, q, content);

      if (DRY) {
        await mkdir(OUT, { recursive: true });
        await writeFile(join(OUT, `${q.id}.png`), png);
        await writeFile(join(OUT, `${q.id}.txt`), buildPost(q, content, 300).text);
        log(`  ✓ dry run → out/${q.id}.png (+ .txt)`);
        continue;
      }

      if (ENV.POST_BLUESKY === '1') {
        const { text } = buildPost(q, content, 300);
        await postBluesky(text, png, q, content);
      }
      if (ENV.POST_MASTODON === '1') {
        const { text } = buildPost(q, content, 500);
        await postMastodon(text, png, q, content);
      }
      posted.add(q.id);
      await saveState(posted);
    } catch (e) {
      log(`  ✗ ${q.id} failed: ${e.message}`);   // leave unposted; retried next pass
    }
  }
}

// ── main ────────────────────────────────────────────────────────────
(async () => {
  if (!ENV.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
  // file:// で開くため Babel standalone が .jsx を XHR 取得できるよう許可する
  const browser = await chromium.launch({
    args: ['--allow-file-access-from-files', '--disable-web-security'],
  });
  try {
    await pass(browser);
    if (!ONCE) {
      const ms = Number(ENV.POLL_MINUTES || 15) * 60e3;
      log(`Daemon mode — polling every ${ENV.POLL_MINUTES || 15} min.`);
      // eslint-disable-next-line no-constant-condition
      while (true) { await new Promise(r => setTimeout(r, ms)); await pass(browser).catch(e => log('pass error', e.message)); }
    }
  } finally { if (ONCE) await browser.close(); }
})();
