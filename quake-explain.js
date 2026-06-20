/* Globe — earthquake mechanism explanation, gated behind a paywall.
 *
 *   tap epicenter → card → "解説" button → this overlay.
 *   Free tier: a few explanations per day (client-side soft limit).
 *   Paid pass: unlimited (verified server-side via a signed token).
 *
 * Claude is called through a Netlify Function (keeps the API key secret).
 * In this design preview — where no backend exists — it falls back to
 * window.claude.complete so the flow is fully demoable.
 */
(function () {
  'use strict';

  // ───────────────────────── CONFIG — edit these ─────────────────────────
  const CFG = {
    EXPLAIN_ENDPOINT: '/.netlify/functions/explain',
    CHECKOUT_ENDPOINT: '/.netlify/functions/checkout',
    VERIFY_ENDPOINT: '/.netlify/functions/verify',
    FREE_PER_DAY: 3,            // free explanations per day per visitor
    PRICE: { ja: '¥480 / 月', en: '$3.49 / mo', zh: '¥22 / 月', hi: '₹299 / माह', es: '€2,99 / mes', ar: '$3.49 / شهر' },
  };

  // ───────────────────────── i18n ─────────────────────────
  const DISC = {
    en: 'Automated explanation from USGS data for general awareness — not an official hazard assessment. Mechanism and aftershock outlook are estimates and may be revised. Follow your local authority for safety guidance.',
    ja: 'USGSのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。発震機構や余震の見込みは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。',
    zh: '基于USGS数据自动生成的科普解说，非官方灾害评估。震源机制与余震展望为估计值，可能修订。请以当地官方机构的防灾信息为准。',
    hi: 'यह USGS डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक खतरा आकलन नहीं। तंत्र व आफ्टरशॉक अनुमान हैं और बदल सकते हैं। सुरक्षा हेतु स्थानीय प्राधिकरण का पालन करें।',
    es: 'Explicación automática a partir de datos del USGS con fines informativos; no es una evaluación oficial de peligro. El mecanismo y las réplicas son estimaciones y pueden revisarse. Siga a su autoridad local.',
    ar: 'شرح آلي مُولّد من بيانات USGS لأغراض التوعية، وليس تقييمًا رسميًا للمخاطر. الآلية وتوقعات التوابع تقديرية وقد تُراجَع. اتبع السلطة المحلية لإرشادات السلامة.',
  };

  const LOC = {
    ja: { eyebrow: '発震機構の解説', depth: '深さ', cls: '深さ区分', when: '発生', epi: '震央', shallow: '浅発', intermediate: 'やや深発', deep: '深発', faultTag: '断層型', cause: '主な原因', nature: '地震の性質', after: '余震の見込み', tsunami: '津波について', disc: '注意事項', btn: '解説', fetching: '震源データを取得中…', generating: 'AIが発震機構を解説中…', errGen: '解説の生成に失敗しました。', retry: '再試行', payTitle: 'AI解説をすべて見る', payBody: 'AIが震源ごとに発震機構・原因・余震の見込みを解説します。本日の無料分を使い切りました。', f1: '回数無制限のAI解説', f2: 'あなたの言語＋英語の対訳', f3: '津波リスクと断層型の図解', unlock: 'パスを購入', restore: '購入済みを復元', fine: 'いつでも解約できます。', quota: '本日の無料解説：残り %n 回', paid: 'パス有効', loadingPay: '決済ページへ移動中…' },
    en: { eyebrow: 'Earthquake mechanism', depth: 'Depth', cls: 'Class', when: 'When', epi: 'Epicenter', shallow: 'Shallow', intermediate: 'Intermediate', deep: 'Deep', faultTag: 'Fault type', cause: 'Main cause', nature: 'Nature', after: 'Aftershock outlook', tsunami: 'Tsunami', disc: 'Disclaimer', btn: 'Explain', fetching: 'Fetching quake data…', generating: 'AI is explaining the mechanism…', errGen: 'Could not generate the explanation.', retry: 'Retry', payTitle: 'See every AI explanation', payBody: 'AI explains the faulting mechanism, cause, and aftershock outlook for any quake. You have used today’s free explanations.', f1: 'Unlimited AI explanations', f2: 'Your language + English', f3: 'Tsunami risk & fault diagrams', unlock: 'Unlock', restore: 'Restore purchase', fine: 'Cancel anytime.', quota: '%n free explanation(s) left today', paid: 'Pass active', loadingPay: 'Opening checkout…' },
    zh: { eyebrow: '震源机制解说', depth: '深度', cls: '分类', when: '发生', epi: '震中', shallow: '浅源', intermediate: '中源', deep: '深源', faultTag: '断层类型', cause: '主因', nature: '地震性质', after: '余震展望', tsunami: '海啸', disc: '注意事项', btn: '解说', fetching: '正在获取震源数据…', generating: 'AI正在解说震源机制…', errGen: '解说生成失败。', retry: '重试', payTitle: '查看全部AI解说', payBody: 'AI为每次地震解说断层机制、成因与余震展望。今日免费次数已用完。', f1: '无限次AI解说', f2: '你的语言＋英文对照', f3: '海啸风险与断层图解', unlock: '购买通行证', restore: '恢复购买', fine: '可随时取消。', quota: '今日免费解说：剩余 %n 次', paid: '通行证有效', loadingPay: '正在打开结算页…' },
    hi: { eyebrow: 'भूकंप तंत्र', depth: 'गहराई', cls: 'श्रेणी', when: 'कब', epi: 'अधिकेंद्र', shallow: 'उथला', intermediate: 'मध्यम', deep: 'गहरा', faultTag: 'भ्रंश प्रकार', cause: 'मुख्य कारण', nature: 'प्रकृति', after: 'आफ्टरशॉक', tsunami: 'सुनामी', disc: 'अस्वीकरण', btn: 'व्याख्या', fetching: 'भूकंप डेटा ला रहे हैं…', generating: 'AI तंत्र समझा रहा है…', errGen: 'व्याख्या नहीं बन सकी।', retry: 'पुनः', payTitle: 'सभी AI व्याख्याएँ देखें', payBody: 'AI हर भूकंप का तंत्र, कारण व आफ्टरशॉक समझाता है। आज की मुफ़्त व्याख्याएँ समाप्त।', f1: 'असीमित AI व्याख्या', f2: 'आपकी भाषा + अंग्रेज़ी', f3: 'सुनामी जोखिम व भ्रंश चित्र', unlock: 'पास खरीदें', restore: 'खरीद बहाल करें', fine: 'कभी भी रद्द करें।', quota: 'आज मुफ़्त: %n शेष', paid: 'पास सक्रिय', loadingPay: 'चेकआउट खुल रहा है…' },
    es: { eyebrow: 'Mecanismo sísmico', depth: 'Profundidad', cls: 'Clase', when: 'Cuándo', epi: 'Epicentro', shallow: 'Superficial', intermediate: 'Intermedio', deep: 'Profundo', faultTag: 'Tipo de falla', cause: 'Causa principal', nature: 'Naturaleza', after: 'Réplicas', tsunami: 'Tsunami', disc: 'Aviso', btn: 'Explicar', fetching: 'Obteniendo datos…', generating: 'La IA explica el mecanismo…', errGen: 'No se pudo generar la explicación.', retry: 'Reintentar', payTitle: 'Ver todas las explicaciones', payBody: 'La IA explica el mecanismo, la causa y las réplicas de cada sismo. Agotaste las gratuitas de hoy.', f1: 'Explicaciones IA ilimitadas', f2: 'Tu idioma + inglés', f3: 'Riesgo de tsunami y fallas', unlock: 'Desbloquear', restore: 'Restaurar compra', fine: 'Cancela cuando quieras.', quota: '%n explicación(es) gratis hoy', paid: 'Pase activo', loadingPay: 'Abriendo pago…' },
    ar: { eyebrow: 'آلية الزلزال', depth: 'العمق', cls: 'التصنيف', when: 'الوقت', epi: 'المركز', shallow: 'ضحل', intermediate: 'متوسط', deep: 'عميق', faultTag: 'نوع الصدع', cause: 'السبب الرئيسي', nature: 'الطبيعة', after: 'التوابع', tsunami: 'تسونامي', disc: 'تنويه', btn: 'شرح', fetching: 'جارٍ جلب البيانات…', generating: 'الذكاء الاصطناعي يشرح الآلية…', errGen: 'تعذّر إنشاء الشرح.', retry: 'إعادة', payTitle: 'شاهد كل الشروح', payBody: 'يشرح الذكاء الاصطناعي آلية الصدع والسبب وتوقعات التوابع لكل زلزال. انتهت محاولاتك المجانية اليوم.', f1: 'شروح غير محدودة', f2: 'لغتك + الإنجليزية', f3: 'خطر التسونامي ورسوم الصدوع', unlock: 'فتح', restore: 'استعادة الشراء', fine: 'ألغِ في أي وقت.', quota: 'تبقّى %n شرح مجاني اليوم', paid: 'الاشتراك فعّال', loadingPay: 'فتح الدفع…' },
  };
  const RTL = { ar: true };

  // ───────────────────────── helpers ─────────────────────────
  const depthClassOf = d => d < 70 ? 'shallow' : d < 300 ? 'intermediate' : 'deep';
  const LOCALE = { ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar', en: 'en-US' };
  function coordOf(lat, lon) {
    return Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + '  ' + Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
  }
  function whenOf(ms, lang) {
    try {
      return new Intl.DateTimeFormat(LOCALE[lang] || 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(ms)) + ' UTC';
    } catch (e) { return new Date(ms).toUTCString(); }
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  // ───────────────────────── fault diagrams (brand SVG) ─────────────────────────
  const ARROW = (x1, y1, x2, y2, col, w) => {
    col = col || '#cf4f2e'; w = w || 2.6;
    const ang = Math.atan2(y2 - y1, x2 - x1), h = 8;
    const a1 = ang + Math.PI - 0.45, a2 = ang + Math.PI + 0.45;
    const p1x = x2 + h * Math.cos(a1), p1y = y2 + h * Math.sin(a1);
    const p2x = x2 + h * Math.cos(a2), p2y = y2 + h * Math.sin(a2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/><path d="M${x2} ${y2} L${p1x} ${p1y} L${p2x} ${p2y} Z" fill="${col}"/>`;
  };
  const F = 'rgba(44,42,39,0.05)', F2 = 'rgba(44,42,39,0.13)', S = 'rgba(44,42,39,0.22)', RED = '#cf4f2e', INK = '#2c2a27';
  const DIAG = {
    'strike-slip': () => `<rect x="14" y="22" width="312" height="150" fill="${F}" stroke="rgba(44,42,39,0.18)"/><line x1="40" y1="97" x2="166" y2="97" stroke="#8c887f" stroke-width="1.4" stroke-dasharray="2 4"/><line x1="174" y1="83" x2="300" y2="83" stroke="#8c887f" stroke-width="1.4" stroke-dasharray="2 4"/><line x1="170" y1="22" x2="170" y2="172" stroke="${RED}" stroke-width="2.6" stroke-dasharray="7 5"/>${ARROW(92,150,92,116)}${ARROW(248,44,248,78)}`,
    normal: () => `<path d="M14 60 L150 60 L196 172 L14 172 Z" fill="${F2}" stroke="${S}"/><path d="M168 86 L326 86 L326 172 L214 172 Z" fill="${F}" stroke="${S}"/><line x1="150" y1="60" x2="208" y2="172" stroke="${RED}" stroke-width="2.8" stroke-dasharray="7 5"/>${ARROW(70,40,26,40)}${ARROW(270,40,314,40)}${ARROW(250,100,250,142)}`,
    reverse: () => `<path d="M14 96 L150 96 L196 172 L14 172 Z" fill="${F}" stroke="${S}"/><path d="M150 56 L326 56 L326 172 L196 172 Z" fill="${F2}" stroke="${S}"/><line x1="150" y1="96" x2="200" y2="172" stroke="${RED}" stroke-width="2.8" stroke-dasharray="7 5"/>${ARROW(26,40,70,40)}${ARROW(314,40,270,40)}${ARROW(244,120,244,78)}`,
    subduction: () => `<path d="M186 70 L326 70 L326 172 L186 172 Z" fill="${F2}" stroke="${S}"/><path d="M14 70 L186 70 L300 168 L262 172 L150 96 L14 96 Z" fill="${F}" stroke="${S}"/><line x1="186" y1="70" x2="285" y2="156" stroke="${RED}" stroke-width="3" stroke-dasharray="7 5"/>${ARROW(44,52,120,52)}${ARROW(316,52,240,52)}${ARROW(232,112,262,140,INK,2.2)}<circle cx="223" cy="116" r="6.5" fill="none" stroke="${RED}" stroke-width="1.6"/><circle cx="223" cy="116" r="2.6" fill="${RED}"/>`,
    intraplate: () => `<rect x="14" y="58" width="312" height="114" fill="${F}" stroke="rgba(44,42,39,0.2)"/><line x1="170" y1="58" x2="150" y2="172" stroke="${RED}" stroke-width="2.6" stroke-dasharray="7 5"/>${ARROW(34,40,86,40)}${ARROW(306,40,254,40)}<circle cx="160" cy="118" r="6.5" fill="none" stroke="${RED}" stroke-width="1.6"/><circle cx="160" cy="118" r="2.6" fill="${RED}"/>`,
  };
  const DIAG_ALIAS = { thrust: 'reverse', 'oceanic-transform': 'strike-slip' };
  function faultSvg(type) {
    const key = DIAG[type] ? type : (DIAG_ALIAS[type] || 'intraplate');
    return `<svg viewBox="0 0 340 200" preserveAspectRatio="xMidYMid meet">${DIAG[key]()}</svg>`;
  }

  // ───────────────────────── Claude prompt ─────────────────────────
  function buildPrompt(q, lang) {
    const wantReg = lang !== 'en';
    const focalTxt = q.focal && q.focal.rake1 != null
      ? `Focal mechanism nodal plane: strike ${q.focal.strike1}°, dip ${q.focal.dip1}°, rake ${q.focal.rake1}°.`
      : 'No focal-mechanism solution available; infer from regional tectonics.';
    const langName = { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang];
    return `You are a seismologist writing a concise, accurate public explanation of an earthquake's mechanism.

Earthquake facts:
- Magnitude: M${q.mag}
- Location: ${q.place} (lat ${q.lat}, lon ${q.lon})
- Depth: ${Math.round(q.depth)} km (${q.depthClass})
- Tsunami flag from USGS: ${q.tsunami ? 'yes' : 'no'}
- ${focalTxt}

Determine the most likely faulting mechanism and tectonic setting from this location's known tectonics (and any focal data).

Return ONLY raw JSON (no markdown) with EXACTLY this shape:
{
  "faultType": "strike-slip" | "normal" | "reverse" | "subduction" | "intraplate",
  "faultTypeLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "mainCause": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "nature": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "continuity": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "tsunamiNote": ${'{ "en": "...", "reg": ' + (wantReg ? '"..."' : 'null') + ' } or null'}
}

Rules:
- "mainCause": the driving plate/tectonic cause. ≤ 24 words.
- "nature": shallow vs deep + energy/scale character and what it means for shaking. ≤ 24 words.
- "continuity": aftershock expectation and how long the sequence may persist. ≤ 24 words.
- "tsunamiNote": include only with genuine tsunami relevance (offshore/coastal + sufficient size), else null. ≤ 18 words.
- ${wantReg ? `Every "reg" value MUST be written in ${langName}.` : 'Set every "reg" to null.'}
- Be factual and specific to this region's tectonics. Do NOT restate the magnitude or place name in the text fields. Professional tone.`;
  }

  function parseContent(raw, lang) {
    let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
    const o = JSON.parse(txt);
    const wantReg = lang !== 'en';
    const norm = f => f ? { en: f.en || '', reg: wantReg ? (f.reg || '') : null } : null;
    return {
      faultType: o.faultType || 'intraplate',
      faultTypeLabel: norm(o.faultTypeLabel) || { en: 'Tectonic fault', reg: null },
      mainCause: norm(o.mainCause) || { en: '', reg: null },
      nature: norm(o.nature) || { en: '', reg: null },
      continuity: norm(o.continuity) || { en: '', reg: null },
      tsunamiNote: o.tsunamiNote ? norm(o.tsunamiNote) : null,
    };
  }

  // ───────────────────────── entitlement (pass + quota) ─────────────────────────
  const PASS_KEY = 'globe-explain-pass';
  const USE_KEY = 'globe-explain-usage';
  const CACHE_KEY = 'globe-explain-cache';

  function getPass() { try { return localStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; } }
  function setPass(t) { try { t ? localStorage.setItem(PASS_KEY, t) : localStorage.removeItem(PASS_KEY); } catch (e) {} }
  function hasPass() { return !!getPass(); }

  function usageToday() {
    const today = new Date().toISOString().slice(0, 10);
    let u = { date: today, n: 0 };
    try { const s = JSON.parse(localStorage.getItem(USE_KEY) || '{}'); if (s.date === today) u = s; } catch (e) {}
    return u;
  }
  function freeLeft() { return Math.max(0, CFG.FREE_PER_DAY - usageToday().n); }
  function bumpUsage() {
    const u = usageToday(); u.n += 1;
    try { localStorage.setItem(USE_KEY, JSON.stringify(u)); } catch (e) {}
  }
  function canGenerate() { return hasPass() || freeLeft() > 0; }

  function cacheGet(id, lang) {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return c[id + ':' + lang] || null; } catch (e) { return null; }
  }
  function cacheSet(id, lang, content) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      c[id + ':' + lang] = content;
      const keys = Object.keys(c);
      if (keys.length > 60) delete c[keys[0]];
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  // ───────────────────────── generation (backend → preview fallback) ─────────────────────────
  async function generate(q, lang) {
    const payload = { quake: q, lang: lang, pass: getPass() };

    // ── Try the Netlify Function (production) ──
    let netlifyAvailable = false;
    try {
      const r = await fetch(CFG.EXPLAIN_ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (r.status === 402) { const e = new Error('payment_required'); e.paywall = true; throw e; }
      if (r.ok) { return await r.json(); }
      // 5xx → real server error; throw so the catch shows it
      if (r.status >= 500) {
        let msg = 'server error ' + r.status;
        try { const d = await r.json(); msg = d.error || msg; } catch (e) {}
        throw new Error(msg);
      }
      // 404 → backend not deployed; fall through to preview
      netlifyAvailable = false;
    } catch (e) {
      if (e.paywall) throw e;
      // Hard network error (CORS/DNS/offline) or thrown 5xx
      if (!(e instanceof TypeError)) throw e; // TypeError = network fail → try preview
      netlifyAvailable = false;
    }

    // ── Preview fallback: sandbox-provided Claude ──
    if (window.claude && window.claude.complete) {
      const raw = await window.claude.complete({ messages: [{ role: 'user', content: buildPrompt(q, lang) }] });
      return parseContent(raw, lang);
    }
    throw new Error('no_backend');
  }

  // ───────────────────────── Stripe pass restore (on load) ─────────────────────────
  async function restoreFromUrl() {
    const p = new URLSearchParams(location.search);
    const sid = p.get('session_id');
    if (!sid) return;
    try {
      const r = await fetch(CFG.VERIFY_ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sid }),
      });
      if (r.ok) { const d = await r.json(); if (d.pass) setPass(d.pass); }
    } catch (e) {}
    // clean the URL
    p.delete('session_id'); p.delete('explain');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  async function startCheckout(lang) {
    // Production: ask the backend for a Stripe Checkout URL and redirect.
    try {
      const r = await fetch(CFG.CHECKOUT_ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang: lang, return_url: location.href.split('?')[0].split('#')[0] }),
      });
      if (r.ok) { const d = await r.json(); if (d.url) { location.href = d.url; return; } }
    } catch (e) {}
    // Preview / no backend: grant a local demo pass so the unlocked flow is visible.
    setPass('demo-preview-pass');
    return 'demo';
  }

  // ───────────────────────── DOM ─────────────────────────
  let overlay, panel, current = null;
  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'ex-overlay';
    overlay.innerHTML = '<div class="ex-panel" role="dialog" aria-modal="true"><button class="ex-close" aria-label="close">×</button><div class="ex-content"></div></div>';
    document.body.appendChild(overlay);
    panel = overlay.querySelector('.ex-content');
    overlay.querySelector('.ex-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('show')) close(); });
  }
  function open() { ensureDom(); overlay.classList.add('show'); }
  function close() { if (overlay) overlay.classList.remove('show'); }

  function bilingualHtml(loc, en, lang, cls) {
    cls = cls || '';
    if (lang === 'en' || !loc) return `<div class="en ${cls}">${esc(en)}</div>`;
    return `<div class="en ${cls}">${esc(loc)}</div><div class="reg ${cls}">${esc(en)}</div>`;
  }

  function renderLoading(t, sub) {
    panel.innerHTML = `<div class="ex-loading"><div class="ex-spinner"></div><div class="msg">${esc(t)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
  }

  function renderError(t, lang) {
    const L = LOC[lang] || LOC.en;
    panel.innerHTML = `<div class="ex-error"><div class="t">${esc(t)}</div><button class="ex-retry">${esc(L.retry)}</button></div>`;
    panel.querySelector('.ex-retry').addEventListener('click', () => run(current.q, lang, true));
  }

  function renderPaywall(lang) {
    const L = LOC[lang] || LOC.en;
    const price = CFG.PRICE[lang] || CFG.PRICE.en;
    const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    panel.innerHTML =
      `<div class="ex-pay">
        <div class="lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
        <h3>${esc(L.payTitle)}</h3>
        <p>${esc(L.payBody)}</p>
        <ul class="ex-pay-features">
          <li>${check}<span>${esc(L.f1)}</span></li>
          <li>${check}<span>${esc(L.f2)}</span></li>
          <li>${check}<span>${esc(L.f3)}</span></li>
        </ul>
        <button class="ex-unlock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V8a5 5 0 0 1 10 0"/><rect x="4" y="11" width="16" height="9" rx="2"/></svg>${esc(L.unlock)} · <span class="price">${esc(price)}</span></button>
        <div class="fine">${esc(L.fine)} · <a href="#" class="ex-restore" style="color:inherit">${esc(L.restore)}</a></div>
      </div>`;
    panel.querySelector('.ex-unlock').addEventListener('click', async () => {
      renderLoading(L.loadingPay);
      const res = await startCheckout(lang);
      if (res === 'demo') { run(current.q, lang, true); }  // preview: pass granted, retry
    });
    panel.querySelector('.ex-restore').addEventListener('click', async (e) => {
      e.preventDefault();
      await restoreFromUrl();
      if (hasPass()) run(current.q, lang, true);
    });
  }

  function renderContent(q, c, lang) {
    const L = LOC[lang] || LOC.en;
    const dir = RTL[lang] ? ' dir="rtl"' : '';
    const dc = q.depthClass;
    const dcTxt = lang === 'en' ? L[dc] : L[dc];
    const meta = [
      [L.depth, Math.round(q.depth) + ' km'],
      [L.cls, L[dc]],
      [L.when, whenOf(q.time, lang)],
      [L.epi, coordOf(q.lat, q.lon)],
    ].map(m => `<div><div class="k">${esc(m[0])}</div><div class="v">${esc(m[1])}</div></div>`).join('');

    const sec = (n, label, field) => {
      if (!field || (!field.en && !field.reg)) return '';
      return `<div class="ex-sec"><div class="n">${n}</div><div class="body"><div class="label">${esc(label)}</div>${bilingualHtml(field.reg, field.en, lang)}</div></div>`;
    };

    let tsunami = '';
    if (c.tsunamiNote || q.tsunami) {
      const note = c.tsunamiNote || { en: '', reg: null };
      tsunami = `<div class="ex-tsunami"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg><div><div class="label">${esc(L.tsunami)}</div>${(note.en || note.reg) ? bilingualHtml(note.reg, note.en, lang) : ''}</div></div>`;
    }

    const discReg = lang !== 'en' && DISC[lang] ? `<div class="t reg"${dir}>${esc(DISC[lang])}</div>` : '';
    const fl = c.faultTypeLabel || { en: '', reg: null };
    const badge = hasPass() ? `<span class="ex-badge">${esc(L.paid)}</span>` : '';

    panel.innerHTML =
      `<div class="ex-eyebrow"><span class="dot"></span>${esc(L.eyebrow)}${badge}</div>
       <div class="ex-head"><div class="ex-mag"><span class="u">M</span>${q.mag.toFixed(1)}</div><div class="ex-place">${esc(q.place || '')}</div></div>
       <div class="ex-rule"></div>
       <div class="ex-meta">${meta}</div>
       <div class="ex-fault">
         <div class="diagram">${faultSvg(c.faultType)}</div>
         <div><div class="ftag">${esc(L.faultTag)}</div><div class="fname">${esc(lang === 'en' ? fl.en : (fl.reg || fl.en))}${(lang !== 'en' && fl.reg && fl.en) ? `<span class="reg">${esc(fl.en)}</span>` : ''}</div></div>
       </div>
       <div class="ex-sections">
         ${sec('01', L.cause, c.mainCause)}
         ${sec('02', L.nature, c.nature)}
         ${sec('03', L.after, c.continuity)}
       </div>
       ${tsunami}
       <div class="ex-disc"><div class="label">${esc(L.disc)}</div><div class="t">${esc(DISC.en)}</div>${discReg}</div>`;
  }

  // ───────────────────────── flow ─────────────────────────
  async function run(q, lang, force) {
    const L = LOC[lang] || LOC.en;
    current = { q, lang };
    if (RTL[lang]) overlay.querySelector('.ex-panel').setAttribute('dir', 'rtl');
    else overlay.querySelector('.ex-panel').removeAttribute('dir');

    // 1. cached → free, instant, no billing
    const cached = cacheGet(q.id, lang);
    if (cached && !force) { renderContent(q, cached, lang); return; }

    // 2. gate
    if (!canGenerate()) { renderPaywall(lang); return; }

    // 3. generate
    renderLoading(L.generating, hasPass() ? '' : (freeLeft() > 0 ? L.quota.replace('%n', freeLeft()) : ''));
    try {
      const c = await generate(q, lang);
      cacheSet(q.id, lang, c);
      if (!hasPass()) bumpUsage();
      renderContent(q, c, lang);
    } catch (e) {
      if (e && e.paywall) { renderPaywall(lang); return; }
      renderError(L.errGen, lang);
    }
  }

  // ───────────────────────── public API ─────────────────────────
  const Api = {
    // q: { id, mag, place, lat, lon, depth, time, tsunami, focal? }
    open(rawQuake, lang) {
      lang = LOC[lang] ? lang : 'en';
      const q = Object.assign({}, rawQuake);
      q.depthClass = depthClassOf(q.depth == null ? 10 : q.depth);
      if (q.depth == null) q.depth = 10;
      open();
      run(q, lang, false);
    },
    // returns label + whether the feature is currently locked (for the button UI)
    buttonLabel(lang) { return (LOC[lang] || LOC.en).btn; },
    isLocked() { return !canGenerate(); },
    hasPass: hasPass,
  };
  window.GlobeExplain = Api;

  // restore a Stripe purchase if we just came back from checkout
  restoreFromUrl();
})();
