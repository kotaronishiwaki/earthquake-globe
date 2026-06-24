/* Volcano Activity Card Studio — pulls the current volcano alerts (JMA + USGS),
   asks Claude for a bilingual, card-length explanation, and renders it into
   three comparable SNS card designs for Bluesky / Mastodon. Mirror of the
   earthquake Mechanism Card studio. */
(function () {
  const { useState, useEffect, useCallback } = React;

  const AMBER = '#b0741c', INK = '#2c2a27', MUT = '#8c887f', PAPER = '#f1eee8', SURF = '#fbfaf7', LINE = 'rgba(44,42,39,0.16)';

  const LANGMETA = {
    ja: { name: '日本語', font: "'Noto Sans JP', sans-serif", dir: 'ltr' },
    zh: { name: '中文', font: "'Noto Sans SC', sans-serif", dir: 'ltr' },
    hi: { name: 'हिन्दी', font: "'Noto Sans Devanagari', sans-serif", dir: 'ltr' },
    es: { name: 'Español', font: "'Noto Sans', sans-serif", dir: 'ltr' },
    ar: { name: 'العربية', font: "'Noto Sans Arabic', sans-serif", dir: 'rtl' },
  };
  // label set per regional language (secondary section labels)
  const SLBL = {
    ja: { s2: 'なぜ今活発なのか', s3: '警戒レベルの意味', s4: '考えられる影響', outlook: '今後の備え', hazards: '想定される災害', typeTag: '火山型', kind: '警報種別', obs: '観測所', updated: '最終更新', loc: '位置' },
    zh: { s2: '为何此刻活跃', s3: '警戒级别的含义', s4: '可能的影响', outlook: '后续与准备', hazards: '可能的灾害', typeTag: '火山类型', kind: '警报种类', obs: '观测站', updated: '最近更新', loc: '位置' },
    hi: { s2: 'अभी सक्रिय क्यों', s3: 'स्तर का अर्थ', s4: 'संभावित प्रभाव', outlook: 'तैयारी', hazards: 'संभावित खतरे', typeTag: 'प्रकार', kind: 'चेतावनी', obs: 'वेधशाला', updated: 'अद्यतन', loc: 'स्थान' },
    es: { s2: 'Por qué está activo', s3: 'Qué significa el nivel', s4: 'Posibles efectos', outlook: 'Preparación', hazards: 'Peligros probables', typeTag: 'Tipo de volcán', kind: 'Tipo de aviso', obs: 'Observatorio', updated: 'Actualizado', loc: 'Ubicación' },
    ar: { s2: 'لماذا هو نشط الآن', s3: 'معنى المستوى', s4: 'الآثار المحتملة', outlook: 'الاستعداد', hazards: 'المخاطر المحتملة', typeTag: 'نوع البركان', kind: 'نوع التحذير', obs: 'المرصد', updated: 'آخر تحديث', loc: 'الموقع' },
  };
  const DISC = {
    en: 'Automated explanation from JMA / USGS data for general awareness — not an official hazard assessment. The mechanism, alert-level reasoning and outlook are estimates and may be revised. Always follow your local authority.',
    ja: 'JMA・USGSのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。メカニズム・警戒レベルの背景・見通しは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。',
    zh: '基于JMA／USGS数据自动生成的科普解说，非官方灾害评估。机制、警戒级别背景与展望均为估计值，可能修订。请以当地官方机构的防灾信息为准。',
    hi: 'यह JMA/USGS डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक खतरा आकलन नहीं। तंत्र, अलर्ट-स्तर का कारण व अनुमान बदल सकते हैं। सुरक्षा हेतु स्थानीय प्राधिकरण का पालन करें।',
    es: 'Explicación automática a partir de datos de JMA/USGS con fines informativos; no es una evaluación oficial de peligro. El mecanismo, el nivel de alerta y el panorama son estimaciones y pueden revisarse. Siga a su autoridad local.',
    ar: 'شرح آلي مُولّد من بيانات JMA/USGS لأغراض التوعية، وليس تقييمًا رسميًا للمخاطر. الآلية وسبب مستوى التحذير والتوقعات تقديرية وقد تُراجَع. اتبع السلطة المحلية دائمًا.',
  };
  const LOCALE = { ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar' };

  // ── helpers ─────────────────────────────────────────────────────────────
  const slug = s => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'x';
  function volId(v) { return v.source + '-' + slug(v.nameEn || v.name); }
  const tc = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '—';
  function coordOf(lat, lon) {
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
  function regionLangOf(v) { return v.source === 'jma' ? 'ja' : null; }

  function buildVolcano(raw) {
    const rl = regionLangOf(raw);
    return {
      ...raw,
      id: raw.id || volId(raw),
      coordTxt: coordOf(raw.lat, raw.lon),
      whenTxt: whenOf(raw.date, rl),
    };
  }
  function buildT(regionLang) {
    const base = { eyebrow: 'Volcano activity', lvl: 'Level', avColor: 'Aviation colour', kind: 'Warning type', obs: 'Observatory', typeTag: 'Volcano type', updated: 'Updated', loc: 'Location', s2: 'Why it is active now', s3: 'What the level means', s4: 'Possible impacts', outlook: 'What to watch & prepare', hazards: 'Likely hazards', s2r: null, s3r: null, s4r: null };
    if (regionLang && SLBL[regionLang]) {
      const l = SLBL[regionLang];
      return { ...base, eyebrow: 'Volcano activity', s2r: l.s2, s3r: l.s3, s4r: l.s4, kind: 'Warning type · ' + l.kind, obs: 'Observatory · ' + l.obs, typeTag: 'Volcano type · ' + l.typeTag, updated: 'Updated · ' + l.updated, loc: 'Location · ' + l.loc, outlook: l.outlook + ' · Watch & prepare', hazards: 'Likely hazards · ' + l.hazards };
    }
    return base;
  }
  function normContent(c) {
    const rl = c.regionLang && LANGMETA[c.regionLang] ? c.regionLang : null;
    const norm = f => f ? { en: f.en || '', reg: rl ? (f.reg || '') : null } : { en: '', reg: null };
    return {
      edifice: ['stratovolcano', 'caldera', 'shield', 'lava-dome', 'complex'].indexOf(c.edifice) >= 0 ? c.edifice : 'stratovolcano',
      edificeLabel: norm(c.edificeLabel),
      whyNow: norm(c.whyNow), levelMeaning: norm(c.levelMeaning), impacts: norm(c.impacts), outlook: norm(c.outlook),
      hazards: Array.isArray(c.hazards) ? c.hazards.slice(0, 4) : [],
      regionLang: rl,
      disclaimer: c.disclaimer || { en: DISC.en, reg: rl ? DISC[rl] : null },
    };
  }
  const EXPORT = new URLSearchParams(location.search).get('export');

  // ── sample (studio always renders something) ─────────────────────────────
  const SAMPLE_V = buildVolcano({ source: 'jma', name: '桜島', nameEn: 'Sakurajima', level: 3, kind: '噴火警報（火口周辺）', lat: 31.593, lon: 130.657, date: Date.now() - 2 * 3600e3, report: 'https://www.jma.go.jp/bosai/volcano/', rgb: '214,108,28' });
  const SAMPLE_C = normContent({
    edifice: 'stratovolcano',
    edificeLabel: { en: 'Stratovolcano (steep cone)', reg: '成層火山（円錐形）' },
    whyNow: { en: 'Fresh magma is pushing up the central conduit, raising gas pressure and feeding frequent small explosions at the summit crater.', reg: '新しいマグマが火道を押し上げ、ガス圧が高まって山頂火口で小規模な噴火が頻発しています。' },
    levelMeaning: { en: 'Level 3 means stay off the mountain: hazards can reach areas a few kilometres from the crater, beyond the summit.', reg: 'レベル3は入山規制。火口から数km、山頂を越えた範囲まで影響が及ぶおそれがあります。' },
    impacts: { en: 'Expect ashfall on nearby towns, small rock falls near the crater, and occasional flight or transport disruption downwind.', reg: '周辺の町への降灰、火口付近の噴石、風下での交通・航空への影響が考えられます。' },
    outlook: { en: 'Watch for official updates and keep masks and goggles handy; avoid valleys after heavy rain in case of mudflows.', reg: '公式情報に注意し、マスクやゴーグルを用意。大雨後は泥流に備え谷筋を避けてください。' },
    hazards: ['ashfall', 'ballistics', 'gas', 'lahar'],
    regionLang: 'ja',
  });

  // ── data: current volcano alerts (JMA proxy + USGS HANS) ─────────────────
  const CODE_RGB = { GREEN: '70,150,70', YELLOW: '214,170,28', ORANGE: '214,108,28', RED: '200,52,40' };
  const COLOR_SEV = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };
  async function fetchAlerts() {
    const HANS = 'https://volcanoes.usgs.gov/hans-public/api/volcano/';
    const [elev, us, jma] = await Promise.all([
      fetch(HANS + 'getElevatedVolcanoes').then(r => r.json()).catch(() => []),
      fetch(HANS + 'getUSVolcanoes').then(r => r.json()).catch(() => []),
      fetch('/.netlify/functions/jma-volcano').then(r => r.json()).catch(() => []),
    ]);
    const coordById = {};
    (Array.isArray(us) ? us : []).forEach(v => {
      const lat = parseFloat(v.latitude), lon = parseFloat(v.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) coordById[String(v.vnum)] = [lon, lat];
    });
    const list = [];
    (Array.isArray(elev) ? elev : []).forEach(e => {
      const c = coordById[String(e.vnum)]; if (!c) return;
      const code = (e.color_code || '').toUpperCase();
      if (code === 'GREEN' || !code) return;       // only elevated
      list.push(buildVolcano({ source: 'usgs', name: e.volcano_name || '', nameEn: e.volcano_name || '', obs: e.obs_fullname || '',
        color: code, alert: (e.alert_level || '').toUpperCase(), lat: c[1], lon: c[0],
        date: e.sent_utc ? e.sent_utc.replace(' ', 'T') + 'Z' : null, report: e.notice_url || '', rgb: CODE_RGB[code] || '176,116,28',
        sev: 3 + (COLOR_SEV[code] || 0) }));
    });
    (Array.isArray(jma) ? jma : []).forEach(v => {
      if (!Number.isFinite(v.lon) || !Number.isFinite(v.lat)) return;
      list.push(buildVolcano({ source: 'jma', name: v.name || '', nameEn: v.nameEn || v.name || '', level: v.level, kind: v.kind || '',
        lat: v.lat, lon: v.lon, date: v.date || null, report: v.url || 'https://www.jma.go.jp/bosai/volcano/', rgb: v.rgb || '176,116,28',
        sev: 10 + (v.level || 2) }));
    });
    list.sort((a, b) => (b.sev - a.sev) || (Date.parse(b.date || 0) - Date.parse(a.date || 0)));
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
    const rl = regionLangOf(v);
    const wantReg = !!rl;
    const langName = rl ? { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[rl] : null;
    const nm = v.nameEn || v.name || 'this volcano';
    let statusLine;
    if (v.source === 'jma' && v.level) statusLine = `Monitoring: Japan Meteorological Agency. Current 噴火警戒レベル (Volcanic Alert Level): ${v.level}. ${JMA_LEVELS[v.level] || ''} Warning type: ${v.kind || 'n/a'}.`;
    else if (v.source === 'usgs') statusLine = `Monitoring: USGS Volcano Hazards Program. Aviation Colour Code: ${v.color || 'n/a'}. Volcano Alert Level: ${v.alert || 'n/a'}. Observatory: ${v.obs || 'n/a'}.`;
    else statusLine = 'Smithsonian GVP reports open eruptive activity; no numeric alert level.';
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
${wantReg ? `Every "reg" MUST be ${langName}; every "en" 100% natural English. Never mix languages within a field.` : 'Set every "reg" to null.'}
Do not restate the volcano name or the raw alert number inside the text fields.`;
  }
  const HAZ_OK = ['ashfall', 'pyroclastic', 'lava', 'lahar', 'ballistics', 'gas'];
  function parseContent(raw, rl) {
    let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
    const o = JSON.parse(txt);
    const norm = f => f ? { en: f.en || '', reg: rl ? (f.reg || '') : null } : { en: '', reg: null };
    return normContent({
      edifice: o.edifice, edificeLabel: norm(o.edificeLabel),
      whyNow: norm(o.whyNow), levelMeaning: norm(o.levelMeaning), impacts: norm(o.impacts), outlook: norm(o.outlook),
      hazards: Array.isArray(o.hazards) ? o.hazards.filter(h => HAZ_OK.indexOf(h) >= 0) : [],
      regionLang: rl,
    });
  }
  async function generateContent(v) {
    const rl = regionLangOf(v);
    const raw = await window.claude.complete({ messages: [{ role: 'user', content: buildPrompt(v) }] });
    return parseContent(raw, rl);
  }

  // ── post text ────────────────────────────────────────────────────────────
  const HASHTAGS = { en: ['#volcano', '#volcanoes'], ja: ['#火山', '#防災'] };
  const LVL_WORD = { en: 'Alert Level', ja: '噴火警戒レベル' };
  function composePost(v, content) {
    const rl = content.regionLang;
    const url = `globelabo.netlify.app/#vol=${v.id}`;
    const status = v.source === 'jma'
      ? `${LVL_WORD.en} ${v.level}`
      : `Aviation ${tc(v.color)}${v.alert ? ' · ' + tc(v.alert) : ''}`;
    const name = v.nameEn || v.name;
    const lines = [`🌋 ${name} · ${status}`, `${content.whyNow.en}`];
    if (rl === 'ja' && content.whyNow.reg) lines.push(`${v.name}（${LVL_WORD.ja}${v.level}）${content.whyNow.reg}`);
    lines.push(`Live map: ${url}`);
    const tags = [...(HASHTAGS[rl] || HASHTAGS.en)];
    const nm = (v.nameEn || v.name || '').replace(/[^\p{L}\p{N}]+/gu, '');
    if (nm) tags.push('#' + nm);
    if (v.source === 'jma') tags.push('#日本'); 
    lines.push(tags.join(' '));
    return lines.join('\n');
  }

  // ── scaled card frame ─────────────────────────────────────────────────────
  function CardFrame({ label, children, w = 500 }) {
    const scale = w / 1080;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid ' + AMBER }} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK }}>{label}</span>
        </div>
        <div style={{ width: w, height: 1350 * scale, overflow: 'hidden', boxShadow: '0 18px 50px -24px rgba(44,42,39,0.5)', border: '1px solid ' + LINE, background: PAPER }}>
          <div style={{ width: 1080, height: 1350, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
        </div>
      </div>
    );
  }

  // ── composer ───────────────────────────────────────────────────────────────
  function Composer({ v, content }) {
    const [platform, setPlatform] = useState('bluesky');
    const [text, setText] = useState('');
    const [copied, setCopied] = useState(false);
    useEffect(() => { setText(composePost(v, content)); }, [v.id, content]);
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
    const [v, setV] = useState(SAMPLE_V);
    const [content, setContent] = useState(SAMPLE_C);
    const [status, setStatus] = useState('sample');
    const [msg, setMsg] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [alerts, setAlerts] = useState([]);

    const runFor = useCallback(async (vol) => {
      setV(vol); setStatus('loading'); setMsg('Generating explanation for ' + (vol.nameEn || vol.name) + '…');
      try {
        const c = await generateContent(vol);
        setContent(c); setStatus('ready'); setMsg('');
      } catch (e) {
        setStatus('error'); setMsg('AI generation failed (' + (e.message || 'error') + '). Volcano loaded; explanation unavailable.');
      }
    }, []);

    const latest = useCallback(async () => {
      setStatus('loading'); setMsg('Finding current volcano alerts…');
      try {
        const list = await fetchAlerts();
        setAlerts(list);
        if (!list.length) { setStatus('error'); setMsg('No volcanoes at an elevated alert level right now (JMA + USGS).'); return; }
        runFor(list[0]);
      } catch (e) { setStatus('error'); setMsg(e.message || 'Lookup failed'); }
    }, [runFor]);

    const regMeta = content.regionLang ? { code: content.regionLang, ...LANGMETA[content.regionLang] } : null;
    const T = buildT(content.regionLang);
    const cards = window.VolcanoCards;
    const Hero = cards['globe-hero'].el;

    useEffect(() => {
      window.__studio = {
        render: (vr, c) => { setV(buildVolcano(vr)); setContent(normContent(c)); setStatus('ready'); },
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
        const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = `globe-vol-${v.id}.png`; a.click();
      } catch (e) {
        console.error(e);
        window.open('Volcano Activity Cards.html?export=globe-hero', '_blank');
        alert('In-browser PNG export is slow in this preview. Opened the card at full size in a new tab — screenshot it, or use the auto-poster kit for a guaranteed render.');
      } finally { setExporting(false); }
    };

    if (EXPORT) {
      return <div style={{ width: 1080, height: 1350 }}><Hero v={v} content={content} regMeta={regMeta} T={T} /></div>;
    }

    const busy = status === 'loading';
    return (
      <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: "'Helvetica Neue', 'Noto Sans', system-ui, sans-serif" }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(241,238,232,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderBottom: '1px solid ' + LINE }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginRight: 4 }}>
              <svg width="30" height="30" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill={PAPER} /><g fill="none" stroke={INK} strokeWidth="2.4"><circle cx="32" cy="32" r="20" /><ellipse cx="32" cy="32" rx="8.4" ry="20" /><line x1="12" y1="32" x2="52" y2="32" /></g><path d="M42 16.5 L49 27 H35 Z" fill={AMBER} /></svg>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>Globe · Volcano Activity Cards</div>
                <div style={{ fontSize: 11.5, color: MUT, letterSpacing: '0.04em', marginTop: 2 }}>Alert-update auto-explainer for Bluesky / Mastodon</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={latest} disabled={busy} style={{ padding: '9px 18px', border: 'none', background: busy ? MUT : INK, color: PAPER, fontWeight: 600, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Highest current alert</button>
            </div>
          </div>
          {alerts.length > 1 && (
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {alerts.slice(0, 10).map(a => {
                const on = a.id === v.id;
                const tag = a.source === 'jma' ? 'Lv' + a.level : tc(a.color);
                return (
                  <button key={a.id} onClick={() => runFor(a)} disabled={busy} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 999, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', border: '1px solid ' + (on ? INK : LINE), background: on ? INK : 'transparent', color: on ? PAPER : MUT, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgb(' + a.rgb + ')' }} />{a.nameEn || a.name} · {tag}
                  </button>
                );
              })}
            </div>
          )}
          {(msg || status === 'sample') && (
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px 12px' }}>
              <span style={{ fontSize: 12.5, color: status === 'error' ? '#cf4f2e' : MUT, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {busy && <span className="spin" style={{ width: 11, height: 11, border: '2px solid ' + LINE, borderTopColor: AMBER, borderRadius: '50%', display: 'inline-block' }} />}
                {msg || 'Showing a sample (Sakurajima, JMA Level 3). Tap “Highest current alert” to pull live JMA + USGS data and run the AI.'}
              </span>
            </div>
          )}
        </div>

        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 28px 60px' }}>
          <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 auto' }}><CardFrame label="Globe Hero" w={500}><Hero v={v} content={content} regMeta={regMeta} T={T} /></CardFrame></div>
            <div style={{ flex: 1, minWidth: 340, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={downloadPng} disabled={exporting} style={{ padding: '9px 18px', border: 'none', background: exporting ? MUT : INK, color: PAPER, fontWeight: 600, fontSize: 13.5, cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {exporting ? <><span className="spin" style={{ width: 13, height: 13, border: '2px solid rgba(241,238,232,0.4)', borderTopColor: PAPER, borderRadius: '50%', display: 'inline-block' }} />Rendering…</> : <><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Download card PNG</>}
                </button>
                <button onClick={() => setShowAll(s => !s)} style={{ padding: '9px 16px', border: '1px solid ' + LINE, background: 'transparent', color: MUT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>{showAll ? 'Hide other concepts' : 'Compare other concepts'}</button>
              </div>
              <Composer v={v} content={content} />
              <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.65, borderTop: '1px solid ' + LINE, paddingTop: 14 }}>
                Workflow: attach the 1080×1350 PNG to your Bluesky / Mastodon post with the text above. For hands-off posting whenever an alert level changes, run the <b style={{ color: INK }}>auto-poster kit</b> (<code style={{ background: SURF, padding: '1px 5px', border: '1px solid ' + LINE }}>auto-poster/volcano-poster.mjs</code>) on a schedule — it polls JMA + USGS, generates this exact card, and posts to both networks.
              </div>
            </div>
          </div>
          {showAll && (
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'center', marginTop: 36, paddingTop: 30, borderTop: '1px solid ' + LINE }}>
              {['field-report', 'monolith'].map(key => {
                const C = cards[key].el;
                return <CardFrame key={key} label={cards[key].label} w={332}><C v={v} content={content} regMeta={regMeta} T={T} /></CardFrame>;
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
