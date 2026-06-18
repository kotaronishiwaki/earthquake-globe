/**
 * quake-post.js
 * 一定マグニチュード以上の新規地震を検知し、震源国の言語で
 * Bluesky / Mastodon に自動投稿します（どちらも API 無料）。
 *
 * GitHub Actions の cron で 5 分ごとに実行されます。
 * 投稿には地球儀 + 震源を描いたシェア画像（share-image.js）を添付します。
 */

// ─────────────────────────────────────────────
// 設定（GitHub Variables / Secrets で上書き可）
// ─────────────────────────────────────────────

// 投稿対象とする最小マグニチュード
const MIN_MAG = parseFloat(process.env.MIN_MAG || '4.5');

// 投稿済み地震IDを記録する状態ファイル（リポジトリにコミットされる）
const fs = require('fs');
const path = require('path');
const { renderShareCard } = require('./share-image');
const STATE_FILE = path.join(__dirname, 'posted.json');

// 状態記録の保持期間（USGSフィードは過去1時間なので3時間あれば十分）
const STATE_TTL_MS = 3 * 60 * 60 * 1000;

// 初回実行時に過去フィードからさかのぼって投稿する最大件数（スパム防止の上限）
const BACKFILL_CAP = parseInt(process.env.BACKFILL_CAP || '6', 10);

// 公開サイトの URL（GitHub Variables の SITE_URL で上書き可）
const SITE_URL = process.env.SITE_URL || 'https://globelabo.netlify.app/';

// USGS M4.5+ 過去1時間フィード
const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.geojson';

// ─────────────────────────────────────────────
// 言語検出：USGS の place 文字列から震源国を推定
// ─────────────────────────────────────────────

const COUNTRY_LANG = {
  ja: ['japan'],
  zh: ['china', 'yunnan', 'sichuan', 'xinjiang', 'qinghai', 'gansu', 'taiwan'],
  hi: ['india', 'nepal', 'bangladesh', 'bhutan'],
  es: [
    'mexico', 'chile', 'peru', 'colombia', 'argentina', 'ecuador',
    'bolivia', 'venezuela', 'costa rica', 'guatemala', 'honduras',
    'nicaragua', 'el salvador', 'panama', 'dominican republic',
    'puerto rico', 'spain', 'paraguay', 'uruguay', 'cuba',
  ],
  ar: [
    'saudi arabia', 'yemen', 'jordan', 'egypt', 'morocco', 'algeria',
    'tunisia', 'libya', 'syria', 'oman', 'kuwait', 'bahrain',
    'qatar', 'united arab emirates', 'uae', 'iraq', 'djibouti',
  ],
};

function detectLang(place) {
  const p = (place || '').toLowerCase();
  const region = p.split(',').pop().trim();  // 最後のカンマ以降が国名に近い
  for (const [lang, keywords] of Object.entries(COUNTRY_LANG)) {
    if (keywords.some(kw => region.includes(kw) || p.includes(kw))) return lang;
  }
  return 'en'; // デフォルト
}

// ─────────────────────────────────────────────
// 投稿文テンプレート（6言語）
// ─────────────────────────────────────────────

function timeAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : `${m} min ago`;
}

