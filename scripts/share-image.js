/**
 * share-image.js
 * 地震ごとに「地球儀 + 震源」を描いた 1200×630 のシェア画像（OGPカード）を生成します。
 * サイト本体（Globe Loader.html）と同じ配色・地球儀スタイルを Node 側で再現しています。
 *
 * 使い方:
 *   const { renderShareCard } = require('./share-image');
 *   const buf = await renderShareCard(quake); // JPEG の Buffer を返す（失敗時は null）
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { geoOrthographic, geoPath, geoGraticule10 } = require('d3-geo');
const topojson = require('topojson-client');

// ── サイトと同じ配色 ─────────────────────────────
const COL = {
  bg:      '#f1eee8',           // クリーム（背景 / 海）
  land:    '#2c2a27',           // ダークな大陸
  hair:    '#f1eee8',           // 国境（クリームで大陸を切り抜く）
  ring:    '#2c2a27',           // 地球儀の縁
  grid:    'rgba(241,238,232,0.18)', // 経緯線（ダーク大陸上に薄く）
  quake:   '#cf4f2e',           // 震源（オレンジ）
  tsunami: '#266e96',           // 津波（ブルー）
  ink:     '#2c2a27',
  muted:   '#8c887f',
};

const FONT = '"DejaVu Sans", "Liberation Sans", sans-serif';

// world-atlas を一度だけ取得してキャッシュ（同一実行内で再利用）
let _world = null;
async function loadWorld() {
  if (_world !== null) return _world;
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json');
    if (!res.ok) throw new Error('world-atlas fetch failed: ' + res.status);
    const w = await res.json();
    _world = {
      land:    topojson.merge(w, w.objects.countries.geometries),
      borders: topojson.mesh(w, w.objects.countries, (a, b) => a !== b),
    };
  } catch (err) {
    console.error('share-image: world map unavailable, drawing graticule only:', err.message);
    _world = { land: null, borders: null };
  }
  return _world;
}

// テキストを最大幅で折り返す（最大 maxLines 行、超過分は省略）
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const all = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { all.push(line); line = w; }
    else line = test;
  }
  if (line) all.push(line);
  if (all.length <= maxLines) return all;
  const kept = all.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (ctx.measureText(last + '…').width > maxWidth && /\s/.test(last)) {
    last = last.replace(/\s*\S+$/, '');
  }
  kept[maxLines - 1] = last.replace(/[,\s]+$/, '') + '…';
  return kept;
}

function timeAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h + (h === 1 ? ' hour ago' : ' hours ago');
}

/**
 * @param {{mag:number, place:string, depth:number, time:number, tsunami:boolean,
 *          lon:number, lat:number}} q
 * @returns {Promise<Buffer|null>} JPEG buffer（失敗時 null）
 */
