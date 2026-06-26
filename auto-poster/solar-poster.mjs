#!/usr/bin/env node
/* Globe — solar flare auto-poster.
 *
 *   NOAA SWPC (GOES X-ray) feed ──▶ detect a NEW strong flare ──▶ Claude
 *   (bilingual card JSON) ──▶ render the Globe Hero solar card (Playwright
 *   screenshot of the studio page) ──▶ post text + card image to Bluesky + Mastodon.
 *
 * Run:  node solar-poster.mjs --once   (single pass; ideal for cron / Actions)
 *       node solar-poster.mjs          (daemon, polls every POLL_MINUTES)
 *       node solar-poster.mjs --dry    (generate + render to ./out, do NOT post)
 *       node solar-poster.mjs --test   (post the single strongest recent flare NOW)
 *       node solar-poster.mjs --seed   (record current flares without posting)
 *
 * A solar flare is a discrete event (unlike a volcano's changing alert level),
 * so each flare at or above MIN_FLARE_CLASS is posted exactly once. The ledger
 * (posted-flares.json) records every flare id already posted.
 *
 * Config comes from environment (same credentials as the quake / volcano poster,
 * plus the solar options below). Use `node --env-file=.env solar-poster.mjs`.
 */
import { chromium } from 'playwright';
import { BskyAgent, RichText } from '@atproto/api';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE = join(__dirname, 'posted-flares.json');
const OUT = join(__dirname, 'out');

const ENV = process.env;
const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has('--dry');
const SEED = ARGS.has('--seed');                          // record current flares without posting
const TEST = ARGS.has('--test') || ARGS.has('--force');   // post the single strongest recent flare NOW
const ONCE = ARGS.has('--once') || DRY || SEED || TEST;   // any of these is a single pass, never a daemon

// Regional language paired with English on the card + post (the site is JA-first).
// Set SOLAR_REG_LANG=none for English-only. Anything else (ja/zh/hi/es/ar) is bilingual.
const REG_LANG = (ENV.SOLAR_REG_LANG || 'ja').toLowerCase();
const REG = (REG_LANG === 'none' || REG_LANG === 'en') ? null : REG_LANG;
const HTML = pathToFileURL(join(__dirname, '..', 'Solar Flare Cards.html')).href + (REG ? ('?reg=' + REG) : '?reg=none');

// Lowest flare class to post. Examples: 'M5' (default), 'X1', 'M1', 'X10'.
const MIN_FLARE_CLASS = (ENV.MIN_FLARE_CLASS || 'M5').toUpperCase();
const MIN_FLUX = classToFlux(MIN_FLARE_CLASS) || 5e-5;
const MAX_AGE_HOURS = Number(ENV.MAX_AGE_HOURS || 48);    // don't post a flare whose peak is older than this
const SWPC_URL = ENV.SWPC_FLARES_URL || 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json';

const DISC_EN = 'Automated explanation from NOAA SWPC (GOES) X-ray data for general awareness — not an official forecast. Effects, the R-level reasoning and the CME/aurora outlook are estimates and may be revised. Always follow your local authority.';
const DISC_REG = {
  ja: 'NOAA SWPC（GOES）のX線データをもとに自動生成した一般向けの解説です。公式の予報ではありません。影響・R等級の背景・CME／オーロラの見通しは推定であり、更新される場合があります。情報は各国の公式機関に従ってください。',
  zh: '基于NOAA SWPC（GOES）X射线数据自动生成的科普解说，非官方预报。影响、R等级背景与CME／极光展望均为估计值，可能修订。请以官方机构信息为准。',
  hi: 'यह NOAA SWPC (GOES) एक्स-रे डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक पूर्वानुमान नहीं। प्रभाव, R-स्तर का कारण और CME/ध्रुवीय-प्रकाश अनुमान हैं और बदल सकते हैं। आधिकारिक स्रोत का पालन करें।',
  es: 'Explicación automática a partir de datos de rayos X de NOAA SWPC (GOES) con fines informativos; no es un pronóstico oficial. Los efectos, el nivel R y el panorama de CME/auroras son estimaciones y pueden revisarse. Siga a su autoridad local.',
  ar: 'شرح آلي مُولّد من بيانات الأشعة السينية من NOAA SWPC (GOES) لأغراض التوعية، وليس تنبؤًا رسميًا. الآثار وسبب مستوى R وتوقعات CME/الشفق تقديرية وقد تُراجَع. اتبع المصادر الرسمية دائمًا.',
};
const R_RGB = { 1: '230,194,90', 2: '224,160,40', 3: '217,122,43', 4: '196,74,42', 5: '160,40,40' };
const R_WORD = { 1: 'Minor', 2: 'Moderate', 3: 'Strong', 4: 'Severe', 5: 'Extreme' };
const HASHTAG_REG = { ja: ['#太陽フレア', '#宇宙天気', '#宇宙天気予報'] };

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ── flare maths ───────────────────────────────────────────────────────────
function classToFlux(cls) {
  if (!cls) return NaN;
  const m = /^([ABCMX])([0-9.]+)?/i.exec(String(cls).trim());
  if (!m) return NaN;
  const base = { A: -8, B: -7, C: -6, M: -5, X: -4 }[m[1].toUpperCase()];
  const num = m[2] ? parseFloat(m[2]) : 1;
  return num * Math.pow(10, base);
}
function rScaleOf(flux) {
  if (!Number.isFinite(flux)) return 0;
  if (flux >= 2e-3) return 5;
  if (flux >= 1e-3) return 4;
  if (flux >= 1e-4) return 3;
  if (flux >= 5e-5) return 2;
  if (flux >= 1e-5) return 1;
  return 0;
}
function subsolarPoint(when) {
  const d = (when instanceof Date) ? when : new Date(when);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const N = (d - start) / 86400000;
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (N + 10));
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let lon = -15 * (h - 12);
  lon = ((lon + 540) % 360) - 180;
  return [lon, decl];
}