// 世界共通の絶対時刻（UTC）。相対時刻は投稿時点で凍結するため併記する。
function fmtUTC(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

// 相対時刻 + UTC絶対時刻を1行にまとめる
function whenLine(ms) {
  return `🕒 ${timeAgo(ms)} · ${fmtUTC(ms)}`;
}

// 津波フラグが立っているときだけ挿入される警告行（震源国の言語）
const TSUNAMI_LINE = {
  en: '🌊 Tsunami may be possible — stay away from the coast',
  ja: '🌊 津波のおそれ — 海岸に近づかないでください',
  zh: '🌊 可能引发海啸 — 请远离海岸',
  hi: '🌊 सुनामी संभव — तट से दूर रहें',
  es: '🌊 Posible tsunami — aléjese de la costa',
  ar: '🌊 احتمال حدوث تسونامي — ابتعدوا عن الساحل',
};

// 津波フラグ時に追加するハッシュタグ
const TSUNAMI_TAG = {
  en: ' #tsunami', ja: ' #津波 #tsunami', zh: ' #海啸 #tsunami',
  hi: ' #सुनामी #tsunami', es: ' #tsunami', ar: ' #تسونامي #tsunami',
};

function tsu(q, lang) {
  return q.tsunami ? TSUNAMI_LINE[lang] + '\n' : '';
}
function tsuTag(q, lang) {
  return q.tsunami ? (TSUNAMI_TAG[lang] || ' #tsunami') : '';
}

const TEMPLATES = {
  en: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} earthquake\n${tsu(q, 'en')}📍 ${q.place}\n📏 Depth: ${Math.round(q.depth)} km\n${whenLine(q.time)}\n🔗 ${url}\n#earthquake #seismic${tsuTag(q, 'en')}`,

  ja: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} の地震が発生しました\n${tsu(q, 'ja')}📍 ${q.place}\n📏 深さ: ${Math.round(q.depth)} km\n${whenLine(q.time)}\n🔗 ${url}\n#地震 #earthquake${tsuTag(q, 'ja')}`,

  zh: (q, url) =>
    `🌍 发生 M${q.mag.toFixed(1)} 地震\n${tsu(q, 'zh')}📍 ${q.place}\n📏 深度：${Math.round(q.depth)} 公里\n${whenLine(q.time)}\n🔗 ${url}\n#地震 #earthquake${tsuTag(q, 'zh')}`,

  hi: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} भूकंप आया\n${tsu(q, 'hi')}📍 ${q.place}\n📏 गहराई: ${Math.round(q.depth)} km\n${whenLine(q.time)}\n🔗 ${url}\n#भूकंप #earthquake${tsuTag(q, 'hi')}`,

  es: (q, url) =>
    `🌍 Sismo M${q.mag.toFixed(1)}\n${tsu(q, 'es')}📍 ${q.place}\n📏 Profundidad: ${Math.round(q.depth)} km\n${whenLine(q.time)}\n🔗 ${url}\n#sismo #terremoto #earthquake${tsuTag(q, 'es')}`,

  ar: (q, url) =>
    `🌍 زلزال بقوة M${q.mag.toFixed(1)}\n${tsu(q, 'ar')}📍 ${q.place}\n📏 العمق: ${Math.round(q.depth)} كم\n${whenLine(q.time)}\n🔗 ${url}\n#زلزال #earthquake${tsuTag(q, 'ar')}`,
};

// ─────────────────────────────────────────────
// Bluesky 投稿（facets でリンク・ハッシュタグをクリック可能にする）
// ─────────────────────────────────────────────

// リンクカード（Bluesky の外部カード）用のタイトル・説明
const CARD = {
  en: { title:(m,p)=>`M${m} earthquake · ${p}`, desc:'Live 7-day earthquake map · Globe' },
  ja: { title:(m,p)=>`M${m} の地震 · ${p}`, desc:'過去7日間の地震をリアルタイム表示 · Globe' },
  zh: { title:(m,p)=>`M${m} 地震 · ${p}`, desc:'过去7天地震实时地图 · Globe' },
  hi: { title:(m,p)=>`M${m} भूकंप · ${p}`, desc:'पिछले 7 दिनों का लाइव भूकंप मानचित्र · Globe' },
  es: { title:(m,p)=>`Sismo M${m} · ${p}`, desc:'Mapa sísmico de 7 días en vivo · Globe' },
  ar: { title:(m,p)=>`زلزال M${m} · ${p}`, desc:'خريطة الزلازل الحية لآخر 7 أيام · Globe' },
};

