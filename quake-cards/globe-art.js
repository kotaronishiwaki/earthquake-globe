// Shared static globe artwork renderer for Globe Labo brand assets.
window.GlobeArt = (function () {
  let worldPromise = null;
  function loadWorld() {
    if (!worldPromise) {
      worldPromise = fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
        .then(r => r.json());
    }
    return worldPromise;
  }

  async function draw(canvas, o) {
    const COL = o.COL;
    const ctx = canvas.getContext('2d');
    const { cx, cy, R, centerLon, centerLat } = o;

    const world = await loadWorld();
    const land = topojson.merge(world, world.objects.countries.geometries);
    const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);

    const projection = d3.geoOrthographic()
      .scale(R).translate([cx, cy]).clipAngle(90)
      .rotate([-centerLon, -centerLat]);
    const path = d3.geoPath(projection, ctx);
    const graticule = d3.geoGraticule10();

    // ---- whirl (signature tilted elliptical comet) drawn behind + front ----
    const W = o.whirl;
    function whirlDots(wantFront) {
      if (!W) return;
      const tilt = W.tilt, ctn = Math.cos(tilt), stn = Math.sin(tilt);
      const dots = W.dots, gap = W.gap;
      for (let i = 0; i < dots; i++) {
        const f = i / (dots - 1);
        const a = W.phase - i * gap;
        const ox = W.A * Math.cos(a), oy = W.B * Math.sin(a);
        const x = cx + ox * ctn - oy * stn;
        const y = cy + ox * stn + oy * ctn;
        const front = Math.sin(a) >= 0;
        if (front !== wantFront) continue;
        const r = W.headR + (W.tailR - W.headR) * f;
        const op = W.headO * (1 - f) * (1 - f);
        if (op <= 0.003) continue;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + COL.whirl + ',' + op.toFixed(3) + ')'; ctx.fill();
      }
    }

    function clipDisc() { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); }

    whirlDots(false);

    // ocean disc
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = COL.ocean; ctx.fill();

    clipDisc();
    ctx.beginPath(); path(land); ctx.fillStyle = COL.land; ctx.fill();
    ctx.beginPath(); path(graticule);
    ctx.lineWidth = R * 0.0035; ctx.strokeStyle = 'rgba(44,42,39,0.13)'; ctx.stroke();
    ctx.beginPath(); path(borders);
    ctx.lineWidth = R * 0.0048; ctx.strokeStyle = COL.hair; ctx.stroke();
    ctx.restore();

    // sphere edge
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = R * 0.009; ctx.strokeStyle = COL.ring; ctx.stroke();

    whirlDots(true);

    // ---- seismic accent dots (only those on visible hemisphere) ----
    const cen = [centerLon, centerLat];
    clipDisc();
    (o.quakes || []).forEach(q => {
      if (d3.geoDistance([q.lon, q.lat], cen) >= Math.PI / 2) return;
      const p = projection([q.lon, q.lat]);
      if (!p) return;
      const dotR = R * (0.012 + (q.mag - 4.5) * 0.004);
      // ripple rings
      for (let k = 1; k <= 2; k++) {
        ctx.beginPath(); ctx.arc(p[0], p[1], dotR + k * dotR * 1.5, 0, Math.PI * 2);
        ctx.lineWidth = R * 0.004;
        ctx.strokeStyle = 'rgba(' + COL.quake + ',' + (0.42 / k).toFixed(3) + ')'; ctx.stroke();
      }
      // halo + core
      ctx.beginPath(); ctx.arc(p[0], p[1], dotR + R * 0.006, 0, Math.PI * 2);
      ctx.lineWidth = R * 0.006; ctx.strokeStyle = 'rgba(241,238,232,0.9)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], dotR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(' + COL.quake + ')'; ctx.fill();
    });
    ctx.restore();
  }

  return { draw, loadWorld };
})();

// Ring-of-Fire-ish accent points (lon, lat, mag) — recognizable seismic belt
window.RING_OF_FIRE = [
  { lon: 141, lat: 38, mag: 6.4 },  // Japan
  { lon: 121, lat: 23, mag: 5.2 },  // Taiwan
  { lon: 125, lat: 9,  mag: 5.6 },  // Philippines
  { lon: 120, lat: -3, mag: 6.0 },  // Sulawesi
  { lon: 134, lat: -5, mag: 5.0 },  // New Guinea
  { lon: 152, lat: 47, mag: 5.4 },  // Kuril
  { lon: 95,  lat: 4,  mag: 4.9 },  // Sumatra N
];
