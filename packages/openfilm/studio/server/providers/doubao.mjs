// @ts-check
/** Doubao recorded-speech recognition with the person's Volcengine Speech API key. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { inside } from '../files.mjs';
import { billedBy, needed, noBalance, serviceUrl } from './common.mjs';

const exec = promisify(execFile);
const NAME = 'Doubao';
const MODEL = 'volc.bigasr.auc_turbo';
const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';
/** Convert only actual service timestamps, in milliseconds, to OpenFilm words in seconds.
 * @param {any} body @param {string | null} status @param {number} duration */
export function doubaoResult(body, status, duration) {
  if (status !== '20000000') throw new Error('Doubao did not report recognition success. Check Speech service access and balance. Not retried.');
  const result = body?.result;
  if (!result || typeof result.text !== 'string' || !Array.isArray(result.utterances)) throw new Error('Doubao returned no transcript or utterance timestamps.');
  const words = [];
  let previous = -1;
  for (const line of result.utterances) {
    if (!Array.isArray(line?.words)) throw new Error('Doubao returned no word timestamps.');
    for (const w of line.words) {
      if (!w || typeof w.text !== 'string' || !w.text.trim()) continue;
      if (typeof w.start_time !== 'number' || typeof w.end_time !== 'number') throw new Error('Doubao returned nonnumeric timestamps.');
      const start = w.start_time / 1000, end = w.end_time / 1000;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start < previous || end > duration + 0.15) throw new Error('Doubao returned invalid or out-of-range word timestamps; the response was retained.');
      words.push({ token: w.text, start, end });
      previous = start;
    }
  }
  const content = (/** @type {string} */ s) => s.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '').toLowerCase();
  if (!words.length || content(words.map((w) => w.token).join('')) !== content(result.text)) throw new Error('Doubao word timestamps do not cover the transcript; the response was retained.');
  return { text: result.text, words };
}

/** @type {import('./contract.mjs').Provider} */
export default {
  id: 'doubao', name: NAME, env: 'DOUBAO_ASR_API_KEY', speechFormat: 'mp3',
  keysUrl: 'https://console.volcengine.com/speech/app',
  billingUrl: 'https://console.volcengine.com/finance/overview/',
  verbs: ['asr'], models: { asr: [{ id: MODEL, name: MODEL }] },
  async run(verb, args, ctx) {
    if (verb !== 'asr') throw new Error(`${NAME} does not do ${verb}.`);
    const src = needed(args, 'src');
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', inside(ctx.root, src)], { windowsHide: true, signal: ctx.signal });
    const duration = Number(JSON.parse(stdout).format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw new Error('Doubao supports recordings up to 2 hours. Split this recording first. No audio was uploaded.');
    const bytes = Buffer.from(await ctx.read(src));
    if (!bytes.length || bytes.length >= 100_000_000) throw new Error('Doubao requires audio smaller than 100 MB. No audio was uploaded.');
    const requestId = randomUUID();
    const rawPath = `assets/asr/doubao-${requestId}.json`;
    await mkdir(inside(ctx.root, 'assets/asr'), { recursive: true });
    const record = { provider: 'doubao', model: MODEL, src, duration, requestId, state: 'submitted' };
    await writeFile(inside(ctx.root, rawPath), JSON.stringify(record), { flag: 'wx' });
    let response;
    try {
      response = await fetch(serviceUrl('DOUBAO', ENDPOINT), {
        method: 'POST', redirect: 'error', signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(180_000)]),
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': ctx.key, 'X-Api-Resource-Id': MODEL, 'X-Api-Request-Id': requestId, 'X-Api-Sequence': '-1' },
        body: JSON.stringify({ user: { uid: 'openfilm-local' }, audio: { data: bytes.toString('base64') }, request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: false, show_utterances: true } }),
      });
    } catch { throw new Error(`Doubao was interrupted or timed out and may have charged. Check the console before retrying. Request record: ${rawPath}. Not retried.`); }
    const status = response.headers.get('X-Api-Status-Code');
    if (!response.ok) {
      if (response.status === 402) throw noBalance(NAME);
      throw new Error(`Doubao HTTP ${response.status}. Check the Speech API key, flash recognition access and balance. Not retried.`);
    }
    const body = await response.json();
    await writeFile(inside(ctx.root, rawPath), JSON.stringify({ ...record, state: 'received', status, response: body }, null, 2));
    const result = doubaoResult(body, status, duration);
    return { files: [], index: [{ src, ...result, transcribed: true }],
      receipt: { provider: 'doubao', model: MODEL, src, text: result.text, words: result.words.length, raw: rawPath }, cost: billedBy(NAME) };
  },
};