// ── state: set of posted flare ids ─────────────────────────────────────────
async function loadState() { try { return JSON.parse(await readFile(STATE, 'utf8')) || {}; } catch { return {}; } }
async function saveState(obj) { await writeFile(STATE, JSON.stringify(obj, null, 0)); }

// ── current flares (NOAA SWPC GOES X-ray) ──────────────────────────────────
async function fetchFlares() {
  const rows = await fetch(SWPC_URL, { headers: { 'user-agent': 'globelabo/1.0 (+https://globelabo.netlify.app)' } })
    .then(r => r.json()).catch(() => []);
  const seen = {}, list = [];
  (Array.isArray(rows) ? rows : []).forEach(e => {
    const cls = e.max_class || e.current_class || e.begin_class;
    const flux = Number.isFinite(e.max_xrlong) ? e.max_xrlong : classToFlux(cls);
    if (!Number.isFinite(flux) || flux < MIN_FLUX) return;     // below threshold
    const peak = e.max_time || e.time_tag || e.begin_time;
    if (!peak) return;
    const id = 'fl-' + peak; if (seen[id]) return; seen[id] = 1;
    const c = subsolarPoint(peak);
    const r = rScaleOf(flux);
    list.push({
      id, class: cls, flux, rScale: r,
      peak, begin: e.begin_time || peak, end: e.end_time || null,
      lat: c[1], lon: c[0], rgb: R_RGB[r] || '224,158,40',
      report: 'https://www.swpc.noaa.gov/products/solar-and-geophysical-event-reports',
      sev: flux,
    });
  });
  return list;
}

