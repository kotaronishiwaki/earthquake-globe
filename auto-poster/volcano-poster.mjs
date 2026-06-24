#!/usr/bin/env node
/* Globe — volcano alert auto-poster.
 *
 *   JMA + USGS feeds ──▶ detect a NEW or CHANGED alert level ──▶ Claude
 *   (bilingual card JSON) ──▶ render the Globe Hero volcano card (Playwright
 *   screenshot of the studio page) ──▶ post text + card image to Bluesky + Mastodon.
 *
 * Run:  node volcano-poster.mjs --once   (single pass; ideal for cron / Actions)
 *       node volcano-poster.mjs          (daemon, polls every POLL_MINUTES)
 *       node volcano-poster.mjs --dry    (generate + render to ./out, do NOT post)
 *
 * A volcano is posted when it first appears at an elevated level, AND again
 * whenever its alert level / aviation colour changes (raised OR lowered) — that
 * is the "volcano warning was updated" event the kit reacts to. The ledger
 * (posted-volcanoes.json) maps each volcano to the last alert signature posted.
 *
 * Config comes from environment (same keys as the earthquake poster, plus the
 * JMA/USGS volcano options below). Use `node --env-file=.env volcano-poster.mjs`.
 */
import { chromium } from 'playwright';
import { BskyAgent, RichText } from '@atproto/api';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = pathToFileURL(join(__dirname, '..', 'Volcano Activity Cards.html')).href;
const STATE = join(__dirname, 'posted-volcanoes.json');
const OUT = join(__dirname, 'out');

const ENV = process.env;
const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has('--dry');
const ONCE = ARGS.has('--once') || DRY;
const MIN_JMA_LEVEL = Number(ENV.MIN_JMA_LEVEL || 2);          // JMA: post level >= this (2 = warning)
const POST_AVIATION = (ENV.POST_AVIATION || 'YELLOW,ORANGE,RED').toUpperCase().split(',').map(s => s.trim());
const MAX_AGE_HOURS = Number(ENV.MAX_AGE_HOURS || 72);         // don't post a change whose report is older than this
const SEED = ARGS.has('--seed');                              // record current state without posting
const TEST = ARGS.has('--test') || ARGS.has('--force');      // post the single highest current alert NOW (end-to-end check)
// where to read JMA from — the deployed Netlify proxy already parses JMA's XML robustly
const JMA_URL = ENV.JMA_VOLCANO_URL || 'https://globelabo.netlify.app/.netlify/functions/jma-volcano';
const HANS = 'https://volcanoes.usgs.gov/hans-public/api/volcano/';

const DISC_EN = 'Automated explanation from JMA / USGS data for general awareness — not an official hazard assessment. The mechanism, alert-level reasoning and outlook are estimates and may be revised. Always follow your local authority.';
const DISC_JA = 'JMA・USGSのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。メカニズム・警戒レベルの背景・見通しは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。';
const CODE_RGB = { GREEN: '70,150,70', YELLOW: '214,170,28', ORANGE: '214,108,28', RED: '200,52,40' };
const COLOR_SEV = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

const log = (...a) => console.log(new Date().toISOString(), ...a);
const slug = s => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'x';
const tc = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';

// ── state: id -> last posted alert signature ─────────────────────────────
async function loadState() { try { return JSON.parse(await readFile(STATE, 'utf8')) || {}; } catch { return {}; } }
async function saveState(obj) { await writeFile(STATE, JSON.stringify(obj, null, 0)); }

// ── current alerts (JMA + USGS) ──────────────────────────────────────────
function volId(v) { return v.source + '-' + slug(v.nameEn || v.name); }
function signature(v) {
  return v.source === 'jma' ? `jma:L${v.level}:${v.kind || ''}` : `usgs:${v.color || ''}:${v.alert || ''}`;
}

