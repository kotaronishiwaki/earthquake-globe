/* Globe — volcano activity explanation, gated behind the same paywall/quota
 * as the earthquake explainer (shares the pass + daily free counter).
 *
 *   tap a volcano → card → "解説" button → this overlay.
 *
 * Claude is called through a Netlify Function (keeps the API key secret); in
 * the design preview (no backend) it falls back to window.claude.complete.
 */
(function () {
  'use strict';

  const CFG = {
    EXPLAIN_ENDPOINT: '/.netlify/functions/explain-volcano',
    CHECKOUT_ENDPOINT: '/.netlify/functions/checkout',
    VERIFY_ENDPOINT: '/.netlify/functions/verify',
    FREE_PER_DAY: 3,
    PRICE: { ja: '$3.50 / 月', en: '$3.50 / mo', zh: '$3.50 / 月', hi: '$3.50 / माह', es: '$3.50 / mes', ar: '$3.50 / شهر' },
  };

  // ───────────────────────── i18n ─────────────────────────
  const DISC = {
    en: 'Automated explanation from JMA / USGS data for general awareness — not an official hazard assessment. The mechanism, alert-level reasoning and outlook are estimates and may be revised. Always follow your local authority.',
    ja: 'JMA・USGSのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。メカニズム・警戒レベルの背景・見通しは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。',
    zh: '基于JMA／USGS数据自动生成的科普解说，非官方灾害评估。机制、警戒级别背景与展望均为估计值，可能修订。请以当地官方机构的防灾信息为准。',
    hi: 'यह JMA/USGS डेटा से स्वतः तैयार सामान्य जानकारी है, आधिकारिक खतरा आकलन नहीं। तंत्र, अलर्ट-स्तर का कारण व आगे का अनुमान हैं और बदल सकते हैं। सुरक्षा हेतु स्थानीय प्राधिकरण का पालन करें।',
    es: 'Explicación automática a partir de datos de JMA/USGS con fines informativos; no es una evaluación oficial de peligro. El mecanismo, el nivel de alerta y el panorama son estimaciones y pueden revisarse. Siga a su autoridad local.',
    ar: 'شرح آلي مُولّد من بيانات JMA/USGS لأغراض التوعية، وليس تقييمًا رسميًا للمخاطر. الآلية وسبب مستوى التحذير والتوقعات تقديرية وقد تُراجَع. اتبع السلطة المحلية دائمًا.',
  };

  const LOC = {
    en: { eyebrow: 'Volcano activity', lvl: 'Level', kind: 'Warning type', avColor: 'Aviation colour', avAlert: 'Alert level', obs: 'Observatory', updated: 'Updated', loc: 'Location', typeTag: 'Volcano type', ladder: 'Volcanic alert level', here: 'Now', s1: 'How this volcano works', s2: 'Why it is active now', s3: 'What the level means', s4: 'Possible impacts', outlook: 'What to watch & prepare', hazards: 'Likely hazards', disc: 'Disclaimer', source: 'Official source', btn: 'Explain', fetching: 'Reading volcano data…', generating: 'AI is explaining this volcano…', errGen: 'Could not generate the explanation.', retry: 'Retry', payTitle: 'See every AI explanation', payBody: 'AI explains, in plain language, how each volcano works, why it is active, what the alert level means and the likely impacts. You have used today’s free explanations.', f1: 'Unlimited AI explanations', f2: 'Your language + English', f3: 'Alert-level ladder & hazard diagrams', unlock: 'Unlock', restore: 'Restore purchase', fine: 'Cancel anytime.', quota: '%n free explanation(s) left today', paid: 'Pass active', loadingPay: 'Opening checkout…' },
    ja: { eyebrow: '火山活動の解説', lvl: 'レベル', kind: '警報種別', avColor: '航空カラーコード', avAlert: '警戒区分', obs: '観測所', updated: '最終更新', loc: '位置', typeTag: '火山型', ladder: '噴火警戒レベル', here: '現在', s1: 'どんな火山？', s2: 'なぜ今活発なの？', s3: '警戒レベルの意味', s4: '考えられる影響', outlook: '今後の見通しと備え', hazards: '想定される災害', disc: '注意事項', source: '公式情報', btn: '解説', fetching: '火山データを取得中…', generating: 'AIが火山活動を解説中…', errGen: '解説の生成に失敗しました。', retry: '再試行', payTitle: 'AI解説をすべて見る', payBody: 'AIが火山ごとに「どんな仕組みか・なぜ活発か・警戒レベルの意味・考えられる影響」をやさしく解説します。本日の無料分を使い切りました。', f1: '回数無制限のAI解説', f2: 'あなたの言語＋英語の対訳', f3: '警戒レベルの図解と災害アイコン', unlock: 'パスを購入', restore: '購入済みを復元', fine: 'いつでも解約できます。', quota: '本日の無料解説：残り %n 回', paid: 'パス有効', loadingPay: '決済ページへ移動中…' },
    zh: { eyebrow: '火山活动解说', lvl: '级别', kind: '警报种类', avColor: '航空颜色代码', avAlert: '警戒级别', obs: '观测站', updated: '最近更新', loc: '位置', typeTag: '火山类型', ladder: '喷发警戒级别', here: '当前', s1: '这是怎样的火山', s2: '为何此刻活跃', s3: '警戒级别的含义', s4: '可能的影响', outlook: '后续观察与准备', hazards: '可能的灾害', disc: '注意事项', source: '官方信息', btn: '解说', fetching: '正在获取火山数据…', generating: 'AI正在解说火山活动…', errGen: '解说生成失败。', retry: '重试', payTitle: '查看全部AI解说', payBody: 'AI用通俗语言解说每座火山的运作方式、为何活跃、警戒级别含义与可能影响。今日免费次数已用完。', f1: '无限次AI解说', f2: '你的语言＋英文对照', f3: '警戒级别图解与灾害图标', unlock: '购买通行证', restore: '恢复购买', fine: '可随时取消。', quota: '今日免费解说：剩余 %n 次', paid: '通行证有效', loadingPay: '正在打开结算页…' },
    hi: { eyebrow: 'ज्वालामुखी गतिविधि', lvl: 'स्तर', kind: 'चेतावनी प्रकार', avColor: 'विमानन रंग', avAlert: 'अलर्ट स्तर', obs: 'वेधशाला', updated: 'अद्यतन', loc: 'स्थान', typeTag: 'ज्वालामुखी प्रकार', ladder: 'ज्वालामुखी अलर्ट स्तर', here: 'अभी', s1: 'यह ज्वालामुखी कैसे काम करता है', s2: 'अभी सक्रिय क्यों', s3: 'स्तर का अर्थ', s4: 'संभावित प्रभाव', outlook: 'क्या देखें और तैयारी', hazards: 'संभावित खतरे', disc: 'अस्वीकरण', source: 'आधिकारिक स्रोत', btn: 'व्याख्या', fetching: 'ज्वालामुखी डेटा ला रहे हैं…', generating: 'AI ज्वालामुखी समझा रहा है…', errGen: 'व्याख्या नहीं बन सकी।', retry: 'पुनः', payTitle: 'सभी AI व्याख्याएँ देखें', payBody: 'AI सरल भाषा में बताता है कि हर ज्वालामुखी कैसे काम करता है, क्यों सक्रिय है, स्तर का अर्थ और संभावित प्रभाव। आज की मुफ़्त व्याख्याएँ समाप्त।', f1: 'असीमित AI व्याख्या', f2: 'आपकी भाषा + अंग्रेज़ी', f3: 'अलर्ट-स्तर व खतरा चित्र', unlock: 'पास खरीदें', restore: 'खरीद बहाल करें', fine: 'कभी भी रद्द करें।', quota: 'आज मुफ़्त: %n शेष', paid: 'पास सक्रिय', loadingPay: 'चेकआउट खुल रहा है…' },
    es: { eyebrow: 'Actividad volcánica', lvl: 'Nivel', kind: 'Tipo de aviso', avColor: 'Color de aviación', avAlert: 'Nivel de alerta', obs: 'Observatorio', updated: 'Actualizado', loc: 'Ubicación', typeTag: 'Tipo de volcán', ladder: 'Nivel de alerta volcánica', here: 'Ahora', s1: 'Cómo funciona este volcán', s2: 'Por qué está activo ahora', s3: 'Qué significa el nivel', s4: 'Posibles efectos', outlook: 'Qué vigilar y preparar', hazards: 'Peligros probables', disc: 'Aviso', source: 'Fuente oficial', btn: 'Explicar', fetching: 'Leyendo datos…', generating: 'La IA explica el volcán…', errGen: 'No se pudo generar la explicación.', retry: 'Reintentar', payTitle: 'Ver todas las explicaciones', payBody: 'La IA explica, en lenguaje sencillo, cómo funciona cada volcán, por qué está activo, qué significa el nivel y los efectos probables. Agotaste las gratuitas de hoy.', f1: 'Explicaciones IA ilimitadas', f2: 'Tu idioma + inglés', f3: 'Escala de alerta y peligros', unlock: 'Desbloquear', restore: 'Restaurar compra', fine: 'Cancela cuando quieras.', quota: '%n explicación(es) gratis hoy', paid: 'Pase activo', loadingPay: 'Abriendo pago…' },
    ar: { eyebrow: 'النشاط البركاني', lvl: 'المستوى', kind: 'نوع التحذير', avColor: 'لون الطيران', avAlert: 'مستوى التحذير', obs: 'المرصد', updated: 'آخر تحديث', loc: 'الموقع', typeTag: 'نوع البركان', ladder: 'مستوى التحذير البركاني', here: 'الآن', s1: 'كيف يعمل هذا البركان', s2: 'لماذا هو نشط الآن', s3: 'ماذا يعني المستوى', s4: 'الآثار المحتملة', outlook: 'ما يجب مراقبته والاستعداد', hazards: 'المخاطر المرجحة', disc: 'تنويه', source: 'المصدر الرسمي', btn: 'شرح', fetching: 'جارٍ جلب البيانات…', generating: 'الذكاء الاصطناعي يشرح البركان…', errGen: 'تعذّر إنشاء الشرح.', retry: 'إعادة', payTitle: 'شاهد كل الشروح', payBody: 'يشرح الذكاء الاصطناعي بلغة بسيطة كيف يعمل كل بركان ولماذا هو نشط وماذا يعني المستوى والآثار المحتملة. انتهت محاولاتك المجانية اليوم.', f1: 'شروح غير محدودة', f2: 'لغتك + الإنجليزية', f3: 'سلّم التحذير ورسوم المخاطر', unlock: 'فتح', restore: 'استعادة الشراء', fine: 'ألغِ في أي وقت.', quota: 'تبقّى %n شرح مجاني اليوم', paid: 'الاشتراك فعّال', loadingPay: 'فتح الدفع…' },
  };
  const RTL = { ar: true };

  // ───────────────────────── alert-level ladders ─────────────────────────
  // JMA 噴火警戒レベル 1–5 (colour matches the globe markers; LEVEL_RGB)
  const JMA_RGB = { 1: '70,150,70', 2: '214,170,28', 3: '214,108,28', 4: '200,52,40', 5: '170,30,30' };
  const JMA_LAB = {
    en: ['Normal', 'Near-crater restriction', 'Do not approach', 'Prepare to evacuate', 'Evacuate'],
    ja: ['平常', '火口周辺規制', '入山規制', '高齢者等避難', '避難'],
    zh: ['平静', '火口周边管制', '禁止登山', '高龄者等避难', '避难'],
    hi: ['सामान्य', 'क्रेटर के पास रोक', 'न जाएँ', 'निकासी की तैयारी', 'निकासी'],
    es: ['Normal', 'Cerca del cráter', 'No acercarse', 'Evacuar vulnerables', 'Evacuación'],
    ar: ['عادي', 'حول الفوهة', 'ممنوع الاقتراب', 'استعداد للإخلاء', 'إخلاء'],
  };
  const JMA_ZONE = {
    en: ['', 'Around crater', 'Crater to summit', 'Near residences', 'Residential areas'],
    ja: ['', '火口周辺', '火口〜入山', '居住地域近く', '居住地域'],
    zh: ['', '火口周边', '火口至山体', '居民区附近', '居民区'],
    hi: ['', 'क्रेटर के पास', 'शिखर तक', 'बस्ती के पास', 'बस्ती क्षेत्र'],
    es: ['', 'Junto al cráter', 'Hasta la cima', 'Cerca de casas', 'Zonas habitadas'],
    ar: ['', 'حول الفوهة', 'حتى القمة', 'قرب المساكن', 'مناطق سكنية'],
  };
  // USGS aviation colour code → alert level
  const USGS_RGB = { GREEN: '70,150,70', YELLOW: '214,170,28', ORANGE: '214,108,28', RED: '200,52,40' };
  const USGS_LAB = {
    en: ['Normal', 'Advisory', 'Watch', 'Warning'],
    ja: ['平常', '注意', '警戒', '警報'],
    zh: ['平静', '注意', '警戒', '警报'],
    hi: ['सामान्य', 'सलाह', 'निगरानी', 'चेतावनी'],
    es: ['Normal', 'Aviso', 'Vigilancia', 'Alerta'],
    ar: ['عادي', 'إرشادي', 'مراقبة', 'تحذير'],
  };
  const USGS_KEYS = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];

  // ───────────────────────── volcano cross-section diagrams ─────────────────────────
  const INK = '#2c2a27', AMBER = '#b0741c', RED = '#cf4f2e';
  const ROCK = '#e0d4bd', ROCK2 = '#cdbd9f', MAG = '#cf4f2e', SKY = '#f4efe6';
  const GND = '#7a6b55', SMOKE = '#9a948a';
  const FNT = "'Noto Sans JP','Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',sans-serif";
  const TT = (x, y, s, size, fill, anchor, weight) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${FNT}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}>${s}</text>`;

  const VLABEL = {
    en: { plume: 'Ash plume', vent: 'Vent', conduit: 'Conduit', chamber: 'Magma chamber', crust: 'Crust', rising: 'magma rises' },
    ja: { plume: '噴煙', vent: '火口', conduit: '火道', chamber: 'マグマ溜まり', crust: '地殻', rising: 'マグマ上昇' },
    zh: { plume: '火山灰柱', vent: '火口', conduit: '火道', chamber: '岩浆房', crust: '地壳', rising: '岩浆上升' },
    hi: { plume: 'राख स्तंभ', vent: 'मुख', conduit: 'नाल', chamber: 'मैग्मा कक्ष', crust: 'भूपर्पटी', rising: 'मैग्मा ऊपर' },
    es: { plume: 'Columna de ceniza', vent: 'Cráter', conduit: 'Conducto', chamber: 'Cámara magmática', crust: 'Corteza', rising: 'el magma sube' },
    ar: { plume: 'عمود الرماد', vent: 'الفوهة', conduit: 'القناة', chamber: 'حجرة الصهارة', crust: 'القشرة', rising: 'صعود الصهارة' },
  };

  // edifice silhouettes (summit x=190, ground y=150); each returns a polygon points string
  const EDIFICE = {
    'stratovolcano': '60,150 170,58 210,58 320,150',
    'caldera': '50,150 120,78 150,96 230,96 260,78 330,150',
    'shield': '20,150 120,104 190,92 260,104 360,150',
    'lava-dome': '70,150 150,80 172,66 190,60 208,66 230,80 310,150',
    'complex': '50,150 130,74 165,86 190,60 215,86 250,74 330,150',
  };

  function volcanoSvg(edifice, lang) {
    const D = VLABEL[lang] || VLABEL.en;
    const poly = EDIFICE[edifice] || EDIFICE.stratovolcano;
    const summitY = edifice === 'shield' ? 92 : (edifice === 'caldera' ? 90 : 60);
    return `<svg viewBox="0 0 380 250" preserveAspectRatio="xMidYMid meet" role="img" aria-label="volcano cross-section">
      <rect x="0" y="0" width="380" height="250" fill="${SKY}"/>
      <!-- ash plume -->
      <path d="M190 ${summitY} C 150 ${summitY - 34}, 150 ${summitY - 18}, 178 ${summitY - 40}
               C 150 ${summitY - 70}, 196 ${summitY - 64}, 190 ${summitY - 92}
               C 210 ${summitY - 66}, 246 ${summitY - 74}, 212 ${summitY - 44}
               C 240 ${summitY - 20}, 226 ${summitY - 34}, 190 ${summitY} Z" fill="${SMOKE}" opacity="0.5"/>
      <!-- subsurface rock -->
      <rect x="0" y="150" width="380" height="100" fill="${ROCK}"/>
      <rect x="0" y="206" width="380" height="44" fill="${ROCK2}"/>
      <!-- edifice -->
      <polygon points="${poly}" fill="${ROCK2}" stroke="${GND}" stroke-width="2"/>
      <line x1="0" y1="150" x2="380" y2="150" stroke="${GND}" stroke-width="2.5"/>
      <!-- magma chamber -->
      <ellipse cx="190" cy="212" rx="78" ry="26" fill="${MAG}" opacity="0.9"/>
      <ellipse cx="190" cy="212" rx="78" ry="26" fill="none" stroke="#a83a22" stroke-width="1.5"/>
      <!-- conduit -->
      <path d="M183 ${summitY + 2} L187 188 L193 188 L197 ${summitY + 2} Z" fill="${MAG}"/>
      <!-- vent glow -->
      <circle cx="190" cy="${summitY + 2}" r="6" fill="${RED}"/>
      <!-- labels -->
      ${TT(190, summitY - 96, D.plume, 13, SMOKE, 'middle', 600)}
      ${TT(214, summitY + 6, D.vent, 12.5, INK, 'start', 600)}
      ${TT(214, 168, D.conduit, 12.5, INK, 'start', 600)}
      ${TT(190, 216, D.chamber, 13, '#fff', 'middle', 700)}
      ${TT(366, 240, D.crust, 11.5, '#6f6b63', 'end')}
      ${TT(150, 196, '↑', 14, RED, 'middle', 700)}
    </svg>`;
  }

  // ───────────────────────── hazard chips ─────────────────────────
  const HAZ_ICON = {
    ashfall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 10a4 4 0 0 1 1-7.87A5 5 0 0 1 17 4a4 4 0 0 1 1 8"/><line x1="8" y1="18" x2="8" y2="20"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="16" y1="18" x2="16" y2="20"/></svg>',
    pyroclastic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18c2-1 3 1 5 0s3-2 5-1 3 2 5 1 3-1 3-1"/><path d="M5 14c1.5-.8 2.5.8 4 0s2.5-1.6 4-.8 2.5 1.6 4 .8"/><path d="M9 9c1-.5 1.5.5 2.5 0"/></svg>',
    lava: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s5 5 5 9a5 5 0 0 1-10 0c0-1.5 1-3 1-3s1 1.5 2 1.5S12 6 12 2Z"/></svg>',
    lahar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg>',
    ballistics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="15" cy="9" r="3"/><path d="M4 20c2-6 5-9 8-9"/><path d="M7 20H4v-3"/></svg>',
    gas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3c0 2-2 2-2 4s2 2 2 4-2 2-2 4 2 2 2 4"/><path d="M16 4c0 1.6-1.6 1.6-1.6 3.2s1.6 1.6 1.6 3.2-1.6 1.6-1.6 3.2 1.6 1.6 1.6 3.2"/></svg>',
  };
  const HAZ_LAB = {
    en: { ashfall: 'Ashfall', pyroclastic: 'Pyroclastic flow', lava: 'Lava flow', lahar: 'Mudflow (lahar)', ballistics: 'Flying rocks', gas: 'Volcanic gas' },
    ja: { ashfall: '降灰', pyroclastic: '火砕流', lava: '溶岩流', lahar: '火山泥流', ballistics: '噴石', gas: '火山ガス' },
    zh: { ashfall: '降灰', pyroclastic: '火砕流', lava: '熔岩流', lahar: '火山泥流', ballistics: '飞石', gas: '火山气体' },
    hi: { ashfall: 'राख गिरना', pyroclastic: 'पायरोक्लास्टिक प्रवाह', lava: 'लावा प्रवाह', lahar: 'कीचड़ प्रवाह', ballistics: 'उड़ते पत्थर', gas: 'ज्वालामुखी गैस' },
    es: { ashfall: 'Caída de ceniza', pyroclastic: 'Flujo piroclástico', lava: 'Colada de lava', lahar: 'Lahar', ballistics: 'Proyectiles', gas: 'Gas volcánico' },
    ar: { ashfall: 'تساقط الرماد', pyroclastic: 'تدفق بركاني', lava: 'تدفق الحمم', lahar: 'تدفق طيني', ballistics: 'قذائف صخرية', gas: 'غاز بركاني' },
  };

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
  const tc = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '—';

  // ───────────────────────── Claude prompt (preview fallback) ─────────────────────────
  const JMA_LEVELS = {
    1: 'Level 1 (Normal) — active volcano, no entry restriction.',
    2: 'Level 2 (Near-crater restriction) — do not approach the crater.',
    3: 'Level 3 (Do not approach the volcano) — entry restricted, hazard may reach near residential areas.',
    4: 'Level 4 (Prepare to evacuate) — vulnerable people in danger areas should evacuate.',
    5: 'Level 5 (Evacuate) — residents in danger areas must evacuate.',
  };
  function buildPrompt(v, lang) {
    const wantReg = lang !== 'en';
    const langName = { ja: 'Japanese', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', ar: 'Arabic' }[lang];
    const nm = v.nameEn || v.name || 'this volcano';
    let statusLine;
    if (v.source === 'jma' && v.level) statusLine = `JMA Volcanic Alert Level ${v.level}. ${JMA_LEVELS[v.level] || ''} Warning type: ${v.kind || 'n/a'}.`;
    else if (v.source === 'usgs') statusLine = `USGS Aviation Colour Code ${v.color || 'n/a'}, Volcano Alert Level ${v.alert || 'n/a'}. Observatory: ${v.obs || 'n/a'}.`;
    else statusLine = 'Smithsonian GVP reports open eruptive activity; no numeric alert level supplied.';
    return `You are a volcanologist explaining a volcano's CURRENT activity for the general public (no science background).

