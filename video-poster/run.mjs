#!/usr/bin/env node
/* Globe Weekly — orchestrator. Runs the generation pipeline end to end and
 * STOPS before uploading (review gate). Publish with `npm run upload`.
 *
 *   npm run build        aggregate -> script -> tts -> record -> compose
 *   npm run build:dry    aggregate -> script   (fast text-only check, no audio/video)
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { OUT } from './config.mjs';

const DRY = process.argv.includes('--dry');
const log = (...a) => console.log('\n=== ' + a.join(' ') + ' ===');
const step = f => execFileSync('node', [join(import.meta.dirname || '.', f)], { stdio: 'inherit' });

(async () => {
  log('1/5 aggregate'); step('aggregate.mjs');
  log('2/5 script');    step('script.mjs');
  if (DRY) { log('dry run — stopping after script.json'); return; }
  log('3/5 tts');       step('tts.mjs');
  log('4/5 record');    step('record.mjs');
  log('5/5 compose');   step('compose.mjs');

  const data = JSON.parse(await readFile(join(OUT, 'data.json'), 'utf8'));
  const tag = `${data.week.year}-W${String(data.week.no).padStart(2, '0')}`;
  console.log(`\n────────────────────────────────────────`);
  console.log(`Review the videos in video-poster/out/ :`);
  console.log(`  Globe-Weekly-${tag}-ja.mp4   (+ -ja-short.mp4)`);
  console.log(`  Globe-Weekly-${tag}-en.mp4   (+ -en-short.mp4)`);
  console.log(`When they look right:  npm run upload   (uploads as ${process.env.YT_PRIVACY || 'private'})`);
  console.log(`────────────────────────────────────────`);
})();
