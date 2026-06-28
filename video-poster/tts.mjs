#!/usr/bin/env node
/* Globe Weekly — step 3: synthesize the two voices with edge-tts-client.mjs.
 *
 *   out/program.json
 *     -> out/audio/<lang>/<seg>-<line>.mp3        (dialogue lines)
 *     -> out/audio/<lang>/title-<seg>.mp3         (section title call, one per titleCard)
 *     -> out/program.<lang>.timed.json
 *     -> out/audio/<lang>/manifest.json
 *
 * Needs ffprobe on PATH (ships with ffmpeg). Run: node tts.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { synthesize } from './azure-tts-client.mjs';
import { OUT, LANGS, VOICES, GAP, TITLE_DUR, DISC_DUR } from './config.mjs';

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---- ffprobe: measure actual audio duration ----
function probe(file) {
  try {
    return Number(execFileSync(
      'ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]
    ).toString().trim()) || 0;
  } catch { return 0; }
}

// ---- synthesize one clip to file, with retry ----
async function synthLine(voice, text, outPath, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const mp3 = await synthesize(voice, text);
      if (!mp3 || mp3.length === 0) throw new Error('empty audio returned');
      await writeFile(outPath, mp3);
      return;
    } catch (e) {
      const err = e?.message ?? String(e);
      if (attempt < retries) {
        const wait = attempt * 1500;
        log(`  attempt ${attempt}/${retries} failed (${err}) — retrying in ${wait}ms…`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw new Error(`TTS failed after ${retries} attempts for "${text.slice(0, 40)}…": ${err}`);
      }
    }
  }
}

// ---- process one language ----
async function runLang(lang, program) {
  const dir    = join(OUT, 'audio', lang);
  await mkdir(dir, { recursive: true });
  const voices = VOICES[lang];

  const manifest  = [];
  let   lineCount = 0;

  // Opening disclaimer card plays first, silent (BGM bed only) for DISC_DUR.
  if (program.disclaimer) manifest.push({ type: 'disc', dur: DISC_DUR });

  for (let si = 0; si < program.segments.length; si++) {
    const seg = program.segments[si];

    if (seg.titleCard) {
      // Synthesize the section title as a short voice announcement.
      const titleText = lang === 'ja' ? seg.title_ja : seg.title_en;
      const titleFile = join(dir, `title-${si}.mp3`);
      if (titleText) {
        await synthLine(voices.host, titleText, titleFile);
        manifest.push({ type: 'title', dur: TITLE_DUR, file: `title-${si}.mp3` });
        log(`  [${lang}] title card ${si}: "${titleText}"`);
      } else {
        manifest.push({ type: 'title', dur: TITLE_DUR });
      }
    }

    for (let li = 0; li < seg.lines.length; li++) {
      const ln    = seg.lines[li];
      const text  = lang === 'ja' ? ln.ja : ln.en;
      const voice = voices[ln.who] ?? voices.host;
      const file  = join(dir, `${si}-${li}.mp3`);

      await synthLine(voice, text, file);

      const audioDur = probe(file);
      const dur = Math.max(1.6, audioDur + GAP);
      ln.dur = Number(dur.toFixed(3));
      manifest.push({ type: 'line', dur: ln.dur, audioDur: Number(audioDur.toFixed(3)), file: `${si}-${li}.mp3`, pad: GAP });
      lineCount++;
      if (lineCount % 10 === 0) log(`  [${lang}] ${lineCount} lines done…`);
    }
  }

  await writeFile(join(OUT, `program.${lang}.timed.json`), JSON.stringify(program, null, 2));
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const total = manifest.reduce((s, m) => s + m.dur, 0);
  log(`[${lang}] ${lineCount} lines, ~${(total / 60).toFixed(1)} min`);
}

(async () => {
  for (const lang of LANGS) {
    log(`[${lang}] starting TTS…`);
    const program = JSON.parse(await readFile(join(OUT, 'program.json'), 'utf8'));
    await runLang(lang, program);
  }
  log('tts done');
})();