const enc = new TextEncoder();
function byteLen(str) { return enc.encode(str).length; }

// text 内の URL と #ハッシュタグを検出して facets を組み立てる
function buildFacets(text) {
  const facets = [];

  // リンク
  const urlRe = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    const start = byteLen(text.slice(0, m.index));
    facets.push({
      index: { byteStart: start, byteEnd: start + byteLen(m[0]) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
    });
  }

  // ハッシュタグ（日本語・多言語対応）
  const tagRe = /#([^\s#]+)/g;
  while ((m = tagRe.exec(text)) !== null) {
    const start = byteLen(text.slice(0, m.index));
    facets.push({
      index: { byteStart: start, byteEnd: start + byteLen(m[0]) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }],
    });
  }

  return facets;
}

async function postToBluesky(text, lang, img, q, deepUrl) {
  const identifier = process.env.BLUESKY_HANDLE;        // 例: yourname.bsky.social
  const password = process.env.BLUESKY_APP_PASSWORD;    // アプリパスワード
  if (!identifier || !password) return false;           // 未設定ならスキップ

  // 1) セッション作成
  const sessRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!sessRes.ok) throw new Error(`Bluesky login failed: ${sessRes.status} ${await sessRes.text()}`);
  const { accessJwt, did } = await sessRes.json();

  // 2) 画像をサムネとしてアップロード（カードの絵に使う）
  let thumb = null;
  if (img) {
    try {
      const upRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${accessJwt}` },
        body: img,
      });
      if (!upRes.ok) throw new Error(`${upRes.status} ${await upRes.text()}`);
      thumb = (await upRes.json()).blob;
    } catch (err) {
      console.error('  (Bluesky thumbnail upload skipped:', err.message + ')');
    }
  }

  // 3) 外部リンクカード（カード全体がサイトに飛ぶ）として投稿
  const card = CARD[lang] || CARD.en;
  const external = {
    uri: deepUrl,
    title: card.title(q.mag.toFixed(1), q.place),
    description: card.desc,
  };
  if (thumb) external.thumb = thumb;

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    facets: buildFacets(text),
    langs: [lang],
    createdAt: new Date().toISOString(),
    embed: { $type: 'app.bsky.embed.external', external },
  };
  const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
  });
  if (!postRes.ok) throw new Error(`Bluesky post failed: ${postRes.status} ${await postRes.text()}`);
  return true;
}

// ─────────────────────────────────────────────
// Mastodon 投稿
// 投稿文の URL から Mastodon が自動でOGPリンクカードを生成します
// （サイトに og:image / og:title を設定済み）。画像は添付しません。
// ─────────────────────────────────────────────

async function postToMastodon(text, lang) {
  const base = process.env.MASTODON_BASE_URL;     // 例: https://mastodon.social
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!base || !token) return false;              // 未設定ならスキップ
  const root = base.replace(/\/$/, '');

  const res = await fetch(`${root}/api/v1/statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: text, language: lang, visibility: 'public' }),
  });
  if (!res.ok) throw new Error(`Mastodon post failed: ${res.status} ${await res.text()}`);
  return true;
}

// ─────────────────────────────────────────────
// メイン処理
// ─────────────────────────────────────────────

