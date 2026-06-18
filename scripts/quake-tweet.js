/**
 * quake-tweet.js
 * M4.5+ の新規地震を検知し、震源国の言語で X (Twitter) に自動投稿します。
 * GitHub Actions の cron で 5 分ごとに実行されます。
 */

const { TwitterApi } = require('twitter-api-v2');

// ─────────────────────────────────────────────
// 設定
// ─────────────────────────────────────────────

// 検知ウィンドウ：「過去 N 分以内」に発生した地震を対象にする
// 実行間隔（5分）より少し広め（6分）に設定 → 取りこぼしを防ぐ
const WINDOW_MS = 6 * 60 * 1000;

// 公開サイトの URL（GitHub Variables に SITE_URL を設定するか、直接書く）
const SITE_URL = process.env.SITE_URL || 'https://your-site.netlify.app';

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
  // USGS place は "33km E of Boconó, Venezuela" のような形式が多い
  const region = p.split(',').pop().trim();  // 最後のカンマ以降が国名に近い
  for (const [lang, keywords] of Object.entries(COUNTRY_LANG)) {
    if (keywords.some(kw => region.includes(kw) || p.includes(kw))) return lang;
  }
  return 'en'; // デフォルト
}

// ─────────────────────────────────────────────
// ツイート文テンプレート（6言語）
// ─────────────────────────────────────────────

function timeAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : `${m} min ago`;
}

const TEMPLATES = {
  en: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} earthquake\n📍 ${q.place}\n📏 Depth: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#earthquake #seismic`,

  ja: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} の地震が発生しました\n📍 ${q.place}\n📏 深さ: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#地震 #earthquake`,

  zh: (q, url) =>
    `🌍 发生 M${q.mag.toFixed(1)} 地震\n📍 ${q.place}\n📏 深度：${Math.round(q.depth)} 公里 · ${timeAgo(q.time)}\n🔗 ${url}\n#地震 #earthquake`,

  hi: (q, url) =>
    `🌍 M${q.mag.toFixed(1)} भूकंप आया\n📍 ${q.place}\n📏 गहराई: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#भूकंप #earthquake`,

  es: (q, url) =>
    `🌍 Sismo M${q.mag.toFixed(1)}\n📍 ${q.place}\n📏 Profundidad: ${Math.round(q.depth)} km · ${timeAgo(q.time)}\n🔗 ${url}\n#sismo #terremoto #earthquake`,

  ar: (q, url) =>
    `🌍 زلزال بقوة M${q.mag.toFixed(1)}\n📍 ${q.place}\n📏 العمق: ${Math.round(q.depth)} كم · ${timeAgo(q.time)}\n🔗 ${url}\n#زلزال #earthquake`,
};

// ─────────────────────────────────────────────
// メイン処理
// ─────────────────────────────────────────────

async function main() {
  // X API クライアントを初期化
  const client = new TwitterApi({
    appKey:            process.env.X_API_KEY,
    appSecret:         process.env.X_API_SECRET,
    accessToken:       process.env.X_ACCESS_TOKEN,
    accessSecret:      process.env.X_ACCESS_TOKEN_SECRET,
  });

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

  console.log(`Fetched ${features.length} M4.5+ earthquakes from USGS`);

  // 対象ウィンドウ内の地震を絞り込む
  const cutoff = Date.now() - WINDOW_MS;
  const fresh = features.filter(f => f.properties.time >= cutoff);

  console.log(`${fresh.length} earthquakes within the last ${WINDOW_MS / 60000} minutes`);

  if (fresh.length === 0) {
    console.log('No new earthquakes to tweet.');
    return;
  }

  let tweeted = 0;
  for (const f of fresh) {
    const q = {
      id:    f.id,
      mag:   f.properties.mag || 0,
      place: f.properties.place || 'Unknown location',
      depth: f.geometry.coordinates[2] || 0,
      time:  f.properties.time,
    };

    const lang = detectLang(q.place);
    const tmpl = TEMPLATES[lang] || TEMPLATES.en;

    // 深リンク：この地震の詳細ページに直接飛べる URL を生成
    const deepUrl = `${SITE_URL}#eq=${encodeURIComponent(q.id)}`;
    const text = tmpl(q, deepUrl);

    console.log(`\n--- Tweeting in [${lang}] for ${q.id} ---`);
    console.log(text);

    try {
      await client.v2.tweet(text);
      console.log('✅ Tweeted successfully');
      tweeted++;
    } catch (err) {
      console.error('❌ Tweet failed:', err.message);
    }

    // X API の rate limit を避けるため少し待機
    if (fresh.indexOf(f) < fresh.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`\nDone: ${tweeted}/${fresh.length} tweets posted.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
