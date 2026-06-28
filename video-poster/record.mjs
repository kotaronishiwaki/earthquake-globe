#!/usr/bin/env node
/* Globe Weekly — step 4: record the studio playing each language to video.
 *
 *   out/program.<lang>.timed.json  +  studio/weekly-studio.html
 *     -> out/video-<lang>.webm      (silent; narration is muxed in compose.mjs)
 *     -> out/sync-<lang>.json       {preDelay: N}  seconds from rec-start to play()
 *
 * The studio is opened in ?mode=render (no controls, no browser TTS) with the
 * timed PROGRAM injected, then played in real time while Playwright records.
 *
 * Run: node record.mjs   (needs `npx playwright install chromium` once)
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { OUT, STUDIO, LANGS, W, H, TITLE_DUR, DISC_DUR } from './config.mjs';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const URL = pathToFileURL(STUDIO).href;

async function recordLang(browser, lang) {
  const program  = JSON.parse(await readFile(join(OUT, `program.${lang}.timed.json`), 'utf8'));
  const manifest = JSON.parse(await readFile(join(OUT, 'audio', lang, 'manifest.json'), 'utf8'));
  const totalMs  = manifest.reduce((s, m) => s + m.dur, 0) * 1000;

  const context = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1,
    recordVideo: { dir: join(OUT, 'rec', lang), size: { width: W, height: H } },
  });
  const t0 = Date.now();   // video recording begins here

  await context.addInitScript(p => { window.__PROGRAM = p; }, program);
  await context.addInitScript(d => { window.__TITLE_DUR = d; }, TITLE_DUR);
  await context.addInitScript(d => { window.__DISC_DUR = d; }, DISC_DUR);
  const page = await context.newPage();
  await page.goto(`${URL}?mode=render&lang=${lang}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__studioReady === true', { timeout: 20000 });
  await page.waitForTimeout(2800);         // let globe map + fonts settle

  const tPlay = Date.now();
  await page.evaluate(() => { window.__studio.restart(); window.__studio.play(); });

  // Write precise pre-play delay so compose.mjs can trim the loading head.
  const preDelay = +((tPlay - t0) / 1000).toFixed(3);
  await writeFile(join(OUT, `sync-${lang}.json`), JSON.stringify({ preDelay }));
  log(`[${lang}] preDelay=${preDelay}s  recording ${(totalMs / 60000).toFixed(1)} min…`);

  await page.waitForTimeout(totalMs + 1600);

  const video = page.video();
  await page.close();
  await context.close();                   // finalises the .webm
  const src  = await video.path();
  const dest = join(OUT, `video-${lang}.webm`);
  await rename(src, dest);
  log(`[${lang}] recorded -> ${dest}`);
}

(async () => {
  const browser = await chromium.launch({
    args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    for (const lang of LANGS) await recordLang(browser, lang);
  } finally { await browser.close(); }
  log('record done');
})();
