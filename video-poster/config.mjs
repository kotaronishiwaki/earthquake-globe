/* Globe Weekly — shared config for the video pipeline. */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const OUT = join(ROOT, 'out');
export const STUDIO = process.env.STUDIO_PATH || join(ROOT, '..', 'studio', 'weekly-studio.html');

export const LANGS = ['ja', 'en'];

// Presenters. Names are editable; voices map to free Microsoft Edge neural voices.
export const HOSTS = {
  host:   { ja: 'ハルカ', en: 'Haruka', role_ja: '進行', role_en: 'Anchor' },
  expert: { ja: 'リク',   en: 'Riku',   role_ja: '解説', role_en: 'Analyst' },
};

// edge-tts neural voices (free). Host = female, Expert = male, per language.
export const VOICES = {
  ja: { host: 'ja-JP-NanamiNeural', expert: 'ja-JP-KeitaNeural' },
  en: { host: 'en-US-JennyNeural',              expert: 'en-US-ChristopherNeural' },
};

// Pause inserted after each spoken line (seconds) and title-card hold time.
export const GAP = 0.38;
export const TITLE_DUR = 2.6;

// Opening disclaimer card: hold time (seconds) + the text shown / captioned.
// Plays silently over the BGM bed before the show starts.
export const DISC_DUR = 7;
export const DISCLAIMER = {
  ja: 'USGS・JMA・NOAAのデータをもとに自動生成した一般向けの解説です。公式の危険度評価ではありません。地震メカニズム・津波リスク・余震の見込みは推定であり、更新される場合があります。防災情報は各国の公式機関に従ってください。',
  en: 'An automatically generated, general-audience recap based on USGS, JMA and NOAA data — not an official hazard assessment. Earthquake mechanisms, tsunami risk and aftershock outlooks are estimates and may be revised. For disaster guidance, follow your country’s official agencies.',
};

// Leading-silence trim gate for TTS clips (compose.mjs). Anything below this
// level at the head of a clip is treated as silence and clipped so the spoken
// word lands on the caption cue. edge-tts neural voices differ a lot in lead-in:
// Nanami/Keita carry a soft breath/room-tone onset that sits ABOVE -50 dB, so a
// too-low gate leaves the word starting late. -40 dB clips that lead-in while
// staying under real speech (typ. -20…-6 dB). If a voice still starts late,
// raise toward -35/-32; if soft consonants get clipped, lower toward -45.
export const TRIM_DB = -40;
// How long the level must stay below TRIM_DB to count as silence (seconds).
// 0 reacts to the first sample; a tiny value (0.01) ignores single-sample blips.
export const TRIM_DUR = 0.01;

// BGM bed level under narration (dB). Lower = quieter music.
export const BGM_DB = -16;

// Title-card sting level (dB). Lower = quieter sting.
export const STING_DB = -6;

// Video canvas.
export const W = 1920, H = 1080;
export const FPS = 30;
