#!/usr/bin/env node
/* Globe Weekly — step 6: upload to YouTube (main + Short, JA + EN).
 *
 * Uploads as PRIVATE by default (YT_PRIVACY) so a human reviews and publishes.
 * Captions (.srt) are attached when present. Run after you've eyeballed the MP4s:
 *   node --env-file=.env upload.mjs
 *
 * One-time setup: create an OAuth "Desktop" client in Google Cloud, enable the
 * YouTube Data API v3, and obtain a refresh token for the channel (store all
 * three in .env). See README.
 */
import { readFile, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import { OUT, LANGS } from './config.mjs';

const ENV = process.env;
const log = (...a) => console.log(new Date().toISOString(), ...a);
const exists = p => access(p).then(() => true).catch(() => false);
const PRIVACY = ENV.YT_PRIVACY || 'private';

function client() {
  const o = new google.auth.OAuth2(ENV.YT_CLIENT_ID, ENV.YT_CLIENT_SECRET);
  o.setCredentials({ refresh_token: ENV.YT_REFRESH_TOKEN });
  return google.youtube({ version: 'v3', auth: o });
}

function meta(program, data, lang, isShort) {
  const wk = lang === 'ja' ? `${program.week.start_ja}〜${program.week.end_ja}` : `${program.week.start_en} – ${program.week.end_en}`;
  const top = program.events.quakes[0];
  const link = 'https://globelabo.netlify.app/';
  if (lang === 'ja') {
    const title = isShort
      ? `今週の地球：いちばんの注目 #Shorts（${wk}）`
      : `今週の地球｜地震・火山・太陽フレアまとめ（${wk}）`;
    const desc = `進行ハルカと解説リクが、この1週間の地震・火山・太陽フレアを振り返り、今後の見込みまでお伝えします。\n` +
      (top ? `最大の地震：M${top.mag} ${top.ja}\n` : '') +
      `\n回転する地球儀ですべての地震・火山・フレアを見る → ${link}\n` +
      `\n※自動生成。一般向けの解説であり、公式の防災情報ではありません。最新情報は気象庁等の発表に従ってください。\n` +
      `#地震 #火山 #太陽フレア #宇宙天気 #防災`;
    return { title: title.slice(0, 100), description: desc, tags: ['地震', '火山', '太陽フレア', '宇宙天気', '防災', 'Globe Weekly'] };
  }
  const title = isShort
    ? `This week's standout #Shorts (${wk})`
    : `Globe Weekly | Quakes, Volcanoes & Solar Flares (${wk})`;
  const desc = `Haruka and Riku recap the past week of earthquakes, volcanoes and solar flares — and what to watch next.\n` +
    (top ? `Largest quake: M${top.mag} ${top.en}\n` : '') +
    `\nSee every quake, volcano and flare on the spinning globe → ${link}\n` +
    `\nAuto-generated general explainer — not an official hazard assessment. Follow your local authority.\n` +
    `#earthquake #volcano #solarflare #spaceweather`;
  return { title: title.slice(0, 100), description: desc, tags: ['earthquake', 'volcano', 'solar flare', 'space weather', 'Globe Weekly'] };
}

async function uploadOne(yt, file, m, lang, srtFile) {
  log(`uploading ${file} …`);
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: m.title, description: m.description, tags: m.tags, categoryId: '25', defaultLanguage: lang, defaultAudioLanguage: lang },
      status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false },
    },
    media: { body: createReadStream(file) },
  });
  const id = res.data.id;
  log(`  ✓ https://youtu.be/${id}  (${PRIVACY})`);
  if (srtFile && await exists(srtFile)) {
    try {
      await yt.captions.insert({ part: ['snippet'],
        requestBody: { snippet: { videoId: id, language: lang, name: lang.toUpperCase(), isDraft: false } },
        media: { body: createReadStream(srtFile) } });
      log('  ✓ captions attached');
    } catch (e) { log('  caption upload skipped:', e.message); }
  }
  return id;
}

(async () => {
  for (const k of ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN']) if (!ENV[k]) { console.error('Set ' + k); process.exit(1); }
  const data = JSON.parse(await readFile(join(OUT, 'data.json'), 'utf8'));
  const weekTag = `${data.week.year}-W${String(data.week.no).padStart(2, '0')}`;
  const yt = client();
  for (const lang of LANGS) {
    const program = JSON.parse(await readFile(join(OUT, `program.${lang}.timed.json`), 'utf8'));
    const main = join(OUT, `Globe-Weekly-${weekTag}-${lang}.mp4`);
    const short = join(OUT, `Globe-Weekly-${weekTag}-${lang}-short.mp4`);
    const srtFile = join(OUT, `${lang}.srt`);
    if (await exists(main)) await uploadOne(yt, main, meta(program, data, lang, false), lang, srtFile);
    if (await exists(short)) await uploadOne(yt, short, meta(program, data, lang, true), lang, null);
  }
  log('upload done — review the private videos in YouTube Studio, then publish.');
})();
