/* Solar-flare card visuals — Sun→Earth diagram, radio-blackout (R) ladder and
   effect chips, shared by the three SNS card designs. Ported from the live
   globe's solar-explain.js so the cards match the in-app explainer exactly.
   Exposes window.SolarDiagram / window.RScaleLadder / window.EffectChips. */
(function () {
  const INK = '#2c2a27', PAPER = '#f1eee8', MUT = '#8c887f', LINE = 'rgba(44,42,39,0.16)';
  const GOLD = '#e09e28', AMBER = '#c98318', FLARE = '#d97a2b', SKY = '#f4efe6',
        SPOT = '#7a4f12', MAGLINE = '#3a6f8c', NIGHT = '#cfc7b6';
  const FNT = "'Noto Sans JP','Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',sans-serif";

  // ── R-scale ladder data (NOAA radio-blackout) ───────────────────────────
  const R_RGB = { 1: '230,194,90', 2: '224,160,40', 3: '217,122,43', 4: '196,74,42', 5: '160,40,40' };
  const R_LAB = {
    en: ['Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'],
    ja: ['軽微', '中程度', '強い', '重大', '極めて重大'],
    zh: ['轻微', '中等', '强', '严重', '极端'],
    hi: ['मामूली', 'मध्यम', 'तीव्र', 'गंभीर', 'चरम'],
    es: ['Menor', 'Moderado', 'Fuerte', 'Severo', 'Extremo'],
    ar: ['طفيف', 'متوسط', 'قوي', 'شديد', 'بالغ'],
  };
  // what each R level means, very short (the "zone" line)
  const R_ZONE = {
    en: ['Brief HF fade', 'Limited HF blackout', 'Wide HF blackout', 'Most of sunlit side', 'Complete sunlit side'],
    ja: ['短いHF減衰', '限定的HF障害', '広範囲HF障害', '昼側の大半', '昼側全域'],
    zh: ['短暂HF衰减', '有限HF中断', '大范围HF中断', '昼侧大部', '昼侧全域'],
    hi: ['संक्षिप्त HF क्षय', 'सीमित HF रुकावट', 'व्यापक HF रुकावट', 'दिन-पक्ष अधिकांश', 'पूरा दिन-पक्ष'],
    es: ['Desvanec. HF breve', 'Apagón HF limitado', 'Apagón HF amplio', 'Casi todo el día', 'Todo el lado diurno'],
    ar: ['تلاشٍ قصير HF', 'انقطاع HF محدود', 'انقطاع HF واسع', 'معظم الجانب النهاري', 'كامل الجانب النهاري'],
  };
  // class threshold that triggers each R level (language-neutral)
  const R_THRESH = ['M1', 'M5', 'X1', 'X10', 'X20'];
  const HERE = { en: 'Now', ja: '現在', zh: '当前', hi: 'अभी', es: 'Ahora', ar: 'الآن' };
  const LADTITLE = { en: 'Radio-blackout scale (R)', ja: '電波障害スケール(R)', zh: '无线电中断等级(R)', hi: 'रेडियो-ब्लैकआउट स्केल(R)', es: 'Escala de apagón de radio (R)', ar: 'مقياس انقطاع الراديو (R)' };

  function rScaleOf(flux) {
    if (!Number.isFinite(flux)) return 0;
    if (flux >= 2e-3) return 5;
    if (flux >= 1e-3) return 4;
    if (flux >= 1e-4) return 3;
    if (flux >= 5e-5) return 2;
    if (flux >= 1e-5) return 1;
    return 0;
  }

  // ── Sun → Earth diagram (ported from solar-explain.js) ───────────────────
  const SLABEL = {
    en: { sun: 'Sun', flare: 'Flare', xray: 'X-rays (~8 min)', earth: 'Earth', day: 'Day side', blackout: 'HF radio blackout', mag: 'Magnetic field', region: 'active region' },
    ja: { sun: '太陽', flare: 'フレア', xray: 'X線（約8分）', earth: '地球', day: '昼側', blackout: '電波障害(HF)', mag: '磁気圏', region: '黒点群' },
    zh: { sun: '太阳', flare: '耀斑', xray: 'X射线（约8分）', earth: '地球', day: '昼侧', blackout: 'HF无线电中断', mag: '磁场', region: '活动区' },
    hi: { sun: 'सूर्य', flare: 'ज्वाला', xray: 'एक्स-रे (~8 मिनट)', earth: 'पृथ्वी', day: 'दिन-पक्ष', blackout: 'HF रेडियो ब्लैकआउट', mag: 'चुंबकीय क्षेत्र', region: 'सक्रिय क्षेत्र' },
    es: { sun: 'Sol', flare: 'Erupción', xray: 'Rayos X (~8 min)', earth: 'Tierra', day: 'Lado diurno', blackout: 'Apagón de radio HF', mag: 'Campo magnético', region: 'región activa' },
    ar: { sun: 'الشمس', flare: 'توهج', xray: 'أشعة سينية (~8 د)', earth: 'الأرض', day: 'الجانب النهاري', blackout: 'انقطاع راديو HF', mag: 'المجال المغناطيسي', region: 'منطقة نشطة' },
  };
  const TT = (x, y, s, size, fill, anchor, weight) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${FNT}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}>${s}</text>`;

  function spotCluster(type) {
    const sets = {
      simple: [[58, 120, 5]],
      moderate: [[54, 116, 5], [66, 124, 4]],
      complex: [[50, 114, 5], [62, 120, 6], [70, 130, 4], [58, 128, 3]],
    };
    const arr = sets[type] || sets.moderate;
    return arr.map(s => `<circle cx="${s[0]}" cy="${s[1]}" r="${s[2]}" fill="${SPOT}"/>`).join('');
  }

  function spotCluster(type) {
    const sets = {
      simple: [[64, 98, 7]],
      moderate: [[56, 92, 7], [74, 102, 6]],
      complex: [[50, 88, 7], [66, 96, 8], [80, 108, 6], [60, 110, 5]],
    };
    const arr = sets[type] || sets.moderate;
    return arr.map(s => `<circle cx="${s[0]}" cy="${s[1]}" r="${s[2]}" fill="${SPOT}"/>`).join('');
  }

  function sunEarthSvg(regionType, lang) {
    const D = SLABEL[lang] || SLABEL.en;
    const xrays = [];
    for (let i = 0; i < 5; i++) {
      const y0 = 78 + i * 12, y1 = 100 + (y0 - 100) * 0.25;
      xrays.push(`<line x1="96" y1="${y0}" x2="360" y2="${y1.toFixed(1)}" stroke="${GOLD}" stroke-width="2" stroke-dasharray="3 5" opacity="0.75"/>`);
    }
    return `<svg viewBox="0 0 520 200" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="img" aria-label="Sun to Earth space weather diagram">
      <rect x="0" y="0" width="520" height="200" fill="${SKY}"/>
      <circle cx="2" cy="100" r="108" fill="${GOLD}" opacity="0.16"/>
      <circle cx="2" cy="100" r="92" fill="none" stroke="${GOLD}" stroke-width="2.4"/>
      <circle cx="2" cy="100" r="92" fill="${GOLD}" opacity="0.10"/>
      ${spotCluster(regionType)}
      <path d="M52 92 C 58 54, 86 54, 92 96" fill="none" stroke="${FLARE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M60 94 C 64 66, 82 66, 86 98" fill="none" stroke="${FLARE}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
      <circle cx="72" cy="58" r="5" fill="${FLARE}"/>
      ${xrays.join('')}
      <g>
        <circle cx="430" cy="100" r="44" fill="${NIGHT}"/>
        <path d="M430 56 A44 44 0 0 0 430 144 Z" fill="${GOLD}" opacity="0.24"/>
        <circle cx="430" cy="100" r="44" fill="none" stroke="${INK}" stroke-width="1.8"/>
        <path d="M413 78 q11 -7 20 2 q-4 9 -13 8 q-9 -1 -7 -10 Z" fill="${INK}" opacity="0.5"/>
        <path d="M420 116 q13 -3 18 6 q-9 8 -18 2 Z" fill="${INK}" opacity="0.42"/>
        <path d="M430 64 A36 36 0 0 0 430 136" fill="none" stroke="${FLARE}" stroke-width="6" stroke-linecap="round" opacity="0.55"/>
        <path d="M388 60 C 344 74, 344 126, 388 140" fill="none" stroke="${MAGLINE}" stroke-width="2" stroke-dasharray="4 4" opacity="0.8"/>
        <path d="M380 48 C 322 66, 322 134, 380 152" fill="none" stroke="${MAGLINE}" stroke-width="1.7" stroke-dasharray="4 4" opacity="0.5"/>
      </g>
      ${TT(46, 188, D.sun, 15, AMBER, 'middle', 700)}
      ${TT(72, 42, D.flare, 14.5, FLARE, 'middle', 700)}
      ${TT(235, 56, D.xray, 14.5, AMBER, 'middle', 700)}
      ${TT(430, 162, D.earth, 15, INK, 'middle', 700)}
      ${TT(430, 188, D.blackout, 14, FLARE, 'middle', 700)}
      ${TT(514, 100, D.mag, 13.5, MAGLINE, 'end', 700)}
    </svg>`;
  }

  // ── effect chips (ported from solar-explain.js) ──────────────────────────
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

  // ── React components ─────────────────────────────────────────────────────
  function SolarDiagram({ regionType, lang, height = 214 }) {
    return (
      <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: sunEarthSvg(regionType || 'moderate', lang || 'en') }} />
    );
  }

  function RScaleLadder({ flux, rScale, lang }) {
    const L = lang || 'en';
    const cur = rScale || rScaleOf(flux);
    if (!cur) return null;
    const labs = R_LAB[L] || R_LAB.en, zones = R_ZONE[L] || R_ZONE.en;
    const here = HERE[L] || HERE.en;
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUT, fontWeight: 600, marginBottom: 10 }}>
          {LADTITLE[L] || LADTITLE.en}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => {
            const on = n === cur;
            const sc = 'rgb(' + R_RGB[n] + ')';
            return (
              <div key={n} style={{ flex: 1, position: 'relative', padding: '9px 10px 11px',
                background: on ? sc : PAPER, border: '1px solid ' + (on ? sc : LINE),
                borderTop: '4px solid ' + sc, minHeight: 78, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: on ? '#fff' : INK,
                  fontVariantNumeric: 'tabular-nums' }}>R{n}</div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, color: on ? '#fff' : INK, fontFamily: FNT }}>{labs[n - 1]}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.15, color: on ? 'rgba(255,255,255,0.85)' : MUT, fontFamily: FNT }}>≥{R_THRESH[n - 1]}</div>
                {on && <div style={{ position: 'absolute', top: -11, right: 6, background: INK, color: PAPER,
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', textTransform: 'uppercase' }}>{here}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function EffectChips({ effects, lang, label }) {
    if (!effects || !effects.length) return null;
    const L = lang || 'en';
    const lab = EFF_LAB[L] || EFF_LAB.en;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {label && (
          <div style={{ width: '100%', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: MUT, fontWeight: 600, marginBottom: -2 }}>{label}</div>
        )}
        {effects.map(h => (
          <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
            border: '1px solid ' + LINE, background: PAPER, color: INK, fontSize: 18, fontWeight: 500, fontFamily: FNT }}>
            <span style={{ width: 20, height: 20, display: 'inline-flex', color: AMBER }}
              dangerouslySetInnerHTML={{ __html: EFF_ICON[h] || '' }} />
            <span>{lab[h] || h}</span>
          </span>
        ))}
      </div>
    );
  }

  window.SolarDiagram = SolarDiagram;
  window.RScaleLadder = RScaleLadder;
  window.EffectChips = EffectChips;
  window.SolarRScaleOf = rScaleOf;
  window.SolarRLabels = R_LAB;
})();