async function fetchAlerts() {
  const [elev, us, jma] = await Promise.all([
    fetch(HANS + 'getElevatedVolcanoes').then(r => r.json()).catch(() => []),
    fetch(HANS + 'getUSVolcanoes').then(r => r.json()).catch(() => []),
    fetch(JMA_URL).then(r => r.json()).catch(() => []),
  ]);
  const coordById = {};
  (Array.isArray(us) ? us : []).forEach(v => {
    const lat = parseFloat(v.latitude), lon = parseFloat(v.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) coordById[String(v.vnum)] = [lon, lat];
  });
  const list = [];
  (Array.isArray(elev) ? elev : []).forEach(e => {
    const c = coordById[String(e.vnum)]; if (!c) return;
    const color = (e.color_code || '').toUpperCase();
    if (!POST_AVIATION.includes(color)) return;
    const v = { source: 'usgs', name: e.volcano_name || '', nameEn: e.volcano_name || '', obs: e.obs_fullname || '',
      color, alert: (e.alert_level || '').toUpperCase(), lat: c[1], lon: c[0],
      date: e.sent_utc ? e.sent_utc.replace(' ', 'T') + 'Z' : null, report: e.notice_url || '',
      rgb: CODE_RGB[color] || '176,116,28', sev: 3 + (COLOR_SEV[color] || 0) };
    v.id = volId(v); list.push(v);
  });
  (Array.isArray(jma) ? jma : []).forEach(j => {
    if (!Number.isFinite(j.lon) || !Number.isFinite(j.lat)) return;
    if ((j.level || 0) < MIN_JMA_LEVEL) return;
    const v = { source: 'jma', name: j.name || '', nameEn: j.nameEn || j.name || '', level: j.level, kind: j.kind || '',
      lat: j.lat, lon: j.lon, date: j.date || null, report: j.url || 'https://www.jma.go.jp/bosai/volcano/',
      rgb: j.rgb || '176,116,28', sev: 10 + (j.level || 2) };
    v.id = volId(v); list.push(v);
  });
  return list;
}

// ── Claude (card-length bilingual content) ───────────────────────────────
const JMA_LEVELS = {
  1: 'Level 1 (Normal) — active volcano, no entry restriction.',
  2: 'Level 2 (Near-crater restriction) — do not approach the crater.',
  3: 'Level 3 (Do not approach the volcano) — entry restricted; hazards may reach near residential areas.',
  4: 'Level 4 (Prepare to evacuate) — vulnerable people in danger areas should evacuate.',
  5: 'Level 5 (Evacuate) — residents in danger areas must evacuate.',
};
function buildPrompt(v) {
  const rl = v.source === 'jma' ? 'ja' : null;
  const wantReg = !!rl;
  const nm = v.nameEn || v.name || 'this volcano';
  let statusLine;
  if (v.source === 'jma' && v.level) statusLine = `Monitoring: Japan Meteorological Agency. Current 噴火警戒レベル (Volcanic Alert Level): ${v.level}. ${JMA_LEVELS[v.level] || ''} Warning type: ${v.kind || 'n/a'}.`;
  else statusLine = `Monitoring: USGS Volcano Hazards Program. Aviation Colour Code: ${v.color || 'n/a'}. Volcano Alert Level: ${v.alert || 'n/a'}. Observatory: ${v.obs || 'n/a'}.`;
  return `You are a volcanologist writing a warm, clear update about a volcano's CURRENT activity for ordinary people with no science background. It will appear on a social media card, so every text field must be SHORT.

Volcano: ${nm}${v.name && v.name !== nm ? ` (${v.name})` : ''}, latitude ${v.lat}, longitude ${v.lon}.
Status: ${statusLine}

Use your knowledge of THIS specific, real, named volcano (its eruptive style, edifice type, history) plus the status above. Be specific, not generic.

Return ONLY raw JSON (no markdown):
{
  "edifice": "stratovolcano"|"caldera"|"shield"|"lava-dome"|"complex",
  "edificeLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "whyNow": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "levelMeaning": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "impacts": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "outlook": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "hazards": ["ashfall"|"pyroclastic"|"lava"|"lahar"|"ballistics"|"gas", ...]
}
Plain everyday words, calm and factual, never alarmist. Keep EACH text field <= 24 words.
- "edificeLabel": the structural type in friendly words (e.g. "Stratovolcano (steep cone)").
- "whyNow": what is driving the current unrest/eruption. <= 24 words.
- "levelMeaning": what this alert level means in practice for people nearby. <= 24 words.
- "impacts": realistic effects nearby and downwind (ashfall, exclusion zone, aviation…). Honest, not frightening. <= 24 words.
- "outlook": what to watch for and sensible preparedness, calm tone. <= 24 words.
- "hazards": 2–4 hazards genuinely relevant now, from the allowed list only.
${wantReg ? 'Every "reg" MUST be Japanese; every "en" 100% natural English. Never mix languages within a field.' : 'Set every "reg" to null.'}
Do not restate the volcano name or the raw alert number inside the text fields.`;
}
const HAZ_OK = ['ashfall', 'pyroclastic', 'lava', 'lahar', 'ballistics', 'gas'];
async function generateContent(v) {
  const rl = v.source === 'jma' ? 'ja' : null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ENV.ANTHROPIC_MODEL || 'claude-haiku-4-5', max_tokens: 1200, messages: [{ role: 'user', content: buildPrompt(v) }] }),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  let txt = (data.content?.[0]?.text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
  const o = JSON.parse(txt);
  const norm = f => f ? { en: f.en || '', reg: rl ? (f.reg || '') : null } : { en: '', reg: null };
  return {
    edifice: ['stratovolcano', 'caldera', 'shield', 'lava-dome', 'complex'].indexOf(o.edifice) >= 0 ? o.edifice : 'stratovolcano',
    edificeLabel: norm(o.edificeLabel), whyNow: norm(o.whyNow), levelMeaning: norm(o.levelMeaning),
    impacts: norm(o.impacts), outlook: norm(o.outlook),
    hazards: Array.isArray(o.hazards) ? o.hazards.filter(h => HAZ_OK.indexOf(h) >= 0).slice(0, 4) : [],
    regionLang: rl, disclaimer: { en: DISC_EN, reg: rl ? DISC_JA : null },
  };
}

