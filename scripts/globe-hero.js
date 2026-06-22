/**
 * globe-hero.js
 * 大きめの地震（既定 M6.0 以上）向けに「Globe Hero」カード（1080×1350 PNG）を生成します。
 *
 *   USGS の地震 ──▶ Claude（発震機構の多言語 JSON）
 *               ──▶ Earthquake Mechanism Cards.html をヘッドレスで描画して PNG 化
 *
 * quake-post.js から呼び出されます。Claude（ANTHROPIC_API_KEY）と Playwright(chromium)
 * が必要です。どちらか欠けても呼び出し側で従来のシェア画像にフォールバックします。
 *
 *   const { buildGlobeHero } = require('./globe-hero');
 *   const hero = await buildGlobeHero(q); // { png:Buffer, content } を返す（失敗時は throw）
 */

const path = require('path');
const { pathToFileURL } = require('url');

// 描画元のスタジオ HTML（リポジトリ直下に配置されている前提。scripts/ の1つ上）
const HTML = pathToFileURL(path.join(__dirname, '..', 'Earthquake Mechanism Cards.html')).href;

const LANGS = { ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar' };
const DISC_EN = 'Automated explanation from USGS data for general awareness — not an official hazard assessment. Mechanism and aftershock outlook are estimates and may be revised. Follow your local authority for safety guidance.';

function depthClass(d) { return d < 70 ? 'shallow' : d < 300 ? 'intermediate' : 'deep'; }

// ── Claude：発震機構の多言語 JSON を生成 ───────────────────────────────
async function generateContent(q) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

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
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
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

// ── Playwright：スタジオ HTML を描画して Globe Hero カードを PNG 化 ───────
async function renderCard(q, content) {
  // 遅延 require：M6+ が来たときだけ chromium を要求する（軽い地震では未使用）
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 });
    await page.goto(HTML + '?export=globe-hero', { waitUntil: 'networkidle' });
    await page.waitForFunction('window.__studioReady === true', { timeout: 20000 });
    // 生の地震データ（studio 側の buildQuake が整形する）
    const qr = { id: q.id, mag: q.mag, place: q.place, lon: q.lon, lat: q.lat,
      depth: q.depth, time: q.time, tsunami: q.tsunami ? 1 : 0 };
    await page.evaluate(({ qr, c }) => window.__studio.render(qr, c), { qr, c: content });
    await page.waitForTimeout(2500);            // 地球儀 canvas とリップルが落ち着くのを待つ
    await page.evaluate(() => document.fonts.ready);
    const el = await page.waitForSelector('[data-export-card="globe-hero"]');
    const buf = await el.screenshot({ type: 'png' });
    return buf;
  } finally {
    await browser.close();
  }
}

// ── 投稿文（Mechanism Cards の「Auto-post text」と同じ組み立て）───────────
// 震源国の言語に合わせた基本ハッシュタグ
const HASHTAGS = {
  en: ['#earthquake', '#seismology'],
  ja: ['#地震', '#防災'],
  zh: ['#地震', '#防灾'],
  hi: ['#भूकंप', '#भूविज्ञान'],
  es: ['#sismo', '#terremoto'],
  ar: ['#زلزال', '#زلازل'],
};
// USGS の place 文字列から #地名 / #国 タグを取り出す
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

/**
 * Mechanism Cards スタジオの composePost / poster.mjs buildPost と同じ本文を組み立てる。
 * 文字数上限に収まるよう、まず地域語の行を落とし、次に英語要約を詰める。
 * @param {object} q       地震データ
 * @param {object} content generateContent の戻り値
 * @param {string} url     サイトの深リンク（Live map: に入る）
 * @param {number} limit   文字数上限（Bluesky 300 / Mastodon 500）
 * @returns {string} 投稿本文
 */
function buildHeroPost(q, content, url, limit) {
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
  const fit = () => head + body + reg + tail;
  // 収まらなければ：まず地域語の行を落とし、それでも超えたら英語要約を詰める
  if (fit().length > limit && reg) reg = '';
  if (fit().length > limit) {
    const room = limit - (head + reg + tail).length - 3;
    body = '\n' + content.faultTypeLabel.en + ' — ' + content.nature.en;
    if (body.length > room) body = body.slice(0, Math.max(0, room)) + '…';
  }
  return fit();
}

/**
 * @param {{id,mag,place,depth,time,tsunami,lon,lat}} q
 * @returns {Promise<{png:Buffer, content:object}>}  失敗時は throw
 */
async function buildGlobeHero(q) {
  const content = await generateContent(q);
  const png = await renderCard(q, content);
  return { png, content };
}

module.exports = { buildGlobeHero, generateContent, buildHeroPost };
