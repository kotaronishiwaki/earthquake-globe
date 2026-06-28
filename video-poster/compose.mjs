#!/usr/bin/env node
/* Globe Weekly — step 5: assemble the final videos with ffmpeg.
 *
 *   video-<lang>.webm + audio/<lang>/* + BGM + sting
 *     -> out/Globe-Weekly-<week>-<lang>.mp4         (main, 1920x1080)
 *     -> out/Globe-Weekly-<week>-<lang>-short.mp4   (vertical 1080x1920)
 *     -> out/<lang>.srt                             (captions incl. title cards)
 *
 * Timing: record.mjs writes sync-<lang>.json with the actual seconds between
 * recording-start and play(). compose trims that head off the video so audio
 * and picture start together. Run: node compose.mjs
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { OUT, ROOT, LANGS, TITLE_DUR, DISC_DUR, BGM_DB, STING_DB, TRIM_DB, TRIM_DUR, W, H, FPS } from './config.mjs';

const ENV  = process.env;
const log  = (...a) => console.log(new Date().toISOString(), ...a);
const exists = p => access(p).then(() => true).catch(() => false);
const ff   = args => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

// Strip leading silence from a TTS clip so the spoken word lands on the caption's
// cue boundary. edge-tts MP3s (esp. ja-JP voices) carry a short head of silence +
// a soft breath/room-tone onset; without trimming, the burned-in caption + SRT
// lead the voice by a beat. Gate level/duration come from config (TRIM_DB/_DUR)
// so a breathy new voice can be tuned without touching this file. Default RMS
// detection averages over a short window, so a low-energy breath reads as silence
// and gets trimmed closer to the actual word onset (peak detection would stop at
// the first transient and leave the breath in).
const TRIM = `silenceremove=start_periods=1:start_threshold=${TRIM_DB}dB:start_duration=${TRIM_DUR}`;

// Find the exact play()-start in the recorded webm by locating the leading white
// sync marker the studio holds until playback begins. negate turns that white
// hold into a "black" region blackdetect can time; its end is the play() frame =
// audio t=0. Robust to Playwright recorder spin-up and machine load, which the
// wall-clock preDelay estimate is not. Short load-flicker regions (<0.8s) are
// ignored; falls back to the recorded preDelay if no marker is found (e.g. a
// recording made before the marker was added).
function detectStart(video, fallback) {
  try {
    const r = spawnSync('ffmpeg', [
      '-hide_banner', '-i', video,
      '-vf', 'negate,blackdetect=d=0.8:pic_th=0.93:pix_th=0.10',
      '-an', '-f', 'null', '-',
    ], { encoding: 'utf8', maxBuffer: 1 << 27 });
    const txt = (r.stderr || '') + (r.stdout || '');
    const re = /black_start:([\d.]+)[^\n]*?black_end:([\d.]+)/g;
    let m, best = null;
    while ((m = re.exec(txt))) {
      const start = +m[1], end = +m[2];
      if (start < 10 && (best == null || end > best)) best = end;   // leading marker only
    }
    if (best != null && best > 0.2) { log(`  sync marker ends at ${best.toFixed(3)}s`); return best; }
    log(`  (no sync marker found — using preDelay=${fallback}s)`);
  } catch (e) {
    log(`  (blackdetect failed: ${e.message} — using preDelay=${fallback}s)`);
  }
  return fallback;
}

function srtTime(s) {
  const ms = Math.round((s % 1) * 1000), t = Math.floor(s);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)},${p(ms, 3)}`;
}

function cueTimes(program) {
  let t = 0; const segs = [];
  if (program.disclaimer) t = DISC_DUR;   // opening disclaimer card occupies the head
  for (const seg of program.segments) {
    const start = t;
    if (seg.titleCard) t += TITLE_DUR;
    for (const ln of seg.lines) t += ln.dur || 0;
    segs.push({ id: seg.id, short: !!seg.short, start, end: t });
  }
  return { segs, total: t };
}

// ---- Build the per-segment WAV clips and concatenate into narration.wav ----
async function buildNarration(lang) {
  const dir    = join(OUT, 'audio', lang);
  const segDir = join(dir, 'seg');
  await mkdir(segDir, { recursive: true });

  const manifest  = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const stingPath = join(ROOT, ENV.STING_FILE || 'assets/sting.mp3');
  const hasSting  = await exists(stingPath);
  const list      = [];

  for (let i = 0; i < manifest.length; i++) {
    const m   = manifest[i];
    const out = join(segDir, `${String(i).padStart(4, '0')}.wav`);

    if (m.type === 'disc') {
      // silent opening-disclaimer bed (BGM is layered on later); exact length.
      ff(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-c:a', 'pcm_s16le', '-t', String(m.dur), out]);

    } else if (m.type === 'title') {
      const voiceFile = m.file ? join(dir, m.file) : null;
      const hasVoice  = voiceFile && await exists(voiceFile);
      // All title-card cases hard-clamp to exactly TITLE_DUR with -t to prevent
      // cumulative drift (ffmpeg filter buffering can otherwise add fractions of a second).
      const tStr = String(TITLE_DUR);

      if (hasVoice && hasSting) {
        ff([
          '-i', stingPath,
          '-i', voiceFile,
          '-filter_complex',
          `[0:a]volume=${STING_DB}dB,apad[s];[1:a]${TRIM},volume=2dB[v];[s][v]amix=inputs=2:duration=first:normalize=0[a]`,
          '-map', '[a]', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', tStr, out,
        ]);
      } else if (hasSting) {
        ff(['-i', stingPath,
            '-af', `volume=${STING_DB}dB,apad`,
            '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-t', tStr, out]);
      } else if (hasVoice) {
        ff(['-i', voiceFile,
            '-ar', '44100', '-ac', '2', '-af', `${TRIM},apad`, '-c:a', 'pcm_s16le', '-t', tStr, out]);
      } else {
        ff(['-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
            '-c:a', 'pcm_s16le', '-t', tStr, out]);
      }

    } else {
      ff(['-i', join(dir, m.file), '-ar', '44100', '-ac', '2',
          '-af', `${TRIM},apad`, '-t', String(m.dur), '-c:a', 'pcm_s16le', out]);
    }

    list.push(`file '${out.replace(/'/g, "'\\''")}'`);
  }

  const listFile  = join(dir, 'concat.txt');
  await writeFile(listFile, list.join('\n'));
  const narration = join(dir, 'narration.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', narration]);
  return narration;
}

// ---- Mix BGM bed under narration ----
async function mixBgm(narration, lang) {
  const bgm = join(ROOT, ENV.BGM_FILE || 'assets/bed.wav');
  const mix = join(OUT, 'audio', lang, 'mix.wav');
  if (await exists(bgm)) {
    ff(['-i', narration, '-stream_loop', '-1', '-i', bgm,
        '-filter_complex',
        `[1:a]volume=${BGM_DB}dB[b];[0:a][b]amix=inputs=2:duration=first:normalize=0[a]`,
        '-map', '[a]', '-c:a', 'pcm_s16le', mix]);
    return mix;
  }
  log(`  (no BGM at ${bgm} — voice only)`);
  return narration;
}

// ---- Build SRT captions (includes title-card lines) ----
function srt(program, lang) {
  let t = 0, n = 0; const out = [];
  if (program.disclaimer) {
    const txt = lang === 'ja' ? program.disclaimer.ja : program.disclaimer.en;
    out.push(`${++n}\n${srtTime(t)} --> ${srtTime(t + DISC_DUR)}\n${txt}\n`);
    t += DISC_DUR;
  }
  for (const seg of program.segments) {
    if (seg.titleCard) {
      // Caption the section title for the duration of the title card
      const txt = lang === 'ja'
        ? `【${seg.title_ja}】`
        : `[ ${seg.title_en} ]`;
      out.push(`${++n}\n${srtTime(t)} --> ${srtTime(t + TITLE_DUR)}\n${txt}\n`);
      t += TITLE_DUR;
    }
    for (const ln of seg.lines) {
      const dur = ln.dur || 0;
      const txt = lang === 'ja' ? ln.ja : ln.en;
      out.push(`${++n}\n${srtTime(t)} --> ${srtTime(t + dur)}\n${txt}\n`);
      t += dur;
    }
  }
  return out.join('\n');
}

// ---- Compose one language ----
async function composeLang(lang, weekTag) {
  // Read sync file written by record.mjs (falls back to 2.8 s if missing)
  let preDelay = 2.8;
  try {
    const s = JSON.parse(await readFile(join(OUT, `sync-${lang}.json`), 'utf8'));
    preDelay = s.preDelay ?? 2.8;
  } catch {}
  log(`[${lang}] preDelay=${preDelay}s`);

  const program   = JSON.parse(await readFile(join(OUT, `program.${lang}.timed.json`), 'utf8'));
  const video     = join(OUT, `video-${lang}.webm`);
  const narration = await buildNarration(lang);
  const audio     = await mixBgm(narration, lang);

  // Anchor the head off the recorded white sync marker (preDelay is the fallback).
  const startAt = detectStart(video, preDelay);

  const main = join(OUT, `Globe-Weekly-${weekTag}-${lang}.mp4`);
  // -ss trims the loading-screen head from the recording so A/V start together
  ff([
    '-ss', String(startAt.toFixed(3)), '-i', video,
    '-i', audio,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', main,
  ]);
  await writeFile(join(OUT, `${lang}.srt`), srt(program, lang));
  log(`[${lang}] main -> ${main}`);

  // Vertical short — clip from the flagged segment
  const { segs } = cueTimes(program);
  const sh = segs.find(s => s.short);
  if (sh) {
    const short = join(OUT, `Globe-Weekly-${weekTag}-${lang}-short.mp4`);
    ff([
      '-ss', String(sh.start), '-to', String(sh.end), '-i', main,
      '-vf', `scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:0xF1EEE8`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', short,
    ]);
    log(`[${lang}] short -> ${short} (${(sh.end - sh.start).toFixed(0)}s)`);
  }
}

(async () => {
  const data    = JSON.parse(await readFile(join(OUT, 'data.json'), 'utf8'));
  const weekTag = `${data.week.year}-W${String(data.week.no).padStart(2, '0')}`;
  for (const lang of LANGS) await composeLang(lang, weekTag);
  log('compose done');
})();