// ── post text (English + Japanese for JMA, fitted to a char limit) ───────
function buildPost(v, content, limit, change) {
  const url = `https://globelabo.netlify.app/#vol=${v.id}`;
  const name = v.nameEn || v.name;
  const status = v.source === 'jma' ? `Alert Level ${v.level}` : `Aviation ${tc(v.color)}${v.alert ? ' · ' + tc(v.alert) : ''}`;
  const verb = change === 'raised' ? ' raised to' : change === 'lowered' ? ' lowered to' : ' ·';
  const head = `🌋 ${name}${verb} ${status}`;
  let body = `\n${content.whyNow.en}`;
  let reg = (v.source === 'jma' && content.whyNow.reg) ? `\n${v.name}（噴火警戒レベル${v.level}）${content.whyNow.reg}` : '';
  const tags = ['#volcano'];
  if (v.source === 'jma') tags.push('#火山', '#防災', '#日本');
  else tags.push('#volcanoes');
  const nm = (v.nameEn || v.name || '').replace(/[^\p{L}\p{N}]+/gu, '');
  if (nm) tags.push('#' + nm);
  const tail = `\nLive map: ${url}\n${tags.join(' ')}`;
  const fit = () => head + body + reg + tail;
  if (fit().length > limit && reg) reg = '';
  if (fit().length > limit) {
    const room = limit - (head + reg + tail).length - 2;
    body = '\n' + content.whyNow.en;
    if (body.length > room) body = body.slice(0, Math.max(0, room)) + '…';
  }
  return { text: fit(), url };
}

