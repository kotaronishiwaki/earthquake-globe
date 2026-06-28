#!/usr/bin/env node
/* Globe Weekly — Azure Speech REST API client.
 *
 * Drop-in replacement for edge-tts-client.mjs.
 * Requires env vars: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION
 *
 * Docs: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
 */

const KEY    = (process.env.AZURE_SPEECH_KEY    || '').trim();
const REGION = (process.env.AZURE_SPEECH_REGION || '').trim().toLowerCase();
const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

// Log config once on import so problems are visible immediately.
console.log(`[azure-tts] region="${REGION}" key="${KEY.slice(0, 4)}…${KEY.slice(-4)}" (${KEY.length} chars)`);

function xmlEsc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Synthesize text to MP3 using the Azure Speech REST API.
 * @param {string} voice  e.g. 'ja-JP-NanamiNeural'
 * @param {string} text   Plain text (not SSML).
 * @returns {Promise<Buffer>} MP3 audio data.
 */
export async function synthesize(voice, text) {
  if (!KEY || !REGION) {
    throw new Error('AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set in .env');
  }

  const lang = voice.split('-').slice(0, 2).join('-'); // e.g. 'ja-JP-NanamiNeural' → 'ja-JP'
  const url  = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${voice}'>${xmlEsc(text)}</voice></speak>`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type':               'application/ssml+xml; charset=utf-8',
      'X-Microsoft-OutputFormat':   FORMAT,
      'User-Agent':                 'GlobeWeekly/1.0',
    },
    body: ssml,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '(unreadable)');
    console.error(`[azure-tts] 400 debug:`);
    console.error(`  URL  : ${url}`);
    console.error(`  voice: ${voice}`);
    console.error(`  SSML : ${ssml}`);
    console.error(`  body : ${msg}`);
    console.error(`  hdrs : ${JSON.stringify(Object.fromEntries(res.headers))}`);
    throw new Error(`Azure TTS HTTP ${res.status}: ${msg || '(empty body)'}`);
  }

  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}
