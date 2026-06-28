/* Globe Weekly — mechanism animations.
 *
 * Lightweight, self-contained SVG + CSS-keyframe loops that illustrate HOW each
 * kind of event happens. No JS animation loop is needed: the CSS runs on its own
 * once the markup is in the DOM, which is exactly what the Playwright recorder
 * captures. Re-injecting the markup (panel re-render) restarts the loop.
 *
 *   window.Mechanisms.svg(kind)        -> diagram markup (string)
 *   window.Mechanisms.label(kind,lang) -> { eyebrow, title, desc }
 *   window.Mechanisms.classifyFault(text) -> 'strike-slip'|'normal'|'reverse'|'subduction'
 *
 * Kinds: strike-slip | normal | reverse | subduction | flare | volcano
 *
 * Colours come from the studio CSS custom properties (var(--quake) etc.), so the
 * diagrams stay in palette automatically.
 */
(function () {
  'use strict';

  // ---- localized labels ----------------------------------------------------
  const LABELS = {
    'strike-slip': {
      ja: { eyebrow: '断層のしくみ', title: '横ずれ断層', desc: '2つの岩盤が水平に、すれ違うように動く。' },
      en: { eyebrow: 'Fault mechanism', title: 'Strike-slip fault', desc: 'Two blocks grind sideways past each other.' },
    },
    normal: {
      ja: { eyebrow: '断層のしくみ', title: '正断層', desc: '地殻が引っ張られ、片側がずり落ちる。' },
      en: { eyebrow: 'Fault mechanism', title: 'Normal fault', desc: 'The crust is pulled apart; one side drops.' },
    },
    reverse: {
      ja: { eyebrow: '断層のしくみ', title: '逆断層', desc: '地殻が押し合い、片側がせり上がる。' },
      en: { eyebrow: 'Fault mechanism', title: 'Reverse fault', desc: 'The crust is pushed together; one side rides up.' },
    },
    subduction: {
      ja: { eyebrow: '地震のしくみ', title: '沈み込み帯の巨大地震', desc: 'プレートが跳ね上がり、海面を持ち上げて津波に。' },
      en: { eyebrow: 'Quake mechanism', title: 'Subduction megathrust', desc: 'The plate snaps up, lifts the sea, and sends a tsunami.' },
    },
    flare: {
      ja: { eyebrow: '太陽フレアのしくみ', title: '電波障害が起きるまで', desc: 'X線が光の速さで届き、昼側の電離層を乱す。' },
      en: { eyebrow: 'Solar flare mechanism', title: 'How a radio blackout forms', desc: 'X-rays arrive at light-speed and disturb the dayside ionosphere.' },
    },
    volcano: {
      ja: { eyebrow: '火山のしくみ', title: '噴火のしくみ', desc: 'マグマが上昇し、ガスが抜けて噴煙が立ちのぼる。' },
      en: { eyebrow: 'Volcano mechanism', title: 'How an eruption works', desc: 'Magma rises, gas escapes, and an ash column climbs.' },
    },
  };

  function label(kind, lang) {
    const e = LABELS[kind] || LABELS['strike-slip'];
    return (lang === 'en' ? e.en : e.ja);
  }

  // ---- fault-text classifier ----------------------------------------------
  // script.mjs may give us a clean `mechanism` field; when it only has free-text
  // fault wording (or the sample data), map it onto one of the four diagrams.
  function classifyFault(text) {
    const t = String(text || '').toLowerCase();
    if (/subduct|megathrust|interplate|沈み込み|プレート境界|海溝/.test(t)) return 'subduction';
    if (/strike[- ]?slip|transform|横ずれ|横ズレ|右横|左横/.test(t)) return 'strike-slip';
    if (/normal|extens|正断層/.test(t)) return 'normal';
    if (/reverse|thrust|逆断層|衝上|圧縮/.test(t)) return 'reverse';
    return 'strike-slip';
  }

  // ---- shared layer hatching for crust blocks ------------------------------
  const STRATA = ['rgba(44,42,39,.06)', 'rgba(44,42,39,.13)', 'rgba(44,42,39,.05)'];

  // ============================ DIAGRAMS ====================================
  // Each returns an <svg> sized to viewBox 0 0 720 420, with its own scoped
  // <style>. Class names are prefixed per-diagram so two could coexist safely.

  function strikeSlip() {
    return `<svg class="mech" viewBox="0 0 720 420" role="img" aria-label="strike-slip fault">
      <style>
        .ss-blk{transform-box:fill-box;transform-origin:center}
        .ss-top{animation:ssTop 4.6s ease-in-out infinite}
        .ss-bot{animation:ssBot 4.6s ease-in-out infinite}
        @keyframes ssTop{0%,12%{transform:translateX(0)}55%,72%{transform:translateX(46px)}100%{transform:translateX(0)}}
        @keyframes ssBot{0%,12%{transform:translateX(0)}55%,72%{transform:translateX(-46px)}100%{transform:translateX(0)}}
        .ss-arr{opacity:0;animation:ssArr 4.6s ease-in-out infinite}
        @keyframes ssArr{0%,10%{opacity:0}30%,70%{opacity:1}88%,100%{opacity:0}}
      </style>
      <defs>
        <clipPath id="ssClipTop"><rect x="40" y="40" width="640" height="160"/></clipPath>
        <clipPath id="ssClipBot"><rect x="40" y="220" width="640" height="160"/></clipPath>
      </defs>
      <!-- upper block (moves right) -->
      <g clip-path="url(#ssClipTop)">
        <g class="ss-blk ss-top">
          <rect x="-60" y="40" width="840" height="160" fill="#e6e1d6"/>
          <rect x="-60" y="40" width="840" height="22" fill="${STRATA[1]}"/>
          <rect x="-60" y="96" width="840" height="30" fill="${STRATA[0]}"/>
          <rect x="-60" y="150" width="840" height="26" fill="${STRATA[2]}"/>
          <rect x="296" y="40" width="10" height="160" fill="var(--quake)" opacity=".85"/>
        </g>
      </g>
      <!-- lower block (moves left) -->
      <g clip-path="url(#ssClipBot)">
        <g class="ss-blk ss-bot">
          <rect x="-60" y="220" width="840" height="160" fill="#dcd6c8"/>
          <rect x="-60" y="220" width="840" height="24" fill="${STRATA[1]}"/>
          <rect x="-60" y="280" width="840" height="30" fill="${STRATA[0]}"/>
          <rect x="-60" y="338" width="840" height="24" fill="${STRATA[2]}"/>
          <rect x="296" y="220" width="10" height="160" fill="var(--quake)" opacity=".85"/>
        </g>
      </g>
      <!-- fault trace -->
      <line x1="40" y1="210" x2="680" y2="210" stroke="var(--ink)" stroke-width="3"/>
      <!-- opposing motion arrows -->
      <g class="ss-arr">
        <path d="M470 120 h120 M566 102 l28 18 -28 18" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M250 300 h-120 M154 282 l-28 18 28 18" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`;
  }

  function dipSlip(mode) {
    // mode 'normal' (hanging wall drops) or 'reverse' (hanging wall rides up)
    const drop = mode === 'normal';
    const anim = drop ? 'nfDrop' : 'rfUp';
    const arr = drop
      // extension: arrows point outward
      ? `<path d="M250 70 h-150 M118 52 l-28 18 28 18" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M470 70 h150 M602 52 l28 18 -28 18" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
      // compression: arrows point inward
      : `<path d="M100 70 h150 M222 52 l28 18 -28 18" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M620 70 h-150 M498 52 l-28 18 28 18" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
    const kf = drop
      ? `@keyframes nfDrop{0%,12%{transform:translate(0,0)}58%,74%{transform:translate(26px,54px)}100%{transform:translate(0,0)}}`
      : `@keyframes rfUp{0%,12%{transform:translate(0,0)}58%,74%{transform:translate(-26px,-50px)}100%{transform:translate(0,0)}}`;
    // hanging wall is the block resting ON the dipping fault plane (right side).
    return `<svg class="mech" viewBox="0 0 720 420" role="img" aria-label="${mode} fault">
      <style>
        .df-hw{transform-box:fill-box;animation:${anim} 4.8s ease-in-out infinite}
        .df-arr{opacity:0;animation:dfArr 4.8s ease-in-out infinite}
        @keyframes dfArr{0%,12%{opacity:0}34%,72%{opacity:1}90%,100%{opacity:0}}
        ${kf}
      </style>
      <defs>
        <clipPath id="dfClip"><rect x="40" y="110" width="640" height="270"/></clipPath>
      </defs>
      <g clip-path="url(#dfClip)">
        <!-- footwall (left, fixed) : everything left of the dipping plane -->
        <g>
          <path d="M40 110 H470 L300 380 H40 Z" fill="#dcd6c8"/>
          <path d="M40 110 H470 L455 134 H40 Z" fill="${STRATA[1]}"/>
          <path d="M40 168 H432 L417 192 H40 Z" fill="${STRATA[0]}"/>
          <path d="M40 230 H395 L380 254 H40 Z" fill="${STRATA[2]}"/>
        </g>
        <!-- hanging wall (right, moves) : block on top of the dipping plane -->
        <g class="df-hw">
          <path d="M470 110 H680 V380 H300 Z" fill="#e6e1d6"/>
          <path d="M470 110 H680 V134 H455 Z" fill="${STRATA[1]}"/>
          <path d="M432 168 H680 V192 H417 Z" fill="${STRATA[0]}"/>
          <path d="M395 230 H680 V254 H380 Z" fill="${STRATA[2]}"/>
        </g>
      </g>
      <!-- fault plane -->
      <line x1="470" y1="110" x2="300" y2="380" stroke="var(--quake)" stroke-width="5"/>
      <!-- ground surface -->
      <line x1="40" y1="110" x2="680" y2="110" stroke="var(--ink)" stroke-width="3"/>
      <g class="df-arr">${arr}</g>
    </svg>`;
  }

  function subduction() {
    return `<svg class="mech" viewBox="0 0 720 420" role="img" aria-label="subduction megathrust and tsunami">
      <style>
        .sb-over{transform-box:fill-box;transform-origin:center;animation:sbSnap 5.4s cubic-bezier(.2,.9,.3,1) infinite}
        @keyframes sbSnap{0%,46%{transform:translate(0,0)}52%{transform:translate(-6px,-20px)}60%,100%{transform:translate(0,0)}}
        .sb-ocean{transform-box:fill-box;animation:sbPush 5.4s ease-in infinite}
        @keyframes sbPush{0%{transform:translate(40px,18px)}46%{transform:translate(0,0)}52%{transform:translate(4px,6px)}100%{transform:translate(40px,18px)}}
        .sb-wave{opacity:0;animation:sbWave 5.4s ease-out infinite}
        @keyframes sbWave{0%,50%{opacity:0;transform:translateX(0)}56%{opacity:1}99%{opacity:0;transform:translateX(-300px)}100%{opacity:0}}
        .sb-bulge{transform-box:fill-box;animation:sbBulge 5.4s ease-out infinite}
        @keyframes sbBulge{0%,48%{transform:scaleY(1)}54%{transform:scaleY(1.7)}66%,100%{transform:scaleY(1)}}
        .sb-star{opacity:0;animation:sbStar 5.4s ease-out infinite}
        @keyframes sbStar{0%,48%{opacity:0;transform:scale(.4)}53%{opacity:1;transform:scale(1)}64%{opacity:0;transform:scale(1.5)}100%{opacity:0}}
      </style>
      <!-- sky / sea -->
      <rect x="40" y="60" width="640" height="80" fill="rgba(38,110,150,.16)"/>
      <g class="sb-bulge" style="transform-origin:300px 140px">
        <path class="sb-wave-base" d="M40 140 H680" stroke="var(--tsunami)" stroke-width="0" fill="none"/>
      </g>
      <!-- tsunami crest travelling toward the coast (left) -->
      <g class="sb-wave">
        <path d="M300 140 q-26 -46 -52 0 q-26 44 -52 0" fill="none" stroke="var(--tsunami)" stroke-width="6" stroke-linecap="round"/>
      </g>
      <!-- overriding (continental) plate, left -->
      <g class="sb-over">
        <path d="M40 140 H300 L250 250 L40 300 Z" fill="#e6e1d6"/>
        <path d="M40 140 H300 L286 168 H40 Z" fill="${STRATA[1]}"/>
      </g>
      <!-- subducting (oceanic) plate, sliding down-left -->
      <g class="sb-ocean">
        <path d="M300 150 H700 V210 L330 330 L300 250 Z" fill="#cfc8b8"/>
        <path d="M300 150 H700 V176 L322 296 L300 240 Z" fill="${STRATA[1]}"/>
      </g>
      <!-- locked-zone rupture star -->
      <g class="sb-star" style="transform-origin:300px 200px">
        <path d="M300 168 l10 26 27 6 -21 18 6 28 -22 -15 -22 15 6 -28 -21 -18 27 -6 Z" fill="var(--quake)"/>
      </g>
      <line x1="40" y1="140" x2="680" y2="140" stroke="var(--tsunami)" stroke-width="2" opacity=".5"/>
    </svg>`;
  }

  function flare() {
    return `<svg class="mech" viewBox="0 0 720 420" role="img" aria-label="solar flare radio blackout">
      <style>
        .fl-burst{transform-box:fill-box;transform-origin:160px 210px;animation:flBurst 4.4s ease-in-out infinite}
        @keyframes flBurst{0%,30%{transform:scale(1);opacity:.9}40%{transform:scale(1.18);opacity:1}55%,100%{transform:scale(1);opacity:.9}}
        .fl-ray{stroke-dasharray:18 22;animation:flRay 4.4s linear infinite}
        @keyframes flRay{0%,32%{opacity:0;stroke-dashoffset:0}40%{opacity:1}100%{opacity:.9;stroke-dashoffset:-320}}
        .fl-black{opacity:0;animation:flBlack 4.4s ease-out infinite}
        @keyframes flBlack{0%,52%{opacity:0}60%{opacity:.85}82%,100%{opacity:0}}
        .fl-sig{animation:flSig 4.4s ease-in-out infinite}
        @keyframes flSig{0%,55%{opacity:1}62%{opacity:.15}88%,100%{opacity:1}}
        .fl-x{opacity:0;animation:flX 4.4s ease-out infinite}
        @keyframes flX{0%,58%{opacity:0;transform:scale(.5)}66%{opacity:1;transform:scale(1)}84%,100%{opacity:0}}
      </style>
      <!-- Sun -->
      <g class="fl-burst">
        <circle cx="160" cy="210" r="78" fill="var(--flare)"/>
        <circle cx="160" cy="210" r="78" fill="none" stroke="var(--flare)" stroke-width="4" opacity=".4"/>
        <path d="M196 150 q34 -10 40 -42 q10 34 42 40 q-34 10 -40 42 q-10 -34 -42 -40 Z" fill="var(--flare)" opacity=".9"/>
      </g>
      <!-- X-ray rays toward Earth -->
      <g class="fl-ray-g">
        <line class="fl-ray" x1="250" y1="180" x2="540" y2="150" stroke="var(--flare)" stroke-width="5" stroke-linecap="round"/>
        <line class="fl-ray" x1="252" y1="210" x2="544" y2="210" stroke="var(--flare)" stroke-width="5" stroke-linecap="round" style="animation-delay:.15s"/>
        <line class="fl-ray" x1="250" y1="240" x2="540" y2="270" stroke="var(--flare)" stroke-width="5" stroke-linecap="round" style="animation-delay:.07s"/>
      </g>
      <!-- Earth (dayside faces the Sun) -->
      <g>
        <circle cx="600" cy="210" r="60" fill="#dcd6c8"/>
        <path d="M600 150 a60 60 0 0 0 0 120 Z" fill="#e6e1d6"/>
        <!-- ionosphere arc on the dayside -->
        <path d="M548 168 a60 60 0 0 0 0 84" fill="none" stroke="var(--tsunami)" stroke-width="3" opacity=".6"/>
        <!-- blackout flush on the dayside -->
        <path class="fl-black" d="M600 150 a60 60 0 0 0 0 120 Z" fill="var(--quake)"/>
      </g>
      <!-- ground radio link that drops out -->
      <g class="fl-sig">
        <path d="M566 300 q34 -28 68 0" fill="none" stroke="var(--ink)" stroke-width="4" opacity=".5"/>
        <path d="M576 312 q24 -18 48 0" fill="none" stroke="var(--ink)" stroke-width="4" opacity=".7"/>
      </g>
      <g class="fl-x" style="transform-box:fill-box;transform-origin:600px 306px">
        <path d="M588 294 l24 24 M612 294 l-24 24" stroke="var(--quake)" stroke-width="6" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  function volcano() {
    return `<svg class="mech" viewBox="0 0 720 420" role="img" aria-label="volcanic eruption">
      <style>
        .vo-plume circle{transform-box:fill-box;transform-origin:center}
        .vo-p1{animation:voP 3.6s ease-out infinite}
        .vo-p2{animation:voP 3.6s ease-out infinite;animation-delay:.6s}
        .vo-p3{animation:voP 3.6s ease-out infinite;animation-delay:1.2s}
        .vo-p4{animation:voP 3.6s ease-out infinite;animation-delay:1.8s}
        .vo-p5{animation:voP 3.6s ease-out infinite;animation-delay:2.4s}
        @keyframes voP{0%{opacity:0;transform:translateY(0) scale(.4)}20%{opacity:.85}100%{opacity:0;transform:translateY(-150px) scale(1.7)}}
        .vo-glow{transform-box:fill-box;transform-origin:center;animation:voGlow 2.4s ease-in-out infinite}
        @keyframes voGlow{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
        .vo-lava{animation:voLava 2.4s ease-in-out infinite}
        @keyframes voLava{0%,100%{opacity:.5}50%{opacity:1}}
      </style>
      <!-- rising ash plume (drawn first, behind the cone top) -->
      <g class="vo-plume" fill="rgba(44,42,39,.5)">
        <circle class="vo-p1" cx="360" cy="150" r="30"/>
        <circle class="vo-p2" cx="338" cy="150" r="26"/>
        <circle class="vo-p3" cx="384" cy="150" r="24"/>
        <circle class="vo-p4" cx="352" cy="150" r="34"/>
        <circle class="vo-p5" cx="372" cy="150" r="22"/>
      </g>
      <!-- volcano cone -->
      <path d="M150 360 L320 150 H400 L570 360 Z" fill="#dcd6c8"/>
      <path d="M150 360 L320 150 H400 L570 360 Z" fill="none" stroke="var(--ink)" stroke-width="2" opacity=".25"/>
      <!-- crater glow + lava spatter -->
      <ellipse class="vo-glow" cx="360" cy="156" rx="34" ry="12" fill="var(--quake)"/>
      <path class="vo-lava" d="M344 156 q16 -34 32 0" fill="none" stroke="var(--quake)" stroke-width="6" stroke-linecap="round"/>
      <!-- conduit + magma chamber -->
      <rect x="350" y="156" width="20" height="180" fill="var(--quake)" opacity=".5"/>
      <ellipse class="vo-glow" cx="360" cy="356" rx="74" ry="34" fill="var(--quake)" opacity=".55"/>
      <line x1="120" y1="360" x2="600" y2="360" stroke="var(--ink)" stroke-width="3"/>
    </svg>`;
  }

  function svg(kind) {
    switch (kind) {
      case 'normal': return dipSlip('normal');
      case 'reverse': return dipSlip('reverse');
      case 'subduction': return subduction();
      case 'flare': return flare();
      case 'volcano': return volcano();
      case 'strike-slip':
      default: return strikeSlip();
    }
  }

  window.Mechanisms = { svg, label, classifyFault };
})();
