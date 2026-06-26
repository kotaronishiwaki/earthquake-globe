/* Three SNS card designs (1080×1350) for a solar-flare update, sharing one
   bilingual content model. Palette matches the Globe brand and the earthquake /
   volcano cards: paper #f1eee8, surface #fbfaf7, ink #2c2a27, solar gold/amber,
   muted #8c887f. Export-ready for Bluesky / Mastodon.
   Content model:
     { regionType, regionLabel:{en,reg}, mechanism, source, levelMeaning,
       impacts, outlook, effects:[], regionLang, disclaimer:{en,reg} }
   Flare model:
     { id, class, flux, rScale, peak, begin, end, lat, lon, report, rgb }
       (+ derived coordTxt / whenTxt / beganTxt) */
(function () {
  const PAPER = '#f1eee8', SURF = '#fbfaf7', INK = '#2c2a27', AMBER = '#c98318',
        GOLD = '#e09e28', MUT = '#8c887f', LINE = 'rgba(44,42,39,0.16)';
  const SANS = "'Helvetica Neue', 'Noto Sans', system-ui, sans-serif";
  const R_RGB = { 1: '230,194,90', 2: '224,160,40', 3: '217,122,43', 4: '196,74,42', 5: '160,40,40' };

  // ── shared atoms ────────────────────────────────────────────────────────
  function Logomark({ size = 40, dark = false }) {
    const bg = dark ? '#3a3733' : PAPER, stroke = dark ? PAPER : INK;
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
        {/* solar flare accent — small sun above the right shoulder */}
        <circle cx="46" cy="19" r="6.2" fill={GOLD} />
      </svg>
    );
  }

  function Eyebrow({ children, color = MUT, size = 17, style }) {
    return <div style={{ fontSize: size, letterSpacing: '0.18em', textTransform: 'uppercase', color, fontWeight: 600, ...style }}>{children}</div>;
  }

  function Bilingual({ en, reg, regMeta, enSize = 22, regSize = 20, gap = 7, color = INK, mutedReg, clampEn, clampReg }) {
    const clampStyle = n => n ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: n, overflow: 'hidden' } : {};
    return (
      <div>
        <div style={{ fontSize: enSize, lineHeight: 1.42, color, textWrap: 'pretty', fontWeight: 400, ...clampStyle(clampEn) }}>{en}</div>
        {reg && regMeta && (
          <div dir={regMeta.dir} style={{ fontSize: regSize, lineHeight: 1.5, marginTop: gap,
            color: mutedReg || 'rgba(44,42,39,0.62)', fontFamily: regMeta.font, textWrap: 'pretty',
            textAlign: regMeta.dir === 'rtl' ? 'right' : 'left', ...clampStyle(clampReg) }}>{reg}</div>
        )}
      </div>
    );
  }

  function Section({ n, labelEn, labelReg, regMeta, body, color }) {
    return (
      <div style={{ display: 'flex', gap: 18 }}>
        <div style={{ fontSize: 15, color: AMBER, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.04em', paddingTop: 3, minWidth: 24 }}>{n}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 9 }}>
            <Eyebrow size={16} color={color || INK}>{labelEn}</Eyebrow>
            {labelReg && regMeta && <span style={{ fontSize: 15, color: MUT, fontFamily: regMeta.font }}>{labelReg}</span>}
          </div>
          {body}
        </div>
      </div>
    );
  }

  // R-scale chip — radio-blackout level, colour-coded by R
  function RChip({ f, T, big }) {
    const r = f.rScale || (window.SolarRScaleOf ? window.SolarRScaleOf(f.flux) : 0);
    const accent = 'rgb(' + (R_RGB[r] || '224,158,40') + ')';
    const word = r ? ((window.SolarRLabels && (window.SolarRLabels[T.lang] || window.SolarRLabels.en))[r - 1] || '') : '';
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: accent, color: '#fff', padding: big ? '16px 30px' : '12px 22px', minWidth: big ? 158 : 124 }}>
        <div style={{ fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, opacity: 0.92 }}>{T.rscale}</div>
        <div style={{ fontSize: big ? 78 : 60, fontWeight: 700, lineHeight: 0.95, fontVariantNumeric: 'tabular-nums' }}>R{r || '—'}</div>
        {word && <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.92, marginTop: 2 }}>{word}</div>}
      </div>
    );
  }

  // name block — the GOES class code is the headline (e.g. "X2.3")
  function NameBlock({ f, T, size = 70 }) {
    return (
      <div>
        <Eyebrow size={size * 0.2} style={{ marginBottom: 8 }}>{T.cls}</Eyebrow>
        <div style={{ fontSize: size, fontWeight: 700, color: INK, lineHeight: 1.0, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{f.class}</div>
      </div>
    );
  }

  function MetaGrid({ f, T, regMeta, content, dark }) {
    const c1 = dark ? 'rgba(241,238,232,0.55)' : MUT, c2 = dark ? PAPER : INK;
    const cells = [
      [T.peak, f.whenTxt],
      [T.began, f.beganTxt],
      [T.typeTag, content.regionLabel ? content.regionLabel.en : '—'],
      [T.region, f.coordTxt],
    ];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 30px' }}>
        {cells.map((c, i) => (
          <div key={i}>
            <div style={{ fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: c1, marginBottom: 4 }}>{c[0]}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: c2, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{c[1]}</div>
          </div>
        ))}
      </div>
    );
  }

  // compact single-row meta strip (hero)
  function MetaStrip({ cells }) {
    return (
      <div style={{ display: 'flex', gap: 0, border: `1px solid ${LINE}`, background: PAPER }}>
        {cells.map((c, i) => (
          <div key={i} style={{ flex: 1, padding: '11px 18px', borderLeft: i ? `1px solid ${LINE}` : 'none' }}>
            <div style={{ fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUT, marginBottom: 4 }}>{c[0]}</div>
            <div style={{ fontSize: 21, fontWeight: 600, color: INK, lineHeight: 1.12, fontVariantNumeric: 'tabular-nums' }}>{c[1]}</div>
          </div>
        ))}
      </div>
    );
  }

  // outlook banner (amber) — "CME & aurora outlook"
  function OutlookBanner({ content, regMeta, T, compact }) {
    const o = content.outlook;
    if (!o || (!o.en && !o.reg)) return null;
    return (
      <div style={{ padding: compact ? '14px 16px' : '16px 20px', background: 'rgba(201,131,24,0.10)', border: `1px solid ${AMBER}` }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={AMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
          </svg>
          <span style={{ fontSize: compact ? 17 : 19, fontWeight: 700, color: AMBER, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{T.outlook}</span>
        </div>
        <Bilingual en={o.en} reg={o.reg} regMeta={regMeta} enSize={compact ? 19 : 21} regSize={compact ? 17 : 19} color={INK} mutedReg="rgba(44,42,39,0.62)" clampEn={2} clampReg={2} />
      </div>
    );
  }

  function Disclaimer({ d, regMeta, dark }) {
    const col = dark ? 'rgba(241,238,232,0.5)' : MUT;
    return (
      <div style={{ borderTop: `1px solid ${dark ? 'rgba(241,238,232,0.18)' : LINE}`, paddingTop: 14 }}>
        <Eyebrow size={12} color={col} style={{ marginBottom: 6 }}>{regMeta && regMeta.code === 'ja' ? '注意事項 · Disclaimer' : 'Disclaimer'}</Eyebrow>
        <div style={{ fontSize: 13, lineHeight: 1.4, color: col }}>{d.en}</div>
        {d.reg && regMeta && (
          <div dir={regMeta.dir} style={{ fontSize: 12.5, lineHeight: 1.45, color: col, marginTop: 4, fontFamily: regMeta.font, textAlign: regMeta.dir === 'rtl' ? 'right' : 'left' }}>{d.reg}</div>
        )}
      </div>
    );
  }

  function Footer({ f, dark }) {
    const col = dark ? 'rgba(241,238,232,0.62)' : MUT, acc = dark ? PAPER : INK;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 19, color: acc, fontWeight: 600, letterSpacing: '0.01em' }}>
          globelabo.netlify.app<span style={{ color: AMBER }}>/#flare={f.id}</span>
        </div>
        <div style={{ fontSize: 15, color: col, letterSpacing: '0.06em' }}>LIVE SPACE-WEATHER MAP · DATA NOAA SWPC</div>
      </div>
    );
  }

  // mini globe centred on the sub-solar point (gold marker = blackout centre) -
  function GlobeMini({ f, px = 238 }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const cv = ref.current; if (!cv || !window.GlobeArt) return;
      const dpr = 2; cv.width = px * dpr; cv.height = px * dpr;
      const c = cv.getContext('2d'); c.scale(dpr, dpr);
      window.GlobeArt.draw(cv, {
        COL: { bg: PAPER, ocean: PAPER, land: INK, hair: PAPER, ring: INK, quake: f.rgb || '224,158,40', whirl: '44,42,39' },
        cx: px / 2, cy: px / 2, R: px * 0.42,
        centerLon: f.lon, centerLat: f.lat,
        quakes: [{ lon: f.lon, lat: f.lat, mag: 7.2 }],
        whirl: { A: px * 0.42 * 1.4, B: px * 0.42 * 0.5, tilt: -20 * Math.PI / 180, dots: 64, gap: 0.05, headR: px * 0.012, tailR: 1, headO: 0.5, phase: 2.1 },
      });
    }, [f.id, f.lon, f.lat]);
    return <canvas ref={ref} style={{ width: px, height: px, display: 'block' }} />;
  }

  // ====== VARIATION B — Globe Hero (the primary auto-post card) ============
  function CardGlobeHero({ f, content, regMeta, T }) {
    const r = f.rScale || (window.SolarRScaleOf ? window.SolarRScaleOf(f.flux) : 0);
    const accent = 'rgb(' + (R_RGB[r] || '224,158,40') + ')';
    return (
      <div data-export-card="globe-hero" style={{ width: 1080, height: 1350, background: SURF, color: INK, fontFamily: SANS,
        padding: '32px 58px 16px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Logomark size={40} />
            <span style={{ fontSize: 25, fontWeight: 700 }}>Globe</span>
          </div>
          <Eyebrow color={accent}>{T.eyebrow}</Eyebrow>
        </div>

        {/* class + R chip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1, paddingTop: 4 }}><NameBlock f={f} T={T} size={66} /></div>
          <RChip f={f} T={T} big />
        </div>

        {/* compact meta strip — region & location live in the boxes below */}
        <MetaStrip cells={[
          [T.peak, f.whenTxt],
          [T.began, f.beganTxt],
        ]} />

        {/* radio-blackout (R) ladder — the hero visual */}
        <window.RScaleLadder flux={f.flux} rScale={f.rScale} lang={content.regionLang || 'en'} />

        {/* SOURCE REGION — full-width label strip (clamped, so a long bilingual
            label can never crowd or overflow the diagram), then a wide visual row:
            compact sub-solar globe (left) + the large Sun→Earth diagram (right). */}
        <div style={{ background: PAPER, border: `1px solid ${LINE}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '11px 20px 10px', borderBottom: `1px solid ${LINE}` }}>
            <Eyebrow size={14} style={{ flex: 'none', paddingTop: 1 }}>{T.typeTag}</Eyebrow>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1.18, textWrap: 'pretty',
                display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{content.regionLabel.en}</div>
              {regMeta && content.regionLabel.reg && (
                <div dir={regMeta.dir} style={{ fontSize: 17, color: MUT, fontFamily: regMeta.font, lineHeight: 1.4, marginTop: 3, textWrap: 'pretty',
                  textAlign: regMeta.dir === 'rtl' ? 'right' : 'left', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{content.regionLabel.reg}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 0, height: 214 }}>
            <div style={{ flex: '0 0 226px', borderRight: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px 0' }}>
                <Eyebrow size={12.5}>{T.region}</Eyebrow>
                <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{f.coordTxt}</div>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <GlobeMini f={f} px={132} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <window.SolarDiagram regionType={content.regionType} lang={content.regionLang || 'en'} height="100%" />
            </div>
          </div>
        </div>

        {/* sections + outlook in a 2×2 grid — flex:1 + minHeight:0 + overflow:hidden makes
            this the ONLY elastic block, so effects/disclaimer/footer below it are always
            in frame; per-field line-clamp truncates any single overlong field gracefully. */}
        {/* 3 text sections — the ONLY elastic block (flex:1 + overflow:hidden);
            per-field clamp truncates gracefully. Impacts spans the bottom row. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 36px', alignContent: 'start', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Section n="01" labelEn={T.s1} labelReg={T.s1r} regMeta={regMeta}
            body={<Bilingual en={content.mechanism.en} reg={content.mechanism.reg} regMeta={regMeta} enSize={18} regSize={16} gap={5} clampEn={4} clampReg={3} />} />
          <Section n="02" labelEn={T.s3} labelReg={T.s3r} regMeta={regMeta}
            body={<Bilingual en={content.levelMeaning.en} reg={content.levelMeaning.reg} regMeta={regMeta} enSize={18} regSize={16} gap={5} clampEn={4} clampReg={3} />} />
          <div style={{ gridColumn: '1 / -1' }}>
            <Section n="03" labelEn={T.s4} labelReg={T.s4r} regMeta={regMeta}
              body={<Bilingual en={content.impacts.en} reg={content.impacts.reg} regMeta={regMeta} enSize={18} regSize={16} gap={5} clampEn={2} clampReg={2} />} />
          </div>
        </div>

        {/* CME / aurora outlook — full width, always fully visible (never clipped) */}
        <OutlookBanner content={content} regMeta={regMeta} T={T} compact />

        {/* effects */}
        <window.EffectChips effects={content.effects} lang={content.regionLang || 'en'} label={T.effects} />

        <Disclaimer d={content.disclaimer} regMeta={regMeta} />
        <Footer f={f} />
      </div>
    );
  }

  // ====== VARIATION A — Field Report (paper, editorial) ===================
  function CardFieldReport({ f, content, regMeta, T }) {
    return (
      <div style={{ width: 1080, height: 1350, background: PAPER, color: INK, fontFamily: SANS,
        padding: '46px 60px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><Logomark size={40} /><span style={{ fontSize: 25, fontWeight: 700 }}>Globe</span></div>
          <Eyebrow>{T.eyebrow}</Eyebrow>
        </div>
        <div style={{ borderTop: `2px solid ${INK}` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1, paddingTop: 2 }}><NameBlock f={f} T={T} size={60} /></div>
          <RChip f={f} T={T} />
        </div>
        <MetaGrid f={f} T={T} regMeta={regMeta} content={content} />
        <window.RScaleLadder flux={f.flux} rScale={f.rScale} lang={content.regionLang || 'en'} />
        <div style={{ display: 'flex', gap: 26, alignItems: 'center', background: SURF, border: `1px solid ${LINE}`, padding: '12px 22px' }}>
          <div style={{ flex: '0 0 360px' }}><window.SolarDiagram regionType={content.regionType} lang={content.regionLang || 'en'} height={176} /></div>
          <div style={{ flex: 1 }}>
            <Eyebrow size={14} style={{ marginBottom: 7 }}>{T.typeTag}</Eyebrow>
            <div style={{ fontSize: 25, fontWeight: 700, color: INK, lineHeight: 1.12 }}>{content.regionLabel.en}</div>
            {regMeta && content.regionLabel.reg && <div style={{ fontSize: 18, color: MUT, fontFamily: regMeta.font, marginTop: 4 }}>{content.regionLabel.reg}</div>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 44px', flex: 1, alignContent: 'start' }}>
          <Section n="01" labelEn={T.s1} labelReg={T.s1r} regMeta={regMeta} body={<Bilingual en={content.mechanism.en} reg={content.mechanism.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} />} />
          <Section n="02" labelEn={T.s3} labelReg={T.s3r} regMeta={regMeta} body={<Bilingual en={content.levelMeaning.en} reg={content.levelMeaning.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} />} />
          <Section n="03" labelEn={T.s4} labelReg={T.s4r} regMeta={regMeta} body={<Bilingual en={content.impacts.en} reg={content.impacts.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} />} />
          <OutlookBanner content={content} regMeta={regMeta} T={T} compact />
        </div>
        <window.EffectChips effects={content.effects} lang={content.regionLang || 'en'} label={T.effects} />
        <Disclaimer d={content.disclaimer} regMeta={regMeta} />
        <Footer f={f} />
      </div>
    );
  }

  // ====== VARIATION C — Monolith (ink / dark, technical) ==================
  function CardMonolith({ f, content, regMeta, T }) {
    const sub = 'rgba(241,238,232,0.62)';
    return (
      <div style={{ width: 1080, height: 1350, background: INK, color: PAPER, fontFamily: SANS,
        padding: '50px 60px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><Logomark size={40} dark /><span style={{ fontSize: 25, fontWeight: 700, color: PAPER }}>Globe</span></div>
          <Eyebrow color={sub}>{T.eyebrow}</Eyebrow>
        </div>
        <div style={{ borderTop: `1px solid rgba(241,238,232,0.2)` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <Eyebrow size={13} color={sub} style={{ marginBottom: 8 }}>{T.cls}</Eyebrow>
            <div style={{ fontSize: 62, fontWeight: 700, color: PAPER, lineHeight: 1.0, fontVariantNumeric: 'tabular-nums' }}>{f.class}</div>
          </div>
          <RChip f={f} T={T} big />
        </div>
        {/* inset light readout: ladder */}
        <div style={{ background: PAPER, color: INK, padding: '18px 24px' }}>
          <window.RScaleLadder flux={f.flux} rScale={f.rScale} lang={content.regionLang || 'en'} />
        </div>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          <div style={{ flex: '0 0 340px', background: PAPER, padding: '8px 12px' }}><window.SolarDiagram regionType={content.regionType} lang={content.regionLang || 'en'} height={170} /></div>
          <div style={{ flex: 1 }}>
            <Eyebrow size={14} color={sub} style={{ marginBottom: 6 }}>{T.typeTag}</Eyebrow>
            <div style={{ fontSize: 26, fontWeight: 700, color: PAPER }}>{content.regionLabel.en}</div>
            {regMeta && content.regionLabel.reg && <div style={{ fontSize: 18, color: sub, fontFamily: regMeta.font, marginTop: 3 }}>{content.regionLabel.reg}</div>}
            <div style={{ marginTop: 14 }}><MetaGrid f={f} T={T} regMeta={regMeta} content={content} dark /></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 44px', flex: 1, alignContent: 'start' }}>
          <Section n="01" labelEn={T.s1} labelReg={T.s1r} regMeta={regMeta} color={PAPER} body={<Bilingual en={content.mechanism.en} reg={content.mechanism.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} color={PAPER} mutedReg={sub} />} />
          <Section n="02" labelEn={T.s3} labelReg={T.s3r} regMeta={regMeta} color={PAPER} body={<Bilingual en={content.levelMeaning.en} reg={content.levelMeaning.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} color={PAPER} mutedReg={sub} />} />
          <Section n="03" labelEn={T.s4} labelReg={T.s4r} regMeta={regMeta} color={PAPER} body={<Bilingual en={content.impacts.en} reg={content.impacts.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} color={PAPER} mutedReg={sub} />} />
          <OutlookBanner content={content} regMeta={regMeta} T={T} compact />
        </div>
        <Disclaimer d={content.disclaimer} regMeta={regMeta} dark />
        <Footer f={f} dark />
      </div>
    );
  }

  window.SolarCards = {
    'globe-hero': { label: 'Globe Hero', el: CardGlobeHero },
    'field-report': { label: 'Field Report', el: CardFieldReport },
    'monolith': { label: 'Monolith', el: CardMonolith },
  };
})();
