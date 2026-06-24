/* Volcano card visuals — cross-section diagram, alert-level ladder and hazard
   chips, shared by the three SNS card designs. Ported from the live globe's
   volcano-explain.js so the cards match the in-app explainer exactly.
   Exposes window.VolcanoDiagram / window.AlertLadder / window.HazardChips. */
(function () {
  const INK = '#2c2a27', PAPER = '#f1eee8', MUT = '#8c887f', LINE = 'rgba(44,42,39,0.16)';
  const ROCK = '#e0d4bd', ROCK2 = '#cdbd9f', MAG = '#cf4f2e', SKY = '#f4efe6',
        GND = '#7a6b55', SMOKE = '#9a948a', RED = '#cf4f2e';
  const FNT = "'Noto Sans JP','Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',sans-serif";

  // ── alert-level ladders ────────────────────────────────────────────────
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
  const USGS_RGB = { GREEN: '70,150,70', YELLOW: '214,170,28', ORANGE: '214,108,28', RED: '200,52,40' };
  const USGS_LAB = {
    en: ['Normal', 'Advisory', 'Watch', 'Warning'],
    ja: ['平常', '注意', '警戒', '警報'], zh: ['平静', '注意', '警戒', '警报'],
    hi: ['सामान्य', 'सलाह', 'निगरानी', 'चेतावनी'], es: ['Normal', 'Aviso', 'Vigilancia', 'Alerta'],
    ar: ['عادي', 'إرشادي', 'مراقبة', 'تحذير'],
  };
  const USGS_KEYS = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
  const HERE = { en: 'Now', ja: '現在', zh: '当前', hi: 'अभी', es: 'Ahora', ar: 'الآن' };
  const LADTITLE = { en: 'Volcanic alert level', ja: '噴火警戒レベル', zh: '喷发警戒级别', hi: 'ज्वालामुखी अलर्ट स्तर', es: 'Nivel de alerta volcánica', ar: 'مستوى التحذير البركاني' };
  const tc = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '—';

  // ── cross-section ──────────────────────────────────────────────────────
  const VLABEL = {
    en: { plume: 'Ash plume', vent: 'Vent', conduit: 'Conduit', chamber: 'Magma chamber', crust: 'Crust' },
    ja: { plume: '噴煙', vent: '火口', conduit: '火道', chamber: 'マグマ溜まり', crust: '地殻' },
    zh: { plume: '火山灰柱', vent: '火口', conduit: '火道', chamber: '岩浆房', crust: '地壳' },
    hi: { plume: 'राख स्तंभ', vent: 'मुख', conduit: 'नाल', chamber: 'मैग्मा कक्ष', crust: 'भूपर्पटी' },
    es: { plume: 'Columna de ceniza', vent: 'Cráter', conduit: 'Conducto', chamber: 'Cámara magmática', crust: 'Corteza' },
    ar: { plume: 'عمود الرماد', vent: 'الفوهة', conduit: 'القناة', chamber: 'حجرة الصهارة', crust: 'القشرة' },
  };
  const EDIFICE = {
    'stratovolcano': '40,150 150,62 190,62 300,150',
    'caldera': '30,150 100,80 130,96 210,96 240,80 310,150',
    'shield': '10,150 100,108 170,96 240,108 340,150',
    'lava-dome': '50,150 130,82 152,68 170,62 188,68 210,82 290,150',
    'complex': '30,150 110,76 145,86 170,62 195,86 230,76 310,150',
  };
  const TT = (x, y, s, size, fill, anchor, weight) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${FNT}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}>${s}</text>`;

  function volcanoSvg(edifice, lang) {
    const D = VLABEL[lang] || VLABEL.en;
    const poly = EDIFICE[edifice] || EDIFICE.stratovolcano;
    const summitY = edifice === 'shield' ? 96 : (edifice === 'caldera' ? 94 : 64);
    const HAIR = 'rgba(44,42,39,0.4)';
    // leader lines connect each feature to a label sitting in clear space on
    // the right, so labels stay big and never collide with the mountain.
    return `<svg viewBox="0 0 460 250" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="img" aria-label="volcano cross-section">
      <rect x="0" y="0" width="460" height="250" fill="${SKY}"/>
      <path d="M170 ${summitY} C 130 ${summitY - 34}, 130 ${summitY - 18}, 158 ${summitY - 40}
               C 130 ${summitY - 70}, 176 ${summitY - 64}, 170 ${summitY - 92}
               C 190 ${summitY - 66}, 226 ${summitY - 74}, 192 ${summitY - 44}
               C 220 ${summitY - 20}, 206 ${summitY - 34}, 170 ${summitY} Z" fill="${SMOKE}" opacity="0.5"/>
      <rect x="0" y="150" width="460" height="100" fill="${ROCK}"/>
      <rect x="0" y="208" width="460" height="42" fill="${ROCK2}"/>
      <polygon points="${poly}" fill="${ROCK2}" stroke="${GND}" stroke-width="2"/>
      <line x1="0" y1="150" x2="460" y2="150" stroke="${GND}" stroke-width="2.5"/>
      <ellipse cx="170" cy="212" rx="80" ry="26" fill="${MAG}" opacity="0.92"/>
      <ellipse cx="170" cy="212" rx="80" ry="26" fill="none" stroke="#a83a22" stroke-width="1.5"/>
      <path d="M163 ${summitY + 2} L167 188 L173 188 L177 ${summitY + 2} Z" fill="${MAG}"/>
      <circle cx="170" cy="${summitY + 2}" r="6.5" fill="${RED}"/>
      ${TT(170, summitY + 4, '↑', 19, RED, 'middle', 700)}
      <!-- leader lines -->
      <line x1="170" y1="${summitY - 56}" x2="170" y2="${summitY - 80}" stroke="${HAIR}" stroke-width="1.2"/>
      <line x1="178" y1="${summitY + 2}" x2="300" y2="${summitY - 2}" stroke="${HAIR}" stroke-width="1.2"/>
      <circle cx="178" cy="${summitY + 2}" r="3" fill="${RED}"/>
      <line x1="173" y1="172" x2="300" y2="156" stroke="${HAIR}" stroke-width="1.2"/>
      <circle cx="173" cy="172" r="3" fill="${INK}"/>
      <line x1="250" y1="206" x2="300" y2="206" stroke="${HAIR}" stroke-width="1.2"/>
      <!-- labels (large, in clear right-hand zone) -->
      ${TT(170, summitY - 88, D.plume, 19, '#6f6960', 'middle', 700)}
      ${TT(306, summitY - 2, D.vent, 19, INK, 'start', 700)}
      ${TT(306, 161, D.conduit, 19, INK, 'start', 700)}
      ${TT(306, 211, D.chamber, 19, '#a83a22', 'start', 700)}
      ${TT(452, 240, D.crust, 16, '#6f6b63', 'end', 600)}
    </svg>`;
  }

  // ── hazard chips ───────────────────────────────────────────────────────
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

  // ── React components ───────────────────────────────────────────────────
  function VolcanoDiagram({ edifice, lang, height = 214 }) {
    return (
      <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: volcanoSvg(edifice || 'stratovolcano', lang || 'en') }} />
    );
  }

  function AlertLadder({ v, lang, accent }) {
    const L = lang || 'en';
    let steps, cur;
    if (v.source === 'jma' && v.level) {
      const labs = JMA_LAB[L] || JMA_LAB.en, zones = JMA_ZONE[L] || JMA_ZONE.en;
      steps = [1, 2, 3, 4, 5].map(n => ({ n, lab: labs[n - 1], zone: zones[n - 1], sc: 'rgb(' + JMA_RGB[n] + ')' }));
      cur = v.level;
    } else if (v.source === 'usgs' && (v.color || v.alert)) {
      const labs = USGS_LAB[L] || USGS_LAB.en;
      const ci = Math.max(0, USGS_KEYS.indexOf((v.color || '').toUpperCase()));
      steps = USGS_KEYS.map((k, i) => ({ n: i + 1, lab: labs[i], zone: tc(k), sc: 'rgb(' + USGS_RGB[k] + ')' }));
      cur = ci + 1;
    } else { return null; }
    const here = HERE[L] || HERE.en;
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUT, fontWeight: 600, marginBottom: 10 }}>
          {LADTITLE[L] || LADTITLE.en}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {steps.map(s => {
            const on = s.n === cur;
            return (
              <div key={s.n} style={{ flex: 1, position: 'relative', padding: '9px 10px 11px',
                background: on ? s.sc : PAPER, border: '1px solid ' + (on ? s.sc : LINE),
                borderTop: '4px solid ' + s.sc, minHeight: 78, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: on ? '#fff' : INK,
                  fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, color: on ? '#fff' : INK, fontFamily: FNT }}>{s.lab}</div>
                {s.zone && <div style={{ fontSize: 11.5, lineHeight: 1.15, color: on ? 'rgba(255,255,255,0.85)' : MUT, fontFamily: FNT }}>{s.zone}</div>}
                {on && <div style={{ position: 'absolute', top: -11, right: 6, background: INK, color: PAPER,
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', textTransform: 'uppercase' }}>{here}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function HazardChips({ hazards, lang, label }) {
    if (!hazards || !hazards.length) return null;
    const L = lang || 'en';
    const lab = HAZ_LAB[L] || HAZ_LAB.en;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {label && (
          <div style={{ width: '100%', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: MUT, fontWeight: 600, marginBottom: -2 }}>{label}</div>
        )}
        {hazards.map(h => (
          <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
            border: '1px solid ' + LINE, background: PAPER, color: INK, fontSize: 18, fontWeight: 500, fontFamily: FNT }}>
            <span style={{ width: 20, height: 20, display: 'inline-flex', color: '#b0741c' }}
              dangerouslySetInnerHTML={{ __html: HAZ_ICON[h] || '' }} />
            <span>{lab[h] || h}</span>
          </span>
        ))}
      </div>
    );
  }

  window.VolcanoDiagram = VolcanoDiagram;
  window.AlertLadder = AlertLadder;
  window.HazardChips = HazardChips;
})();
