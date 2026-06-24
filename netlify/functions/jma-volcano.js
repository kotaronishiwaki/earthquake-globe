/* Netlify Function — GET /.netlify/functions/jma-volcano
 *
 * Japan Meteorological Agency (JMA) real-time volcanic warnings.
 *
 * The browser cannot read JMA's feeds directly (no CORS headers), so this
 * function fetches the official 気象庁防災情報XML feed server-side, parses the
 * latest 噴火警報・予報 / 噴火速報 reports, and returns clean CORS-enabled JSON:
 *
 *   [{ name, nameEn, level, kind, lat, lon, date, url }, ...]
 *
 * Only volcanoes currently at 噴火警戒レベル ≥ 2 (an active warning) are returned;
 * a downgrade to level 1 (平常) drops the volcano from the list. Coordinates come
 * from the report XML when present, otherwise from a built-in lookup table of
 * Japan's continuously-monitored volcanoes.
 *
 * Source: https://www.data.jma.go.jp/developer/xml/  (public, no key required)
 */

// 高頻度 feed = last few hours of reports (newly issued/changed warnings + ashfall forecasts)
const FEED = 'https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml';
// 長期 feed = retains the latest report per phenomenon for ~1 week (so a warning that
// hasn't changed recently still has an entry here)
const FEED_L = 'https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml';
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  // let the CDN cache the answer for 5 min so we don't hammer JMA
  'cache-control': 'public, max-age=300, s-maxage=300',
};

// Romanised names for the most active monitored volcanoes (UI display fallback).
const NAME_EN = {
  '桜島': 'Sakurajima', '諏訪之瀬島': 'Suwanosejima', '口永良部島': 'Kuchinoerabujima',
  '阿蘇山': 'Asosan', '霧島山': 'Kirishimayama', '雲仙岳': 'Unzendake',
  '薩摩硫黄島': 'Satsuma-Iojima', '浅間山': 'Asamayama', '草津白根山': 'Kusatsu-Shiranesan',
  '御嶽山': 'Ontakesan', '箱根山': 'Hakoneyama', '富士山': 'Fujisan',
  '伊豆大島': 'Izu-Oshima', '三宅島': 'Miyakejima', '西之島': 'Nishinoshima',
  '硫黄島': 'Ioto', '那須岳': 'Nasudake', '吾妻山': 'Azumayama',
  '安達太良山': 'Adatarayama', '磐梯山': 'Bandaisan', '蔵王山': 'Zaozan',
  '十勝岳': 'Tokachidake', '樽前山': 'Tarumaesan', '有珠山': 'Usuzan',
  '北海道駒ヶ岳': 'Hokkaido-Komagatake', '雌阿寒岳': 'Meakandake', '岩手山': 'Iwatesan',
  '秋田駒ヶ岳': 'Akita-Komagatake', '秋田焼山': 'Akita-Yakeyama', '鳥海山': 'Chokaisan',
  '焼岳': 'Yakedake', '白山': 'Hakusan', '弥陀ヶ原': 'Midagahara',
  '新潟焼山': 'Niigata-Yakeyama', '九重山': 'Kujusan', '鶴見岳・伽藍岳': 'Tsurumidake',
  '口之島': 'Kuchinoshima', '中之島': 'Nakanoshima', '青ヶ島': 'Aogashima',
};