// ── render the Globe Hero volcano card to a PNG buffer ───────────────────
async function renderCard(browser, v, content) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 });
  await page.goto(HTML + '?export=globe-hero', { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__studioReady === true', { timeout: 20000 });
  await page.evaluate(({ vr, c }) => window.__studio.render(vr, c), { vr: v, c: content });
  await page.waitForTimeout(2500);            // globe canvas settles
  await page.evaluate(() => document.fonts.ready);
  const el = await page.waitForSelector('[data-export-card="globe-hero"]');
  const buf = await el.screenshot({ type: 'png' });
  await page.close();
  return buf;
}

// ── Bluesky ──────────────────────────────────────────────────────────────
// Log in ONCE per run and reuse the session — creating a fresh session for
// every volcano trips Bluesky's createSession rate limit (surfaces as an
// "Invalid identifier or password" error after the first few).
async function bskyLogin() {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: ENV.BLUESKY_IDENTIFIER, password: ENV.BLUESKY_APP_PASSWORD });
  return agent;
}
async function postBluesky(agent, text, png, v) {
  const up = await agent.uploadBlob(png, { encoding: 'image/png' });
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  const langs = ['en']; if (v.source === 'jma') langs.push('ja');
  await agent.post({
    text: rt.text, facets: rt.facets, langs,
    embed: { $type: 'app.bsky.embed.images', images: [{ image: up.data.blob, alt: `Globe volcano activity card — ${v.nameEn || v.name}` }] },
  });
  log('  ✓ Bluesky posted');
}