// ── Claude (card-length bilingual content) ─────────────────────────────────
const R_LEVELS = {
  1: 'R1 (Minor) — ≥M1 flare. Weak/brief HF radio degradation on the sunlit side; minor navigation signal effects.',
  2: 'R2 (Moderate) — ≥M5 flare. Limited HF radio blackout on the sunlit side for tens of minutes; degraded low-frequency navigation.',
  3: 'R3 (Strong) — ≥X1 flare. Wide-area HF radio blackout on the entire sunlit side for ~an hour; navigation outages.',
  4: 'R4 (Severe) — ≥X10 flare. HF radio blackout on most of the sunlit side for 1–2 hours; navigation degraded for hours.',
  5: 'R5 (Extreme) — ≥X20 flare. Complete HF radio blackout on the entire sunlit side for hours; navigation out for hours.',
};
function buildPrompt(f, lang) {
  const wantReg = !!lang;
  const langName = wantReg ? { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang] : null;
  const r = f.rScale || rScaleOf(f.flux);
  return `You are a solar physicist and space-weather forecaster writing a warm, clear explanation of ONE specific solar flare for ordinary members of the public — people with no science background.

Flare facts:
- GOES soft X-ray class: ${f.class} (peak 1–8 Å X-ray flux of the flare).
- NOAA radio-blackout level: R${r}. ${R_LEVELS[r] || 'Below R1 — minimal radio effect.'}
- Peak time (UTC): ${f.peak || 'recent'}.
- Sub-solar point at peak: latitude ${f.lat != null ? f.lat.toFixed(1) : '?'}, longitude ${f.lon != null ? f.lon.toFixed(1) : '?'} — the Sun was overhead there, the centre of the HF radio blackout on Earth's sunlit hemisphere.

Use your knowledge of solar flares, magnetically complex sunspot groups (active regions), the NOAA R-scale and typical space-weather impacts. Be factual and specific to a flare of THIS class; no generic boilerplate.

Return ONLY raw JSON (no markdown):
{
  "regionType": "simple"|"moderate"|"complex",
  "regionLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "mechanism": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "source": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "levelMeaning": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "impacts": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "outlook": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "effects": ["radio"|"gps"|"satellite"|"grid"|"aurora"|"cme"|"aviation", ...]
}
Plain everyday words, calm, non-alarmist. Each text field <= 24 words (keep them tight — these render on a fixed-size card).
- "regionType": likely complexity of the sunspot group ("complex" for X-class, usually "moderate" for mid/strong M, "simple" only for small flares).
- "regionLabel": that source in friendly words (e.g. "Large, magnetically complex sunspot group").
- "mechanism": what a solar flare is and what an ${f.class} flare emits (a burst of X-rays reaching Earth in ~8 minutes). <= 24 words.
- "source": flares erupt from active regions (sunspot groups) with tangled magnetic fields; describe the kind that makes a flare this size. <= 22 words.
- "levelMeaning": what radio-blackout level R${r} means in practice — who is affected, where (sunlit side), roughly how long. <= 24 words.
- "impacts": realistic effects at Earth for THIS class — HF radio fade/blackout on the daylit side, possible GPS/satellite effects. <= 24 words.
- "outlook": whether a flare this size may come with a CME, and the geomagnetic-storm / aurora possibility a day or two later. <= 24 words.
- "effects": 2–4 from the allowed list relevant to this flare ("radio" almost always applies).
${wantReg ? `Every "reg" MUST be ${langName}; every "en" 100% natural English. Never mix languages within a field.` : 'Set every "reg" to null.'}
Do not restate the raw class code inside the text fields.`;
}
const EFF_OK = ['radio', 'gps', 'satellite', 'grid', 'aurora', 'cme', 'aviation'];
async function generateContent(f) {
  const lang = REG;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ENV.ANTHROPIC_MODEL || 'claude-haiku-4-5', max_tokens: 1200, messages: [{ role: 'user', content: buildPrompt(f, lang) }] }),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  let txt = (data.content?.[0]?.text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
  const o = JSON.parse(txt);
  const norm = fld => fld ? { en: fld.en || '', reg: lang ? (fld.reg || '') : null } : { en: '', reg: null };
  return {
    regionType: ['simple', 'moderate', 'complex'].indexOf(o.regionType) >= 0 ? o.regionType : 'moderate',
    regionLabel: norm(o.regionLabel), mechanism: norm(o.mechanism), source: norm(o.source),
    levelMeaning: norm(o.levelMeaning), impacts: norm(o.impacts), outlook: norm(o.outlook),
    effects: Array.isArray(o.effects) ? o.effects.filter(h => EFF_OK.indexOf(h) >= 0).slice(0, 4) : [],
    regionLang: lang, disclaimer: { en: DISC_EN, reg: lang ? (DISC_REG[lang] || null) : null },
  };
}

// ── post text (English + regional line, fitted to a char limit) ────────────
function buildPost(f, content, limit) {
  const url = `https://globelabo.netlify.app/#flare=${f.id}`;
  const r = f.rScale || rScaleOf(f.flux);
  const word = R_WORD[r] || '';
  const head = `☀️ ${f.class} solar flare · R${r}${word ? ' ' + word : ''}`;
  let body = `\n${content.mechanism.en}`;
  let reg = (REG === 'ja' && content.mechanism.reg) ? `\n${f.class}フレア（電波障害R${r}）${content.mechanism.reg}` : '';
  const tags = ['#solarflare', '#spaceweather'];
  if (REG === 'ja') tags.push(...HASHTAG_REG.ja);
  const tail = `\nLive map: ${url}\n${tags.join(' ')}`;
  const fit = () => head + body + reg + tail;
  if (fit().length > limit && reg) reg = '';
  if (fit().length > limit) {
    const room = limit - (head + reg + tail).length - 2;
    body = '\n' + content.mechanism.en;
    if (body.length > room) body = body.slice(0, Math.max(0, room)) + '…';
  }
  return { text: fit(), url };
}