// [lon, lat] for monitored volcanoes — fallback when the report omits coordinates.
const COORDS = {
  '桜島': [130.657, 31.593], '諏訪之瀬島': [129.714, 29.638], '口永良部島': [130.217, 30.443],
  '阿蘇山': [131.104, 32.884], '霧島山': [130.862, 31.934], '雲仙岳': [130.299, 32.761],
  '薩摩硫黄島': [130.305, 30.793], '浅間山': [138.523, 36.406], '草津白根山': [138.528, 36.618],
  '御嶽山': [137.480, 35.893], '箱根山': [139.021, 35.234], '富士山': [138.731, 35.361],
  '伊豆大島': [139.398, 34.724], '三宅島': [139.529, 34.079], '西之島': [140.879, 27.247],
  '硫黄島': [141.289, 24.751], '那須岳': [139.963, 37.122], '吾妻山': [140.246, 37.735],
  '安達太良山': [140.288, 37.618], '磐梯山': [140.075, 37.601], '蔵王山': [140.440, 38.144],
  '十勝岳': [142.686, 43.418], '樽前山': [141.377, 42.690], '有珠山': [140.839, 42.541],
  '北海道駒ヶ岳': [140.677, 42.063], '雌阿寒岳': [144.008, 43.386], '岩手山': [140.854, 39.853],
  '秋田駒ヶ岳': [140.799, 39.761], '秋田焼山': [140.757, 39.964], '鳥海山': [140.048, 39.099],
  '焼岳': [137.588, 36.227], '白山': [136.771, 36.155], '弥陀ヶ原': [137.595, 36.575],
  '新潟焼山': [138.044, 36.918], '九重山': [131.249, 33.086], '鶴見岳・伽藍岳': [131.432, 33.281],
  '青ヶ島': [139.759, 32.452],
};

// numeric alert level → marker colour (matches the globe's USGS code colours)
const LEVEL_RGB = { 1: '70,150,70', 2: '214,170,28', 3: '214,108,28', 4: '200,52,40', 5: '170,30,30' };

function pick(re, s) { const m = re.exec(s); return m ? m[1].trim() : ''; }

// full-width digits → ASCII
function toHalf(s) { return (s || '').replace(/[０-９]/g, d => '０１２３４５６７８９'.indexOf(d) + ''); }

// pull the numeric 噴火警戒レベル out of a free-text summary, e.g.
//   「現在、桜島は噴火警戒レベル３（入山規制）です」 → 3
function levelFromText(t) {
  const m = /噴火警戒レベル[^0-9０-９]{0,6}([0-9０-９])/.exec(t || '');
  return m ? parseInt(toHalf(m[1]), 10) : null;
}

// resolve any display name (incl. parenthetical sub-volcano like 霧島山（新燃岳）)
// to a base key present in COORDS, longest match first so 草津白根山（…）→草津白根山.
const BASE_NAMES = Object.keys(COORDS).sort((a, b) => b.length - a.length);
function resolveBase(s) {
  if (!s) return null;
  const n = s.replace(/\s+/g, '');
  for (const k of BASE_NAMES) { if (n.indexOf(k) !== -1) return k; }
  return null;
}

// ashfall-forecast summaries read「現在、〇〇は噴火警戒レベルN（…）です」
function nameFromAshfall(content) {
  const m = /現在、(.+?)は噴火警戒レベル/.exec(content || '');
  return m ? m[1] : '';
}