async function renderShareCard(q) {
  try {
    const W = 1200, H = 630;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);

    // ── 地球儀（右側）────────────────────────────
    const cx = 870, cy = H / 2, R = 268;
    const { land, borders } = await loadWorld();

    const projection = geoOrthographic()
      .scale(R)
      .translate([cx, cy])
      .rotate([-q.lon, -q.lat]);   // 震源を正面中央に
    const path = geoPath(projection, ctx);

    // 海（クリームの円盤）
    ctx.beginPath(); path({ type: 'Sphere' });
    ctx.fillStyle = COL.bg; ctx.fill();

    if (land) {
      // 大陸（ダーク）
      ctx.beginPath(); path(land);
      ctx.fillStyle = COL.land; ctx.fill();
      // 経緯線（大陸上に薄いクリーム）— 大陸でクリップ
      ctx.save();
      ctx.beginPath(); path(land); ctx.clip();
      ctx.beginPath(); path(geoGraticule10());
      ctx.lineWidth = 0.6; ctx.strokeStyle = COL.grid; ctx.stroke();
      ctx.restore();
      // 国境（クリームで切り抜き）
      ctx.beginPath(); path(borders);
      ctx.lineWidth = 0.8; ctx.strokeStyle = COL.hair; ctx.stroke();
    } else {
      // 地図が取れない場合は経緯線のみ
      ctx.beginPath(); path(geoGraticule10());
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(44,42,39,0.18)'; ctx.stroke();
    }

    // 地球儀の縁
    ctx.beginPath(); path({ type: 'Sphere' });
    ctx.lineWidth = 2; ctx.strokeStyle = COL.ring; ctx.stroke();

    // ── 震源（中央）— リップル + ドット ─────────────
    const ep = projection([q.lon, q.lat]) || [cx, cy];
    const accent = q.tsunami ? COL.tsunami : COL.quake;
    const dotR = Math.max(7, Math.min(22, 4 + q.mag * 2.1));
    // リップル
    ctx.lineWidth = 3;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(ep[0], ep[1], dotR + i * (dotR * 0.9 + 6), 0, Math.PI * 2);
      ctx.strokeStyle = hexA(accent, 0.42 - i * 0.1);
      ctx.stroke();
    }
    // 白縁 + ドット
    ctx.beginPath(); ctx.arc(ep[0], ep[1], dotR + 3, 0, Math.PI * 2);
    ctx.fillStyle = COL.bg; ctx.fill();
    ctx.beginPath(); ctx.arc(ep[0], ep[1], dotR, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();

    // ── 左カラム（テキスト）────────────────────────
    const x = 72;
    ctx.textBaseline = 'alphabetic';

    // キッカー
    ctx.font = '600 22px ' + FONT;
    ctx.fillStyle = COL.muted;
    ctx.fillText('GLOBE · LIVE EARTHQUAKE MONITOR', x, 96);

    // マグニチュード（特大）
    ctx.font = '700 150px ' + FONT;
    ctx.fillStyle = accent;
    const magStr = 'M' + q.mag.toFixed(1);
    ctx.fillText(magStr, x - 4, 246);
    const magW = ctx.measureText(magStr).width;

    // 「earthquake」ラベル（M数値の右下に添える）
    ctx.font = '600 30px ' + FONT;
    ctx.fillStyle = COL.ink;
    ctx.fillText('earthquake', x - 4 + magW + 18, 246);

    // 震源地（最大2行）
    ctx.font = '600 40px ' + FONT;
    ctx.fillStyle = COL.ink;
    const placeLines = wrapText(ctx, q.place || 'Unknown location', 520, 2);
    let ty = 312;
    for (const ln of placeLines) { ctx.fillText(ln, x, ty); ty += 50; }

    // メタ情報（深さ・経過時間）
    ctx.font = '500 28px ' + FONT;
    ctx.fillStyle = COL.muted;
    ctx.fillText(`Depth ${Math.round(q.depth)} km  ·  ${timeAgo(q.time)}`, x, ty + 14);

    // 津波バナー
    if (q.tsunami) {
      const by = ty + 44;
      const label = 'TSUNAMI MAY BE POSSIBLE';
      ctx.font = '700 24px ' + FONT;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = hexA(COL.tsunami, 0.12);
      roundRect(ctx, x, by, tw + 76, 50, 8); ctx.fill();
      ctx.fillStyle = COL.tsunami;
      // 波アイコン
      ctx.lineWidth = 3; ctx.strokeStyle = COL.tsunami;
      drawWave(ctx, x + 18, by + 25);
      ctx.fillText(label, x + 52, by + 33);
    }

    // フッター（サイトドメイン）
    ctx.font = '600 24px ' + FONT;
    ctx.fillStyle = COL.muted;
    ctx.fillText('exquisite-crumble-17f890.netlify.app', x, H - 48);

    return await canvas.encode('jpeg', 90);
  } catch (err) {
    console.error('share-image: render failed:', err.message);
    return null;
  }
}

// ── ヘルパー ───────────────────────────────────
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawWave(ctx, x, y) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + 5, y - 7, x + 11, y - 7, x + 16, y);
  ctx.bezierCurveTo(x + 21, y + 7, x + 27, y + 7, x + 32, y);
  ctx.stroke();
}

module.exports = { renderShareCard };