// ── Mastodon ──────────────────────────────────────────────────────────────
async function postMastodon(text, png, v) {
  const base = ENV.MASTODON_INSTANCE.replace(/\/$/, '');
  const auth = { Authorization: 'Bearer ' + ENV.MASTODON_ACCESS_TOKEN };
  const media = new FormData();
  media.append('file', new Blob([png], { type: 'image/png' }), 'card.png');
  media.append('description', `Globe volcano activity card — ${v.nameEn || v.name}`);
  const mres = await fetch(base + '/api/v2/media', { method: 'POST', headers: auth, body: media });
  if (!mres.ok) throw new Error('Mastodon media ' + mres.status + ' ' + (await mres.text()).slice(0, 200));
  const mediaId = (await mres.json()).id;
  const form = new URLSearchParams();
  form.set('status', text);
  form.append('media_ids[]', mediaId);
  form.set('language', v.source === 'jma' ? 'ja' : 'en');
  const sres = await fetch(base + '/api/v1/statuses', { method: 'POST', headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  if (!sres.ok) throw new Error('Mastodon status ' + sres.status + ' ' + (await sres.text()).slice(0, 200));
  log('  ✓ Mastodon posted');
}

// ── one pass ──────────────────────────────────────────────────────────────
async function pass(browser) {
  // FIRST RUN: if there's no ledger yet, record the current alert state without
  // posting — otherwise every volcano already at an elevated level would be
  // posted at once. (Pass --seed to force this; delete the ledger to re-seed.)
  const firstRun = !existsSync(STATE);
  const state = await loadState();         // { id: { sig, level, color, date } }
  const alerts = await fetchAlerts();

  // --test / --force: post the single highest current alert right now, ignoring
  // the ledger and freshness — a one-shot end-to-end check that posting works.
  if (TEST) {
    if (!alerts.length) { log('No elevated volcanoes right now — nothing to test-post.'); return; }
    const v = alerts.slice().sort((a, b) => b.sev - a.sev)[0];
    log(`TEST mode — posting highest current alert: ${v.nameEn || v.name} [${v.id}] ${signature(v)}`);
    let agent = null;
    if (!DRY && ENV.POST_BLUESKY === '1') agent = await bskyLogin();
    const content = await generateContent(v);
    log(`  edifice: ${content.edificeLabel.en} · hazards ${content.hazards.join(', ') || '—'}`);
    const png = await renderCard(browser, v, content);
    if (DRY) {
      await mkdir(OUT, { recursive: true });
      await writeFile(join(OUT, `${v.id}.png`), png);
      await writeFile(join(OUT, `${v.id}.txt`), buildPost(v, content, 300, 'updated').text);
      log(`  ✓ dry run → out/${v.id}.png (+ .txt)`);
    } else {
      if (agent) await postBluesky(agent, buildPost(v, content, 300, 'updated').text, png, v);
      if (ENV.POST_MASTODON === '1') await postMastodon(buildPost(v, content, 500, 'updated').text, png, v);
    }
    log('  ✓ TEST post complete — check your Bluesky / Mastodon timeline. (Ledger left unchanged.)');
    return;
  }

  if ((firstRun || SEED) && !DRY) {
    const seeded = {};
    for (const v of alerts) seeded[v.id] = { sig: signature(v), level: v.level || null, color: v.color || null, date: v.date || null, ts: Date.now() };
    await saveState(seeded);
    log(`Seeded ledger with ${alerts.length} active volcano(es) — nothing posted on first run. Future level changes will post.`);
    return;
  }

  const tooOld = v => {
    if (!v.date) return false;               // no timestamp → don't block
    const ms = Date.parse(v.date);
    return Number.isFinite(ms) && (Date.now() - ms) > MAX_AGE_HOURS * 3600e3;
  };
  // postable = new OR changed signature, and recent enough to be worth posting
  const todo = alerts.filter(v => {
    const prev = state[v.id];
    if (prev && prev.sig === signature(v)) return false;   // unchanged
    if (tooOld(v)) return false;                            // stale report
    return true;
  }).sort((a, b) => b.sev - a.sev);

  // record (silently) any stale changes so we don't keep re-evaluating them
  let touched = false;
  for (const v of alerts) {
    const prev = state[v.id];
    if ((!prev || prev.sig !== signature(v)) && tooOld(v)) {
      state[v.id] = { sig: signature(v), level: v.level || null, color: v.color || null, date: v.date || null, ts: Date.now() };
      touched = true;
    }
  }
  if (touched && !DRY) await saveState(state);

  if (!todo.length) { log(`No new/changed volcano alerts to post (${alerts.length} active).`); return; }
  log(`${todo.length} new/changed volcano alert(s) of ${alerts.length} active.`);

  // log in to Bluesky once for the whole pass
  let agent = null;
  if (!DRY && ENV.POST_BLUESKY === '1') {
    try { agent = await bskyLogin(); } catch (e) { log(`  ✗ Bluesky login failed: ${e.message} — skipping Bluesky this pass`); }
  }

  for (const v of todo) {
    // detect direction of change for nicer wording
    const prev = state[v.id];
    let change = 'new';
    if (prev) {
      const before = v.source === 'jma' ? prev.level : (COLOR_SEV[prev.color] ?? -1);
      const after = v.source === 'jma' ? v.level : (COLOR_SEV[v.color] ?? -1);
      change = after > before ? 'raised' : after < before ? 'lowered' : 'updated';
    }
    log(`• ${v.nameEn || v.name} [${v.id}] ${signature(v)} (${change})`);
    try {
      const content = await generateContent(v);
      log(`  edifice: ${content.edificeLabel.en} · hazards ${content.hazards.join(', ') || '—'}`);
      const png = await renderCard(browser, v, content);

      if (DRY) {
        await mkdir(OUT, { recursive: true });
        await writeFile(join(OUT, `${v.id}.png`), png);
        await writeFile(join(OUT, `${v.id}.txt`), buildPost(v, content, 300, change).text);
        log(`  ✓ dry run → out/${v.id}.png (+ .txt)`);
      } else {
        if (agent) await postBluesky(agent, buildPost(v, content, 300, change).text, png, v);
        if (ENV.POST_MASTODON === '1') await postMastodon(buildPost(v, content, 500, change).text, png, v);
      }
      state[v.id] = { sig: signature(v), level: v.level || null, color: v.color || null, date: v.date || null, ts: Date.now() };
      if (!DRY) await saveState(state);
    } catch (e) {
      log(`  ✗ ${v.id} failed: ${e.message}`);   // leave for next pass
    }
  }
  if (DRY) await saveState(state);   // remember dry-run signatures too, so a re-run is quiet
}

// ── main ──────────────────────────────────────────────────────────────────
(async () => {
  if (!ENV.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
  try {
    await pass(browser);
    if (!ONCE) {
      const ms = Number(ENV.POLL_MINUTES || 15) * 60e3;
      log(`Daemon mode — polling every ${ENV.POLL_MINUTES || 15} min.`);
      while (true) { await new Promise(r => setTimeout(r, ms)); await pass(browser).catch(e => log('pass error', e.message)); }
    }
  } finally { if (ONCE) await browser.close(); }
})();
