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
    PRICE: { ja: '$3.50 / 月', en: '$3.50 / mo', zh: '$3.50 / 月', hi: '$3.50 / माह', es: '$3.50 / mes', ar: '$3.50 / شهر' },
  };

  // ───────────────────────── i18n ─────────────────────────
  const DISC = {
    en: 'Automated explanation from USGS data for general awareness — not an official hazard assessment. Mechanism, tsunami risk and aftershock outlook are estimates and may be revised. Follow your local authority for safety guidance.',
    ja: 'USGSのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。発震機構・津波リスク・余震の見込みは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。',
    zh: '基于USGS数据自动生成的科普解说，非官方灾害评估。震源机制、海啸风险与余震展望均为估计值，可能修订。请以当地官方机构的防灾信息为准。',
    hi: 'यह USGS डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक खतरा आकलन नहीं। तंत्र, सुनामी जोखिम व आफ्टरशॉक अनुमान हैं और बदल सकते हैं। सुरक्षा हेतु स्थानीय प्राधिकरण का पालन करें।',
    es: 'Explicación automática a partir de datos del USGS con fines informativos; no es una evaluación oficial de peligro. El mecanismo, el riesgo de tsunami y las réplicas son estimaciones y pueden revisarse. Siga a su autoridad local.',
    ar: 'شرح آلي مُولّد من بيانات USGS لأغراض التوعية، وليس تقييمًا رسميًا للمخاطر. الآلية وخطر التسونامي وتوقعات التوابع تقديرية وقد تُراجَع. اتبع السلطة المحلية لإرشادات السلامة.',
  };

  const LOC = {
    ja: { eyebrow: '地震のメカニズム', depth: '深さ', cls: '深さ区分', when: '発生', epi: '震央', shallow: '浅い', intermediate: 'やや深い', deep: '深い', faultTag: '断層型', cause: 'なぜ起きた？', nature: 'どんな揺れ？', after: '余震は？', tsunami: '津波のリスク', disc: '注意事項', btn: '解説', fetching: '震源データを取得中…', generating: 'AIが発震機構を解説中…', errGen: '解説の生成に失敗しました。', retry: '再試行', payTitle: 'AI解説をすべて見る', payBody: 'AIが震源ごとに「なぜ起きたか・どんな揺れか・余震や津波の見込み」をやさしく解説します。本日の無料分を使い切りました。', f1: '回数無制限のAI解説', f2: 'あなたの言語＋英語の対訳', f3: '津波リスク評価と断層型の図解', unlock: 'パスを購入', restore: '購入済みを復元', fine: 'いつでも解約できます。', quota: '本日の無料解説：残り %n 回', paid: 'パス有効', loadingPay: '決済ページへ移動中…' },
    en: { eyebrow: 'Earthquake mechanism', depth: 'Depth', cls: 'Class', when: 'When', epi: 'Epicenter', shallow: 'Shallow', intermediate: 'Intermediate', deep: 'Deep', faultTag: 'Fault type', cause: 'Why it happened', nature: 'How it was felt', after: 'Aftershocks', tsunami: 'Tsunami risk', disc: 'Disclaimer', btn: 'Explain', fetching: 'Fetching quake data…', generating: 'AI is explaining the mechanism…', errGen: 'Could not generate the explanation.', retry: 'Retry', payTitle: 'See every AI explanation', payBody: 'AI explains, in plain language, why each quake happened, how it was felt, and the aftershock and tsunami outlook. You have used today’s free explanations.', f1: 'Unlimited AI explanations', f2: 'Your language + English', f3: 'Tsunami risk rating & fault diagrams', unlock: 'Unlock', restore: 'Restore purchase', fine: 'Cancel anytime.', quota: '%n free explanation(s) left today', paid: 'Pass active', loadingPay: 'Opening checkout…' },
    zh: { eyebrow: '震源机制解说', depth: '深度', cls: '分类', when: '发生', epi: '震中', shallow: '浅', intermediate: '较深', deep: '深', faultTag: '断层类型', cause: '为何发生', nature: '震感如何', after: '余震情况', tsunami: '海啸风险', disc: '注意事项', btn: '解说', fetching: '正在获取震源数据…', generating: 'AI正在解说震源机制…', errGen: '解说生成失败。', retry: '重试', payTitle: '查看全部AI解说', payBody: 'AI用通俗语言解说每次地震为何发生、震感如何，以及余震和海啸展望。今日免费次数已用完。', f1: '无限次AI解说', f2: '你的语言＋英文对照', f3: '海啸风险评级与断层图解', unlock: '购买通行证', restore: '恢复购买', fine: '可随时取消。', quota: '今日免费解说：剩余 %n 次', paid: '通行证有效', loadingPay: '正在打开结算页…' },
    hi: { eyebrow: 'भूकंप तंत्र', depth: 'गहराई', cls: 'श्रेणी', when: 'कब', epi: 'अधिकेंद्र', shallow: 'उथला', intermediate: 'मध्यम', deep: 'गहरा', faultTag: 'भ्रंश प्रकार', cause: 'क्यों हुआ', nature: 'कैसा महसूस हुआ', after: 'आफ्टरशॉक', tsunami: 'सुनामी जोखिम', disc: 'अस्वीकरण', btn: 'व्याख्या', fetching: 'भूकंप डेटा ला रहे हैं…', generating: 'AI तंत्र समझा रहा है…', errGen: 'व्याख्या नहीं बन सकी।', retry: 'पुनः', payTitle: 'सभी AI व्याख्याएँ देखें', payBody: 'AI सरल भाषा में बताता है कि हर भूकंप क्यों आया, कैसा महसूस हुआ, और आफ्टरशॉक व सुनामी की संभावना। आज की मुफ़्त व्याख्याएँ समाप्त।', f1: 'असीमित AI व्याख्या', f2: 'आपकी भाषा + अंग्रेज़ी', f3: 'सुनामी जोखिम रेटिंग व भ्रंश चित्र', unlock: 'पास खरीदें', restore: 'खरीद बहाल करें', fine: 'कभी भी रद्द करें।', quota: 'आज मुफ़्त: %n शेष', paid: 'पास सक्रिय', loadingPay: 'चेकआउट खुल रहा है…' },
    es: { eyebrow: 'Mecanismo sísmico', depth: 'Profundidad', cls: 'Clase', when: 'Cuándo', epi: 'Epicentro', shallow: 'Superficial', intermediate: 'Intermedio', deep: 'Profundo', faultTag: 'Tipo de falla', cause: 'Por qué ocurrió', nature: 'Cómo se sintió', after: 'Réplicas', tsunami: 'Riesgo de tsunami', disc: 'Aviso', btn: 'Explicar', fetching: 'Obteniendo datos…', generating: 'La IA explica el mecanismo…', errGen: 'No se pudo generar la explicación.', retry: 'Reintentar', payTitle: 'Ver todas las explicaciones', payBody: 'La IA explica, en lenguaje sencillo, por qué ocurrió cada sismo, cómo se sintió y el panorama de réplicas y tsunami. Agotaste las gratuitas de hoy.', f1: 'Explicaciones IA ilimitadas', f2: 'Tu idioma + inglés', f3: 'Nivel de riesgo de tsunami y fallas', unlock: 'Desbloquear', restore: 'Restaurar compra', fine: 'Cancela cuando quieras.', quota: '%n explicación(es) gratis hoy', paid: 'Pase activo', loadingPay: 'Abriendo pago…' },
    ar: { eyebrow: 'آلية الزلزال', depth: 'العمق', cls: 'التصنيف', when: 'الوقت', epi: 'المركز', shallow: 'ضحل', intermediate: 'متوسط', deep: 'عميق', faultTag: 'نوع الصدع', cause: 'لماذا حدث', nature: 'كيف شُعر به', after: 'التوابع', tsunami: 'خطر التسونامي', disc: 'تنويه', btn: 'شرح', fetching: 'جارٍ جلب البيانات…', generating: 'الذكاء الاصطناعي يشرح الآلية…', errGen: 'تعذّر إنشاء الشرح.', retry: 'إعادة', payTitle: 'شاهد كل الشروح', payBody: 'يشرح الذكاء الاصطناعي بلغة بسيطة سبب وقوع كل زلزال وكيف شُعر به وتوقعات التوابع والتسونامي. انتهت محاولاتك المجانية اليوم.', f1: 'شروح غير محدودة', f2: 'لغتك + الإنجليزية', f3: 'تقييم خطر التسونامي ورسوم الصدوع', unlock: 'فتح', restore: 'استعادة الشراء', fine: 'ألغِ في أي وقت.', quota: 'تبقّى %n شرح مجاني اليوم', paid: 'الاشتراك فعّال', loadingPay: 'فتح الدفع…' },
  };
  const RTL = { ar: true };

  // tsunami risk levels — localized label + colour
  const TRISK = {
    none:     { color: '#5b9e6f', bg: 'rgba(91,158,111,0.10)',  label: { en: 'No tsunami risk', ja: '津波の心配なし', zh: '无海啸风险', hi: 'कोई सुनामी जोखिम नहीं', es: 'Sin riesgo de tsunami', ar: 'لا خطر تسونامي' } },
    low:      { color: '#266e96', bg: 'rgba(38,110,150,0.09)',  label: { en: 'Low tsunami risk', ja: '津波リスク：低', zh: '海啸风险：低', hi: 'कम सुनामी जोखिम', es: 'Riesgo de tsunami bajo', ar: 'خطر تسونامي منخفض' } },
    moderate: { color: '#d98a2b', bg: 'rgba(217,138,43,0.12)',  label: { en: 'Moderate tsunami risk', ja: '津波リスク：中', zh: '海啸风险：中等', hi: 'मध्यम सुनामी जोखिम', es: 'Riesgo de tsunami moderado', ar: 'خطر تسونامي متوسط' } },
    high:     { color: '#cf4f2e', bg: 'rgba(207,79,46,0.11)',   label: { en: 'High tsunami risk', ja: '津波リスク：高', zh: '海啸风险：高', hi: 'उच्च सुनामी जोखिम', es: 'Riesgo de tsunami alto', ar: 'خطر تسونامي مرتفع' } },
  };

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

  // ───────────────────────── fault diagrams (brand SVG, localized) ─────────────────────────
  const ARROW = (x1, y1, x2, y2, col, w) => {
    col = col || '#cf4f2e'; w = w || 3;
    const ang = Math.atan2(y2 - y1, x2 - x1), h = w * 3.4;
    const a1 = ang + Math.PI - 0.45, a2 = ang + Math.PI + 0.45;
    const p1x = x2 + h * Math.cos(a1), p1y = y2 + h * Math.sin(a1);
    const p2x = x2 + h * Math.cos(a2), p2y = y2 + h * Math.sin(a2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/><path d="M${x2} ${y2} L${p1x} ${p1y} L${p2x} ${p2y} Z" fill="${col}"/>`;
  };
  const RED = '#cf4f2e', INK = '#2c2a27';
  const LB  = '#e8dfc8';   // 大陸 / 陸ブロック (warm tan)
  const OB  = '#c4d8ee';   // 海洋ブロック (cool blue)
  const HW  = '#d6c9ad';   // hanging wall (やや暗め)
  const GND = '#7a6b55';   // 地表色
  const WC  = '#3f88b0';   // 海面色
  const FNT = "'Noto Sans JP','Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',sans-serif";

  // localized labels used inside the diagrams (kept short to fit)
  const DLABEL = {
    en: { planView: 'Map view — seen from above', blockA: 'Block A', blockB: 'Block B', fault: 'Fault', extension: 'Land pulled apart', compression: 'Land pushed together', footwall: 'Stays', hangingwall: 'Moves', drop: 'drops down', uplift: 'pushed up', surface: 'Ground', sealevel: 'Sea level', trench: 'Trench', oceanic: 'Ocean plate', continental: 'Land plate', subduction: 'sinks under', interior: 'Inside one plate', focus: 'Quake focus', stress: 'Stress' },
    ja: { planView: '平面図（上から見た図）', blockA: 'ブロックA', blockB: 'ブロックB', fault: '断層', extension: '引っ張られる', compression: '押し合う', footwall: '動かない', hangingwall: '動く', drop: '下がる', uplift: '持ち上がる', surface: '地表', sealevel: '海面', trench: '海溝', oceanic: '海洋プレート', continental: '大陸プレート', subduction: '沈み込む', interior: 'プレート内部', focus: '震源', stress: '応力' },
    zh: { planView: '俯视图（从上方看）', blockA: '断块A', blockB: '断块B', fault: '断层', extension: '地块被拉张', compression: '地块被挤压', footwall: '不动', hangingwall: '移动', drop: '下降', uplift: '抬升', surface: '地表', sealevel: '海平面', trench: '海沟', oceanic: '海洋板块', continental: '大陆板块', subduction: '俯冲', interior: '板块内部', focus: '震源', stress: '应力' },
    hi: { planView: 'ऊपर से दृश्य', blockA: 'खंड A', blockB: 'खंड B', fault: 'भ्रंश', extension: 'ज़मीन अलग खिंची', compression: 'ज़मीन दबी', footwall: 'स्थिर', hangingwall: 'गतिशील', drop: 'नीचे', uplift: 'ऊपर', surface: 'सतह', sealevel: 'समुद्र तल', trench: 'गर्त', oceanic: 'महासागरीय प्लेट', continental: 'महाद्वीपीय प्लेट', subduction: 'अधोगमन', interior: 'प्लेट के अंदर', focus: 'भूकंप केंद्र', stress: 'तनाव' },
    es: { planView: 'Vista desde arriba', blockA: 'Bloque A', blockB: 'Bloque B', fault: 'Falla', extension: 'Se separa', compression: 'Se comprime', footwall: 'Fijo', hangingwall: 'Se mueve', drop: 'baja', uplift: 'sube', surface: 'Suelo', sealevel: 'Nivel del mar', trench: 'Fosa', oceanic: 'Placa oceánica', continental: 'Placa continental', subduction: 'subducción', interior: 'Dentro de una placa', focus: 'Foco', stress: 'Esfuerzo' },
    ar: { planView: 'منظر من الأعلى', blockA: 'كتلة A', blockB: 'كتلة B', fault: 'صدع', extension: 'تباعد الأرض', compression: 'تضاغط الأرض', footwall: 'ثابت', hangingwall: 'متحرك', drop: 'يهبط', uplift: 'يرتفع', surface: 'السطح', sealevel: 'سطح البحر', trench: 'خندق', oceanic: 'صفيحة محيطية', continental: 'صفيحة قارية', subduction: 'اندساس', interior: 'داخل صفيحة', focus: 'بؤرة', stress: 'إجهاد' },
  };

  // helper text builders
  const TT = (x, y, s, size, fill, anchor, weight) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${FNT}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}>${s}</text>`;

  const DIAG = {
    /* ── 横ずれ断層：平面図（上から見た図） ── */
    'strike-slip': (D) => `
      ${TT(190, 22, D.planView, 14, '#8c887f', 'middle')}
      <rect x="12" y="34" width="166" height="174" rx="3" fill="${LB}" stroke="rgba(44,42,39,0.2)" stroke-width="1.4"/>
      <rect x="202" y="34" width="166" height="174" rx="3" fill="${LB}" stroke="rgba(44,42,39,0.2)" stroke-width="1.4"/>
      <line x1="190" y1="34" x2="190" y2="208" stroke="${RED}" stroke-width="3" stroke-dasharray="10 6"/>
      ${ARROW(96, 178, 96, 80, INK, 3.4)}
      ${ARROW(284, 64, 284, 162, INK, 3.4)}
      ${TT(96, 200, D.blockA, 14, INK, 'middle', 600)}
      ${TT(284, 52, D.blockB, 14, INK, 'middle', 600)}
      ${TT(190, 226, D.fault, 14, RED, 'middle', 500)}
    `,

    /* ── 正断層：断面図（引っ張られて片側が落ちる） ── */
    normal: (D) => `
      ${TT(190, 22, '↔ ' + D.extension, 14, '#8c887f', 'middle')}
      ${ARROW(168, 30, 92, 30, INK, 3)}
      ${ARROW(212, 30, 288, 30, INK, 3)}
      <line x1="12" y1="52" x2="178" y2="52" stroke="${GND}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="178" y1="52" x2="200" y2="76" stroke="${GND}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="200" y1="76" x2="368" y2="76" stroke="${GND}" stroke-width="3.5" stroke-linecap="round"/>
      <polygon points="12,52 178,52 200,214 12,214" fill="${LB}" stroke="rgba(44,42,39,0.16)" stroke-width="1.4"/>
      <polygon points="198,76 368,76 368,214 198,214" fill="${HW}" stroke="rgba(44,42,39,0.16)" stroke-width="1.4"/>
      <line x1="176" y1="40" x2="202" y2="216" stroke="${RED}" stroke-width="3" stroke-dasharray="10 6"/>
      ${ARROW(286, 96, 286, 144, INK, 3)}
      ${TT(14, 46, D.surface, 12.5, GND)}
      ${TT(92, 150, D.footwall, 14, INK, 'middle', 600)}
      ${TT(286, 174, D.hangingwall, 14, INK, 'middle', 600)}
      ${TT(286, 192, D.drop, 12.5, '#8c887f', 'middle')}
      ${TT(206, 158, D.fault, 14, RED, 'start', 500)}
    `,

    /* ── 逆断層：断面図（押し合って片側が持ち上がる） ── */
    reverse: (D) => `
      ${TT(190, 22, '→ ' + D.compression + ' ←', 14, '#8c887f', 'middle')}
      ${ARROW(92, 30, 168, 30, INK, 3)}
      ${ARROW(288, 30, 212, 30, INK, 3)}
      <line x1="12" y1="76" x2="178" y2="76" stroke="${GND}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="178" y1="76" x2="200" y2="52" stroke="${GND}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="200" y1="52" x2="368" y2="52" stroke="${GND}" stroke-width="3.5" stroke-linecap="round"/>
      <polygon points="12,76 178,76 200,214 12,214" fill="${LB}" stroke="rgba(44,42,39,0.16)" stroke-width="1.4"/>
      <polygon points="198,52 368,52 368,214 198,214" fill="${HW}" stroke="rgba(44,42,39,0.16)" stroke-width="1.4"/>
      <line x1="176" y1="42" x2="202" y2="216" stroke="${RED}" stroke-width="3" stroke-dasharray="10 6"/>
      ${ARROW(286, 146, 286, 96, INK, 3)}
      ${TT(14, 70, D.surface, 12.5, GND)}
      ${TT(92, 158, D.footwall, 14, INK, 'middle', 600)}
      ${TT(286, 172, D.hangingwall, 14, INK, 'middle', 600)}
      ${TT(286, 190, D.uplift, 12.5, '#8c887f', 'middle')}
      ${TT(206, 162, D.fault, 14, RED, 'start', 500)}
    `,

    /* ── 沈み込み帯：断面図（海洋プレートが潜り込む） ── */
    subduction: (D) => `
      <rect x="12" y="14" width="176" height="76" rx="2" fill="rgba(63,136,176,0.15)"/>
      <line x1="12" y1="14" x2="188" y2="14" stroke="${WC}" stroke-width="2.5" stroke-dasharray="7 5" opacity="0.8"/>
      ${TT(96, 34, D.sealevel, 13, WC, 'middle')}
      <polygon points="12,90 182,90 290,214 12,214" fill="${OB}" stroke="rgba(44,42,39,0.16)" stroke-width="1.4"/>
      <polygon points="156,46 368,46 368,214 262,214" fill="${LB}" stroke="rgba(44,42,39,0.16)" stroke-width="1.4"/>
      <line x1="162" y1="84" x2="284" y2="210" stroke="${RED}" stroke-width="3" stroke-dasharray="10 6"/>
      ${ARROW(206, 138, 246, 188, INK, 3)}
      ${TT(158, 80, D.trench, 14, RED, 'end', 500)}
      ${TT(86, 172, D.oceanic, 13.5, INK, 'middle', 600)}
      ${TT(284, 86, D.continental, 13.5, INK, 'middle', 600)}
      ${TT(224, 206, D.subduction, 12.5, '#6f6b63', 'middle')}
    `,

    /* ── プレート内地震：断面図（内部の応力でずれる） ── */
    intraplate: (D) => `
      <line x1="12" y1="48" x2="368" y2="48" stroke="${GND}" stroke-width="3.5" stroke-linecap="round"/>
      ${TT(14, 42, D.surface, 12.5, GND)}
      <rect x="12" y="48" width="356" height="166" rx="3" fill="${LB}" stroke="rgba(44,42,39,0.16)" stroke-width="1.4"/>
      <line x1="176" y1="48" x2="206" y2="214" stroke="${RED}" stroke-width="3" stroke-dasharray="10 6"/>
      ${ARROW(68, 132, 150, 132, INK, 3)}
      ${ARROW(318, 132, 236, 132, INK, 3)}
      ${TT(44, 120, D.stress, 12.5, '#8c887f', 'middle')}
      <circle cx="192" cy="170" r="11" fill="none" stroke="${RED}" stroke-width="2.4"/>
      <circle cx="192" cy="170" r="4.5" fill="${RED}"/>
      ${TT(190, 92, D.interior, 14, INK, 'middle', 600)}
      ${TT(214, 152, D.fault, 14, RED, 'start', 500)}
      ${TT(192, 200, D.focus, 12.5, RED, 'middle')}
    `,
  };
  const DIAG_ALIAS = { thrust: 'reverse', 'oceanic-transform': 'strike-slip' };
  function faultSvg(type, lang) {
    const key = DIAG[type] ? type : (DIAG_ALIAS[type] || 'intraplate');
    const D = DLABEL[lang] || DLABEL.en;
    return `<svg viewBox="0 0 380 236" preserveAspectRatio="xMidYMid meet" role="img" aria-label="fault diagram">${DIAG[key](D)}</svg>`;
  }

  // ───────────────────────── Claude prompt ─────────────────────────
  function buildPrompt(q, lang) {
    const wantReg = lang !== 'en';
    const focalTxt = q.focal && q.focal.rake1 != null
      ? `Focal mechanism nodal plane: strike ${q.focal.strike1}°, dip ${q.focal.dip1}°, rake ${q.focal.rake1}°.`
      : 'No focal-mechanism solution available; infer from regional tectonics.';
    const langName = { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang];
    return `You are a seismologist writing a warm, clear explanation of an earthquake for ordinary members of the public — people with no science background.

Earthquake facts:
- Magnitude: M${q.mag}
- Location: ${q.place} (lat ${q.lat}, lon ${q.lon})
- Depth: ${Math.round(q.depth)} km (${q.depthClass})
- Tsunami flag from USGS: ${q.tsunami ? 'yes' : 'no'}
- ${focalTxt}

Work out the most likely faulting mechanism and tectonic setting from this location's known plate tectonics (and any focal data), then judge the tsunami risk.

Return ONLY raw JSON (no markdown) with EXACTLY this shape:
{
  "faultType": "strike-slip" | "normal" | "reverse" | "subduction" | "intraplate",
  "faultTypeLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "mainCause": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "nature": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "continuity": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "tsunamiRisk": "none" | "low" | "moderate" | "high",
  "tsunamiNote": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} }
}

Write for a NON-EXPERT. Use plain everyday words and full sentences. Avoid jargon; if you must use a term, explain it in a few words. Be calm and reassuring, never alarmist.
- "faultTypeLabel": the fault type in friendly words (e.g. "Subduction thrust", "Strike-slip"). Keep it short.
- "mainCause": which plates or forces moved, and why, in plain language. <= 32 words.
- "nature": what the depth and size meant for how strong and widespread the shaking was. <= 32 words.
- "continuity": whether aftershocks are likely, how strong, and for how long — plainly and calmly. <= 32 words.
- "tsunamiRisk": judge honestly. Offshore + shallow + subduction/reverse + roughly M7 or larger => "high". Offshore + moderate size or less direct => "moderate". Onshore, deep, small, or strike-slip => "low" or "none".
- "tsunamiNote": one or two plain sentences explaining WHY the risk is at that level (e.g. "This quake was deep and far inland, so no sea floor was lifted and a tsunami is not expected."). Always provide. <= 36 words.
- ${wantReg ? `Every "reg" value MUST be written in ${langName}, in the same warm plain style.` : 'Set every "reg" to null.'}
- Use each language's STANDARD public term for a tectonic plate: Japanese プレート (never 板; e.g. インドプレート、ユーラシアプレート), Simplified Chinese 板块, Hindi टेक्टोनिक प्लेट / प्लेट, Spanish placa, Arabic صفيحة.
- Be factual and specific to this region. Do NOT restate the magnitude number or the place name in the text fields.`;
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
      tsunamiRisk: ['none', 'low', 'moderate', 'high'].indexOf(o.tsunamiRisk) >= 0 ? o.tsunamiRisk : null,
      tsunamiNote: o.tsunamiNote ? norm(o.tsunamiNote) : null,
    };
  }

  // ───────────────────────── entitlement (pass + quota) ─────────────────────────
  const PASS_KEY = 'globe-explain-pass';
  const USE_KEY = 'globe-explain-usage';
  const CACHE_KEY = 'globe-explain-cache';
  const CACHE_VER = 'v2';        // bump to invalidate old cached shapes

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
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return c[CACHE_VER + ':' + id + ':' + lang] || null; } catch (e) { return null; }
  }
  function cacheSet(id, lang, content) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      c[CACHE_VER + ':' + id + ':' + lang] = content;
      const keys = Object.keys(c);
      if (keys.length > 60) delete c[keys[0]];
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  // ───────────────────────── generation (backend → preview fallback) ─────────────────────────
  async function generate(q, lang) {
    const payload = { quake: q, lang: lang, pass: getPass() };
    try {
      const r = await fetch(CFG.EXPLAIN_ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (r.status === 402) { const e = new Error('payment_required'); e.paywall = true; throw e; }
      if (r.ok) { return await r.json(); }
      if (r.status >= 500) {
        let msg = 'server error ' + r.status;
        try { const d = await r.json(); msg = d.error || msg; } catch (e) {}
        throw new Error(msg);
      }
      // 404 → backend not deployed; fall through to preview
    } catch (e) {
      if (e.paywall) throw e;
      if (!(e instanceof TypeError)) throw e; // TypeError = network fail → try preview
    }
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
    p.delete('session_id'); p.delete('explain');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  async function startCheckout(lang) {
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
      if (res === 'demo') { run(current.q, lang, true); }
    });
    panel.querySelector('.ex-restore').addEventListener('click', async (e) => {
      e.preventDefault();
      await restoreFromUrl();
      if (hasPass()) run(current.q, lang, true);
    });
  }

  // wave icon
  const WAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg>';

  function renderContent(q, c, lang) {
    const L = LOC[lang] || LOC.en;
    const dir = RTL[lang] ? ' dir="rtl"' : '';
    const dc = q.depthClass;
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

    // tsunami — always shown, colour-coded by risk
    let risk = c.tsunamiRisk;
    if (!risk) risk = q.tsunami ? 'moderate' : 'low';
    const tr = TRISK[risk] || TRISK.low;
    const rlabel = tr.label[lang] || tr.label.en;
    const note = c.tsunamiNote;
    const tsunami =
      `<div class="ex-tsunami" style="--trc:${tr.color};--trbg:${tr.bg}">
         <div class="tsu-head"><span class="tsu-icon">${WAVE}</span><span class="tsu-label">${esc(rlabel)}</span></div>
         ${note && (note.en || note.reg) ? `<div class="tsu-body">${bilingualHtml(note.reg, note.en, lang)}</div>` : ''}
       </div>`;

    const discReg = lang !== 'en' && DISC[lang] ? `<div class="t reg"${dir}>${esc(DISC[lang])}</div>` : '';
    const fl = c.faultTypeLabel || { en: '', reg: null };
    const badge = hasPass() ? `<span class="ex-badge">${esc(L.paid)}</span>` : '';

    panel.innerHTML =
      `<div class="ex-eyebrow"><span class="dot"></span>${esc(L.eyebrow)}${badge}</div>
       <div class="ex-head"><div class="ex-mag"><span class="u">M</span>${q.mag.toFixed(1)}</div><div class="ex-place">${esc(q.place || '')}</div></div>
       <div class="ex-rule"></div>
       <div class="ex-meta">${meta}</div>
       <div class="ex-fault">
         <div class="diagram">${faultSvg(c.faultType, lang)}</div>
         <div class="fault-name"><span class="ftag">${esc(L.faultTag)}</span><span class="fname">${esc(lang === 'en' ? fl.en : (fl.reg || fl.en))}${(lang !== 'en' && fl.reg && fl.en) ? `<span class="reg">${esc(fl.en)}</span>` : ''}</span></div>
       </div>
       <div class="ex-sections">
         ${sec('01', L.cause, c.mainCause)}
         ${sec('02', L.nature, c.nature)}
         ${sec('03', L.after, c.continuity)}
       </div>
       <div class="ex-tsu-label">${esc(L.tsunami)}</div>
       ${tsunami}
       <div class="ex-disc"><div class="label">${esc(L.disc)}</div><div class="t">${esc(DISC.en)}</div>${discReg}</div>`;
  }

  // ───────────────────────── flow ─────────────────────────
  async function run(q, lang, force) {
    const L = LOC[lang] || LOC.en;
    current = { q, lang };
    if (RTL[lang]) overlay.querySelector('.ex-panel').setAttribute('dir', 'rtl');
    else overlay.querySelector('.ex-panel').removeAttribute('dir');

    const cached = cacheGet(q.id, lang);
    if (cached && !force) { renderContent(q, cached, lang); return; }

    if (!canGenerate()) { renderPaywall(lang); return; }

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
    open(rawQuake, lang) {
      lang = LOC[lang] ? lang : 'en';
      const q = Object.assign({}, rawQuake);
      if (q.depth == null) q.depth = 10;
      q.depthClass = depthClassOf(q.depth);
      open();
      run(q, lang, false);
    },
    buttonLabel(lang) { return (LOC[lang] || LOC.en).btn; },
    isLocked() { return !canGenerate(); },
    hasPass: hasPass,
  };
  window.GlobeExplain = Api;

  restoreFromUrl();
})();
