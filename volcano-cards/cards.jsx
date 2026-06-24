/* Three SNS card designs (1080×1350) for a volcano alert update, sharing one
   bilingual content model. Palette matches the Globe brand and the earthquake
   mechanism cards: paper #f1eee8, surface #fbfaf7, ink #2c2a27, volcano amber
   #b0741c, muted #8c887f. Export-ready for Bluesky / Mastodon.
   Content model:
     { edifice, edificeLabel:{en,reg}, whyNow, levelMeaning, impacts, outlook,
       hazards:[], regionLang, disclaimer:{en,reg} }
   Volcano model:
     { id, source:'jma'|'usgs', name, nameEn, level, kind, color, alert, obs,
       lat, lon, date, report, rgb }  (+ derived *Txt fields) */
(function () {
  const PAPER = '#f1eee8', SURF = '#fbfaf7', INK = '#2c2a27', AMBER = '#b0741c',
        RED = '#cf4f2e', MUT = '#8c887f', LINE = 'rgba(44,42,39,0.16)';
  const SANS = "'Helvetica Neue', 'Noto Sans', system-ui, sans-serif";
  const tc = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '—';

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
        {/* amber volcano triangle accent */}
        <path d="M42 16.5 L49 27 H35 Z" fill={AMBER} />
      </svg>
    );
  }

  function Eyebrow({ children, color = MUT, size = 17, style }) {
    return <div style={{ fontSize: size, letterSpacing: '0.18em', textTransform: 'uppercase', color, fontWeight: 600, ...style }}>{children}</div>;
  }

  function Bilingual({ en, reg, regMeta, enSize = 22, regSize = 20, gap = 7, color = INK, mutedReg }) {
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

  // alert chip — JMA numeric level or USGS aviation colour, colour-coded
  function AlertChip({ v, T, big }) {
    const accent = 'rgb(' + (v.rgb || '176,116,28') + ')';
    if (v.source === 'jma' && v.level) {
      return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: accent, color: '#fff', padding: big ? '16px 26px' : '12px 20px', minWidth: big ? 150 : 120 }}>
          <div style={{ fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, opacity: 0.92 }}>{T.lvl}</div>
          <div style={{ fontSize: big ? 78 : 60, fontWeight: 700, lineHeight: 0.95, fontVariantNumeric: 'tabular-nums' }}>{v.level}</div>
        </div>
      );
    }
    // USGS aviation colour
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: accent, color: '#fff', padding: big ? '18px 26px' : '14px 20px', minWidth: big ? 150 : 120 }}>
        <div style={{ fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, opacity: 0.92 }}>{T.avColor}</div>
        <div style={{ fontSize: big ? 40 : 32, fontWeight: 700, lineHeight: 1.05 }}>{tc(v.color)}</div>
        {v.alert && <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.9, marginTop: 2 }}>{tc(v.alert)}</div>}
      </div>
    );
  }

  function NameBlock({ v, regMeta, size = 70 }) {
    const ja = (regMeta && regMeta.code === 'ja');
    const main = v.source === 'jma' ? (ja ? v.name : (v.nameEn || v.name)) : v.name;
    const sub = (v.source === 'jma' && v.nameEn && v.name && v.nameEn !== v.name && !ja) ? v.name : null;
    return (
      <div>
        <div style={{ fontSize: size, fontWeight: 700, color: INK, lineHeight: 1.02, letterSpacing: '-0.01em', textWrap: 'balance' }}>{main}</div>
        {sub && <div style={{ fontSize: size * 0.34, fontWeight: 500, color: MUT, fontFamily: regMeta.font, marginTop: 6 }}>{sub}</div>}
      </div>
    );
  }

  function MetaGrid({ v, T, regMeta, content, dark }) {
    const c1 = dark ? 'rgba(241,238,232,0.55)' : MUT, c2 = dark ? PAPER : INK;
    const cells = [];
    if (v.source === 'jma' && v.kind) cells.push([T.kind, v.kind]);
    else if (v.source === 'usgs' && v.obs) cells.push([T.obs, v.obs]);
    cells.push([T.typeTag, content.edificeLabel ? content.edificeLabel.en : '—']);
    cells.push([T.updated, v.whenTxt]);
    cells.push([T.loc, v.coordTxt]);
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

  // outlook banner (amber) — "what to watch & prepare"
  function OutlookBanner({ content, regMeta, T, compact }) {
    const o = content.outlook;
    if (!o || (!o.en && !o.reg)) return null;
    return (
      <div style={{ padding: compact ? '14px 16px' : '16px 20px', background: 'rgba(176,116,28,0.10)', border: `1px solid ${AMBER}` }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={AMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
          </svg>
          <span style={{ fontSize: compact ? 17 : 19, fontWeight: 700, color: AMBER, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{T.outlook}</span>
        </div>
        <Bilingual en={o.en} reg={o.reg} regMeta={regMeta} enSize={compact ? 19 : 21} regSize={compact ? 17 : 19} color={INK} mutedReg="rgba(44,42,39,0.62)" />
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

  function Footer({ v, dark }) {
    const col = dark ? 'rgba(241,238,232,0.62)' : MUT, acc = dark ? PAPER : INK;
    const src = v.source === 'jma' ? 'DATA JMA' : (v.source === 'usgs' ? 'DATA USGS' : 'DATA SMITHSONIAN GVP');
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 19, color: acc, fontWeight: 600, letterSpacing: '0.01em' }}>
          globelabo.netlify.app<span style={{ color: AMBER }}>/#vol={v.id}</span>
        </div>
        <div style={{ fontSize: 15, color: col, letterSpacing: '0.06em' }}>LIVE VOLCANO MAP · {src}</div>
      </div>
    );
  }

  // mini globe centered on the volcano (amber marker) ----------------------
  function GlobeMini({ v, px = 238 }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const cv = ref.current; if (!cv || !window.GlobeArt) return;
      const dpr = 2; cv.width = px * dpr; cv.height = px * dpr;
      const c = cv.getContext('2d'); c.scale(dpr, dpr);
      window.GlobeArt.draw(cv, {
        COL: { bg: PAPER, ocean: PAPER, land: INK, hair: PAPER, ring: INK, quake: v.rgb || '176,116,28', whirl: '44,42,39' },
        cx: px / 2, cy: px / 2, R: px * 0.42,
        centerLon: v.lon, centerLat: v.lat,
        quakes: [{ lon: v.lon, lat: v.lat, mag: 6.4 }],
        whirl: { A: px * 0.42 * 1.4, B: px * 0.42 * 0.5, tilt: -20 * Math.PI / 180, dots: 64, gap: 0.05, headR: px * 0.012, tailR: 1, headO: 0.5, phase: 2.1 },
      });
    }, [v.id, v.lon, v.lat]);
    return <canvas ref={ref} style={{ width: px, height: px, display: 'block' }} />;
  }

  // ====== VARIATION B — Globe Hero (the primary auto-post card) ============
  function CardGlobeHero({ v, content, regMeta, T }) {
    const accent = 'rgb(' + (v.rgb || '176,116,28') + ')';
    return (
      <div data-export-card="globe-hero" style={{ width: 1080, height: 1350, background: SURF, color: INK, fontFamily: SANS,
        padding: '38px 58px 40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 13, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Logomark size={40} />
            <span style={{ fontSize: 25, fontWeight: 700 }}>Globe</span>
          </div>
          <Eyebrow color={accent}>{T.eyebrow}</Eyebrow>
        </div>

        {/* name + alert chip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1, paddingTop: 4 }}><NameBlock v={v} regMeta={regMeta} size={66} /></div>
          <AlertChip v={v} T={T} big />
        </div>

        {/* compact meta strip — type & location live in the boxes below */}
        <MetaStrip v={v} T={T} cells={[
          [v.source === 'jma' ? T.kind : T.obs, v.source === 'jma' ? (v.kind || '—') : (v.obs || '—')],
          [T.updated, v.whenTxt],
        ]} />

        {/* alert-level ladder — the hero visual */}
        <window.AlertLadder v={v} lang={content.regionLang || 'en'} />

        {/* globe (location) + cross-section (mechanism) */}
        <div style={{ display: 'flex', gap: 18, height: 232 }}>
          <div style={{ flex: '0 0 252px', background: PAPER, border: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '9px 14px 0' }}>
              <Eyebrow size={13}>{T.loc}</Eyebrow>
              <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v.coordTxt}</div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GlobeMini v={v} px={176} />
            </div>
          </div>
          <div style={{ flex: 1, background: PAPER, border: `1px solid ${LINE}`, padding: '11px 20px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, borderBottom: `1px solid ${LINE}`, paddingBottom: 8, flex: 'none' }}>
              <Eyebrow size={14}>{T.typeTag}</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, textAlign: 'right' }}>
                <span style={{ fontSize: 23, fontWeight: 700, color: INK, lineHeight: 1.05 }}>{content.edificeLabel.en}</span>
                {regMeta && content.edificeLabel.reg && <span style={{ fontSize: 16, color: MUT, fontFamily: regMeta.font, whiteSpace: 'nowrap' }}>{content.edificeLabel.reg}</span>}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <window.VolcanoDiagram edifice={content.edifice} lang={content.regionLang || 'en'} height="100%" />
            </div>
          </div>
        </div>

        {/* sections + outlook in a 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 38px', alignContent: 'start' }}>
          <Section n="01" labelEn={T.s2} labelReg={T.s2r} regMeta={regMeta}
            body={<Bilingual en={content.whyNow.en} reg={content.whyNow.reg} regMeta={regMeta} enSize={19} regSize={17} gap={6} />} />
          <Section n="02" labelEn={T.s3} labelReg={T.s3r} regMeta={regMeta}
            body={<Bilingual en={content.levelMeaning.en} reg={content.levelMeaning.reg} regMeta={regMeta} enSize={19} regSize={17} gap={6} />} />
          <Section n="03" labelEn={T.s4} labelReg={T.s4r} regMeta={regMeta}
            body={<Bilingual en={content.impacts.en} reg={content.impacts.reg} regMeta={regMeta} enSize={19} regSize={17} gap={6} />} />
          <OutlookBanner content={content} regMeta={regMeta} T={T} compact />
        </div>

        {/* hazards */}
        <window.HazardChips hazards={content.hazards} lang={content.regionLang || 'en'} label={T.hazards} />

        <Disclaimer d={content.disclaimer} regMeta={regMeta} />
        <Footer v={v} />
        <div style={{ flex: 1, minHeight: 8 }} />
      </div>
    );
  }

  // ====== VARIATION A — Field Report (paper, editorial) ===================
  function CardFieldReport({ v, content, regMeta, T }) {
    return (
      <div style={{ width: 1080, height: 1350, background: PAPER, color: INK, fontFamily: SANS,
        padding: '46px 60px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><Logomark size={40} /><span style={{ fontSize: 25, fontWeight: 700 }}>Globe</span></div>
          <Eyebrow>{T.eyebrow}</Eyebrow>
        </div>
        <div style={{ borderTop: `2px solid ${INK}` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1, paddingTop: 2 }}><NameBlock v={v} regMeta={regMeta} size={60} /></div>
          <AlertChip v={v} T={T} />
        </div>
        <MetaGrid v={v} T={T} regMeta={regMeta} content={content} />
        <window.AlertLadder v={v} lang={content.regionLang || 'en'} />
        <div style={{ display: 'flex', gap: 26, alignItems: 'center', background: SURF, border: `1px solid ${LINE}`, padding: '12px 22px' }}>
          <div style={{ flex: '0 0 380px' }}><window.VolcanoDiagram edifice={content.edifice} lang={content.regionLang || 'en'} height={176} /></div>
          <div style={{ flex: 1 }}>
            <Eyebrow size={14} style={{ marginBottom: 7 }}>{T.typeTag}</Eyebrow>
            <div style={{ fontSize: 27, fontWeight: 700, color: INK, lineHeight: 1.1 }}>{content.edificeLabel.en}</div>
            {regMeta && content.edificeLabel.reg && <div style={{ fontSize: 19, color: MUT, fontFamily: regMeta.font, marginTop: 4 }}>{content.edificeLabel.reg}</div>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 44px', flex: 1, alignContent: 'start' }}>
          <Section n="01" labelEn={T.s2} labelReg={T.s2r} regMeta={regMeta} body={<Bilingual en={content.whyNow.en} reg={content.whyNow.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} />} />
          <Section n="02" labelEn={T.s3} labelReg={T.s3r} regMeta={regMeta} body={<Bilingual en={content.levelMeaning.en} reg={content.levelMeaning.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} />} />
          <Section n="03" labelEn={T.s4} labelReg={T.s4r} regMeta={regMeta} body={<Bilingual en={content.impacts.en} reg={content.impacts.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} />} />
          <OutlookBanner content={content} regMeta={regMeta} T={T} compact />
        </div>
        <window.HazardChips hazards={content.hazards} lang={content.regionLang || 'en'} label={T.hazards} />
        <Disclaimer d={content.disclaimer} regMeta={regMeta} />
        <Footer v={v} />
      </div>
    );
  }

  // ====== VARIATION C — Monolith (ink / dark, technical) ==================
  function CardMonolith({ v, content, regMeta, T }) {
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
          <div style={{ flex: 1 }}><NameBlock v={{ ...v }} regMeta={regMeta} size={62} /></div>
          <AlertChip v={v} T={T} big />
        </div>
        {/* inset light readout: ladder */}
        <div style={{ background: PAPER, color: INK, padding: '18px 24px' }}>
          <window.AlertLadder v={v} lang={content.regionLang || 'en'} />
        </div>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          <div style={{ flex: '0 0 360px', background: PAPER, padding: '8px 12px' }}><window.VolcanoDiagram edifice={content.edifice} lang={content.regionLang || 'en'} height={170} /></div>
          <div style={{ flex: 1 }}>
            <Eyebrow size={14} color={sub} style={{ marginBottom: 6 }}>{T.typeTag}</Eyebrow>
            <div style={{ fontSize: 28, fontWeight: 700, color: PAPER }}>{content.edificeLabel.en}</div>
            {regMeta && content.edificeLabel.reg && <div style={{ fontSize: 19, color: sub, fontFamily: regMeta.font, marginTop: 3 }}>{content.edificeLabel.reg}</div>}
            <div style={{ marginTop: 14 }}><MetaGrid v={v} T={T} regMeta={regMeta} content={content} dark /></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 44px', flex: 1, alignContent: 'start' }}>
          <Section n="01" labelEn={T.s2} labelReg={T.s2r} regMeta={regMeta} color={PAPER} body={<Bilingual en={content.whyNow.en} reg={content.whyNow.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} color={PAPER} mutedReg={sub} />} />
          <Section n="02" labelEn={T.s3} labelReg={T.s3r} regMeta={regMeta} color={PAPER} body={<Bilingual en={content.levelMeaning.en} reg={content.levelMeaning.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} color={PAPER} mutedReg={sub} />} />
          <Section n="03" labelEn={T.s4} labelReg={T.s4r} regMeta={regMeta} color={PAPER} body={<Bilingual en={content.impacts.en} reg={content.impacts.reg} regMeta={regMeta} enSize={20} regSize={18} gap={6} color={PAPER} mutedReg={sub} />} />
          <OutlookBanner content={content} regMeta={regMeta} T={T} compact />
        </div>
        <Disclaimer d={content.disclaimer} regMeta={regMeta} dark />
        <Footer v={v} dark />
      </div>
    );
  }

  window.VolcanoCards = {
    'globe-hero': { label: 'Globe Hero', el: CardGlobeHero },
    'field-report': { label: 'Field Report', el: CardFieldReport },
    'monolith': { label: 'Monolith', el: CardMonolith },
  };
})();