// ── render the Globe Hero solar card to a PNG buffer ───────────────────────
async function renderCard(browser, f, content) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 });
  await page.goto(HTML + '&export=globe-hero', { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__studioReady === true', { timeout: 20000 });
  await page.evaluate(({ fr, c }) => window.__studio.render(fr, c), { fr: f, c: content });
  await page.waitForTimeout(2500);            // globe canvas settles
  await page.evaluate(() => document.fonts.ready);
  const el = await page.waitForSelector('[data-export-card="globe-hero"]');
  const buf = await el.screenshot({ type: 'png' });
  await page.close();
  return buf;
}

// ── Bluesky ────────────────────────────────────────────────────────────────
async function bskyLogin() {
  const identifier = (ENV.BLUESKY_IDENTIFIER || '').trim().replace(/^@/, '');
  const password = (ENV.BLUESKY_APP_PASSWORD || '').trim();
  if (!identifier || !password) {
    throw new Error('BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD is empty — set both (handle like name.bsky.social + an App Password).');
  }
  const appPwOk = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(password);
  log(`  Bluesky login as "${identifier}" (app-password format: ${appPwOk ? 'yes' : 'NO — use an App Password, not your account password'})`);
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  try {
    await agent.login({ identifier, password });
  } catch (e) {
    throw new Error(`${e.message} — check: (1) handle is "name.bsky.social" (no @, no typo), (2) BLUESKY_APP_PASSWORD is an App Password from Settings → App Passwords in the form xxxx-xxxx-xxxx-xxxx (NOT your login password), (3) no trailing spaces/newline in the secret.`);
  }
  return agent;
}
async function postBluesky(agent, text, png, f) {
  const up = await agent.uploadBlob(png, { encoding: 'image/png' });
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  const langs = ['en']; if (REG === 'ja') langs.push('ja'); else if (REG) langs.push(REG);
  await agent.post({
    text: rt.text, facets: rt.facets, langs,
    embed: { $type: 'app.bsky.embed.images', images: [{ image: up.data.blob, alt: `Globe solar-flare card — ${f.class} (radio blackout R${f.rScale})` }] },
  });
  log('  ✓ Bluesky posted');
}

// ── Mastodon ────────────────────────────────────────────────────────────────
async function postMastodon(text, png, f) {
  const base = ENV.MASTODON_INSTANCE.replace(/\/$/, '');
  const auth = { Authorization: 'Bearer ' + ENV.MASTODON_ACCESS_TOKEN };
  const media = new FormData();
  media.append('file', new Blob([png], { type: 'image/png' }), 'card.png');
  media.append('description', `Globe solar-flare card — ${f.class} (radio blackout R${f.rScale})`);
  const mres = await fetch(base + '/api/v2/media', { method: 'POST', headers: auth, body: media });
  if (!mres.ok) throw new Error('Mastodon media ' + mres.status + ' ' + (await mres.text()).slice(0, 200));
  const mediaId = (await mres.json()).id;
  const form = new URLSearchParams();
  form.set('status', text);
  form.append('media_ids[]', mediaId);
  form.set('language', REG === 'ja' ? 'ja' : (REG || 'en'));
  const sres = await fetch(base + '/api/v1/statuses', { method: 'POST', headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  if (!sres.ok) throw new Error('Mastodon status ' + sres.status + ' ' + (await sres.text()).slice(0, 200));
  log('  ✓ Mastodon posted');
}

// ── one pass ────────────────────────────────────────────────────────────────
async function pass(browser) {
  // FIRST RUN: if there's no ledger yet, record current flares without posting —
  // otherwise a week of recent flares would all post at once. (Pass --seed to
  // force this; delete the ledger to re-seed.)
  const firstRun = !existsSync(STATE);
  const state = await loadState();          // { id: { class, flux, ts } }
  const flares = await fetchFlares();

  // --test / --force: post the strongest recent flare now, ignoring the ledger
  // and freshness — a one-shot end-to-end check that posting works.
  if (TEST) {
    if (!flares.length) { log(`No flares ≥${MIN_FLARE_CLASS} in the last 7 days — nothing to test-post.`); return; }
    const f = flares.slice().sort((a, b) => b.flux - a.flux)[0];
    log(`TEST mode — posting strongest recent flare: ${f.class} [${f.id}] R${f.rScale}`);
    let agent = null;
    if (!DRY && ENV.POST_BLUESKY === '1') {
      try { agent = await bskyLogin(); } catch (e) { log(`  ✗ Bluesky login failed: ${e.message}`); }
    }
    const content = await generateContent(f);
    log(`  region: ${content.regionLabel.en} · effects ${content.effects.join(', ') || '—'}`);
    const png = await renderCard(browser, f, content);
    if (DRY) {
      await mkdir(OUT, { recursive: true });
      await writeFile(join(OUT, `${f.id}.png`), png);
      await writeFile(join(OUT, `${f.id}.txt`), buildPost(f, content, 300).text);
      log(`  ✓ dry run → out/${f.id}.png (+ .txt)`);
    } else {
      if (agent) { try { await postBluesky(agent, buildPost(f, content, 300).text, png, f); } catch (e) { log(`  ✗ Bluesky post failed: ${e.message}`); } }
      if (ENV.POST_MASTODON === '1') { try { await postMastodon(buildPost(f, content, 500).text, png, f); } catch (e) { log(`  ✗ Mastodon post failed: ${e.message}`); } }
    }
    log('  ✓ TEST run complete — check your Bluesky / Mastodon timeline. (Ledger left unchanged.)');
    return;
  }

  if ((firstRun || SEED) && !DRY) {
    const seeded = {};
    for (const f of flares) seeded[f.id] = { class: f.class, flux: f.flux, ts: Date.now() };
    await saveState(seeded);
    log(`Seeded ledger with ${flares.length} recent flare(s) ≥${MIN_FLARE_CLASS} — nothing posted on first run. New flares will post.`);
    return;
  }

  const tooOld = f => {
    if (!f.peak) return false;
    const ms = Date.parse(f.peak);
    return Number.isFinite(ms) && (Date.now() - ms) > MAX_AGE_HOURS * 3600e3;
  };
  // postable = not yet posted, and recent enough to be worth posting
  const todo = flares.filter(f => !state[f.id] && !tooOld(f)).sort((a, b) => Date.parse(a.peak) - Date.parse(b.peak));

  // record (silently) any stale unposted flares so we don't keep re-evaluating them
  let touched = false;
  for (const f of flares) {
    if (!state[f.id] && tooOld(f)) { state[f.id] = { class: f.class, flux: f.flux, ts: Date.now() }; touched = true; }
  }
  if (touched && !DRY) await saveState(state);

  if (!todo.length) { log(`No new flares ≥${MIN_FLARE_CLASS} to post (${flares.length} in window).`); return; }
  log(`${todo.length} new flare(s) ≥${MIN_FLARE_CLASS} of ${flares.length} in window.`);

  // log in to Bluesky once for the whole pass
  let agent = null;
  if (!DRY && ENV.POST_BLUESKY === '1') {
    try { agent = await bskyLogin(); } catch (e) { log(`  ✗ Bluesky login failed: ${e.message} — skipping Bluesky this pass`); }
  }

  for (const f of todo) {
    log(`• ${f.class} [${f.id}] R${f.rScale} peak ${f.peak}`);
    try {
      const content = await generateContent(f);
      log(`  region: ${content.regionLabel.en} · effects ${content.effects.join(', ') || '—'}`);
      const png = await renderCard(browser, f, content);

      if (DRY) {
        await mkdir(OUT, { recursive: true });
        await writeFile(join(OUT, `${f.id}.png`), png);
        await writeFile(join(OUT, `${f.id}.txt`), buildPost(f, content, 300).text);
        log(`  ✓ dry run → out/${f.id}.png (+ .txt)`);
      } else {
        if (agent) await postBluesky(agent, buildPost(f, content, 300).text, png, f);
        if (ENV.POST_MASTODON === '1') await postMastodon(buildPost(f, content, 500).text, png, f);
      }
      state[f.id] = { class: f.class, flux: f.flux, ts: Date.now() };
      if (!DRY) await saveState(state);
    } catch (e) {
      log(`  ✗ ${f.id} failed: ${e.message}`);   // leave for next pass
    }
  }
  if (DRY) await saveState(state);   // remember dry-run ids too, so a re-run is quiet
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  if (!ENV.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
  log(`Solar poster — threshold ${MIN_FLARE_CLASS} (flux ≥ ${MIN_FLUX.toExponential(1)} W/m²), language ${REG ? 'EN + ' + REG.toUpperCase() : 'EN only'}.`);
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
  try {
    await pass(browser);
    if (!ONCE) {
      const ms = Number(ENV.POLL_MINUTES || 15) * 60e3;
      log(`Daemon mode — polling every ${ENV.POLL_MINUTES || 15} min.`);
      while (true) { await new Promise(r => setTimeout(r, ms)); await pass(browser).catch(e => log('pass error', e.message)); }
    }
  } finally { if (ONCE) await browser.close(); }
  if (ONCE) { log('Done.'); process.exit(0); }
})();