async function main() {
  // USGS から M4.5+ 過去1時間の地震を取得
  let features;
  try {
    const res = await fetch(USGS_URL);
    if (!res.ok) throw new Error(`USGS fetch failed: ${res.status}`);
    const data = await res.json();
    features = data.features || [];
  } catch (err) {
    console.error('Failed to fetch USGS data:', err.message);
    process.exit(1);
  }

  console.log(`Fetched ${features.length} earthquakes from USGS`);

  // 投稿済み記録を読み込む
  const state = loadState();
  const firstRun = Object.keys(state).length === 0;

  // MIN_MAG 以上 かつ まだ投稿していない地震に絞り込む
  let candidates = features.filter(
    f => (f.properties.mag || 0) >= MIN_MAG && !state[f.id]
  );
  // 古いものから順に投稿
  candidates.sort((a, b) => a.properties.time - b.properties.time);

  console.log(`${candidates.length} new earthquakes ≥ M${MIN_MAG} not yet posted`);

  // 初回実行（記録ファイルなし）でも、直近の地震は投稿する（取りこぼし防止）。
  // ただし過去1時間分を大量に出さないよう、新しい順に最大 BACKFILL_CAP 件に制限。
  if (firstRun && candidates.length > BACKFILL_CAP) {
    const dropped = candidates.slice(0, candidates.length - BACKFILL_CAP);
    for (const f of dropped) state[f.id] = f.properties.time;  // 古い超過分は記録だけ
    candidates = candidates.slice(candidates.length - BACKFILL_CAP);
    console.log(`First run: capped backfill to the ${BACKFILL_CAP} most recent quakes.`);
  }

  if (candidates.length === 0) {
    console.log('No new earthquakes to post.');
    saveState(state);
    return;
  }

  let posted = 0;
  for (const f of candidates) {
    const q = {
      id:      f.id,
      mag:     f.properties.mag || 0,
      place:   f.properties.place || 'Unknown location',
      depth:   f.geometry.coordinates[2] || 0,
      time:    f.properties.time,
      tsunami: f.properties.tsunami === 1,  // USGS の津波フラグ
      lon:     f.geometry.coordinates[0],
      lat:     f.geometry.coordinates[1],
    };

    const lang = detectLang(q.place);
    const tmpl = TEMPLATES[lang] || TEMPLATES.en;

    // 深リンク：この地震の詳細に直接飛べる URL
    const deepUrl = `${SITE_URL.replace(/\/$/, '')}/#eq=${encodeURIComponent(q.id)}`;
    const text = tmpl(q, deepUrl);
    // Bluesky はカードがリンクを担うので、本文からは URL 行を省く
    const textNoUrl = text.split('\n').filter(l => !l.startsWith('🔗')).join('\n');

    // シェア画像（地球儀 + 震源）を生成。Bluesky のカードのサムネに使う。
    const img = await renderShareCard(q);
    if (img) console.log(`  (share image: ${(img.length / 1024).toFixed(0)} KB)`);

    console.log(`\n--- Posting in [${lang}] for ${q.id} ---`);
    console.log(text);

    // それぞれ独立して投稿（片方が失敗しても、もう片方は続行）
    let ok = false;
    try {
      if (await postToBluesky(textNoUrl, lang, img, q, deepUrl)) { console.log('✅ Bluesky: posted'); ok = true; }
    } catch (err) {
      console.error('❌ Bluesky failed:', err.message);
    }
    try {
      if (await postToMastodon(text, lang)) { console.log('✅ Mastodon: posted'); ok = true; }
    } catch (err) {
      console.error('❌ Mastodon failed:', err.message);
    }

    // 少なくとも片方に投稿できたら「投稿済み」として記録
    // （全滅した場合は記録せず、次回に再試行する）
    if (ok) { state[q.id] = q.time; posted++; }

    // 連続投稿の間に少し待機
    if (candidates.indexOf(f) < candidates.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 投稿済み記録を保存（次回の重複防止）
  saveState(state);

  console.log(`\nDone: posted ${posted}/${candidates.length} earthquakes.`);
}

// ─────────────────────────────────────────────
// 投稿済み状態の読み書き（posted.json）
// ─────────────────────────────────────────────

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch {
    return {}; // 初回はファイルなし
  }
}

function saveState(state) {
  // TTL を過ぎた古い記録を剪定（ファイルの肥大化を防ぐ）
  const cutoff = Date.now() - STATE_TTL_MS;
  const pruned = {};
  for (const [id, t] of Object.entries(state)) {
    if (t >= cutoff) pruned[id] = t;
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(pruned, null, 0));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
