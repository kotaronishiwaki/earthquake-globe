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

// 「Globe Hero」カードに切り替える閾値マグニチュード。
// MIN_MAG 〜 (HERO_MAG 未満) … 従来どおりのシェア画像カードを投稿
// HERO_MAG 以上            … Globe Hero カード（Claude 解説 + 地球儀）を投稿
// 既定は M6.0。GitHub Variables の HERO_MAG で調整可能（例: 5.5 / 6.5）。
const HERO_MAG = parseFloat(process.env.HERO_MAG || '6.0');

// Globe Hero を試みるのは ANTHROPIC_API_KEY が設定されているときだけ。
// 未設定なら全マグニチュードで従来のシェア画像にフォールバックする。
const HERO_ENABLED = !!process.env.ANTHROPIC_API_KEY;

// 発生から何時間以内の地震を投稿対象とするか。
// USGSは地震を即時～1,2時間遅れて反映するため、「過去1時間」フィードでは
// 反映が遅れた地震を取りこぼす。24時間フィード＋この窓で確実に拾いつつ、
// 古すぎる（鮮度のない）地震は投稿しないようにする。既定6時間。
const MAX_AGE_HOURS = parseFloat(process.env.MAX_AGE_HOURS || '6');

// 投稿済み地震IDを記録する状態ファイル（リポジトリにコミットされる）
const fs = require('fs');
const path = require('path');
const { renderShareCard } = require('./share-image');
const { buildGlobeHero, buildHeroPost } = require('./globe-hero');
const STATE_FILE = path.join(__dirname, 'posted.json');

// 状態記録の保持期間。重複投稿を防ぐため、USGSフィードの窓（過去24時間）より
// 必ず長くする必要がある（短いと、記録が消えた後にフィードへまだ残っている
// 地震を再投稿してしまう）。ここでは余裕をもって48時間。
const STATE_TTL_MS = 48 * 60 * 60 * 1000;

// 初回実行時に過去フィードからさかのぼって投稿する最大件数（スパム防止の上限）
const BACKFILL_CAP = parseInt(process.env.BACKFILL_CAP || '6', 10);

// 公開サイトの URL（GitHub Variables の SITE_URL で上書き可）
const SITE_URL = process.env.SITE_URL || 'https://globelabo.netlify.app/';

// USGS M4.5+ 過去24時間フィード。
// 「過去1時間」フィードは “発生時刻” が直近60分の地震しか含まないため、
// USGSへの反映が1〜2時間遅れる地震は、載る前に60分窓から外れて取りこぼされる。
// 24時間フィード + posted.json の重複排除 + 上の MAX_AGE_HOURS の組み合わせで、
// 反映が遅れた地震も確実に拾えるようにする。
const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';

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
// Globe Hero 用の投稿（M6+ など大きな地震向け）
// 縦長 1080×1350 のカードを「画像」として本文に直接添付する。
// 従来の M4.5+ シェア画像（横長のリンクカード）とは添付方式が異なる。
// ─────────────────────────────────────────────