Volcano: ${nm}${v.name && v.name !== nm ? ` (${v.name})` : ''}, at latitude ${v.lat}, longitude ${v.lon}.
Status: ${statusLine}

Use your knowledge of THIS specific real volcano plus the status above. Return ONLY raw JSON:
{
  "edifice": "stratovolcano"|"caldera"|"shield"|"lava-dome"|"complex",
  "edificeLabel": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "mechanism": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "whyNow": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "levelChange": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "impacts": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "outlook": { "en": "...", "reg": ${wantReg ? '"..."' : 'null'} },
  "hazards": ["ashfall"|"pyroclastic"|"lava"|"lahar"|"ballistics"|"gas", ...]
}
Plain words, calm, non-alarmist. Each text field <= 42 words. "hazards": 2–4 relevant to this volcano now.
${wantReg ? `Every "reg" MUST be ${langName}; every "en" 100% natural English. Never mix languages within a field.` : 'Set every "reg" to null.'}
Do not restate the volcano name or raw alert number in the text fields.`;
  }
  const HAZ_OK = ['ashfall', 'pyroclastic', 'lava', 'lahar', 'ballistics', 'gas'];
  function parseContent(raw, lang) {
    let txt = (raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a >= 0 && b >= 0) txt = txt.slice(a, b + 1);
    const o = JSON.parse(txt);
    const wantReg = lang !== 'en';
    const norm = f => f ? { en: f.en || '', reg: wantReg ? (f.reg || '') : null } : { en: '', reg: null };
    return {
      edifice: ['stratovolcano', 'caldera', 'shield', 'lava-dome', 'complex'].indexOf(o.edifice) >= 0 ? o.edifice : 'stratovolcano',
      edificeLabel: norm(o.edificeLabel),
      mechanism: norm(o.mechanism), whyNow: norm(o.whyNow), levelChange: norm(o.levelChange),
      impacts: norm(o.impacts), outlook: norm(o.outlook),
      hazards: Array.isArray(o.hazards) ? o.hazards.filter(h => HAZ_OK.indexOf(h) >= 0).slice(0, 4) : [],
    };
  }

  // ───────────────────────── entitlement (shared with quake explainer) ─────────────────────────
  const PASS_KEY = 'globe-explain-pass';
  const USE_KEY = 'globe-explain-usage';
  const CACHE_KEY = 'globe-vexplain-cache';
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
  async function generate(v, lang) {
    const payload = { volcano: v, lang: lang, pass: getPass() };
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
      const raw = await window.claude.complete({ messages: [{ role: 'user', content: buildPrompt(v, lang) }] });
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
    overlay.innerHTML = '<div class="ex-panel vol" role="dialog" aria-modal="true"><button class="ex-close" aria-label="close">×</button><div class="ex-content"></div></div>';
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
    panel.querySelector('.ex-retry').addEventListener('click', () => run(current.v, lang, true));
  }
  function renderPaywall(lang) {
    const L = LOC[lang] || LOC.en;
    const price = CFG.PRICE[lang] || CFG.PRICE.en;
    const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    panel.innerHTML =
      `<div class="ex-pay">
        <div class="lock" style="color:#b0741c"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
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
    panel.querySelector('.ex-pay-features').querySelectorAll('svg').forEach(s => s.style.color = '#b0741c');
    panel.querySelector('.ex-unlock').style.background = '#2c2a27';
    panel.querySelector('.ex-unlock').addEventListener('click', async () => {
      renderLoading(L.loadingPay);
      const res = await startCheckout(lang);
      if (res === 'demo') run(current.v, lang, true);
    });
    panel.querySelector('.ex-restore').addEventListener('click', async (e) => {
      e.preventDefault(); await restoreFromUrl(); if (hasPass()) run(current.v, lang, true);
    });
  }

  // alert-level ladder figure
  function ladderHtml(v, lang) {
    const L = LOC[lang] || LOC.en;
    let steps, cur, rgb;
    if (v.source === 'jma' && v.level) {
      const labs = JMA_LAB[lang] || JMA_LAB.en, zones = JMA_ZONE[lang] || JMA_ZONE.en;
      steps = [1, 2, 3, 4, 5].map(n => ({ n: n, lab: labs[n - 1], zone: zones[n - 1], sc: 'rgb(' + JMA_RGB[n] + ')' }));
      cur = v.level;
    } else if (v.source === 'usgs' && (v.color || v.alert)) {
      const labs = USGS_LAB[lang] || USGS_LAB.en;
      const ci = Math.max(0, USGS_KEYS.indexOf((v.color || '').toUpperCase()));
      steps = USGS_KEYS.map((k, i) => ({ n: i + 1, lab: labs[i], zone: tc(k), sc: 'rgb(' + USGS_RGB[k] + ')' }));
      cur = ci + 1;
    } else { return ''; }
    const rows = steps.map(s => {
      const on = s.n === cur;
      return `<div class="lad-step${on ? ' on' : ''}" style="--sc:${s.sc}">
        <div class="lad-num">${s.n}</div>
        <div class="lad-body"><span class="lad-lab">${esc(s.lab)}</span>${s.zone ? `<span class="lad-zone">${esc(s.zone)}</span>` : ''}${on ? `<span class="lad-here">${esc(L.here)}</span>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="ex-ladder"><div class="lad-title">${esc(L.ladder)}</div><div class="lad-steps">${rows}</div></div>`;
  }

  // outlook icon (eye)
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

  function renderContent(v, c, lang) {
    const L = LOC[lang] || LOC.en;
    const jma = v.source === 'jma', usgs = v.source === 'usgs';
    const accent = 'rgb(' + (v.rgb || '176,116,28') + ')';

    // header chip
    let chip;
    if (jma && v.level) chip = `<div class="ex-vchip" style="--vac:${accent}"><span class="lv-k">${esc(L.lvl)}</span><span class="lv-n">${v.level}</span></div>`;
    else if (usgs && v.color) chip = `<div class="ex-vchip" style="--vac:${accent}"><span class="lv-k">${esc(L.avColor)}</span><span class="lv-n" style="font-size:18px">${esc(tc(v.color))}</span></div>`;
    else chip = `<div class="ex-vchip" style="--vac:${accent}"><span class="lv-n" style="font-size:18px">●</span></div>`;

    // meta grid
    const meta = [];
    if (jma) { if (v.kind) meta.push([L.kind, v.kind]); }
    else if (usgs) { if (v.alert) meta.push([L.avAlert, tc(v.alert)]); if (v.obs) meta.push([L.obs, v.obs]); }
    meta.push([L.updated, whenOf(v.date, lang)]);
    meta.push([L.loc, coordOf(v.lat, v.lon)]);
    const metaHtml = meta.map(m => `<div><div class="k">${esc(m[0])}</div><div class="v" style="font-size:15px">${esc(m[1])}</div></div>`).join('');

    const sec = (n, label, field) => {
      if (!field || (!field.en && !field.reg)) return '';
      return `<div class="ex-sec"><div class="n">${n}</div><div class="body"><div class="label">${esc(label)}</div>${bilingualHtml(field.reg, field.en, lang)}</div></div>`;
    };

    const fl = c.edificeLabel || { en: '', reg: null };
    const hazHtml = (c.hazards && c.hazards.length) ? `
      <div class="ex-haz-label">${esc(L.hazards)}</div>
      <div class="ex-haz">${c.hazards.map(h => `<span class="chip">${HAZ_ICON[h] || ''}<span>${esc((HAZ_LAB[lang] || HAZ_LAB.en)[h] || h)}</span></span>`).join('')}</div>` : '';

    const outlookHtml = (c.outlook && (c.outlook.en || c.outlook.reg)) ? `
      <div class="ex-haz-label">${esc(L.outlook)}</div>
      <div class="ex-outlook"><div class="ou-head"><span class="ou-icon">${EYE}</span><span class="ou-label">${esc(L.outlook)}</span></div><div class="ou-body">${bilingualHtml(c.outlook.reg, c.outlook.en, lang)}</div></div>` : '';

    const srcHtml = v.report ? `<a class="ex-src" href="${esc(v.report)}" target="_blank" rel="noopener">${LINK}<span>${esc(L.source)}</span></a>` : '';
    const discReg = lang !== 'en' && DISC[lang] ? `<div class="t reg">${esc(DISC[lang])}</div>` : '';
    const badge = hasPass() ? `<span class="ex-badge">${esc(L.paid)}</span>` : '';
    const name = (jma ? ((LOCALE[lang] || '').slice(0, 2) === 'ja' ? v.name : (v.nameEn || v.name)) : v.name) || '';
    const nameSub = (jma && v.nameEn && v.name && v.nameEn !== v.name && (LOCALE[lang] || '').slice(0, 2) !== 'ja') ? `<span class="sub">${esc(v.name)}</span>` : '';

    panel.innerHTML =
      `<div class="ex-eyebrow"><span class="dot"></span>${esc(L.eyebrow)}${badge}</div>
       <div class="ex-vhead">${chip}<div class="ex-vname">${esc(name)}${nameSub}</div></div>
       <div class="ex-rule"></div>
       <div class="ex-meta">${metaHtml}</div>
       ${ladderHtml(v, lang)}
       <div class="ex-fault">
         <div class="diagram">${volcanoSvg(c.edifice, lang)}</div>
         <div class="fault-name"><span class="ftag">${esc(L.typeTag)}</span><span class="fname">${esc(lang === 'en' ? fl.en : (fl.reg || fl.en))}${(lang !== 'en' && fl.reg && fl.en) ? `<span class="reg">${esc(fl.en)}</span>` : ''}</span></div>
       </div>
       <div class="ex-sections">
         ${sec('01', L.s1, c.mechanism)}
         ${sec('02', L.s2, c.whyNow)}
         ${sec('03', L.s3, c.levelChange)}
         ${sec('04', L.s4, c.impacts)}
       </div>
       ${hazHtml}
       ${outlookHtml}
       <div class="ex-disc"><div class="label">${esc(L.disc)}</div><div class="t">${esc(DISC.en)}</div>${discReg}${srcHtml}</div>`;
  }

  // ───────────────────────── flow ─────────────────────────
  async function run(v, lang, force) {
    const L = LOC[lang] || LOC.en;
    current = { v, lang };
    const p = overlay.querySelector('.ex-panel');
    if (RTL[lang]) p.setAttribute('dir', 'rtl'); else p.removeAttribute('dir');

    const cached = cacheGet(v.id, lang);
    if (cached && !force) { renderContent(v, cached, lang); return; }
    if (!canGenerate()) { renderPaywall(lang); return; }

    renderLoading(L.generating, hasPass() ? '' : (freeLeft() > 0 ? L.quota.replace('%n', freeLeft()) : ''));
    try {
      const c = await generate(v, lang);
      cacheSet(v.id, lang, c);
      if (!hasPass()) bumpUsage();
      renderContent(v, c, lang);
    } catch (e) {
      if (e && e.paywall) { markExhausted(); renderPaywall(lang); return; }
      renderError(L.errGen, lang);
    }
  }

  // ───────────────────────── public API ─────────────────────────
  const Api = {
    open(rawVolcano, lang) {
      lang = LOC[lang] ? lang : 'en';
      const v = Object.assign({}, rawVolcano);
      open();
      run(v, lang, false);
    },
    buttonLabel(lang) { return (LOC[lang] || LOC.en).btn; },
    isLocked() { return !canGenerate(); },
    hasPass: hasPass,
    onStateChange(fn) { if (typeof fn === 'function') stateListeners.push(fn); },
  };
  window.VolcanoExplain = Api;

  restoreFromUrl();
})();
