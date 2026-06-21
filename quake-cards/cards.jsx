/* Three SNS card designs (1080×1350) sharing one bilingual content model.
   Palette: paper #f1eee8, surface #fbfaf7, ink #2c2a27, quake #cf4f2e,
   tsunami #266e96, muted #8c887f. Export-ready for Bluesky / Mastodon. */
(function () {
  const { useEffect, useRef } = React;
  const PAPER = '#f1eee8', SURF = '#fbfaf7', INK = '#2c2a27', RED = '#cf4f2e',
        BLUE = '#266e96', MUT = '#8c887f', LINE = 'rgba(44,42,39,0.16)';
  const SANS = "'Helvetica Neue', 'Noto Sans', system-ui, sans-serif";

  // tsunami risk levels — localized label + colour (matches the explanation page)
  const TRISK = {
    none:     { color: '#5b9e6f', bg: 'rgba(91,158,111,0.10)', label: { en: 'No tsunami risk', ja: '津波の心配なし', zh: '无海啸风险', hi: 'कोई सुनामी जोखिम नहीं', es: 'Sin riesgo de tsunami', ar: 'لا خطر تسونامي' } },
    low:      { color: '#266e96', bg: 'rgba(38,110,150,0.09)', label: { en: 'Low tsunami risk', ja: '津波リスク：低', zh: '海啸风险：低', hi: 'कम सुनामी जोखिम', es: 'Riesgo de tsunami bajo', ar: 'خطر تسونامي منخفض' } },
    moderate: { color: '#d98a2b', bg: 'rgba(217,138,43,0.12)', label: { en: 'Moderate tsunami risk', ja: '津波リスク：中', zh: '海啸风险：中等', hi: 'मध्यम सुनामी जोखिम', es: 'Riesgo de tsunami moderado', ar: 'خطر تسونامي متوسط' } },
    high:     { color: '#cf4f2e', bg: 'rgba(207,79,46,0.11)', label: { en: 'High tsunami risk', ja: '津波リスク：高', zh: '海啸风险：高', hi: 'उच्च सुनामी जोखिम', es: 'Riesgo de tsunami alto', ar: 'خطر تسونامي مرتفع' } },
  };
  const riskOf = (content) => TRISK[content.tsunamiRisk] ? content.tsunamiRisk : (content.tsunamiNote ? 'low' : 'none');

  // ---- shared atoms ------------------------------------------------------
  function Logomark({ size = 40, dark = false }) {
    const bg = dark ? '#3a3733' : PAPER;
    const stroke = dark ? PAPER : INK;
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block' }}>
        <rect width="64" height="64" rx="13" fill={bg} />
        <g fill="none" stroke={stroke} strokeWidth="2.4">
          <circle cx="32" cy="32" r="20" />
          <ellipse cx="32" cy="32" rx="8.4" ry="20" />
          <line x1="12" y1="32" x2="52" y2="32" />
          <path d="M15.2 22 H48.8" strokeWidth="2" />
          <path d="M15.2 42 H48.8" strokeWidth="2" />
        </g>
        <g>
          <circle cx="42" cy="22" r="8.5" fill="none" stroke={RED} strokeWidth="2" opacity="0.45" />
          <circle cx="42" cy="22" r="4.4" fill={RED} />
        </g>
      </svg>
    );
  }

  function Eyebrow({ children, color = MUT, size = 17, style }) {
    return (
      <div style={{ fontSize: size, letterSpacing: '0.18em', textTransform: 'uppercase',
        color, fontWeight: 600, ...style }}>{children}</div>
    );
  }

  // bilingual prose block: English primary, region language secondary
  function Bilingual({ en, reg, regMeta, enSize = 27, regSize = 25, gap = 9, color = INK, mutedReg }) {
    return (
      <div>
        <div style={{ fontSize: enSize, lineHeight: 1.42, color, textWrap: 'pretty', fontWeight: 400 }}>{en}</div>
        {reg && regMeta && (
          <div dir={regMeta.dir} style={{ fontSize: regSize, lineHeight: 1.5, marginTop: gap,
            color: mutedReg || 'rgba(44,42,39,0.62)', fontFamily: regMeta.font, textWrap: 'pretty',
            textAlign: regMeta.dir === 'rtl' ? 'right' : 'left' }}>{reg}</div>
        )}
      </div>
    );
  }

  function Section({ n, labelEn, labelReg, regMeta, body, color }) {
    return (
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ fontSize: 15, color: RED, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.04em', paddingTop: 3, minWidth: 26 }}>{n}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
            <Eyebrow size={16} color={color || INK}>{labelEn}</Eyebrow>
            {labelReg && regMeta && (
              <span style={{ fontSize: 15, color: MUT, fontFamily: regMeta.font }}>{labelReg}</span>
            )}
          </div>
          {body}
        </div>
      </div>
    );
  }

  function MetaGrid({ q, T, regMeta, dark }) {
    const c1 = dark ? 'rgba(241,238,232,0.55)' : MUT;
    const c2 = dark ? PAPER : INK;
    const cell = (k, kr, v) => (
      <div>
        <div style={{ fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: c1, marginBottom: 4 }}>
          {k}{kr && regMeta ? <span style={{ fontFamily: regMeta.font }}> · {kr}</span> : ''}
        </div>
        <div style={{ fontSize: 25, fontWeight: 600, color: c2, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{v}</div>
      </div>
    );
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 30px' }}>
        {cell('Depth', T.depth, q.depthTxt)}
        {cell('Class', T.cls, q.depthClassTxt)}
        {cell('When', T.when, q.whenTxt)}
        {cell('Epicenter', T.coord, q.coordTxt)}
      </div>
    );
  }

  // tsunami risk block — always shown, colour-coded by risk level
  function TsunamiBanner({ risk, note, regMeta, lang, compact }) {
    const tr = TRISK[risk] || TRISK.low;
    const rlabel = tr.label[lang] || tr.label.en;
    const hasNote = note && (note.en || note.reg);
    return (
      <div style={{ padding: compact ? '14px 16px' : '16px 20px', background: tr.bg,
        border: `1px solid ${tr.color}` }}>
        <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={tr.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
            <path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
            <path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
          </svg>
          <span style={{ fontSize: compact ? 21 : 24, fontWeight: 700, color: tr.color, lineHeight: 1.1 }}>{rlabel}</span>
        </div>
        {hasNote && (
          <div style={{ marginTop: 9, paddingLeft: 37 }}>
            <Bilingual en={note.en} reg={note.reg} regMeta={regMeta} enSize={compact ? 20 : 22} regSize={compact ? 19 : 21} color={INK} mutedReg="rgba(44,42,39,0.62)" />
          </div>
        )}
      </div>
    );
  }

  function Disclaimer({ d, regMeta, dark }) {
    const col = dark ? 'rgba(241,238,232,0.5)' : MUT;
    return (
      <div style={{ borderTop: `1px solid ${dark ? 'rgba(241,238,232,0.18)' : LINE}`, paddingTop: 16 }}>
        <Eyebrow size={12} color={col} style={{ marginBottom: 6 }}>Disclaimer</Eyebrow>
        <div style={{ fontSize: 13, lineHeight: 1.4, color: col }}>{d.en}</div>
        {d.reg && regMeta && (
          <div dir={regMeta.dir} style={{ fontSize: 12.5, lineHeight: 1.45, color: col, marginTop: 4,
            fontFamily: regMeta.font, textAlign: regMeta.dir === 'rtl' ? 'right' : 'left' }}>{d.reg}</div>
        )}
      </div>
    );
  }

  function Footer({ q, dark }) {
    const col = dark ? 'rgba(241,238,232,0.62)' : MUT;
    const acc = dark ? PAPER : INK;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 19, color: acc, fontWeight: 600, letterSpacing: '0.01em' }}>
          globelabo.netlify.app<span style={{ color: RED }}>/#eq={q.id}</span>
        </div>
        <div style={{ fontSize: 15, color: col, letterSpacing: '0.06em' }}>LIVE 7-DAY QUAKE MAP · DATA USGS</div>
      </div>
    );
  }

  function MagBlock({ q, T, regMeta, dark, size = 150 }) {
    const place = dark ? PAPER : INK;
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: size, fontWeight: 700, color: RED, lineHeight: 0.9,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            <span style={{ fontSize: size * 0.42, fontWeight: 600 }}>M</span>{q.magTxt}
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 500, color: place, lineHeight: 1.22, marginTop: 12, textWrap: 'balance' }}>
          {q.place}
        </div>
      </div>
    );
  }

  // mini globe centered on the epicenter (brand motif) ---------------------
  function GlobeMini({ q, px = 380 }) {
    const ref = useRef(null);
    useEffect(() => {
      const cv = ref.current; if (!cv || !window.GlobeArt) return;
      const dpr = 2; cv.width = px * dpr; cv.height = px * dpr;
      const c = cv.getContext('2d'); c.scale(dpr, dpr);
      window.GlobeArt.draw(cv, {
        COL: { bg: PAPER, ocean: PAPER, land: INK, hair: PAPER, ring: INK, quake: '207,79,46', whirl: '44,42,39' },
        cx: px / 2, cy: px / 2, R: px * 0.42,
        centerLon: q.lon, centerLat: q.lat,
        quakes: [{ lon: q.lon, lat: q.lat, mag: Math.max(6.2, q.mag) }],
        whirl: { A: px * 0.42 * 1.4, B: px * 0.42 * 0.5, tilt: -20 * Math.PI / 180, dots: 64, gap: 0.05, headR: px * 0.012, tailR: 1, headO: 0.5, phase: 2.1 },
      });
    }, [q.id, q.lon, q.lat]);
    return <canvas ref={ref} style={{ width: px, height: px, display: 'block' }} />;
  }

  // ====== VARIATION A — Field Report (paper, editorial) ===================
  function CardFieldReport({ q, content, regMeta, T }) {
    return (
      <div style={{ width: 1080, height: 1350, background: PAPER, color: INK, fontFamily: SANS,
        padding: '46px 60px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Logomark size={40} />
            <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: '0.02em' }}>Globe</span>
          </div>
          <Eyebrow>Earthquake Mechanism · {T.brief}</Eyebrow>
        </div>
        <div style={{ borderTop: `2px solid ${INK}` }} />

        <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 auto' }}><MagBlock q={q} T={T} regMeta={regMeta} size={120} /></div>
        </div>
        <MetaGrid q={q} T={T} regMeta={regMeta} />

        <div style={{ display: 'flex', gap: 28, alignItems: 'center', background: SURF,
          border: `1px solid ${LINE}`, padding: '12px 22px' }}>
          <div style={{ flex: '0 0 410px' }}><window.FaultDiagram type={content.faultType} height={188} lang={content.regionLang} /></div>
          <div style={{ flex: 1 }}>
            <Eyebrow size={14} style={{ marginBottom: 7 }}>{T.faultTag}</Eyebrow>
            <div style={{ fontSize: 29, fontWeight: 700, color: INK, lineHeight: 1.1 }}>{content.faultTypeLabel.en}</div>
            {regMeta && content.faultTypeLabel.reg && (
              <div style={{ fontSize: 21, color: MUT, fontFamily: regMeta.font, marginTop: 4 }}>{content.faultTypeLabel.reg}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 44px', flex: 1, alignContent: 'start' }}>
          <Section n="01" labelEn="Main cause" labelReg={T.cause} regMeta={regMeta}
            body={<Bilingual en={content.mainCause.en} reg={content.mainCause.reg} regMeta={regMeta} enSize={21} regSize={19} gap={7} />} />
          <Section n="02" labelEn="Nature of the quake" labelReg={T.natureL} regMeta={regMeta}
            body={<Bilingual en={content.nature.en} reg={content.nature.reg} regMeta={regMeta} enSize={21} regSize={19} gap={7} />} />
          <Section n="03" labelEn="Aftershock outlook" labelReg={T.cont} regMeta={regMeta}
            body={<Bilingual en={content.continuity.en} reg={content.continuity.reg} regMeta={regMeta} enSize={21} regSize={19} gap={7} />} />
          <TsunamiBanner risk={riskOf(content)} note={content.tsunamiNote} regMeta={regMeta} lang={content.regionLang} compact />
        </div>

        <Disclaimer d={content.disclaimer} regMeta={regMeta} />
        <Footer q={q} />
      </div>
    );
  }

  // ====== VARIATION B — Globe Hero (surface, globe motif) =================
  function CardGlobeHero({ q, content, regMeta, T }) {
    return (
      <div data-export-card="globe-hero" style={{ width: 1080, height: 1350, background: SURF, color: INK, fontFamily: SANS,
        padding: '44px 58px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Logomark size={40} />
            <span style={{ fontSize: 25, fontWeight: 700 }}>Globe</span>
          </div>
          <Eyebrow>{T.brief} · Mechanism</Eyebrow>
        </div>

        <MagBlock q={q} T={T} regMeta={regMeta} size={102} />
        <MetaGrid q={q} T={T} regMeta={regMeta} />

        {/* globe (location) + large fault diagram (mechanism), side by side */}
        <div style={{ display: 'flex', gap: 22, height: 286 }}>
          <div style={{ flex: '0 0 290px', background: PAPER, border: `1px solid ${LINE}`,
            display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px 0' }}><Eyebrow size={13}>{T.coord ? 'Epicenter · ' + T.coord : 'Epicenter'}</Eyebrow></div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GlobeMini q={q} px={238} />
            </div>
          </div>
          <div style={{ flex: 1, background: PAPER, border: `1px solid ${LINE}`, padding: '12px 22px 14px',
            display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14,
              borderBottom: `1px solid ${LINE}`, paddingBottom: 9, marginBottom: 4 }}>
              <Eyebrow size={14}>{T.faultTag}</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 27, fontWeight: 700, color: INK, lineHeight: 1 }}>{content.faultTypeLabel.en}</span>
                {regMeta && content.faultTypeLabel.reg && (
                  <span style={{ fontSize: 19, color: MUT, fontFamily: regMeta.font }}>{content.faultTypeLabel.reg}</span>
                )}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <window.FaultDiagram type={content.faultType} height={214} lang={content.regionLang} />
            </div>
          </div>
        </div>

        {/* sections + tsunami in a 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 40px', flex: 1, alignContent: 'start' }}>
          <Section n="01" labelEn="Main cause" labelReg={T.cause} regMeta={regMeta}
            body={<Bilingual en={content.mainCause.en} reg={content.mainCause.reg} regMeta={regMeta} enSize={20} regSize={18} gap={7} />} />
          <Section n="02" labelEn="Nature" labelReg={T.natureL} regMeta={regMeta}
            body={<Bilingual en={content.nature.en} reg={content.nature.reg} regMeta={regMeta} enSize={20} regSize={18} gap={7} />} />
          <Section n="03" labelEn="Aftershocks" labelReg={T.cont} regMeta={regMeta}
            body={<Bilingual en={content.continuity.en} reg={content.continuity.reg} regMeta={regMeta} enSize={20} regSize={18} gap={7} />} />
          <TsunamiBanner risk={riskOf(content)} note={content.tsunamiNote} regMeta={regMeta} lang={content.regionLang} compact />
        </div>

        <Disclaimer d={content.disclaimer} regMeta={regMeta} />
        <Footer q={q} />
      </div>
    );
  }

  // ====== VARIATION C — Seismograph (ink / dark, technical) ===============
  function CardSeismograph({ q, content, regMeta, T }) {
    const sub = 'rgba(241,238,232,0.62)';
    return (
      <div style={{ width: 1080, height: 1350, background: INK, color: PAPER, fontFamily: SANS,
        padding: '50px 60px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Logomark size={40} dark />
            <span style={{ fontSize: 25, fontWeight: 700, color: PAPER }}>Globe</span>
          </div>
          <Eyebrow color={sub}>Mechanism Report · {T.brief}</Eyebrow>
        </div>
        <div style={{ borderTop: `1px solid rgba(241,238,232,0.2)` }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <MagBlock q={q} T={T} regMeta={regMeta} dark size={150} />
          <div style={{ textAlign: 'right' }}>
            <Eyebrow size={14} color={sub} style={{ marginBottom: 6 }}>{T.faultTag}</Eyebrow>
            <div style={{ fontSize: 30, fontWeight: 700, color: PAPER }}>{content.faultTypeLabel.en}</div>
            {regMeta && content.faultTypeLabel.reg && (
              <div style={{ fontSize: 21, color: sub, fontFamily: regMeta.font, marginTop: 3 }}>{content.faultTypeLabel.reg}</div>
            )}
          </div>
        </div>

        {/* inset light readout: diagram + meta */}
        <div style={{ background: PAPER, color: INK, padding: '16px 26px', display: 'flex', gap: 30, alignItems: 'center' }}>
          <div style={{ flex: '0 0 430px' }}><window.FaultDiagram type={content.faultType} height={196} lang={content.regionLang} /></div>
          <div style={{ flex: 1 }}><MetaGrid q={q} T={T} regMeta={regMeta} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 44px', flex: 1, alignContent: 'start' }}>
          <Section n="01" labelEn="Main cause" labelReg={T.cause} regMeta={regMeta} color={PAPER}
            body={<Bilingual en={content.mainCause.en} reg={content.mainCause.reg} regMeta={regMeta} enSize={21} regSize={19} gap={7} color={PAPER} mutedReg={sub} />} />
          <Section n="02" labelEn="Nature" labelReg={T.natureL} regMeta={regMeta} color={PAPER}
            body={<Bilingual en={content.nature.en} reg={content.nature.reg} regMeta={regMeta} enSize={21} regSize={19} gap={7} color={PAPER} mutedReg={sub} />} />
          <Section n="03" labelEn="Aftershock outlook" labelReg={T.cont} regMeta={regMeta} color={PAPER}
            body={<Bilingual en={content.continuity.en} reg={content.continuity.reg} regMeta={regMeta} enSize={21} regSize={19} gap={7} color={PAPER} mutedReg={sub} />} />
          <div>
            <TsunamiBanner risk={riskOf(content)} note={content.tsunamiNote} regMeta={regMeta} lang={content.regionLang} compact />
          </div>
        </div>

        <Disclaimer d={content.disclaimer} regMeta={regMeta} dark />
        <Footer q={q} dark />
      </div>
    );
  }

  window.QuakeCards = {
    'field-report': { label: 'Field Report', el: CardFieldReport },
    'globe-hero': { label: 'Globe Hero', el: CardGlobeHero },
    'seismograph': { label: 'Seismograph', el: CardSeismograph },
  };
})();
