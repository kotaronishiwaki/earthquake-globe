/* Fault schematic diagrams — friendly, plain-language block models that match
   the explanation overlay (quake-explain.js). Coloured land/ocean blocks,
   a drawn ground surface, sea level, and short localized labels. One per
   mechanism, all sharing a 380×236 viewBox. */
(function () {
  const RED = '#cf4f2e', INK = '#2c2a27';
  const LB  = '#e8dfc8';   // land / continental block (warm tan)
  const OB  = '#c4d8ee';   // oceanic block (cool blue)
  const HW  = '#d6c9ad';   // hanging wall (slightly darker tan)
  const GND = '#7a6b55';   // ground surface
  const WC  = '#3f88b0';   // sea / water
  const FNT = "'Helvetica Neue','Noto Sans JP','Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',sans-serif";

  const ARROW = (x1, y1, x2, y2, col, w) => {
    col = col || RED; w = w || 3;
    const ang = Math.atan2(y2 - y1, x2 - x1), h = w * 3.4;
    const a1 = ang + Math.PI - 0.45, a2 = ang + Math.PI + 0.45;
    const p1x = x2 + h * Math.cos(a1), p1y = y2 + h * Math.sin(a1);
    const p2x = x2 + h * Math.cos(a2), p2y = y2 + h * Math.sin(a2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/><path d="M${x2} ${y2} L${p1x} ${p1y} L${p2x} ${p2y} Z" fill="${col}"/>`;
  };
  const TT = (x, y, s, size, fill, anchor, weight) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${FNT}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}>${s}</text>`;

  // localized labels used inside the diagrams (kept short to fit)
  const DLABEL = {
    en: { planView: 'Map view — seen from above', blockA: 'Block A', blockB: 'Block B', fault: 'Fault', extension: 'Land pulled apart', compression: 'Land pushed together', footwall: 'Stays', hangingwall: 'Moves', drop: 'drops down', uplift: 'pushed up', surface: 'Ground', sealevel: 'Sea level', trench: 'Trench', oceanic: 'Ocean plate', continental: 'Land plate', subduction: 'sinks under', interior: 'Inside one plate', focus: 'Quake focus', stress: 'Stress' },
    ja: { planView: '平面図（上から見た図）', blockA: 'ブロックA', blockB: 'ブロックB', fault: '断層', extension: '引っ張られる', compression: '押し合う', footwall: '動かない', hangingwall: '動く', drop: '下がる', uplift: '持ち上がる', surface: '地表', sealevel: '海面', trench: '海溝', oceanic: '海洋プレート', continental: '大陸プレート', subduction: '沈み込む', interior: 'プレート内部', focus: '震源', stress: '応力' },
    zh: { planView: '俯视图（从上方看）', blockA: '断块A', blockB: '断块B', fault: '断层', extension: '地块被拉张', compression: '地块被挤压', footwall: '不动', hangingwall: '移动', drop: '下降', uplift: '抬升', surface: '地表', sealevel: '海平面', trench: '海沟', oceanic: '海洋板块', continental: '大陆板块', subduction: '俯冲', interior: '板块内部', focus: '震源', stress: '应力' },
    hi: { planView: 'ऊपर से दृश्य', blockA: 'खंड A', blockB: 'खंड B', fault: 'भ्रंश', extension: 'ज़मीन अलग खिंची', compression: 'ज़मीन दबी', footwall: 'स्थिर', hangingwall: 'गतिशील', drop: 'नीचे', uplift: 'ऊपर', surface: 'सतह', sealevel: 'समुद्र तल', trench: 'गर्त', oceanic: 'महासागरीय प्लेट', continental: 'महाद्वीपीय प्लेट', subduction: 'अधोगमन', interior: 'प्लेट के अंदर', focus: 'भूकंप केंद्र', stress: 'तनाव' },
    es: { planView: 'Vista desde arriba', blockA: 'Bloque A', blockB: 'Bloque B', fault: 'Falla', extension: 'Se separa', compression: 'Se comprime', footwall: 'Fijo', hangingwall: 'Se mueve', drop: 'baja', uplift: 'sube', surface: 'Suelo', sealevel: 'Nivel del mar', trench: 'Fosa', oceanic: 'Placa oceánica', continental: 'Placa continental', subduction: 'subducción', interior: 'Dentro de una placa', focus: 'Foco', stress: 'Esfuerzo' },
    ar: { planView: 'منظر من الأعلى', blockA: 'كتلة A', blockB: 'كتلة B', fault: 'صدع', extension: 'تباعد الأرض', compression: 'تضاغط الأرض', footwall: 'ثابت', hangingwall: 'متحرك', drop: 'يهبط', uplift: 'يرتفع', surface: 'السطح', sealevel: 'سطح البحر', trench: 'خندق', oceanic: 'صفيحة محيطية', continental: 'صفيحة قارية', subduction: 'اندساس', interior: 'داخل صفيحة', focus: 'بؤرة', stress: 'إجهاد' },
  };

  const DIAG = {
    /* strike-slip — map view, two blocks slide past each other */
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

    /* normal — cross-section, pulled apart, one side drops */
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

    /* reverse — cross-section, pushed together, one side rides up */
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

    /* subduction — cross-section, ocean plate sinks beneath land plate */
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

    /* intraplate — cross-section, stress inside one plate */
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

  function FaultDiagram({ type, height = 150, lang }) {
    const key = DIAG[type] ? type : (DIAG_ALIAS[type] || 'intraplate');
    const D = DLABEL[lang] || DLABEL.en;
    return (
      <svg viewBox="0 0 380 236" width="100%" height={height} preserveAspectRatio="xMidYMid meet"
        role="img" aria-label="fault diagram" style={{ display: 'block' }}
        dangerouslySetInnerHTML={{ __html: DIAG[key](D) }} />
    );
  }

  window.FaultDiagram = FaultDiagram;
})();