function parseReport(xml, fallbackName) {
  // volcano name: <VolcanoName> (jmx_eb) or <Area><Name>
  let name = pick(/<(?:[\w-]+:)?VolcanoName[^>]*>([^<]+)<\/(?:[\w-]+:)?VolcanoName>/, xml)
    || pick(/<Area>\s*<Name>([^<]+)<\/Name>/, xml)
    || fallbackName || '';
  name = name.replace(/\s+/g, '');
  // numeric 噴火警戒レベル
  const lvlStr = pick(/<(?:[\w-]+:)?VolcanicAlertLevel[^>]*>\s*([1-5])\s*<\/(?:[\w-]+:)?VolcanicAlertLevel>/, xml);
  const level = lvlStr ? parseInt(lvlStr, 10) : null;
  // warning kind (e.g. 噴火警報（火口周辺）)
  const kind = pick(/<Kind>\s*<Name>([^<]+)<\/Name>/, xml);
  // ISO-6709 coordinate: +31.5931+130.6577+1117/
  const coordRaw = pick(/<(?:[\w-]+:)?Coordinate[^>]*>\s*([+\-][0-9.+\-]+)/, xml);
  let lat = null, lon = null;
  const cm = /([+\-]\d+(?:\.\d+)?)([+\-]\d+(?:\.\d+)?)/.exec(coordRaw || '');
  if (cm) { lat = parseFloat(cm[1]); lon = parseFloat(cm[2]); }
  return { name, level, kind };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'GET,OPTIONS' } };
  }
  try {
    // Pull BOTH the high-frequency and long-period feeds. The high-frequency feed
    // only holds the last few hours, so in quiet periods it has no 噴火警報・予報
    // entry at all — the long-period feed retains the latest one per volcano, and
    // the 降灰予報（定時）ashfall forecasts state each active volcano's current level.
    const feeds = await Promise.all([FEED, FEED_L].map(async u => {
      try {
        const r = await fetch(u, { headers: { 'user-agent': 'globe-quake-map/1.0' } });
        return r.ok ? await r.text() : '';
      } catch (_) { return ''; }
    }));
    if (!feeds.some(Boolean)) return { statusCode: 502, headers: JSON_HEADERS, body: '{"error":"feed unreachable"}' };

    const records = [];        // { base, level, kind, date, url }
    const needReport = [];     // 噴火警報 entries whose level we couldn't read from the summary

    for (const feed of feeds) {
      for (const e of feed.split('<entry>').slice(1)) {
        const title = pick(/<title>([^<]+)<\/title>/, e);
        const url = pick(/<id>([^<]+)<\/id>/, e);
        const updated = pick(/<updated>([^<]+)<\/updated>/, e);
        const content = pick(/<content[^>]*>([\s\S]*?)<\/content>/, e);

        if (title === '噴火警報・予報' || title === '噴火速報') {
          const base = resolveBase(content);
          if (!base) continue;
          const lvl = levelFromText(content);
          if (lvl != null) records.push({ base, level: lvl, kind: '噴火警報', date: updated, url });
          else if (url) needReport.push({ base, url, updated });   // fall back to the report XML
        } else if (title === '降灰予報（定時）' || title === '降灰予報（速報）') {
          const base = resolveBase(nameFromAshfall(content)) || resolveBase(content);
          const lvl = levelFromText(content);
          if (base && lvl != null) records.push({ base, level: lvl, kind: '降灰予報', date: updated, url });
        }
      }
    }

    // Resolve the handful of warnings whose level wasn't in the summary text.
    const fetched = await Promise.all(needReport.slice(0, 20).map(async w => {
      try {
        const r = await fetch(w.url, { headers: { 'user-agent': 'globe-quake-map/1.0' } });
        if (!r.ok) return null;
        const p = parseReport(await r.text());
        const base = resolveBase(p.name) || w.base;
        return (base && p.level) ? { base, level: p.level, kind: p.kind || '噴火警報', date: w.updated, url: w.url } : null;
      } catch (_) { return null; }
    }));
    for (const r of fetched) if (r) records.push(r);

    // Keep the newest record per volcano so a recent downgrade overrides an old warning.
    records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const byBase = {};
    for (const r of records) if (!byBase[r.base]) byBase[r.base] = r;

    const out = [];
    for (const base of Object.keys(byBase)) {
      const r = byBase[base];
      const level = r.level || 1;
      if (level < 2) continue;                     // level 1 (平常) → not an active warning
      const c = COORDS[base];
      if (!c) continue;                            // unknown location → skip rather than mis-plot
      out.push({
        name: base,
        nameEn: NAME_EN[base] || base,
        level,
        kind: r.kind || '',
        rgb: LEVEL_RGB[level] || LEVEL_RGB[2],
        lon: c[0], lat: c[1],
        date: r.date || null,
        url: r.url || 'https://www.jma.go.jp/bosai/volcano/',
      });
    }
    out.sort((a, b) => b.level - a.level);

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
