/* Globe — solar flare explanation, gated behind the same paywall/quota as the
 * earthquake & volcano explainers (shares the pass + daily free counter).
 *
 *   tap a flare (sun glyph) on the day side → card → "解説" button → this overlay.
 *
 * A solar flare happens on the Sun, but its first effect on Earth is an HF radio
 * blackout across the SUNLIT hemisphere, centred on the sub-solar point (where
 * the Sun is overhead). That sub-solar point is where the marker sits.
 *
 * Claude is called through a Netlify Function (keeps the API key secret); in the
 * design preview (no backend) it falls back to window.claude.complete.
 */
(function () {
  'use strict';

  const CFG = {
    EXPLAIN_ENDPOINT: '/.netlify/functions/explain-solar',
    CHECKOUT_ENDPOINT: '/.netlify/functions/checkout',
    VERIFY_ENDPOINT: '/.netlify/functions/verify',
    FREE_PER_DAY: 3,
    PRICE: { ja: '$3.50 / 月', en: '$3.50 / mo', zh: '$3.50 / 月', hi: '$3.50 / माह', es: '$3.50 / mes', ar: '$3.50 / شهر' },
  };

  // ───────────────────────── i18n ─────────────────────────
  const DISC = {
    en: 'Automated explanation from NOAA SWPC (GOES) X-ray data for general awareness — not an official forecast. Effects, the R-level reasoning and the CME/aurora outlook are estimates and may be revised. Always follow your local authority.',
    ja: 'NOAA SWPC（GOES）のX線データをもとに自動生成した一般向けの解説です。公式の予報ではありません。影響・R等級の背景・CME／オーロラの見通しは推定であり、更新される場合があります。情報は各国の公式機関に従ってください。',
    zh: '基于NOAA SWPC（GOES）X射线数据自动生成的科普解说，非官方预报。影响、R等级背景与CME／极光展望均为估计值，可能修订。请以官方机构信息为准。',
    hi: 'यह NOAA SWPC (GOES) एक्स-रे डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक पूर्वानुमान नहीं। प्रभाव, R-स्तर का कारण और CME/ध्रुवीय-प्रकाश अनुमान हैं और बदल सकते हैं। आधिकारिक स्रोत का पालन करें।',
    es: 'Explicación automática a partir de datos de rayos X de NOAA SWPC (GOES) con fines informativos; no es un pronóstico oficial. Los efectos, el nivel R y el panorama de CME/auroras son estimaciones y pueden revisarse. Siga a su autoridad local.',
    ar: 'شرح آلي مُولّد من بيانات الأشعة السينية من NOAA SWPC (GOES) لأغراض التوعية، وليس تنبؤًا رسميًا. الآثار وسبب مستوى R وتوقعات CME/الشفق تقديرية وقد تُراجَع. اتبع المصادر الرسمية دائمًا.',
  };

  const LOC = {
    en: { eyebrow: 'Solar flare', cls: 'Class', rscale: 'Radio blackout', peak: 'Peak (UTC)', region: 'Sub-solar point', began: 'Began', source: 'Official source (SWPC)', ladder: 'Radio-blackout scale (R)', typeTag: 'Source region', here: 'Now', s1: 'What a solar flare is', s2: 'Where it came from', s3: 'What this R-level means', s4: 'Effects at Earth', effects: 'Possible effects', outlook: 'CME & aurora outlook', disc: 'Disclaimer', btn: 'Explain', fetching: 'Reading flare data…', generating: 'AI is explaining this flare…', errGen: 'Could not generate the explanation.', retry: 'Retry', payTitle: 'See every AI explanation', payBody: 'AI explains, in plain language, what each flare is, where it came from, what the radio-blackout level means and how it affects Earth. You have used today’s free explanations.', f1: 'Unlimited AI explanations', f2: 'Your language + English', f3: 'R-scale ladder & Sun→Earth diagram', unlock: 'Unlock', restore: 'Restore purchase', fine: 'Cancel anytime.', quota: '%n free explanation(s) left today', paid: 'Pass active', loadingPay: 'Opening checkout…' },
    ja: { eyebrow: '太陽フレアの解説', cls: '規模', rscale: '電波障害', peak: 'ピーク(UTC)', region: '太陽直下点', began: '開始', source: '公式情報(SWPC)', ladder: '電波障害スケール(R)', typeTag: '発生源(黒点群)', here: '現在', s1: 'フレアとは？', s2: 'どこで起きたの？', s3: 'R等級の意味', s4: '地球への影響', effects: '考えられる影響', outlook: 'CME・オーロラの見通し', disc: '注意事項', btn: '解説', fetching: 'フレアのデータを取得中…', generating: 'AIがフレアを解説中…', errGen: '解説の生成に失敗しました。', retry: '再試行', payTitle: 'AI解説をすべて見る', payBody: 'AIがフレアごとに「何が起きたか・発生源・電波障害レベルの意味・地球への影響」をやさしく解説します。本日の無料分を使い切りました。', f1: '回数無制限のAI解説', f2: 'あなたの言語＋英語の対訳', f3: 'R等級の図解と太陽→地球の図', unlock: 'パスを購入', restore: '購入済みを復元', fine: 'いつでも解約できます。', quota: '本日の無料解説：残り %n 回', paid: 'パス有効', loadingPay: '決済ページへ移動中…' },
    zh: { eyebrow: '太阳耀斑解说', cls: '等级', rscale: '无线电中断', peak: '峰值(UTC)', region: '太阳直射点', began: '开始', source: '官方信息(SWPC)', ladder: '无线电中断等级(R)', typeTag: '发生源(黑子群)', here: '当前', s1: '什么是太阳耀斑', s2: '来自何处', s3: 'R等级的含义', s4: '对地球的影响', effects: '可能的影响', outlook: 'CME与极光展望', disc: '注意事项', btn: '解说', fetching: '正在获取耀斑数据…', generating: 'AI正在解说耀斑…', errGen: '解说生成失败。', retry: '重试', payTitle: '查看全部AI解说', payBody: 'AI用通俗语言解说每次耀斑是什么、来自何处、无线电中断级别含义与对地球的影响。今日免费次数已用完。', f1: '无限次AI解说', f2: '你的语言＋英文对照', f3: 'R等级图解与太阳→地球图', unlock: '购买通行证', restore: '恢复购买', fine: '可随时取消。', quota: '今日免费解说：剩余 %n 次', paid: '通行证有效', loadingPay: '正在打开结算页…' },
    hi: { eyebrow: 'सौर ज्वाला', cls: 'श्रेणी', rscale: 'रेडियो ब्लैकआउट', peak: 'शिखर(UTC)', region: 'उप-सौर बिंदु', began: 'शुरू', source: 'आधिकारिक स्रोत(SWPC)', ladder: 'रेडियो-ब्लैकआउट स्केल(R)', typeTag: 'स्रोत क्षेत्र', here: 'अभी', s1: 'सौर ज्वाला क्या है', s2: 'यह कहाँ से आई', s3: 'R-स्तर का अर्थ', s4: 'पृथ्वी पर प्रभाव', effects: 'संभावित प्रभाव', outlook: 'CME व ध्रुवीय-प्रकाश अनुमान', disc: 'अस्वीकरण', btn: 'व्याख्या', fetching: 'ज्वाला डेटा ला रहे हैं…', generating: 'AI ज्वाला समझा रहा है…', errGen: 'व्याख्या नहीं बन सकी।', retry: 'पुनः', payTitle: 'सभी AI व्याख्याएँ देखें', payBody: 'AI सरल भाषा में बताता है कि हर ज्वाला क्या है, कहाँ से आई, रेडियो-ब्लैकआउट स्तर का अर्थ और पृथ्वी पर प्रभाव। आज की मुफ़्त व्याख्याएँ समाप्त।', f1: 'असीमित AI व्याख्या', f2: 'आपकी भाषा + अंग्रेज़ी', f3: 'R-स्केल व सूर्य→पृथ्वी चित्र', unlock: 'पास खरीदें', restore: 'खरीद बहाल करें', fine: 'कभी भी रद्द करें।', quota: 'आज मुफ़्त: %n शेष', paid: 'पास सक्रिय', loadingPay: 'चेकआउट खुल रहा है…' },
    es: { eyebrow: 'Erupción solar', cls: 'Clase', rscale: 'Apagón de radio', peak: 'Pico(UTC)', region: 'Punto subsolar', began: 'Inicio', source: 'Fuente oficial(SWPC)', ladder: 'Escala de apagón de radio(R)', typeTag: 'Región de origen', here: 'Ahora', s1: 'Qué es una erupción solar', s2: 'De dónde vino', s3: 'Qué significa este nivel R', s4: 'Efectos en la Tierra', effects: 'Posibles efectos', outlook: 'Panorama de CME y auroras', disc: 'Aviso', btn: 'Explicar', fetching: 'Leyendo datos…', generating: 'La IA explica la erupción…', errGen: 'No se pudo generar la explicación.', retry: 'Reintentar', payTitle: 'Ver todas las explicaciones', payBody: 'La IA explica, en lenguaje sencillo, qué es cada erupción, de dónde vino, qué significa el apagón de radio y cómo afecta a la Tierra. Agotaste las gratuitas de hoy.', f1: 'Explicaciones IA ilimitadas', f2: 'Tu idioma + inglés', f3: 'Escala R y diagrama Sol→Tierra', unlock: 'Desbloquear', restore: 'Restaurar compra', fine: 'Cancela cuando quieras.', quota: '%n explicación(es) gratis hoy', paid: 'Pase activo', loadingPay: 'Abriendo pago…' },
    ar: { eyebrow: 'توهج شمسي', cls: 'الفئة', rscale: 'انقطاع الراديو', peak: 'الذروة(UTC)', region: 'النقطة تحت الشمسية', began: 'البداية', source: 'المصدر الرسمي(SWPC)', ladder: 'مقياس انقطاع الراديو(R)', typeTag: 'منطقة المصدر', here: 'الآن', s1: 'ما هو التوهج الشمسي', s2: 'من أين جاء', s3: 'ماذا يعني مستوى R', s4: 'الآثار على الأرض', effects: 'الآثار المحتملة', outlook: 'توقعات CME والشفق', disc: 'تنويه', btn: 'شرح', fetching: 'جارٍ جلب البيانات…', generating: 'الذكاء الاصطناعي يشرح التوهج…', errGen: 'تعذّر إنشاء الشرح.', retry: 'إعادة', payTitle: 'شاهد كل الشروح', payBody: 'يشرح الذكاء الاصطناعي بلغة بسيطة ما هو كل توهج ومن أين جاء وماذا يعني مستوى انقطاع الراديو وكيف يؤثر على الأرض. انتهت محاولاتك المجانية اليوم.', f1: 'شروح غير محدودة', f2: 'لغتك + الإنجليزية', f3: 'مقياس R ورسم الشمس→الأرض', unlock: 'فتح', restore: 'استعادة الشراء', fine: 'ألغِ في أي وقت.', quota: 'تبقّى %n شرح مجاني اليوم', paid: 'الاشتراك فعّال', loadingPay: 'فتح الدفع…' },
  };
  const RTL = { ar: true };

  // ───────────────────────── R-scale ladder (NOAA radio-blackout) ─────────────────────────
  const R_RGB = { 1: '230,194,90', 2: '224,160,40', 3: '217,122,43', 4: '196,74,42', 5: '160,40,40' };
  const R_LAB = {
    en: ['Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'],
    ja: ['軽微', '中程度', '強い', '重大', '極めて重大'],
    zh: ['轻微', '中等', '强', '严重', '极端'],
    hi: ['मामूली', 'मध्यम', 'तीव्र', 'गंभीर', 'चरम'],
    es: ['Menor', 'Moderado', 'Fuerte', 'Severo', 'Extremo'],
    ar: ['طفيف', 'متوسط', 'قوي', 'شديد', 'بالغ'],
  };
  // class threshold that triggers each R level (language-neutral)
  const R_ZONE = ['M1', 'M5', 'X1', 'X10', 'X20'];

  // ───────────────────────── Sun → Earth diagram ─────────────────────────
  const INK = '#2c2a27', GOLD = '#e09e28', AMBER = '#c98318', FLARE = '#d97a2b', SKY = '#f4efe6';
  const SPOT = '#7a4f12', MAGLINE = '#3a6f8c', NIGHT = '#cfc7b6';
  const FNT = "'Noto Sans JP','Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',sans-serif";
  const TT = (x, y, s, size, fill, anchor, weight) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${FNT}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}>${s}</text>`;

  const SLABEL = {
    en: { sun: 'Sun', flare: 'Flare', xray: 'X-rays (~8 min)', earth: 'Earth', day: 'Day side', blackout: 'HF radio blackout', mag: 'Magnetic field', region: 'active region' },
    ja: { sun: '太陽', flare: 'フレア', xray: 'X線（約8分）', earth: '地球', day: '昼側', blackout: '電波障害(HF)', mag: '磁気圏', region: '黒点群' },
    zh: { sun: '太阳', flare: '耀斑', xray: 'X射线（约8分）', earth: '地球', day: '昼侧', blackout: 'HF无线电中断', mag: '磁场', region: '活动区' },
    hi: { sun: 'सूर्य', flare: 'ज्वाला', xray: 'एक्स-रे (~8 मिनट)', earth: 'पृथ्वी', day: 'दिन-पक्ष', blackout: 'HF रेडियो ब्लैकआउट', mag: 'चुंबकीय क्षेत्र', region: 'सक्रिय क्षेत्र' },
    es: { sun: 'Sol', flare: 'Erupción', xray: 'Rayos X (~8 min)', earth: 'Tierra', day: 'Lado diurno', blackout: 'Apagón de radio HF', mag: 'Campo magnético', region: 'región activa' },
    ar: { sun: 'الشمس', flare: 'توهج', xray: 'أشعة سينية (~8 د)', earth: 'الأرض', day: 'الجانب النهاري', blackout: 'انقطاع راديو HF', mag: 'المجال المغناطيسي', region: 'منطقة نشطة' },
  };

  // sunspot cluster for the active region, by complexity
  function spotCluster(type) {
    const sets = {
      simple: [[58, 120, 5]],
      moderate: [[54, 116, 5], [66, 124, 4]],
      complex: [[50, 114, 5], [62, 120, 6], [70, 130, 4], [58, 128, 3]],
    };
    const arr = sets[type] || sets.moderate;
    return arr.map(s => `<circle cx="${s[0]}" cy="${s[1]}" r="${s[2]}" fill="${SPOT}"/>`).join('');
  }

  function sunEarthSvg(regionType, lang) {
    const D = SLABEL[lang] || SLABEL.en;
    // sun centred off the left edge; earth on the right
    const xrays = [];
    for (let i = 0; i < 5; i++) {
      const y0 = 96 + i * 14, y1 = 96 + i * 14 + (i - 2) * 4;
      xrays.push(`<line x1="96" y1="${y0}" x2="250" y2="${y1}" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="2 4" opacity="0.7"/>`);
    }
    return `<svg viewBox="0 0 380 250" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sun to Earth space weather diagram">
      <rect x="0" y="0" width="380" height="250" fill="${SKY}"/>
      <!-- Sun (large disc clipped at left) -->
      <circle cx="6" cy="125" r="108" fill="${GOLD}" opacity="0.16"/>
      <circle cx="6" cy="125" r="92" fill="none" stroke="${GOLD}" stroke-width="2"/>
      <circle cx="6" cy="125" r="92" fill="${GOLD}" opacity="0.10"/>
      ${spotCluster(regionType)}
      <!-- coronal flare loop above the active region -->
      <path d="M52 116 C 56 86, 78 86, 82 118" fill="none" stroke="${FLARE}" stroke-width="3" stroke-linecap="round"/>
      <path d="M58 118 C 62 96, 74 96, 78 120" fill="none" stroke="${FLARE}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      <circle cx="67" cy="92" r="4" fill="${FLARE}"/>
      <!-- X-ray streaks -->
      ${xrays.join('')}
      <!-- Earth -->
      <g>
        <circle cx="300" cy="125" r="40" fill="${NIGHT}"/>
        <path d="M300 85 A40 40 0 0 0 300 165 Z" fill="${GOLD}" opacity="0.22"/>
        <circle cx="300" cy="125" r="40" fill="none" stroke="${INK}" stroke-width="1.6"/>
        <!-- simple landmass hint -->
        <path d="M286 104 q10 -6 18 2 q-4 8 -12 7 q-8 -1 -6 -9 Z" fill="${INK}" opacity="0.55"/>
        <path d="M292 138 q12 -3 16 6 q-8 7 -16 2 Z" fill="${INK}" opacity="0.45"/>
        <!-- blackout band on day side -->
        <path d="M300 92 A33 33 0 0 0 300 158" fill="none" stroke="${FLARE}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
        <!-- magnetosphere -->
        <path d="M268 70 C 320 78, 320 172, 268 180" fill="none" stroke="${MAGLINE}" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.8"/>
        <path d="M276 58 C 348 72, 348 178, 276 192" fill="none" stroke="${MAGLINE}" stroke-width="1.4" stroke-dasharray="3 3" opacity="0.5"/>
      </g>
      <!-- labels -->
      ${TT(40, 232, D.sun, 12.5, AMBER, 'middle', 600)}
      ${TT(67, 80, D.flare, 12, FLARE, 'middle', 600)}
      ${TT(150, 86, D.xray, 11.5, AMBER, 'middle', 600)}
      ${TT(300, 178, D.earth, 12.5, INK, 'middle', 600)}
      ${TT(300, 222, D.blackout, 11.5, FLARE, 'middle', 600)}
      ${TT(355, 125, D.mag, 10.5, MAGLINE, 'end', 600)}
    </svg>`;
  }

  // ───────────────────────── effect chips ─────────────────────────
  const EFF_ICON = {
    radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M5 12a7 7 0 0 1 2-5M19 12a7 7 0 0 0-2-5M8.5 12a3.5 3.5 0 0 1 1-2.5M15.5 12a3.5 3.5 0 0 0-1-2.5"/></svg>',
    gps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    satellite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="6" height="6" transform="rotate(45 12 12)"/><path d="M5 9 9 5M15 19l4-4M4 14a6 6 0 0 0 6 6M4 9V5h4"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
    aurora: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21c1-7 2-12 4-12s2 6 4 6 2-9 4-9 2 9 4 14"/></svg>',
    cme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"/><path d="M10 9c4 0 7 1.4 7 3s-3 3-7 3M12 6c5 0 9 2.7 9 6s-4 6-9 6"/></svg>',
    aviation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z"/></svg>',
  };
  const EFF_LAB = {
    en: { radio: 'HF radio blackout', gps: 'GPS / navigation', satellite: 'Satellite operations', grid: 'Power-grid currents', aurora: 'Aurora', cme: 'CME / geomagnetic storm', aviation: 'Polar flights' },
    ja: { radio: '短波(HF)通信障害', gps: 'GPS・測位', satellite: '人工衛星の運用', grid: '送電網への誘導電流', aurora: 'オーロラ', cme: 'CME・地磁気嵐', aviation: '極域フライト' },
    zh: { radio: '短波(HF)通信中断', gps: 'GPS／导航', satellite: '卫星运行', grid: '电网感应电流', aurora: '极光', cme: 'CME／地磁暴', aviation: '极地航班' },
    hi: { radio: 'HF रेडियो ब्लैकआउट', gps: 'GPS / नेविगेशन', satellite: 'उपग्रह संचालन', grid: 'पावर-ग्रिड धाराएँ', aurora: 'ध्रुवीय प्रकाश', cme: 'CME / भू-चुंबकीय तूफान', aviation: 'ध्रुवीय उड़ानें' },
    es: { radio: 'Apagón de radio HF', gps: 'GPS / navegación', satellite: 'Operación de satélites', grid: 'Corrientes en la red', aurora: 'Auroras', cme: 'CME / tormenta geomagnética', aviation: 'Vuelos polares' },
    ar: { radio: 'انقطاع راديو HF', gps: 'GPS / الملاحة', satellite: 'تشغيل الأقمار', grid: 'تيارات الشبكة', aurora: 'الشفق', cme: 'CME / عاصفة مغناطيسية', aviation: 'رحلات قطبية' },
  };
  const EFF_OK = ['radio', 'gps', 'satellite', 'grid', 'aurora', 'cme', 'aviation'];

  // ───────────────────────── helpers ─────────────────────────
  const LOCALE = { ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', ar: 'ar', en: 'en-US' };
  function coordOf(lat, lon) {
    return Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + '  ' + Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
  }
  function whenOf(v, lang) {
    if (!v) return '—';
    const ms = typeof v === 'number' ? v : Date.parse(v);
    if (isNaN(ms)) return '—';
    try {
      return new Intl.DateTimeFormat(LOCALE[lang] || 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(ms)) + ' UTC';
    } catch (e) { return new Date(ms).toUTCString(); }
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function rScaleOf(flux) {
    if (!Number.isFinite(flux)) return 0;
    if (flux >= 2e-3) return 5;
    if (flux >= 1e-3) return 4;
    if (flux >= 1e-4) return 3;
    if (flux >= 5e-5) return 2;
    if (flux >= 1e-5) return 1;
    return 0;
  }

  // ───────────────────────── Claude prompt (preview fallback) ─────────────────────────
  function buildPrompt(f, lang) {
    const wantReg = lang !== 'en';
    const langName = { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang];
    const r = f.rScale || rScaleOf(f.flux);
    return `You are a solar physicist / space-weather forecaster explaining ONE specific solar flare for the general public (no science background).

Flare facts:
- GOES soft X-ray class: ${f.class} (NOAA radio-blackout level R${r}).
- Peak time (UTC): ${f.peak || 'recent'}.
- At its peak the Sun was overhead near latitude ${f.lat != null ? f.lat.toFixed(1) : '?'}, longitude ${f.lon != null ? f.lon.toFixed(1) : '?'} — the sub-solar point, the centre of the HF radio blackout on Earth's sunlit side.

Use your knowledge of solar flares, the NOAA R-scale and typical space-weather impacts. Return ONLY raw JSON:
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
Plain words, calm, non-alarmist. Each text field <= 42 words.
- "regionType": complexity of the sunspot group likely to have produced an ${f.class} flare.
- "mechanism": what a solar flare is and how this class of flare releases energy.
- "source": that flares come from magnetically complex sunspot groups (active regions); describe the kind that produces this size.
- "levelMeaning": what radio-blackout level R${r} means in practice (which radio users, where, how long).
- "impacts": realistic effects on Earth for THIS class — HF radio on the sunlit side, GPS, etc.
- "outlook": whether a flare this size may come with a CME, and the geomagnetic-storm / aurora possibility days later.
- "effects": 2–4 from the allowed list relevant to this flare.
${wantReg ? `Every "reg" MUST be ${langName}; every "en" 100% natural English. Never mix languages within a field.` : 'Set every "reg" to null.'}
Do not restate the raw class code inside the text fields.`;
  }

  function parseContent(raw, lang) {
    let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
    const o = JSON.parse(txt);
    const wantReg = lang !== 'en';
    const norm = f => f ? { en: f.en || '', reg: wantReg ? (f.reg || '') : null } : { en: '', reg: null };
    return {
      regionType: ['simple', 'moderate', 'complex'].indexOf(o.regionType) >= 0 ? o.regionType : 'moderate',
      regionLabel: norm(o.regionLabel),
      mechanism: norm(o.mechanism), source: norm(o.source), levelMeaning: norm(o.levelMeaning),
      impacts: norm(o.impacts), outlook: norm(o.outlook),
      effects: Array.isArray(o.effects) ? o.effects.filter(h => EFF_OK.indexOf(h) >= 0).slice(0, 4) : [],
    };
  }

  // ───────────────────────── entitlement (shared with quake/volcano explainer) ─────────────────────────
  const PASS_KEY = 'globe-explain-pass';
  const USE_KEY = 'globe-explain-usage';
  const CACHE_KEY = 'globe-sexplain-cache';
  const CACHE_VER = 'v1';
  function getPass() { try { return localStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; } }
  function setPass(t) { try { t ? localStorage.setItem(PASS_KEY, t) : localStorage.removeItem(PASS_KEY); } catch (e) {} notifyState(); }
  function hasPass() { return !!getPass(); }
  let memUsage = { date: null, n: 0 };
  function usageToday() {
    const today = new Date().toISOString().slice(0, 10);
    let n = 0;
    try { const s = JSON.parse(localStorage.getItem(USE_KEY) || '{}'); if (s.date === today) n = s.n || 0; } catch (e) {}
    if (memUsage.date !== today) memUsage = { date: today, n: 0 };
    return { date: today, n: Math.max(n, memUsage.n) };
  }
  function persistUsage(u) { memUsage = { date: u.date, n: u.n }; try { localStorage.setItem(USE_KEY, JSON.stringify(u)); } catch (e) {} }
  function freeLeft() { return Math.max(0, CFG.FREE_PER_DAY - usageToday().n); }
  function bumpUsage() { const u = usageToday(); u.n += 1; persistUsage(u); notifyState(); }
  function markExhausted() { const u = usageToday(); u.n = Math.max(u.n, CFG.FREE_PER_DAY); persistUsage(u); notifyState(); }
  function canGenerate() { return hasPass() || freeLeft() > 0; }
  const stateListeners = [];
  function notifyState() { for (const fn of stateListeners) { try { fn(!canGenerate()); } catch (e) {} } }

  function cacheGet(id, lang) { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return c[CACHE_VER + ':' + id + ':' + lang] || null; } catch (e) { return null; } }
  function cacheSet(id, lang, content) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      c[CACHE_VER + ':' + id + ':' + lang] = content;
      const keys = Object.keys(c); if (keys.length > 60) delete c[keys[0]];
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  // ───────────────────────── generation ─────────────────────────
  async function generate(f, lang) {
    const payload = { flare: f, lang: lang, pass: getPass() };
    try {
      const r = await fetch(CFG.EXPLAIN_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.status === 402) { const e = new Error('payment_required'); e.paywall = true; throw e; }
      if (r.ok) return await r.json();
      if (r.status >= 500) { let msg = 'server error ' + r.status; try { const d = await r.json(); msg = d.error || msg; } catch (e) {} throw new Error(msg); }
    } catch (e) {
      if (e.paywall) throw e;
      if (!(e instanceof TypeError)) throw e;
    }
    if (window.claude && window.claude.complete) {
      const raw = await window.claude.complete({ messages: [{ role: 'user', content: buildPrompt(f, lang) }] });
      return parseContent(raw, lang);
    }
    throw new Error('no_backend');
  }

  // ───────────────────────── Stripe pass restore + checkout ─────────────────────────
  async function restoreFromUrl() {
    const p = new URLSearchParams(location.search);
    const sid = p.get('session_id');
    if (!sid) return;
    try {
      const r = await fetch(CFG.VERIFY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sid }) });
      if (r.ok) { const d = await r.json(); if (d.pass) setPass(d.pass); }
    } catch (e) {}
  }
  async function startCheckout(lang) {
    try {
      const r = await fetch(CFG.CHECKOUT_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: lang, return_url: location.href.split('?')[0].split('#')[0] }) });
      if (r.ok) { const d = await r.json(); if (d.url) { location.href = d.url; return; } }
    } catch (e) {}
    setPass('demo-preview-pass');
    return 'demo';
  }

  // ───────────────────────── DOM ─────────────────────────
  let overlay, panel, current = null;
  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'ex-overlay';
    overlay.innerHTML = '<div class="ex-panel sol" role="dialog" aria-modal="true"><button class="ex-close" aria-label="close">×</button><div class="ex-content"></div></div>';
    document.body.appendChild(overlay);
    panel = overlay.querySelector('.ex-content');
    overlay.querySelector('.ex-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('show')) close(); });
  }
  function open() { ensureDom(); overlay.classList.add('show'); }
  function close() { if (overlay) overlay.classList.remove('show'); }

  function bilingualHtml(loc, en, lang) {
    if (lang === 'en' || !loc) return `<div class="en">${esc(en)}</div>`;
    return `<div class="en">${esc(loc)}</div><div class="reg">${esc(en)}</div>`;
  }
  function renderLoading(t, sub) {
    panel.innerHTML = `<div class="ex-loading"><div class="ex-spinner"></div><div class="msg">${esc(t)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
  }
  function renderError(t, lang) {
    const L = LOC[lang] || LOC.en;
    panel.innerHTML = `<div class="ex-error"><div class="t">${esc(t)}</div><button class="ex-retry">${esc(L.retry)}</button></div>`;
    panel.querySelector('.ex-retry').addEventListener('click', () => run(current.f, lang, true));
  }
  function renderPaywall(lang) {
    const L = LOC[lang] || LOC.en;
    const price = CFG.PRICE[lang] || CFG.PRICE.en;
    const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    panel.innerHTML =
      `<div class="ex-pay">
        <div class="lock" style="color:#c98318"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
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
    panel.querySelector('.ex-pay-features').querySelectorAll('svg').forEach(s => s.style.color = '#c98318');
    panel.querySelector('.ex-unlock').style.background = '#2c2a27';
    panel.querySelector('.ex-unlock').addEventListener('click', async () => {
      renderLoading(L.loadingPay);
      const res = await startCheckout(lang);
      if (res === 'demo') run(current.f, lang, true);
    });
    panel.querySelector('.ex-restore').addEventListener('click', async (e) => {
      e.preventDefault(); await restoreFromUrl(); if (hasPass()) run(current.f, lang, true);
    });
  }

  function ladderHtml(f, lang) {
    const L = LOC[lang] || LOC.en;
    const labs = R_LAB[lang] || R_LAB.en;
    const cur = f.rScale || rScaleOf(f.flux);
    if (!cur) return '';
    const rows = [1, 2, 3, 4, 5].map(n => {
      const on = n === cur;
      return `<div class="lad-step${on ? ' on' : ''}" style="--sc:rgb(${R_RGB[n]})">
        <div class="lad-num">R${n}</div>
        <div class="lad-body"><span class="lad-lab">${esc(labs[n - 1])}</span><span class="lad-zone">≥${esc(R_ZONE[n - 1])}</span>${on ? `<span class="lad-here">${esc(L.here)}</span>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="ex-ladder"><div class="lad-title">${esc(L.ladder)}</div><div class="lad-steps">${rows}</div></div>`;
  }

  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

  function renderContent(f, c, lang) {
    const L = LOC[lang] || LOC.en;
    const r = f.rScale || rScaleOf(f.flux);
    const accent = 'rgb(' + (f.rgb || '224,158,40') + ')';

    const chip = `<div class="ex-schip" style="--sac:${accent}"><span class="lv-k">${esc(L.rscale)}</span><span class="lv-n">R${r || '—'}</span></div>`;

    const meta = [];
    meta.push([L.cls, f.class]);
    meta.push([L.peak, whenOf(f.peak, lang)]);
    meta.push([L.began, whenOf(f.begin || f.peak, lang)]);
    meta.push([L.region, coordOf(f.lat, f.lon)]);
    const metaHtml = meta.map(m => `<div><div class="k">${esc(m[0])}</div><div class="v" style="font-size:15px">${esc(m[1])}</div></div>`).join('');

    const sec = (n, label, field) => {
      if (!field || (!field.en && !field.reg)) return '';
      return `<div class="ex-sec"><div class="n">${n}</div><div class="body"><div class="label">${esc(label)}</div>${bilingualHtml(field.reg, field.en, lang)}</div></div>`;
    };

    const fl = c.regionLabel || { en: '', reg: null };
    const effHtml = (c.effects && c.effects.length) ? `
      <div class="ex-haz-label">${esc(L.effects)}</div>
      <div class="ex-haz">${c.effects.map(h => `<span class="chip">${EFF_ICON[h] || ''}<span>${esc((EFF_LAB[lang] || EFF_LAB.en)[h] || h)}</span></span>`).join('')}</div>` : '';

    const outlookHtml = (c.outlook && (c.outlook.en || c.outlook.reg)) ? `
      <div class="ex-haz-label">${esc(L.outlook)}</div>
      <div class="ex-outlook"><div class="ou-head"><span class="ou-icon">${EYE}</span><span class="ou-label">${esc(L.outlook)}</span></div><div class="ou-body">${bilingualHtml(c.outlook.reg, c.outlook.en, lang)}</div></div>` : '';

    const srcHtml = f.report ? `<a class="ex-src" href="${esc(f.report)}" target="_blank" rel="noopener">${LINK}<span>${esc(L.source)}</span></a>` : '';
    const discReg = lang !== 'en' && DISC[lang] ? `<div class="t reg">${esc(DISC[lang])}</div>` : '';
    const badge = hasPass() ? `<span class="ex-badge">${esc(L.paid)}</span>` : '';

    panel.innerHTML =
      `<div class="ex-eyebrow"><span class="dot"></span>${esc(L.eyebrow)}${badge}</div>
       <div class="ex-shead">${chip}<div class="ex-sname">${esc(f.class)}<span class="sub">${esc((R_LAB[lang] || R_LAB.en)[r - 1] || '')}</span></div></div>
       <div class="ex-rule"></div>
       <div class="ex-meta">${metaHtml}</div>
       ${ladderHtml(f, lang)}
       <div class="ex-fault">
         <div class="diagram">${sunEarthSvg(c.regionType, lang)}</div>
         <div class="fault-name"><span class="ftag">${esc(L.typeTag)}</span><span class="fname">${esc(lang === 'en' ? fl.en : (fl.reg || fl.en))}${(lang !== 'en' && fl.reg && fl.en) ? `<span class="reg">${esc(fl.en)}</span>` : ''}</span></div>
       </div>
       <div class="ex-sections">
         ${sec('01', L.s1, c.mechanism)}
         ${sec('02', L.s2, c.source)}
         ${sec('03', L.s3, c.levelMeaning)}
         ${sec('04', L.s4, c.impacts)}
       </div>
       ${effHtml}
       ${outlookHtml}
       <div class="ex-disc"><div class="label">${esc(L.disc)}</div><div class="t">${esc(DISC.en)}</div>${discReg}${srcHtml}</div>`;
  }

  // ───────────────────────── flow ─────────────────────────
  async function run(f, lang, force) {
    const L = LOC[lang] || LOC.en;
    current = { f, lang };
    const p = overlay.querySelector('.ex-panel');
    if (RTL[lang]) p.setAttribute('dir', 'rtl'); else p.removeAttribute('dir');

    const cached = cacheGet(f.id, lang);
    if (cached && !force) { renderContent(f, cached, lang); return; }
    if (!canGenerate()) { renderPaywall(lang); return; }

    renderLoading(L.generating, hasPass() ? '' : (freeLeft() > 0 ? L.quota.replace('%n', freeLeft()) : ''));
    try {
      const c = await generate(f, lang);
      cacheSet(f.id, lang, c);
      if (!hasPass()) bumpUsage();
      renderContent(f, c, lang);
    } catch (e) {
      if (e && e.paywall) { markExhausted(); renderPaywall(lang); return; }
      renderError(L.errGen, lang);
    }
  }

  // ───────────────────────── public API ─────────────────────────
  const Api = {
    open(rawFlare, lang) {
      lang = LOC[lang] ? lang : 'en';
      const f = Object.assign({}, rawFlare);
      if (f.rScale == null) f.rScale = rScaleOf(f.flux);
      open();
      run(f, lang, false);
    },
    buttonLabel(lang) { return (LOC[lang] || LOC.en).btn; },
    isLocked() { return !canGenerate(); },
    hasPass: hasPass,
    rScaleOf: rScaleOf,
    onStateChange(fn) { if (typeof fn === 'function') stateListeners.push(fn); },
  };
  window.SolarExplain = Api;

  restoreFromUrl();
})();
