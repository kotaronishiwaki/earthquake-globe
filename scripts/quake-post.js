/**
 * quake-post.js
 * 一定マグニチュード以上の新規地震を検知し、震源国の言語で
 * Bluesky / Mastodon に自動投稿します（どちらも API 無料）。
 *
 * GitHub Actions の cron で 5 分ごとに実行されます。
 * 外部ライブラリ不要 — Node.js 20+ の組み込み fetch だけで動きます。
 */

// ─────────────────────────────────────────────
// 設定（GitHub Variables / Secrets で上書き可）
// ─────────────────────────────────────────────

// 投稿対象とする最小マグニチュード
const MIN_MAG = parseFloat(process.env.MIN_MAG || '4.5');

// 検知ウィンドウ：「過去 N 分以内」に発生した地震を対象にする
// 実行間隔（5分）より少し広め（6分）にして取りこぼしを防ぐ
const WINDOW_MS = 6 * 60 * 1000;

// 公開サイトの URL（GitHub Variables の SITE_URL で上書き可）
const SITE_URL = process.env.SITE_URL || 'https://exquisite-crumble-17f890.netlify.app/';

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
    `🌍 M${q.mag.toFixed(1)} earthquake\n${tsu(q, 'en')}📍 ${q.place}\n📏 Depth: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#earthquake #seismic${tsuTag(q, 'en')}`,

  ja: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} の地震が発生しました\n${tsu(q, 'ja')}📍 ${q.place}\n📏 深さ: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#地震 #earthquake${tsuTag(q, 'ja')}`,

  zh: (q, url) =>
    `🌍 发生 M${q.mag.toFixed(1)} 地震\n${tsu(q, 'zh')}📍 ${q.place}\n📏 深度：${Math.round(q.depth)} 公里 · ${timeAgo(q.time)}\n🔗 ${url}\n#地震 #earthquake${tsuTag(q, 'zh')}`,

  hi: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} भूकंप आया\n${tsu(q, 'hi')}📍 ${q.place}\n📏 गहराई: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#भूकंप #earthquake${tsuTag(q, 'hi')}`,

  es: (q, url) =>
    `🌍 Sismo M${q.mag.toFixed(1)}\n${tsu(q, 'es')}📍 ${q.place}\n📏 Profundidad: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#sismo #terremoto #earthquake${tsuTag(q, 'es')}`,

  ar: (q, url) =>
    `🌍 زلزال بقوة M${q.mag.toFixed(1)}\n${tsu(q, 'ar')}📍 ${q.place}\n📏 العمق: ${Math.round(q.depth)} كم · ${timeAgo(q.time)}\n🔗 ${url}\n#زلزال #earthquake${tsuTag(q, 'ar')}`,
};

// ─────────────────────────────────────────────
// Bluesky 投稿（facets でリンク・ハッシュタグをクリック可能にする）
// ─────────────────────────────────────────────

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

async function postToBluesky(text, lang) {
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

  // 2) 投稿
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    facets: buildFacets(text),
    langs: [lang],
    createdAt: new Date().toISOString(),
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
// Mastodon 投稿（リンク・ハッシュタグは自動でリンク化される）
// ─────────────────────────────────────────────

async function postToMastodon(text, lang) {
  const base = process.env.MASTODON_BASE_URL;     // 例: https://mastodon.social
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!base || !token) return false;              // 未設定ならスキップ

  const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/statuses`, {
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

  // 対象ウィンドウ内 かつ MIN_MAG 以上に絞り込む
  const cutoff = Date.now() - WINDOW_MS;
  const fresh = features.filter(
    f => f.properties.time >= cutoff && (f.properties.mag || 0) >= MIN_MAG
  );

  console.log(`${fresh.length} earthquakes ≥ M${MIN_MAG} within the last ${WINDOW_MS / 60000} min`);

  if (fresh.length === 0) {
    console.log('No new earthquakes to post.');
    return;
  }

  let posted = 0;
  for (const f of fresh) {
    const q = {
      id:      f.id,
      mag:     f.properties.mag || 0,
      place:   f.properties.place || 'Unknown location',
      depth:   f.geometry.coordinates[2] || 0,
      time:    f.properties.time,
      tsunami: f.properties.tsunami === 1,  // USGS の津波フラグ
    };

    const lang = detectLang(q.place);
    const tmpl = TEMPLATES[lang] || TEMPLATES.en;

    // 深リンク：この地震の詳細に直接飛べる URL
    const deepUrl = `${SITE_URL.replace(/\/$/, '')}/#eq=${encodeURIComponent(q.id)}`;
    const text = tmpl(q, deepUrl);

    console.log(`\n--- Posting in [${lang}] for ${q.id} ---`);
    console.log(text);

    // それぞれ独立して投稿（片方が失敗しても、もう片方は続行）
    try {
      if (await postToBluesky(text, lang)) console.log('✅ Bluesky: posted');
    } catch (err) {
      console.error('❌ Bluesky failed:', err.message);
    }
    try {
      if (await postToMastodon(text, lang)) console.log('✅ Mastodon: posted');
    } catch (err) {
      console.error('❌ Mastodon failed:', err.message);
    }

    posted++;

    // 連続投稿の間に少し待機
    if (fresh.indexOf(f) < fresh.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nDone: processed ${posted}/${fresh.length} earthquakes.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