// Bluesky：Globe Hero 画像を images 埋め込みで投稿（リンクカードではなく画像）
async function postHeroToBluesky(text, lang, png, q) {
  const identifier = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return false;

  const sessRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!sessRes.ok) throw new Error(`Bluesky login failed: ${sessRes.status} ${await sessRes.text()}`);
  const { accessJwt, did } = await sessRes.json();

  // Globe Hero PNG をアップロード
  const upRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${accessJwt}` },
    body: png,
  });
  if (!upRes.ok) throw new Error(`Bluesky upload failed: ${upRes.status} ${await upRes.text()}`);
  const blob = (await upRes.json()).blob;

  // 画像はリンクカードを担わないため、本文の 🔗 URL 行は残す（facets でクリック可能）
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    facets: buildFacets(text),
    langs: [lang],
    createdAt: new Date().toISOString(),
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{ image: blob, alt: `Globe earthquake mechanism card — M${q.mag.toFixed(1)} ${q.place}` }],
    },
  };
  const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
  });
  if (!postRes.ok) throw new Error(`Bluesky post failed: ${postRes.status} ${await postRes.text()}`);
  return true;
}

// Mastodon：Globe Hero 画像をメディア添付して投稿
async function postHeroToMastodon(text, lang, png, q) {
  const base = process.env.MASTODON_BASE_URL;
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!base || !token) return false;
  const root = base.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${token}` };

  // 1) メディアをアップロード
  const media = new FormData();
  media.append('file', new Blob([png], { type: 'image/png' }), 'globe-hero.png');
  media.append('description', `Globe earthquake mechanism card — M${q.mag.toFixed(1)} ${q.place}`);
  const mRes = await fetch(`${root}/api/v2/media`, { method: 'POST', headers: auth, body: media });
  if (!mRes.ok) throw new Error(`Mastodon media failed: ${mRes.status} ${await mRes.text()}`);
  const mediaId = (await mRes.json()).id;

  // 2) 画像付きで投稿
  const res = await fetch(`${root}/api/v1/statuses`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: text, language: lang, visibility: 'public', media_ids: [mediaId] }),
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

  // MIN_MAG 以上／未投稿／発生から MAX_AGE_HOURS 以内 の地震に絞り込む。
  // 24時間フィードを使うため、古すぎる（鮮度のない）地震は窓で除外する。
  const maxAgeMs = MAX_AGE_HOURS * 60 * 60 * 1000;
  let candidates = features.filter(
    f => (f.properties.mag || 0) >= MIN_MAG
      && !state[f.id]
      && (Date.now() - f.properties.time) <= maxAgeMs
  );
  // 古いものから順に投稿
  candidates.sort((a, b) => a.properties.time - b.properties.time);

  console.log(`${candidates.length} new earthquakes ≥ M${MIN_MAG} not yet posted`);

  // 初回実行（記録ファイルなし）でも、直近の地震は投稿する（取りこぼし防止）。
  // ただし MAX_AGE_HOURS 分を大量に出さないよう、新しい順に最大 BACKFILL_CAP 件に制限。
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

    // ティア判定：HERO_MAG 以上は Globe Hero、未満は従来のシェア画像。
    const wantHero = HERO_ENABLED && q.mag >= HERO_MAG;
    let hero = null;
    if (wantHero) {
      console.log(`\n--- M${q.mag.toFixed(1)} ≥ M${HERO_MAG}: building Globe Hero card for ${q.id} ---`);
      try {
        hero = await buildGlobeHero(q);
        console.log(`  (globe hero: ${(hero.png.length / 1024).toFixed(0)} KB · region ${hero.content.regionLang || 'en-only'})`);
      } catch (err) {
        console.error('  ⚠ Globe Hero failed, falling back to share image:', err.message);
        hero = null;
      }
    }

    // それぞれ独立して投稿（片方が失敗しても、もう片方は続行）
    let ok = false;
    if (hero) {
      // ── Globe Hero ティア：縦長カードを画像として添付 ──
      // 本文は Mechanism Cards の「Auto-post text」（AI解説ベース）に差し替え。
      // プラットフォームごとに文字数上限へ自動フィット（Bluesky 300 / Mastodon 500）。
      const heroTextBsky = buildHeroPost(q, hero.content, deepUrl, 300);
      const heroTextMasto = buildHeroPost(q, hero.content, deepUrl, 500);
      console.log(`--- Posting [Globe Hero] in [${hero.content.regionLang || 'en'}] for ${q.id} ---`);
      console.log(heroTextMasto);
      try {
        if (await postHeroToBluesky(heroTextBsky, hero.content.regionLang || 'en', hero.png, q)) { console.log('✅ Bluesky: posted (hero)'); ok = true; }
      } catch (err) {
        console.error('❌ Bluesky failed:', err.message);
      }
      try {
        if (await postHeroToMastodon(heroTextMasto, hero.content.regionLang || 'en', hero.png, q)) { console.log('✅ Mastodon: posted (hero)'); ok = true; }
      } catch (err) {
        console.error('❌ Mastodon failed:', err.message);
      }
    } else {
      // ── 従来ティア：シェア画像 + リンクカード（今までどおり） ──
      // Bluesky はカードがリンクを担うので、本文からは URL 行を省く
      const textNoUrl = text.split('\n').filter(l => !l.startsWith('🔗')).join('\n');

      // シェア画像（地球儀 + 震源）を生成。Bluesky のカードのサムネに使う。
      const img = await renderShareCard(q);
      if (img) console.log(`  (share image: ${(img.length / 1024).toFixed(0)} KB)`);

      console.log(`\n--- Posting in [${lang}] for ${q.id} ---`);
      console.log(text);

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
