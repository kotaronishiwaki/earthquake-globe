/* Mechanism Card Studio — fetches a quake from USGS, asks Claude for a
   bilingual (English + region-matched) mechanism explanation, and renders it
   into three comparable SNS card designs for Bluesky / Mastodon. */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;

  const RED = '#cf4f2e', INK = '#2c2a27', MUT = '#8c887f', PAPER = '#f1eee8', SURF = '#fbfaf7', LINE = 'rgba(44,42,39,0.16)';

  const LANGMETA = {
    ja: { name: '日本語', font: "'Noto Sans JP', sans-serif", dir: 'ltr' },
    zh: { name: '中文', font: "'Noto Sans SC', sans-serif", dir: 'ltr' },
    hi: { name: 'हिन्दी', font: "'Noto Sans Devanagari', sans-serif", dir: 'ltr' },
    es: { name: 'Español', font: "'Noto Sans', sans-serif", dir: 'ltr' },
    ar: { name: 'العربية', font: "'Noto Sans Arabic', sans-serif", dir: 'rtl' },
  };
  const LBL = {
    ja: { brief: '速報', depth: '深さ', cls: '深さ区分', when: '発生', coord: '震央', cause: '主原因', natureL: '性質', cont: '余震の見込み', fault: '断層型', tsunami: '津波の可能性', shallow: '浅発', intermediate: 'やや深発', deep: '深発' },
    zh: { brief: '快报', depth: '深度', cls: '分类', when: '发生', coord: '震中', cause: '主因', natureL: '性质', cont: '余震展望', fault: '断层类型', tsunami: '海啸可能', shallow: '浅源', intermediate: '中源', deep: '深源' },
    hi: { brief: 'सूचना', depth: 'गहराई', cls: 'श्रेणी', when: 'कब', coord: 'अधिकेंद्र', cause: 'मुख्य कारण', natureL: 'प्रकृति', cont: 'आफ्टरशॉक', fault: 'भ्रंश प्रकार', tsunami: 'सुनामी संभव', shallow: 'उथला', intermediate: 'मध्यम', deep: 'गहरा' },
    es: { brief: 'Boletín', depth: 'Profundidad', cls: 'Clase', when: 'Cuándo', coord: 'Epicentro', cause: 'Causa', natureL: 'Naturaleza', cont: 'Réplicas', fault: 'Tipo de falla', tsunami: 'Posible tsunami', shallow: 'Superficial', intermediate: 'Intermedio', deep: 'Profundo' },
    ar: { brief: 'موجز', depth: 'العمق', cls: 'التصنيف', when: 'الوقت', coord: 'المركز', cause: 'السبب الرئيسي', natureL: 'الطبيعة', cont: 'التوابع', fault: 'نوع الصدع', tsunami: 'احتمال تسونامي', shallow: 'ضحل', intermediate: 'متوسط', deep: 'عميق' },
  };
  const DISC = {
    en: 'Automated explanation from USGS data for general awareness — not an official hazard assessment. Mechanism and aftershock outlook are estimates and may be revised. Follow your local authority for safety guidance.',
    ja: 'USGSのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。発震機構や余震の見込みは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。',
    zh: '基于USGS数据自动生成的科普解说，非官方灾害评估。震源机制与余震展望为估计值，可能修订。请以当地官方机构的防灾信息为准。',
    hi: 'यह USGS डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक खतरा आकलन नहीं। तंत्र व आफ्टरशॉक अनुमान हैं और बदल सकते हैं। सुरक्षा हेतु स्थानीय प्राधिकरण का पालन करें।',
    es: 'Explicación automática a partir de datos del USGS con fines informativos; no es una evaluación oficial de peligro. El mecanismo y las réplicas son estimaciones y pueden revisarse. Siga a su autoridad local.',
    ar: 'شرح آلي مُولّد من بيانات USGS لأغراض التوعية، وليس تقييمًا رسميًا للمخاطر. الآلية وتوقعات التوابع تقديرية وقد تُراجَع. اتبع السلطة المحلية لإرشادات السلامة.',
  };

  // ---- helpers -----------------------------------------------------------
  const depthClassOf = d => d < 70 ? 'shallow' : d < 300 ? 'intermediate' : 'deep';
  const capEng = { shallow: 'Shallow', intermediate: 'Intermediate', deep: 'Deep' };
  function agoOf(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  function coordOf(lat, lon) {
    return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  }
  const LOCALE = { ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar' };
  function whenOf(ms, regionLang) {
    const loc = (regionLang && LOCALE[regionLang]) ? LOCALE[regionLang] : 'en-US';
    try {
      return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(ms)) + ' UTC';
    } catch (e) { return new Date(ms).toUTCString(); }
  }
  function parseId(input) {
    const m = (input || '').match(/eq=([^&\s#]+)/);
    if (m) return decodeURIComponent(m[1]);
    const t = (input || '').trim();
    return t.replace(/^.*[/#]/, '') || t;
  }

  function buildQuake(raw) {
    const dc = depthClassOf(raw.depth);
    return {
      ...raw,
      magTxt: raw.mag.toFixed(1),
      depthTxt: Math.round(raw.depth) + ' km',
      depthClass: dc,
      agoTxt: agoOf(raw.time),
      coordTxt: coordOf(raw.lat, raw.lon),
    };
  }
  function buildT(regionLang) {
    if (!regionLang || !LBL[regionLang]) {
      return { brief: 'Brief', depth: null, cls: null, when: null, coord: null, cause: null, natureL: null, cont: null, faultTag: 'Fault type', tsunamiTag: 'Tsunami possible' };
    }
    const l = LBL[regionLang];
    return { brief: l.brief, depth: l.depth, cls: l.cls, when: l.when, coord: l.coord, cause: l.cause, natureL: l.natureL, cont: l.cont, faultTag: 'Fault type · ' + l.fault, tsunamiTag: 'Tsunami possible · ' + l.tsunami };
  }
  function depthClassTxt(q, regionLang) {
    const eng = capEng[q.depthClass];
    return regionLang && LBL[regionLang] ? eng + ' · ' + LBL[regionLang][q.depthClass] : eng;
  }
  function normContent(c) {
    const rl = c.regionLang && LANGMETA[c.regionLang] ? c.regionLang : null;
    const risk = ['none', 'low', 'moderate', 'high'].indexOf(c.tsunamiRisk) >= 0 ? c.tsunamiRisk : (c.tsunamiNote ? 'low' : 'none');
    if (c.disclaimer) return { ...c, tsunamiRisk: risk };
    return { ...c, regionLang: rl, tsunamiRisk: risk, disclaimer: { en: DISC.en, reg: rl ? DISC[rl] : null } };
  }
  const EXPORT = new URLSearchParams(location.search).get('export');

  // ---- fallback sample so the studio always renders ----------------------
  const SAMPLE_QUAKE = buildQuake({ id: 'us7000std9', mag: 6.0, place: '248 km SSE of Dunhuang, China', lon: 95.6, lat: 38.3, depth: 10, time: Date.now() - 3 * 3600e3, tsunami: 0 });
  const SAMPLE_CONTENT = {
    faultType: 'strike-slip',
    faultTypeLabel: { en: 'Strike-slip', reg: '走滑断层' },
    mainCause: { en: 'India is slowly pushing north into Asia. That squeeze reaches here and makes old cracks in the crust slip sideways.', reg: '印度板块缓缓向北推挤亚洲，这股力传到这里，让地下老断裂沿水平方向错动。' },
    nature: { en: 'It was shallow — about 10 km down — so the shaking felt sharp nearby but faded quickly with distance.', reg: '震源很浅，约10公里，所以震中附近晃动明显，但随距离迅速减弱。' },
    continuity: { en: 'Smaller aftershocks are likely for days to weeks. A larger quake is unlikely, but stay aware just in case.', reg: '未来数日至数周可能有较小余震。更大地震可能性不大，但请保持留意。' },
    tsunamiRisk: 'none',
    tsunamiNote: { en: 'It happened on land, far from the sea, so no sea floor was lifted. A tsunami is not expected.', reg: '地震发生在陆地，远离海洋，没有抬升海底，因此不会引发海啸。' },
    localeTags: ['敦煌', '中国'],
    regionLang: 'zh',
    disclaimer: { en: DISC.en, reg: DISC.zh },
  };

  // ---- USGS fetch --------------------------------------------------------
  async function fetchQuake(id) {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${encodeURIComponent(id)}&format=geojson`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('USGS ' + r.status);
    const f = await r.json();
    const c = f.geometry.coordinates, p = f.properties;
    let focal = null;
    try {
      const prod = p.products || {};
      const mt = (prod['moment-tensor'] || prod['focal-mechanism'] || [])[0];
      if (mt && mt.properties) {
        const pr = mt.properties;
        focal = { rake1: pr['nodal-plane-1-rake'], dip1: pr['nodal-plane-1-dip'], strike1: pr['nodal-plane-1-strike'] };
      }
    } catch (e) {}
    return buildQuake({ id: f.id || id, mag: p.mag, place: p.place || '', lon: c[0], lat: c[1], depth: c[2] != null ? c[2] : 10, time: p.time, tsunami: p.tsunami, focal });
  }
  async function fetchLatestBig() {
    const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson');
    const gj = await r.json();
    const big = (gj.features || []).filter(f => (f.properties.mag || 0) >= 6).sort((a, b) => b.properties.time - a.properties.time);
    if (!big.length) throw new Error('No M6+ in the last month');
    return big[0].id;
  }

  // ---- Claude generation -------------------------------------------------
  async function generateContent(q) {
    const focalTxt = q.focal && q.focal.rake1 != null
      ? `Focal mechanism nodal plane: strike ${q.focal.strike1}°, dip ${q.focal.dip1}°, rake ${q.focal.rake1}°.`
      : 'No focal-mechanism solution available; infer from regional tectonics.';
    const prompt = `You are a seismologist writing a warm, clear explanation of an earthquake for ordinary members of the public — people with no science background. It will appear on a social media card.

Earthquake facts:
- Magnitude: M${q.mag}
- Location: ${q.place} (lat ${q.lat}, lon ${q.lon})
- Depth: ${Math.round(q.depth)} km (${q.depthClass})
- Tsunami flag from USGS: ${q.tsunami ? 'yes' : 'no'}
- ${focalTxt}

Tasks:
1. Work out the most likely faulting mechanism and tectonic setting from this location's known plate tectonics (and any focal data), then judge the tsunami risk.
2. Choose ONE regional language matching the epicenter, from: ja (Japan), zh (China/Taiwan), hi (South Asia — India, Nepal, Pakistan, Bangladesh), es (Spanish-speaking Americas & Spain), ar (Middle East & North Africa). If none clearly applies, use null.

Return ONLY raw JSON (no markdown, no prose) with EXACTLY this shape:
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
- "tsunamiNote": one plain sentence explaining WHY the risk is at that level (e.g. "It was deep and far inland, so no sea floor was lifted and a tsunami is not expected."). Always provide. <= 24 words.
- "localeTags": exactly two short hashtag words written IN the chosen regionLang — the nearest well-known place and the country (NO # symbol, no spaces), e.g. Japanese ["能登","日本"], Chinese ["敦煌","中国"], Spanish ["Oaxaca","México"]. If regionLang is null, use [].
- If regionLang is null, set every "reg" value to null. Otherwise every "reg" value must be written in that language, in the same warm plain style, using its standard public word for a tectonic plate (Japanese プレート, Chinese 板块, Hindi टेक्टोनिक प्लेट, Spanish placa, Arabic صفيحة).
- Keep every "en" value 100% natural English; never insert a non-English word into "en".
- Be factual and specific to this region. Do NOT restate the magnitude number or the place name inside the text fields.`;

    const raw = await window.claude.complete({ messages: [{ role: 'user', content: prompt }] });
    let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
    const o = JSON.parse(txt);
    const rl = o.regionLang && LANGMETA[o.regionLang] ? o.regionLang : null;
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
      disclaimer: { en: DISC.en, reg: rl ? DISC[rl] : null },
    };
  }

  // ---- post text ---------------------------------------------------------
  // localized base hashtags, matched to the language near the epicenter
  const HASHTAGS = {
    en: ['#earthquake', '#seismology'],
    ja: ['#地震', '#防災'],
    zh: ['#地震', '#防灾'],
    hi: ['#भूकंप', '#भूविज्ञान'],
    es: ['#sismo', '#terremoto'],
    ar: ['#زلزال', '#زلازل'],
  };
  // pull #Place and #Country tags out of a USGS place string
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
    if (parts.length > 1) push(parts[0]);          // nearest place
    if (parts.length) push(parts[parts.length - 1]); // country / region
    return tags;
  }
  function hashtagLine(q, content) {
    const base = HASHTAGS[content.regionLang] || HASHTAGS.en;
    let names;
    if (content.regionLang && content.localeTags && content.localeTags.length) {
      // single-language tags: place + country in the epicenter's main language
      const seen = new Set();
      names = content.localeTags.map(t => '#' + String(t).replace(/[^\p{L}\p{N}]+/gu, ''))
        .filter(h => h.length > 1 && !seen.has(h) && seen.add(h));
    } else {
      names = placeTags(q.place);
    }
    return [...base, ...names].join(' ');
  }
  function composePost(q, content) {
    const url = `globelabo.netlify.app/#eq=${q.id}`;
    const lines = [
      `M${q.mag.toFixed(1)} earthquake · ${q.place}`,
      `${content.faultTypeLabel.en} — ${content.nature.en}`,
    ];
    if (content.regionLang && content.faultTypeLabel.reg) {
      lines.push(`${content.faultTypeLabel.reg}／${content.continuity.reg || ''}`.trim());
    }
    lines.push(`Live map: ${url}`);
    lines.push(hashtagLine(q, content));
    return lines.join('\n');
  }

  // ---- scaled card frame -------------------------------------------------
  function CardFrame({ label, children, w = 372 }) {
    const scale = w / 1080;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: RED }} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK }}>{label}</span>
        </div>
        <div style={{ width: w, height: 1350 * scale, overflow: 'hidden', boxShadow: '0 18px 50px -24px rgba(44,42,39,0.5)', border: '1px solid ' + LINE, background: PAPER }}>
          <div style={{ width: 1080, height: 1350, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  // ---- post composer -----------------------------------------------------
  function Composer({ q, content }) {
    const [platform, setPlatform] = useState('bluesky');
    const [text, setText] = useState('');
    const [copied, setCopied] = useState(false);
    useEffect(() => { setText(composePost(q, content)); }, [q.id, content]);
    const limit = platform === 'bluesky' ? 300 : 500;
    const over = text.length > limit;
    const copy = async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {}
    };
    return (
      <div style={{ background: SURF, border: '1px solid ' + LINE, padding: '20px 22px', maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK }}>Auto-post text</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['bluesky', 'mastodon'].map(p => (
              <button key={p} onClick={() => setPlatform(p)} style={{
                fontSize: 12.5, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                border: '1px solid ' + (platform === p ? INK : LINE), background: platform === p ? INK : 'transparent', color: platform === p ? PAPER : MUT,
              }}>{p}</button>
            ))}
          </div>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false} style={{
          width: '100%', minHeight: 132, resize: 'vertical', boxSizing: 'border-box', padding: '12px 14px',
          border: '1px solid ' + (over ? RED : LINE), background: PAPER, color: INK, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.5,
        }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: over ? RED : MUT, fontVariantNumeric: 'tabular-nums' }}>
            {text.length} / {limit} {over ? '· over limit' : ''} · attach the card image above
          </div>
          <button onClick={copy} style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + INK, background: copied ? INK : 'transparent', color: copied ? PAPER : INK }}>
            {copied ? 'Copied' : 'Copy text'}
          </button>
        </div>
      </div>
    );
  }

  // ---- app ---------------------------------------------------------------
  function App() {
    const [input, setInput] = useState('https://globelabo.netlify.app/#eq=us7000std9');
    const [q, setQ] = useState(SAMPLE_QUAKE);
    const [content, setContent] = useState(SAMPLE_CONTENT);
    const [status, setStatus] = useState('sample'); // sample | loading | ready | error
    const [msg, setMsg] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [exporting, setExporting] = useState(false);

    const run = useCallback(async (rawInput) => {
      const id = parseId(rawInput);
      if (!id) { setStatus('error'); setMsg('Enter a quake link or USGS event id.'); return; }
      setStatus('loading'); setMsg('Fetching ' + id + ' from USGS…');
      let quake;
      try {
        quake = await fetchQuake(id);
        setQ(quake);
      } catch (e) {
        setStatus('error'); setMsg('Could not load ' + id + ' from USGS. Showing the last result.'); return;
      }
      setMsg('Generating mechanism explanation…');
      try {
        const c = await generateContent(quake);
        setContent(c); setStatus('ready'); setMsg('');
      } catch (e) {
        setStatus('error'); setMsg('AI generation failed (' + (e.message || 'error') + '). Quake loaded; explanation unavailable.');
      }
    }, []);

    const latest = useCallback(async () => {
      setStatus('loading'); setMsg('Finding the latest M6+…');
      try {
        const id = await fetchLatestBig();
        setInput('https://globelabo.netlify.app/#eq=' + id);
        run('eq=' + id);
      } catch (e) { setStatus('error'); setMsg(e.message || 'Lookup failed'); }
    }, [run]);

    const regMeta = content.regionLang ? { code: content.regionLang, ...LANGMETA[content.regionLang] } : null;
    const T = buildT(content.regionLang);
    const qx = { ...q, depthClassTxt: depthClassTxt(q, content.regionLang), whenTxt: whenOf(q.time, content.regionLang) };
    const cards = window.QuakeCards;
    const Hero = cards['globe-hero'].el;

    useEffect(() => {
      window.__studio = {
        render: (qr, c) => { setQ(buildQuake(qr)); setContent(normContent(c)); setStatus('ready'); },
        composePost, DISC, LBL, LANGMETA,
      };
      window.__studioReady = true;
    }, []);

    const downloadPng = async (id) => {
      const node = document.querySelector('[data-export-card="globe-hero"]');
      if (!node || !window.htmlToImage) { alert('Export library still loading — try again in a moment.'); return; }
      setExporting(true);
      // html-to-image stalls embedding a live <canvas> in this sandbox, so we skip
      // the canvas during capture and composite the globe back in afterwards.
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
        if (canvas && box) {
          const side = Math.min(box.w, box.h);
          cx.drawImage(canvas, box.x + (box.w - side) / 2, box.y + (box.h - side) / 2, side, side);
        }
        const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = `globe-eq-${id || 'card'}.png`; a.click();
      } catch (e) {
        console.error(e);
        window.open('Earthquake Mechanism Cards.html?export=globe-hero#eq=' + (id || ''), '_blank');
        alert('In-browser PNG export is slow in this preview. Opened the card at full size in a new tab — screenshot it, or use the auto-poster kit for a guaranteed, pixel-perfect render.');
      } finally { setExporting(false); }
    };

    if (EXPORT) {
      return (
        <div style={{ width: 1080, height: 1350 }}>
          <Hero q={qx} content={content} regMeta={regMeta} T={T} />
        </div>
      );
    }

    const busy = status === 'loading';
    return (
      <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: "'Helvetica Neue', 'Noto Sans', system-ui, sans-serif" }}>
        {/* header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(241,238,232,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderBottom: '1px solid ' + LINE }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginRight: 4 }}>
              <svg width="30" height="30" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill={PAPER} /><g fill="none" stroke={INK} strokeWidth="2.4"><circle cx="32" cy="32" r="20" /><ellipse cx="32" cy="32" rx="8.4" ry="20" /><line x1="12" y1="32" x2="52" y2="32" /><path d="M15.2 22 H48.8" strokeWidth="2" /><path d="M15.2 42 H48.8" strokeWidth="2" /></g><circle cx="42" cy="22" r="4.4" fill={RED} /></svg>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>Globe · Mechanism Cards</div>
                <div style={{ fontSize: 11.5, color: MUT, letterSpacing: '0.04em', marginTop: 2 }}>M6+ auto-explainer for Bluesky / Mastodon</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 260, display: 'flex', gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') run(input); }}
                placeholder="Paste a Globe quake link or USGS event id" spellCheck={false}
                style={{ flex: 1, padding: '9px 13px', border: '1px solid ' + LINE, background: SURF, color: INK, fontFamily: 'inherit', fontSize: 13.5 }} />
              <button onClick={() => run(input)} disabled={busy} style={{ padding: '9px 18px', border: 'none', background: busy ? MUT : INK, color: PAPER, fontWeight: 600, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Generate</button>
              <button onClick={latest} disabled={busy} style={{ padding: '9px 14px', border: '1px solid ' + INK, background: 'transparent', color: INK, fontWeight: 600, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Latest M6+</button>
            </div>
          </div>
          {(msg || status === 'sample') && (
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px 12px' }}>
              <span style={{ fontSize: 12.5, color: status === 'error' ? RED : MUT, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {busy && <span className="spin" style={{ width: 11, height: 11, border: '2px solid ' + LINE, borderTopColor: RED, borderRadius: '50%', display: 'inline-block' }} />}
                {msg || 'Showing a sample (Dunhuang, China). Generate or pick the latest M6+ to run the AI live.'}
              </span>
            </div>
          )}
        </div>

        {/* card + tools */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 28px 60px' }}>
          <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 auto' }}>
              <CardFrame label="Globe Hero" w={500}>
                <Hero q={qx} content={content} regMeta={regMeta} T={T} />
              </CardFrame>
            </div>
            <div style={{ flex: 1, minWidth: 340, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => downloadPng(q.id)} disabled={exporting} style={{ padding: '9px 18px', border: 'none', background: exporting ? MUT : INK, color: PAPER, fontWeight: 600, fontSize: 13.5, cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {exporting
                    ? <><span className="spin" style={{ width: 13, height: 13, border: '2px solid rgba(241,238,232,0.4)', borderTopColor: PAPER, borderRadius: '50%', display: 'inline-block' }} />Rendering…</>
                    : <><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Download card PNG</>}
                </button>
                <button onClick={() => setShowAll(s => !s)} style={{ padding: '9px 16px', border: '1px solid ' + LINE, background: 'transparent', color: MUT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {showAll ? 'Hide other concepts' : 'Compare other concepts'}
                </button>
              </div>
              <Composer q={q} content={content} />
              <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.65, borderTop: '1px solid ' + LINE, paddingTop: 14 }}>
                Workflow: attach the 1080×1350 PNG to your Bluesky / Mastodon post with the text above.
                For hands-off posting after every M6+, run the <b style={{ color: INK }}>auto-poster kit</b> (the
                <code style={{ background: SURF, padding: '1px 5px', border: '1px solid ' + LINE }}>auto-poster/</code> folder) on a schedule — it polls USGS, generates this exact card, and posts to both networks.
              </div>
            </div>
          </div>
          {showAll && (
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'center', marginTop: 36, paddingTop: 30, borderTop: '1px solid ' + LINE }}>
              {['field-report', 'seismograph'].map(key => {
                const C = cards[key].el;
                return (
                  <CardFrame key={key} label={cards[key].label} w={332}>
                    <C q={qx} content={content} regMeta={regMeta} T={T} />
                  </CardFrame>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
