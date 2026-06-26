/* Solar Flare Card Studio — pulls the current GOES X-ray flares (NOAA SWPC),
   asks Claude for a bilingual, card-length explanation, and renders it into
   three comparable SNS card designs for Bluesky / Mastodon. Mirror of the
   earthquake & volcano Mechanism Card studios. */
(function () {
  const { useState, useEffect, useCallback } = React;

  const AMBER = '#c98318', GOLD = '#e09e28', INK = '#2c2a27', MUT = '#8c887f',
        PAPER = '#f1eee8', SURF = '#fbfaf7', LINE = 'rgba(44,42,39,0.16)';
  const R_RGB = { 1: '230,194,90', 2: '224,160,40', 3: '217,122,43', 4: '196,74,42', 5: '160,40,40' };

  const LANGMETA = {
    ja: { name: '日本語', font: "'Noto Sans JP', sans-serif", dir: 'ltr' },
    zh: { name: '中文', font: "'Noto Sans SC', sans-serif", dir: 'ltr' },
    hi: { name: 'हिन्दी', font: "'Noto Sans Devanagari', sans-serif", dir: 'ltr' },
    es: { name: 'Español', font: "'Noto Sans', sans-serif", dir: 'ltr' },
    ar: { name: 'العربية', font: "'Noto Sans Arabic', sans-serif", dir: 'rtl' },
  };
  // section labels per regional language (secondary labels) — ported from solar-explain.js
  const SLBL = {
    ja: { s1: 'フレアとは？', s3: 'R等級の意味', s4: '地球への影響', effects: '考えられる影響', outlook: 'CME・オーロラの見通し', typeTag: '発生源(黒点群)', region: '太陽直下点', peak: 'ピーク', began: '開始' },
    zh: { s1: '什么是太阳耀斑', s3: 'R等级的含义', s4: '对地球的影响', effects: '可能的影响', outlook: 'CME与极光展望', typeTag: '发生源(黑子群)', region: '太阳直射点', peak: '峰值', began: '开始' },
    hi: { s1: 'सौर ज्वाला क्या है', s3: 'R-स्तर का अर्थ', s4: 'पृथ्वी पर प्रभाव', effects: 'संभावित प्रभाव', outlook: 'CME व ध्रुवीय-प्रकाश अनुमान', typeTag: 'स्रोत क्षेत्र', region: 'उप-सौर बिंदु', peak: 'शिखर', began: 'शुरू' },
    es: { s1: 'Qué es una erupción solar', s3: 'Qué significa el nivel R', s4: 'Efectos en la Tierra', effects: 'Posibles efectos', outlook: 'Panorama de CME y auroras', typeTag: 'Región de origen', region: 'Punto subsolar', peak: 'Pico', began: 'Inicio' },
    ar: { s1: 'ما هو التوهج الشمسي', s3: 'معنى مستوى R', s4: 'الآثار على الأرض', effects: 'الآثار المحتملة', outlook: 'توقعات CME والشفق', typeTag: 'منطقة المصدر', region: 'النقطة تحت الشمسية', peak: 'الذروة', began: 'البداية' },
  };
  const DISC = {
    en: 'Automated explanation from NOAA SWPC (GOES) X-ray data for general awareness — not an official forecast. Effects, the R-level reasoning and the CME/aurora outlook are estimates and may be revised. Always follow your local authority.',
    ja: 'NOAA SWPC（GOES）のX線データをもとに自動生成した一般向けの解説です。公式の予報ではありません。影響・R等級の背景・CME／オーロラの見通しは推定であり、更新される場合があります。情報は各国の公式機関に従ってください。',
    zh: '基于NOAA SWPC（GOES）X射线数据自动生成的科普解说，非官方预报。影响、R等级背景与CME／极光展望均为估计值，可能修订。请以官方机构信息为准。',
    hi: 'यह NOAA SWPC (GOES) एक्स-रे डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक पूर्वानुमान नहीं। प्रभाव, R-स्तर का कारण और CME/ध्रुवीय-प्रकाश अनुमान हैं और बदल सकते हैं। आधिकारिक स्रोत का पालन करें।',
    es: 'Explicación automática a partir de datos de rayos X de NOAA SWPC (GOES) con fines informativos; no es un pronóstico oficial. Los efectos, el nivel R y el panorama de CME/auroras son estimaciones y pueden revisarse. Siga a su autoridad local.',
    ar: 'شرح آلي مُولّد من بيانات الأشعة السينية من NOAA SWPC (GOES) لأغراض التوعية، وليس تنبؤًا رسميًا. الآثار وسبب مستوى R وتوقعات CME/الشفق تقديرية وقد تُراجَع. اتبع المصادر الرسمية دائمًا.',
  };
  const LOCALE = { ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar' };

  // ── helpers ─────────────────────────────────────────────────────────────
  const rScaleOf = window.SolarRScaleOf || (flux => {
    if (!Number.isFinite(flux)) return 0;
    if (flux >= 2e-3) return 5; if (flux >= 1e-3) return 4; if (flux >= 1e-4) return 3;
    if (flux >= 5e-5) return 2; if (flux >= 1e-5) return 1; return 0;
  });
  function coordOf(lat, lon) {
    if (lat == null || lon == null) return '—';
    return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  }
  function whenOf(v, regionLang) {
    if (!v) return '—';
    const ms = typeof v === 'number' ? v : Date.parse(v);
    if (isNaN(ms)) return '—';
    const loc = (regionLang && LOCALE[regionLang]) ? LOCALE[regionLang] : 'en-US';
    try {
      return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(ms)) + ' UTC';
    } catch (e) { return new Date(ms).toUTCString(); }
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
  function classToFlux(cls) {
    if (!cls) return NaN;
    const m = /^([ABCMX])([0-9.]+)?/i.exec(String(cls).trim());
    if (!m) return NaN;
    const base = { A: -8, B: -7, C: -6, M: -5, X: -4 }[m[1].toUpperCase()];
    const num = m[2] ? parseFloat(m[2]) : 1;
    return num * Math.pow(10, base);
  }

  function buildFlare(raw, regionLang) {
    let lat = raw.lat, lon = raw.lon;
    if ((lat == null || lon == null) && raw.peak) { const c = subsolarPoint(raw.peak); lon = c[0]; lat = c[1]; }
    return {
      ...raw, lat, lon,
      id: raw.id || ('fl-' + (raw.peak || Date.now())),
      rScale: raw.rScale != null ? raw.rScale : rScaleOf(raw.flux),
      rgb: raw.rgb || R_RGB[raw.rScale != null ? raw.rScale : rScaleOf(raw.flux)] || '224,158,40',
      report: raw.report || 'https://www.swpc.noaa.gov/products/solar-and-geophysical-event-reports',
      coordTxt: coordOf(lat, lon),
      whenTxt: whenOf(raw.peak, regionLang),
      beganTxt: whenOf(raw.begin || raw.peak, regionLang),
    };
  }
  function buildT(regionLang) {
    const base = { lang: regionLang || 'en', eyebrow: 'Solar flare', cls: 'Class', rscale: 'Radio blackout', peak: 'Peak (UTC)', began: 'Began', region: 'Sub-solar point', typeTag: 'Source region', effects: 'Possible effects', outlook: 'CME & aurora outlook', s1: 'What a solar flare is', s3: 'What this R-level means', s4: 'Effects at Earth', s1r: null, s3r: null, s4r: null };
    if (regionLang && SLBL[regionLang]) {
      const l = SLBL[regionLang];
      return { ...base, s1r: l.s1, s3r: l.s3, s4r: l.s4, peak: 'Peak (UTC) · ' + l.peak, began: 'Began · ' + l.began, region: 'Sub-solar point · ' + l.region, typeTag: 'Source region · ' + l.typeTag, effects: 'Possible effects · ' + l.effects, outlook: l.outlook };
    }
    return base;
  }
  const EFF_OK = ['radio', 'gps', 'satellite', 'grid', 'aurora', 'cme', 'aviation'];
  function normContent(c) {
    const rl = c.regionLang && LANGMETA[c.regionLang] ? c.regionLang : null;
    const norm = f => f ? { en: f.en || '', reg: rl ? (f.reg || '') : null } : { en: '', reg: null };
    return {
      regionType: ['simple', 'moderate', 'complex'].indexOf(c.regionType) >= 0 ? c.regionType : 'moderate',
      regionLabel: norm(c.regionLabel),
      mechanism: norm(c.mechanism), source: norm(c.source), levelMeaning: norm(c.levelMeaning),
      impacts: norm(c.impacts), outlook: norm(c.outlook),
      effects: Array.isArray(c.effects) ? c.effects.filter(h => EFF_OK.indexOf(h) >= 0).slice(0, 4) : [],
      regionLang: rl,
      disclaimer: c.disclaimer || { en: DISC.en, reg: rl ? DISC[rl] : null },
    };
  }
  const EXPORT = new URLSearchParams(location.search).get('export');
  // regional language paired with English on the cards (the site is JA-first;
  // the auto-poster uses the same default and exposes SOLAR_REG_LANG to change it).
  const REG = (new URLSearchParams(location.search).get('reg')) || 'ja';

  // ── sample (studio always renders something) ─────────────────────────────
  const SAMPLE_F = buildFlare({ class: 'X2.3', flux: 2.3e-4, peak: new Date(Date.now() - 2 * 3600e3).toISOString(), begin: new Date(Date.now() - 2 * 3600e3 - 11 * 60e3).toISOString() }, REG);
  const SAMPLE_C = normContent({
    regionType: 'complex',
    regionLabel: { en: 'Large, magnetically complex sunspot group', reg: '大きく磁場が複雑な黒点群' },
    mechanism: { en: 'A solar flare is a sudden release of magnetic energy in the Sun’s atmosphere. This one sent a burst of X-rays that reached Earth in about eight minutes.', reg: '太陽フレアは太陽大気で磁気エネルギーが急に解放される現象です。今回はX線が放出され、約8分で地球に到達しました。' },
    source: { en: 'Flares erupt from active regions — sunspot groups with tangled magnetic fields. A flare this strong comes from a large, complex group.', reg: '黒点群（活動領域）の絡まった磁場からフレアが発生します。この規模は大きく複雑な黒点群が源です。' },
    levelMeaning: { en: 'R3 means a wide-area shortwave (HF) radio blackout across the entire sunlit side of Earth for about an hour, with navigation signal outages.', reg: 'R3は地球の昼側全域で約1時間、広範囲の短波(HF)通信障害が起き、測位信号も乱れることを意味します。' },
    impacts: { en: 'Shortwave radio used by aviation, mariners and ham operators may fade on the daylit side; GPS accuracy can briefly degrade.', reg: '航空・船舶・アマチュア無線などの短波が昼側で減衰し、GPS精度が一時的に低下することがあります。' },
    outlook: { en: 'A flare this size can launch a coronal mass ejection (CME). If one is aimed at Earth, a geomagnetic storm and auroras are possible a day or two later.', reg: 'この規模ではCME（コロナ質量放出）を伴うことがあります。地球向きなら1〜2日後に地磁気嵐やオーロラの可能性があります。' },
    effects: ['radio', 'gps', 'aviation', 'cme'],
    regionLang: REG,
  });

  // ── data: current GOES X-ray flares (NOAA SWPC) ──────────────────────────
  async function fetchFlares() {
    const DIRECT = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json';
    const PROXY = '/.netlify/functions/swpc-flares';
    let rows = [];
    try { rows = await fetch(DIRECT).then(r => r.json()); }
    catch (e) { try { rows = await fetch(PROXY).then(r => r.json()); } catch (e2) { rows = []; } }
    const seen = {}, list = [];
    (Array.isArray(rows) ? rows : []).forEach(e => {
      const cls = e.max_class || e.current_class || e.begin_class;
      const flux = Number.isFinite(e.max_xrlong) ? e.max_xrlong : classToFlux(cls);
      if (!Number.isFinite(flux) || flux < 1e-5) return;        // M-class and above only
      const peak = e.max_time || e.time_tag || e.begin_time;
      if (!peak) return;
      const id = 'fl-' + peak; if (seen[id]) return; seen[id] = 1;
      list.push(buildFlare({ id, class: cls, flux, peak, begin: e.begin_time || peak, end: e.end_time || null }, REG));
    });
    // newest first, X-class above M-class within the same time
    list.sort((a, b) => (b.flux - a.flux));
    const byTime = list.slice().sort((a, b) => Date.parse(b.peak) - Date.parse(a.peak));
    return byTime;
  }

  // ── Claude (card-length bilingual content) — preview fallback ────────────
  const R_LEVELS = {
    1: 'R1 (Minor) — ≥M1 flare. Weak/brief HF radio degradation on the sunlit side.',
    2: 'R2 (Moderate) — ≥M5 flare. Limited HF radio blackout on the sunlit side for tens of minutes.',
    3: 'R3 (Strong) — ≥X1 flare. Wide-area HF radio blackout on the entire sunlit side for ~an hour.',
    4: 'R4 (Severe) — ≥X10 flare. HF radio blackout on most of the sunlit side for 1–2 hours.',
    5: 'R5 (Extreme) — ≥X20 flare. Complete HF radio blackout on the entire sunlit side for hours.',
  };
  function buildPrompt(f, lang) {
    const wantReg = lang !== 'en';
    const langName = wantReg ? { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang] : null;
    const r = f.rScale || rScaleOf(f.flux);
    return `You are a solar physicist and space-weather forecaster writing a warm, clear explanation of ONE specific solar flare for ordinary members of the public — people with no science background.

Flare facts:
- GOES soft X-ray class: ${f.class} (peak 1–8 Å X-ray flux of the flare).
- NOAA radio-blackout level: R${r}. ${R_LEVELS[r] || 'Below R1 — minimal radio effect.'}
- Peak time (UTC): ${f.peak || 'recent'}.
- Sub-solar point at peak: latitude ${f.lat != null ? f.lat.toFixed(1) : '?'}, longitude ${f.lon != null ? f.lon.toFixed(1) : '?'} — the Sun was overhead there, the centre of the HF radio blackout on Earth's sunlit hemisphere.

Use your knowledge of solar flares, magnetically complex sunspot groups (active regions), the NOAA R-scale and typical space-weather impacts. Be factual and specific to a flare of THIS class.

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
- "effects": 2–4 from the allowed list relevant to this flare.
${wantReg ? `Every "reg" MUST be ${langName}; every "en" 100% natural English. Never mix languages within a field.` : 'Set every "reg" to null.'}
Do not restate the raw class code inside the text fields.`;
  }
  function parseContent(raw, lang) {
    let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
    const o = JSON.parse(txt);
    return normContent({ ...o, regionLang: lang !== 'en' ? lang : null });
  }
  async function generateContent(f, lang) {
    const raw = await window.claude.complete({ messages: [{ role: 'user', content: buildPrompt(f, lang) }] });
    return parseContent(raw, lang);
  }

  // ── post text ────────────────────────────────────────────────────────────
  const HASHTAGS = { en: ['#solarflare', '#spaceweather'], ja: ['#太陽フレア', '#宇宙天気'] };
  function composePost(f, content) {
    const rl = content.regionLang;
    const url = `globelabo.netlify.app/#flare=${f.id}`;
    const r = f.rScale || rScaleOf(f.flux);
    const word = r ? ((window.SolarRLabels && (window.SolarRLabels.en || []))[r - 1] || '') : '';
    const lines = [`☀️ ${f.class} solar flare · R${r}${word ? ' ' + word : ''}`, `${content.mechanism.en}`];
    if (rl === 'ja' && content.mechanism.reg) lines.push(`${f.class}フレア（電波障害R${r}）${content.mechanism.reg}`);
    lines.push(`Live map: ${url}`);
    const tags = [...HASHTAGS.en];
    if (rl === 'ja') tags.push(...HASHTAGS.ja, '#宇宙天気予報');
    lines.push(tags.join(' '));
    return lines.join('\n');
  }

  // ── scaled card frame ─────────────────────────────────────────────────────
  function CardFrame({ label, children, w = 500 }) {
    const scale = w / 1080;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: GOLD }} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK }}>{label}</span>
        </div>
        <div style={{ width: w, height: 1350 * scale, overflow: 'hidden', boxShadow: '0 18px 50px -24px rgba(44,42,39,0.5)', border: '1px solid ' + LINE, background: PAPER }}>
          <div style={{ width: 1080, height: 1350, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
        </div>
      </div>
    );
  }

  // ── composer ───────────────────────────────────────────────────────────────
  function Composer({ f, content }) {
    const [platform, setPlatform] = useState('bluesky');
    const [text, setText] = useState('');
    const [copied, setCopied] = useState(false);
    useEffect(() => { setText(composePost(f, content)); }, [f.id, content]);
    const limit = platform === 'bluesky' ? 300 : 500;
    const over = text.length > limit;
    const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {} };
    return (
      <div style={{ background: SURF, border: '1px solid ' + LINE, padding: '20px 22px', maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK }}>Auto-post text</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['bluesky', 'mastodon'].map(p => (
              <button key={p} onClick={() => setPlatform(p)} style={{ fontSize: 12.5, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', border: '1px solid ' + (platform === p ? INK : LINE), background: platform === p ? INK : 'transparent', color: platform === p ? PAPER : MUT }}>{p}</button>
            ))}
          </div>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false} style={{ width: '100%', minHeight: 150, resize: 'vertical', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid ' + (over ? '#cf4f2e' : LINE), background: PAPER, color: INK, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.5 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: over ? '#cf4f2e' : MUT, fontVariantNumeric: 'tabular-nums' }}>{text.length} / {limit} {over ? '· over limit' : ''} · attach the card image above</div>
          <button onClick={copy} style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + INK, background: copied ? INK : 'transparent', color: copied ? PAPER : INK }}>{copied ? 'Copied' : 'Copy text'}</button>
        </div>
      </div>
    );
  }

  // ── app ────────────────────────────────────────────────────────────────────
  function App() {
    const [f, setF] = useState(SAMPLE_F);
    const [content, setContent] = useState(SAMPLE_C);
    const [status, setStatus] = useState('sample');
    const [msg, setMsg] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [flares, setFlares] = useState([]);

    const runFor = useCallback(async (fl) => {
      setF(fl); setStatus('loading'); setMsg('Generating explanation for ' + fl.class + '…');
      try {
        const c = await generateContent(fl, REG);
        setContent(c); setStatus('ready'); setMsg('');
      } catch (e) {
        setStatus('error'); setMsg('AI generation failed (' + (e.message || 'error') + '). Flare loaded; explanation unavailable.');
      }
    }, []);

    const latest = useCallback(async () => {
      setStatus('loading'); setMsg('Finding recent solar flares…');
      try {
        const list = await fetchFlares();
        setFlares(list);
        if (!list.length) { setStatus('error'); setMsg('No M-class or stronger flares in the last 7 days (NOAA SWPC).'); return; }
        runFor(list[0]);
      } catch (e) { setStatus('error'); setMsg(e.message || 'Lookup failed'); }
    }, [runFor]);

    const regMeta = content.regionLang ? { code: content.regionLang, ...LANGMETA[content.regionLang] } : null;
    const T = buildT(content.regionLang);
    const cards = window.SolarCards;
    const Hero = cards['globe-hero'].el;

    useEffect(() => {
      window.__studio = {
        render: (fr, c) => { setF(buildFlare(fr, c && c.regionLang)); setContent(normContent(c)); setStatus('ready'); },
        composePost, DISC, LANGMETA,
      };
      window.__studioReady = true;
    }, []);

    const downloadPng = async () => {
      const node = document.querySelector('[data-export-card="globe-hero"]');
      if (!node || !window.htmlToImage) { alert('Export library still loading — try again in a moment.'); return; }
      setExporting(true);
      const canvas = node.querySelector('canvas');
      let box = null;
      if (canvas) {
        const cardRect = node.getBoundingClientRect();
        const scale = cardRect.width / 1080;
        const gr = canvas.parentElement.getBoundingClientRect();
        box = { x: (gr.left - cardRect.left) / scale, y: (gr.top - cardRect.top) / scale, w: gr.width / scale, h: gr.height / scale };
      }
      const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
      try {
        const url = await withTimeout(window.htmlToImage.toPng(node, { pixelRatio: 1, width: 1080, height: 1350, backgroundColor: '#fbfaf7', skipFonts: true, style: { transform: 'none' }, filter: (n) => n.tagName !== 'CANVAS' }), 22000);
        const out = document.createElement('canvas'); out.width = 1080; out.height = 1350;
        const cx = out.getContext('2d');
        const im = new Image(); im.src = url; await im.decode();
        cx.drawImage(im, 0, 0, 1080, 1350);
        if (canvas && box) { const side = Math.min(box.w, box.h); cx.drawImage(canvas, box.x + (box.w - side) / 2, box.y + (box.h - side) / 2, side, side); }
        const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = `globe-flare-${f.id}.png`; a.click();
      } catch (e) {
        console.error(e);
        window.open('Solar Flare Cards.html?export=globe-hero', '_blank');
        alert('In-browser PNG export is slow in this preview. Opened the card at full size in a new tab — screenshot it, or use the auto-poster kit for a guaranteed render.');
      } finally { setExporting(false); }
    };

    if (EXPORT) {
      return <div style={{ width: 1080, height: 1350 }}><Hero f={f} content={content} regMeta={regMeta} T={T} /></div>;
    }

    const busy = status === 'loading';
    return (
      <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: "'Helvetica Neue', 'Noto Sans', system-ui, sans-serif" }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(241,238,232,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderBottom: '1px solid ' + LINE }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginRight: 4 }}>
              <svg width="30" height="30" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill={PAPER} /><g fill="none" stroke={INK} strokeWidth="2.4"><circle cx="32" cy="32" r="20" /><ellipse cx="32" cy="32" rx="8.4" ry="20" /><line x1="12" y1="32" x2="52" y2="32" /></g><circle cx="46" cy="19" r="6.2" fill={GOLD} /></svg>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>Globe · Solar Flare Cards</div>
                <div style={{ fontSize: 11.5, color: MUT, letterSpacing: '0.04em', marginTop: 2 }}>Flare auto-explainer for Bluesky / Mastodon</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={latest} disabled={busy} style={{ padding: '9px 18px', border: 'none', background: busy ? MUT : INK, color: PAPER, fontWeight: 600, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Recent flares</button>
            </div>
          </div>
          {flares.length > 1 && (
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {flares.slice(0, 10).map(a => {
                const on = a.id === f.id;
                return (
                  <button key={a.id} onClick={() => runFor(a)} disabled={busy} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 999, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', border: '1px solid ' + (on ? INK : LINE), background: on ? INK : 'transparent', color: on ? PAPER : MUT, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgb(' + a.rgb + ')' }} />{a.class} · R{a.rScale}
                  </button>
                );
              })}
            </div>
          )}
          {(msg || status === 'sample') && (
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px 12px' }}>
              <span style={{ fontSize: 12.5, color: status === 'error' ? '#cf4f2e' : MUT, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {busy && <span className="spin" style={{ width: 11, height: 11, border: '2px solid ' + LINE, borderTopColor: GOLD, borderRadius: '50%', display: 'inline-block' }} />}
                {msg || 'Showing a sample (X2.3, radio blackout R3). Tap “Recent flares” to pull live NOAA SWPC data and run the AI.'}
              </span>
            </div>
          )}
        </div>

        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 28px 60px' }}>
          <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 auto' }}><CardFrame label="Globe Hero" w={500}><Hero f={f} content={content} regMeta={regMeta} T={T} /></CardFrame></div>
            <div style={{ flex: 1, minWidth: 340, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={downloadPng} disabled={exporting} style={{ padding: '9px 18px', border: 'none', background: exporting ? MUT : INK, color: PAPER, fontWeight: 600, fontSize: 13.5, cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {exporting ? <><span className="spin" style={{ width: 13, height: 13, border: '2px solid rgba(241,238,232,0.4)', borderTopColor: PAPER, borderRadius: '50%', display: 'inline-block' }} />Rendering…</> : <><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Download card PNG</>}
                </button>
                <button onClick={() => setShowAll(s => !s)} style={{ padding: '9px 16px', border: '1px solid ' + LINE, background: 'transparent', color: MUT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>{showAll ? 'Hide other concepts' : 'Compare other concepts'}</button>
              </div>
              <Composer f={f} content={content} />
              <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.65, borderTop: '1px solid ' + LINE, paddingTop: 14 }}>
                Workflow: attach the 1080×1350 PNG to your Bluesky / Mastodon post with the text above. For hands-off posting whenever a strong flare occurs, run the <b style={{ color: INK }}>auto-poster kit</b> (<code style={{ background: SURF, padding: '1px 5px', border: '1px solid ' + LINE }}>auto-poster/solar-poster.mjs</code>) on a schedule — it polls NOAA SWPC, generates this exact card, and posts to both networks.
              </div>
            </div>
          </div>
          {showAll && (
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'center', marginTop: 36, paddingTop: 30, borderTop: '1px solid ' + LINE }}>
              {['field-report', 'monolith'].map(key => {
                const C = cards[key].el;
                return <CardFrame key={key} label={cards[key].label} w={332}><C f={f} content={content} regMeta={regMeta} T={T} /></CardFrame>;
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
