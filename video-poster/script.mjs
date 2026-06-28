#!/usr/bin/env node
/* Globe Weekly — step 2: turn the week's data into a PROGRAM the studio can play.
 *
 *   out/data.json  --(Claude: conversational JA/EN dialogue + localization)-->  out/program.json
 *
 * The PROGRAM schema matches exactly what studio/weekly-studio.html consumes
 * (window.__PROGRAM). Panels and focus cues are wired deterministically here;
 * Claude only writes the natural back-and-forth and the localized labels.
 *
 * Run: node --env-file=.env script.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT, HOSTS, DISCLAIMER } from './config.mjs';

const ENV = process.env;
const TARGET = Number(ENV.TARGET_MINUTES || 5);
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---- formatting helpers ----
const MON_JA = d => `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
const DAY_JA = d => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
const DAY_EN = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
function utcLabel(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return { ja: `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UT`,
           en: `${DAY_EN(d)}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UT` };
}
function rScale(cls) {
  const k = cls[0], n = parseFloat(cls.slice(1) || '1');
  if (k === 'X' && n >= 10) return 'R4';
  if (k === 'X') return 'R3';
  if (k === 'M' && n >= 5) return 'R2';
  if (k === 'M') return 'R1';
  return '—';
}

// ---- Claude ----
async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ENV.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const resp = await res.json();
  if (resp.stop_reason === 'max_tokens') log('⚠ hit max_tokens — JSON likely truncated. Set ANTHROPIC_MODEL to a model with larger output or reduce TARGET_MINUTES.');
  let txt = (resp.content?.[0]?.text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0) txt = txt.slice(a, b + 1);
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error('JSON parse failed (likely truncated response). Try setting TARGET_MINUTES to a smaller value or check the raw response. Original: ' + e.message);
  }
}

function buildPrompt(data) {
  const q = data.quakes, f = data.flares, v = data.volcanoes;
  const imp = x => x.impact ? `, OFFICIAL IMPACT (${x.impact.source}, alert ${x.impact.alert})${x.impact.summary ? ': ' + x.impact.summary : ''}` : '';
  const quakeFacts = q.top.map((x, i) => `  quake:${i} — M${x.mag}, "${x.place}", depth ${x.depth}km, ${x.tsunami ? 'USGS tsunami flag SET' : 'no tsunami flag'} (lat ${x.lat}, lon ${x.lon})${imp(x)}`).join('\n');
  const volFacts = v.map((x, i) => `  volcano:${i} — ${x.name} (${x.country}), ${x.source === 'JMA' ? 'JMA level ' + x.level : 'USGS aviation ' + (x.aviation || x.alert)}${imp(x)}`).join('\n') || '  (none elevated this week)';
  const flareFact = f.strongest ? `  flare:0 — class ${f.strongest.cls} from ${f.strongest.region}, ${rScale(f.strongest.cls)} radio blackout` : '  (no notable flares)';

  return `You are writing the script for "Globe Weekly", a warm, friendly weekly web show that recaps the past 7 days of earthquakes, volcanoes and solar flares for a general audience. Two presenters talk to each other:
- host = ${HOSTS.host.ja} (${HOSTS.host.en}), the ANCHOR — curious, frames each topic, asks the questions a normal viewer would ask, reacts ("へぇ", "そうなんだ", "なるほど").
- expert = ${HOSTS.expert.ja} (${HOSTS.expert.en}), the ANALYST — explains the science simply, calm, never alarmist but never falsely reassuring.

THIS WEEK'S FACTS (${data.week.start} → ${data.week.end}):
Earthquakes: ${q.total} events M4.5+ total. Notable:
${quakeFacts || '  (quiet week)'}
Volcanoes:
${volFacts}
Solar flares: ${f.mCount} M-class, ${f.xCount} X-class.
${flareFact}

TONE — IMPORTANT: write a genuine CONVERSATION, not a narration read aloud. Short sentences. Lots of short back-and-forth turns. The host reacts and asks; the expert answers in plain words and sometimes adds a vivid everyday comparison. Vary who speaks. Avoid restating numbers that are already on the on-screen panel — talk about what they MEAN. Aim for about ${TARGET} minutes of speech total (~${Math.round(TARGET * 13)} short lines across all segments).

JAPANESE STYLE — IMPORTANT: 日本語のセリフ（dialogue・intro・outro・outlookBullets の body）はすべて、やわらかく丁寧な話し言葉＝丁寧語（です・ます調）で書いてください。体言止め（名詞や名詞句で文を終える言い方）は避け、各文を述語できちんと締めてください。
  例: ✗「震源はかなり浅め。」→ ○「震源はかなり浅めでした。」
      ✗「津波の心配はなし。」→ ○「津波の心配はなさそうです。」
      ✗「同じ領域がまだ活発。」→ ○「同じ領域が今も活発に動いています。」
相づちや問いかけも丁寧に（「へぇ、そうなんですね」「それはどういう意味なんですか？」など）。ただし一文は簡潔に保ち、キャプション1行に自然に収まる長さにしてください。なお on-screen のラベル類（fault_ja・note_ja・label_ja・where_ja など短い名詞ラベル）はこの限りではなく、従来どおり簡潔な名詞表記でかまいません。

NAMES: the presenters' names are displayed on screen — do NOT have either host say their own name or introduce themselves at any point in the script. Jump straight into the content.

Return ONLY raw JSON (no markdown) with EXACTLY this shape:
{
  "events": {
    "quakes": [ { "ja": "<place in natural Japanese>", "en": "<clean English place>", "fault_ja": "<fault type, short JA>", "fault_en": "<fault type, short EN>", "mechanism": "strike-slip|normal|reverse|subduction" } ],   // one per quake:i, same order
    "volcanoes": [ { "ja": "<name JA>", "en": "<name EN>", "where_ja": "<region JA>", "where_en": "<region EN>", "label_ja": "<alert label JA>", "label_en": "<alert label EN>", "note_ja": "<one-line status JA>", "note_en": "<one-line status EN>" } ],  // one per volcano:i
    "flare": { "effect_ja": "<plain effect on Earth, JA>", "effect_en": "<plain effect EN>", "aurora": true|false }
  },
  "intro":  { "ja": "<2-line welcome statement JA, can use \\n>", "en": "<2-line welcome EN>" },
  "outro":  { "ja": "<short sign-off statement JA>", "en": "<short sign-off EN>" },
  "outlookBullets": [ { "title_ja":"", "title_en":"", "body_ja":"", "body_en":"" } ],   // exactly 3
  "dialogue": {
    "open":    [ { "who":"host|expert", "ja":"", "en":"", "focus":"quake:0|volcano:0|flare:0|list|null" } ],
    "quakes":  [ ... 8-14 lines, focus on the quake being discussed ... ],
    "volcano": [ ... 4-8 lines ... ],
    "flare":   [ ... 5-9 lines ... ],
    "outlook": [ ... 4-7 lines ... ],
    "outro":   [ ... 2-3 lines ... ]
  }
}
Rules: every "en" must be natural English, every "ja" natural Japanese. For each quake set "mechanism" to the single best-fitting category for the animated diagram: "strike-slip" (blocks slide sideways), "normal" (crust pulled apart, one side drops), "reverse" (crust pushed together, one side rides up), or "subduction" (megathrust at an ocean trench — use this for interplate/沈み込み帯 events, which also drive most tsunamis). Set "focus" to the event a line is about (use the quake:i / volcano:i / flare:0 keys above), "list" to show the quake list, or null to hold. Omit the volcano or flare segment's dialogue (empty array) if there is nothing notable. Keep each spoken line under ~28 Japanese characters / ~16 English words so it fits one caption line (polite です/ます endings take a little more room — that is fine).
IMPACT: when a line carries an "OFFICIAL IMPACT" note, you MAY mention it in plain language but you MUST name the source (e.g. 「GDACSの速報では…」 / “According to GDACS…”). Use ONLY the wording provided — never invent casualty figures, and if there is no impact note, do not speculate about damage.

ALERT COLOR EXPLANATION: Whenever any event has an official impact alert whose level is YELLOW, ORANGE, or RED, include exactly ONE short back-and-forth exchange where the host asks what the color means and the expert answers calmly in plain language. Use these definitions only — do not embellish:
  • YELLOW (USGS PAGER): 局地的な限られた範囲で軽微な被害が出る可能性 / localized, limited damage possible in isolated areas
  • ORANGE (USGS PAGER / GDACS): 重大な被害や負傷者が出る恐れがあり、当局が対応中 / significant damage and casualties possible; authorities are responding
  • RED (USGS PAGER / GDACS): 大規模な被害・多数の犠牲者が想定される最高レベル / highest level — major damage and mass casualties expected
Place this exchange naturally within the relevant segment (quakes or volcano), right after the impact source is first mentioned. Always frame the color as a pre-event mobilization estimate, NOT a confirmed death toll — keep the tone calm and factual. The host's question should feel genuinely curious, e.g.「ORANGEって、どういう意味なんですか？」. The expert's answer must fit in ≤2 spoken lines.`;
}

// ---- assemble the studio PROGRAM ----
function assemble(data, c) {
  const q = data.quakes, f = data.flares, v = data.volcanoes;
  const start = new Date(data.week.start), end = new Date(data.week.end);

  const quakes = q.top.map((x, i) => {
    const loc = (c.events.quakes && c.events.quakes[i]) || {};
    const d = new Date(x.time);
    return { mag: x.mag, ja: loc.ja || x.place, en: loc.en || x.place, coords: [x.lon, x.lat],
      depth: x.depth, fault_ja: loc.fault_ja || '—', fault_en: loc.fault_en || '—',
      mechanism: loc.mechanism || '',
      impact: x.impact || null,
      tsunami: x.tsunami, day_ja: DAY_JA(d), day_en: DAY_EN(d) };
  });
  const volcanoes = v.map((x, i) => {
    const loc = (c.events.volcanoes && c.events.volcanoes[i]) || {};
    const o = { ja: loc.ja || x.name, en: loc.en || x.name, where_ja: loc.where_ja || '', where_en: loc.where_en || x.country,
      coords: [x.lon, x.lat], label_ja: loc.label_ja || '', label_en: loc.label_en || '',
      note_ja: loc.note_ja || '', note_en: loc.note_en || '', impact: x.impact || null };
    if (x.source === 'JMA') o.level = x.level; else o.aviation = x.aviation || x.alert;
    return o;
  });
  const flares = [];
  if (f.strongest) {
    const pk = utcLabel(f.strongest.peak);
    flares.push({ cls: f.strongest.cls, region: f.strongest.region, coords: f.strongest.coords || [140, 8],
      r: rScale(f.strongest.cls), peak_ja: pk.ja, peak_en: pk.en,
      effect_ja: c.events.flare?.effect_ja || '', effect_en: c.events.flare?.effect_en || '',
      aurora: !!c.events.flare?.aurora });
  }

  // wire panels onto dialogue lines
  const wire = (lines, kind) => (lines || []).map(ln => {
    const out = { who: ln.who === 'expert' ? 'expert' : 'host', ja: ln.ja, en: ln.en };
    const fo = ln.focus && ln.focus !== 'null' ? ln.focus : null;
    if (fo) out.focus = fo;
    if (fo && fo.startsWith('quake:')) out.panel = { type: 'quakefocus', ix: +fo.split(':')[1] };
    else if (fo === 'list') out.panel = { type: 'quakelist' };
    if (fo && fo.startsWith('volcano:')) out.panel = { type: 'volcano', ix: +fo.split(':')[1] };
    if (fo && fo.startsWith('flare:')) out.panel = { type: 'flare', ix: +fo.split(':')[1] };
    return out;
  });

  const segments = [];
  // Fixed welcome greeting prepended before Claude's opening dialogue.
  const welcome = [{
    who: 'host',
    ja: 'グローブ・ウィークリーにようこそ。今週の地球の動きを見ていきましょう。',
    en: "Welcome to Globe Weekly. Let's take a look at what Earth has been up to this week.",
    panel: { type: 'intro' },
  }];
  segments.push({ id: 'open', kind: 'quake', titleCard: false, panel: { type: 'intro' }, lines: [...welcome, ...wire(c.dialogue.open)] });

  if (quakes.length) segments.push({ id: 'quakes', kind: 'quake', titleCard: true,
    eyebrow_ja: 'セクション 01', eyebrow_en: 'Section 01', title_ja: '今週の地震', title_en: 'This Week in Earthquakes',
    sub_ja: `M4.5以上 ${q.total}回`, sub_en: `${q.total} events M4.5+`,
    panel: { type: 'quakelist' }, lines: wire(c.dialogue.quakes) });

  if (volcanoes.length && (c.dialogue.volcano || []).length) segments.push({ id: 'volcano', kind: 'volcano', titleCard: true,
    eyebrow_ja: 'セクション 02', eyebrow_en: 'Section 02', title_ja: '火山の動き', title_en: 'Volcano Watch',
    sub_ja: '警戒レベルの変化', sub_en: 'Changes in alert level',
    panel: { type: 'volcano', ix: 0 }, lines: wire(c.dialogue.volcano) });

  if (flares.length && (c.dialogue.flare || []).length) segments.push({ id: 'flare', kind: 'flare', titleCard: true, short: true,
    eyebrow_ja: 'セクション 03', eyebrow_en: 'Section 03', title_ja: '太陽フレア', title_en: 'Solar Flares',
    sub_ja: '今週いちばんの注目', sub_en: 'The week’s standout',
    panel: { type: 'flare', ix: 0 }, lines: wire(c.dialogue.flare) });

  segments.push({ id: 'outlook', kind: 'outlook', titleCard: true,
    eyebrow_ja: 'セクション 04', eyebrow_en: 'Section 04', title_ja: '今後の見込み', title_en: 'The Week Ahead',
    sub_ja: '注意して見ておきたい点', sub_en: 'Things worth watching',
    panel: { type: 'outlook' }, lines: wire(c.dialogue.outlook) });

  // Hardcoded GLOBE LABO promo — always appended after Claude's outro lines.
  const promoLines = [
    {
      who: 'host',
      ja: '地球儀を回しながら今週の地震・火山・フレアを自分で確認したい方は、グローブ・ラボのサイトをぜひご覧ください。',
      en: "If you'd like to explore this week's events on the spinning globe yourself, head to Globe Labo — link in the description.",
      panel: { type: 'outro' },
    },
    {
      who: 'expert',
      ja: 'リアルタイムのデータで地球全体の動きが見られます。概要欄にリンクを貼ってあります。',
      en: 'You can see live data from around the whole planet. The link is right below this video.',
      panel: { type: 'outro' },
    },
  ];
  segments.push({ id: 'outro', kind: 'outlook', titleCard: false, panel: { type: 'outro' }, lines: [...wire(c.dialogue.outro), ...promoLines] });

  // if no segment got the short flag (no flare), mark the quakes segment
  if (!segments.some(s => s.short)) { const qs = segments.find(s => s.id === 'quakes'); if (qs) qs.short = true; }

  return {
    week: { start_ja: MON_JA(start), end_ja: MON_JA(end), start_en: DAY_EN(start), end_en: DAY_EN(end), year: data.week.year, no: data.week.no },
    hosts: HOSTS,
    events: { quakes, quakeTotal: q.total, volcanoes, flares,
      flareSummary_ja: `Mクラス${f.mCount}回 ・ Xクラス${f.xCount}回`, flareSummary_en: `${f.mCount} M-class · ${f.xCount} X-class` },
    intro: c.intro, outro: c.outro, outlookBullets: c.outlookBullets,
    disclaimer: DISCLAIMER,
    segments,
  };
}

(async () => {
  if (!ENV.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
  const data = JSON.parse(await readFile(join(OUT, 'data.json'), 'utf8'));
  log('writing script with Claude…');
  const c = await callClaude(buildPrompt(data));
  const program = assemble(data, c);
  await writeFile(join(OUT, 'program.json'), JSON.stringify(program, null, 2));
  const nLines = program.segments.reduce((n, s) => n + s.lines.length, 0);
  log(`program.json  segments:${program.segments.length}  lines:${nLines}`);
})();
