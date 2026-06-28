/* Globe Weekly — broadcast globe.
   d3 orthographic globe that auto-rotates, flies to events, and plots
   quake / volcano / flare markers with ripples. Adapted from the site's map.
   Requires d3 v7 and topojson-client to be loaded first. */

(function () {
  const COL = {
    ocean: '#f1eee8',
    land: '#2c2a27',
    hair: '#f1eee8',
    grat: 'rgba(44,42,39,0.12)',
    ring: '#2c2a27',
    plate: '207,79,46',
    quake: '207,79,46',
    volcano: '181,104,58',
    flare: '199,154,34',
    tsunami: '38,110,150',
    white: '241,238,232',
  };

  function colFor(kind) {
    if (kind === 'volcano') return COL.volcano;
    if (kind === 'flare') return COL.flare;
    return COL.quake;
  }

  class Globe {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.SIZE = opts.size || 760;
      this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = this.SIZE * this.dpr;
      canvas.height = this.SIZE * this.dpr;
      this.ctx.scale(this.dpr, this.dpr);
      this.C = this.SIZE / 2;
      this.R = this.SIZE * 0.46;
      this.TILT = -15;
      this.projection = d3.geoOrthographic().scale(this.R).translate([this.C, this.C]).clipAngle(90);
      this.path = d3.geoPath(this.projection, this.ctx);
      this.graticule = d3.geoGraticule10();
      this.land = null; this.borders = null; this.plates = null;
      this.events = [];
      this.focusIdx = -1;
      this.rot = [0, this.TILT, 0];      // current rotation
      this.target = null;                // {lon, lat} fly target
      this.spin = true;
      this.t0 = performance.now();
      this.last = this.t0;
      this._loadMaps();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    async _loadMaps() {
      try {
        const world = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json());
        this.land = topojson.merge(world, world.objects.countries.geometries);
        this.borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
      } catch (e) { /* offline: still renders ocean + markers */ }
      try {
        this.plates = await fetch('https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_boundaries.json').then(r => r.json());
      } catch (e) {}
    }

    setEvents(list) { this.events = (list || []).map(e => ({ ...e })); }

    // fly the globe so coords face the viewer; pulse-focus that event if idx given
    flyTo(coords, idx = -1) {
      if (!coords) return;
      this.target = { lon: coords[0], lat: coords[1], start: performance.now(), from: this.rot.slice() };
      this.focusIdx = idx;
    }
    focusEvent(idx) {
      const e = this.events[idx];
      if (e) this.flyTo(e.coords, idx);
    }
    clearFocus() { this.focusIdx = -1; }

    _ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    _loop(now) {
      const dt = Math.min(60, now - this.last); this.last = now;
      // rotation
      if (this.target) {
        const k = Math.min(1, (now - this.target.start) / 1200);
        const e = this._ease(k);
        const want = [-this.target.lon, -this.target.lat - 0, 0];
        // shortest-path longitude interp
        let dl = want[0] - this.target.from[0];
        while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
        this.rot[0] = this.target.from[0] + dl * e;
        this.rot[1] = this.target.from[1] + (Math.max(-55, Math.min(55, want[1])) - this.target.from[1]) * e;
        if (k >= 1) this.target = null;
      } else if (this.spin) {
        this.rot[0] -= dt * 0.0045 * 60 / 60 * 0.18;
      }
      this._draw((now - this.t0) / 1000);
      requestAnimationFrame(this._loop);
    }

    _draw(tSec) {
      const ctx = this.ctx, C = this.C, R = this.R;
      this.projection.rotate([this.rot[0], this.rot[1], 0]);
      ctx.clearRect(0, 0, this.SIZE, this.SIZE);

      // disc clip
      ctx.save();
      ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.fillStyle = COL.ocean; ctx.fill();
      if (this.land) {
        ctx.beginPath(); this.path(this.land); ctx.fillStyle = COL.land; ctx.fill();
        ctx.beginPath(); this.path(this.graticule); ctx.lineWidth = 0.6; ctx.strokeStyle = COL.grat; ctx.stroke();
        ctx.beginPath(); this.path(this.borders); ctx.lineWidth = 0.7; ctx.strokeStyle = COL.hair; ctx.stroke();
      }
      if (this.plates) {
        ctx.save(); ctx.beginPath(); this.path(this.plates);
        ctx.lineWidth = 1.1; ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(' + COL.plate + ',0.5)'; ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
      this._drawEvents(tSec);
      ctx.restore();

      // rim
      ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.lineWidth = 1.4; ctx.strokeStyle = COL.ring; ctx.stroke();
    }

    _magDot(e) {
      if (e.kind === 'volcano') return 6.5;
      if (e.kind === 'flare') return 6;
      return Math.max(3.5, 2.4 + (e.mag - 4) * 2.0);
    }

    _drawEvents(tSec) {
      if (!this.events.length) return;
      const ctx = this.ctx;
      const rot = this.projection.rotate(), cen = [-rot[0], -rot[1]];
      this.events.forEach((e, i) => {
        if (d3.geoDistance(e.coords, cen) >= Math.PI / 2) return;
        const p = this.projection(e.coords); if (!p) return;
        const col = colFor(e.kind);
        const dotR = this._magDot(e);
        const focused = i === this.focusIdx;

        // ripple
        const ph = (tSec / 2.2 + i * 0.27) % 1;
        const ripR = dotR + ph * (focused ? 34 : 20);
        const ripO = (1 - ph) * (focused ? 0.6 : 0.32);
        if (ripO > 0.01) {
          ctx.beginPath(); ctx.arc(p[0], p[1], ripR, 0, Math.PI * 2);
          ctx.lineWidth = focused ? 2 : 1.4; ctx.strokeStyle = 'rgba(' + col + ',' + ripO.toFixed(3) + ')'; ctx.stroke();
        }
        // tsunami blue rings
        if (e.tsunami) {
          for (let j = 0; j < 2; j++) {
            const wp = ((tSec / 2.6) + j * 0.5) % 1;
            const wo = (1 - wp) * 0.45;
            if (wo > 0.01) {
              ctx.beginPath(); ctx.arc(p[0], p[1], dotR + wp * 30, 0, Math.PI * 2);
              ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(' + COL.tsunami + ',' + wo.toFixed(3) + ')'; ctx.stroke();
            }
          }
        }
        // marker
        ctx.beginPath(); ctx.arc(p[0], p[1], dotR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(' + col + ')'; ctx.fill();
        ctx.beginPath(); ctx.arc(p[0], p[1], dotR + 1.2, 0, Math.PI * 2);
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(' + COL.white + ',0.8)'; ctx.stroke();

        // focus crosshair + pulse
        if (focused) {
          const pulse = dotR + 8 + 3 * (0.5 + 0.5 * Math.sin(tSec * 3.2));
          ctx.beginPath(); ctx.arc(p[0], p[1], pulse, 0, Math.PI * 2);
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + col + ',0.95)'; ctx.stroke();
          ctx.strokeStyle = 'rgba(' + col + ',0.7)'; ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(p[0] - pulse - 7, p[1]); ctx.lineTo(p[0] - pulse, p[1]);
          ctx.moveTo(p[0] + pulse, p[1]); ctx.lineTo(p[0] + pulse + 7, p[1]);
          ctx.moveTo(p[0], p[1] - pulse - 7); ctx.lineTo(p[0], p[1] - pulse);
          ctx.moveTo(p[0], p[1] + pulse); ctx.lineTo(p[0], p[1] + pulse + 7);
          ctx.stroke();
        }
      });
    }
  }

  window.GlobeWeekly = Globe;
})();
