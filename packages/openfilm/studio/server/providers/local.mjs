// @ts-check
/**
 * A local model the person points OpenFilm at: music and sound effects made on this computer, with no service and no
 * key. The person sets the command that makes them, in Studio (Settings → Providers → Local model) or in the
 * environment (OPENFILM_LOCAL_MUSIC_CMD), for example a MusicGen, Stable Audio Open or ACE-Step setup of their own
 * (docs/local-music.md). The command gets the prompt, the length and a folder, and leaves an audio file there:
 *
 *   python C:\models\musicgen.py --prompt {prompt} --sec {sec} --outdir {outdir}
 *
 * `{prompt}` is the text, `{sec}` the seconds asked (whole seconds), `{outdir}` an empty folder the run made for
 * this. Whatever audio file it leaves there (mp3, wav, ogg, flac, m4a) is the take: the largest one wins.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { clamp, landing, modelOf, mp3Seconds, needed, notes, number, round, text, wavSeconds } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider @typedef {import('./contract.mjs').RunContext} RunContext */

const NAME = 'Local model';
/** the variable whose value connects this provider (the command itself, not a key) */
export const ENV = 'OPENFILM_LOCAL_MUSIC_CMD';
/** what the command may leave behind (anything else there is ignored) */
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a', '.aac']);

/** the local models: the person's own command, the default and only one */
const MODELS = {
  music: [{ id: 'custom', name: 'Custom command' }],
  sfx: [{ id: 'custom', name: 'Custom command' }],
};

/**
 * A pasted command as it is kept: one line, with a place for the output folder. get.mjs substitutes the run's own
 * values; anything else in it is the person's own setup, run as them. Throws a sentence the page can show.
 * @param {unknown} value
 */
export function cleanCommand(value) {
  if (typeof value !== 'string') throw new Error('Paste the command that makes the audio, on one line.');
  const command = value.trim().replace(/\s+/g, ' ');
  if (!command || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Paste the command that makes the audio, on one line.');
  if (command.length > 2000) throw new Error('That command is too long: 2000 characters at most.');
  if (!command.includes('{outdir}')) throw new Error('The command must name where the audio goes, with {outdir} (and usually {prompt} and {sec}).');
  return command;
}

/**
 * A command line in argv, honoring single and double quotes (no shell is ever used, so quoting only groups words).
 * @param {string} command
 */
export function splitCommand(command) {
  /** @type {string[]} */
  const parts = [];
  let current = '';
  /** @type {string | null} */
  let quote = null;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) { parts.push(current); current = ''; }
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** @type {Provider} */
export default {
  id: 'local',
  name: NAME,
  env: ENV,
  keysUrl: 'https://github.com/openfilm/openfilm/blob/main/docs/local-music.md',
  billingUrl: 'https://github.com/openfilm/openfilm/blob/main/docs/local-music.md',
  verbs: ['music', 'sfx'],
  models: MODELS,
  cleanKey: cleanCommand,
  async run(verb, args, ctx) {
    if (verb !== 'music' && verb !== 'sfx') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    modelOf(MODELS, verb, ctx);
    const template = text(ctx.key);
    if (!template) throw new Error(`No local command: set ${ENV}, or paste one in Studio (Settings → Providers → Local model).`);
    const asked = number(args.sec);
    /* the verb's own range is checked by get.mjs; whole seconds here, the way CLIs take them */
    const sec = asked === null ? (verb === 'music' ? 30 : 5) : Math.round(clamp(asked, verb === 'music' ? 3 : 0.5, verb === 'music' ? 300 : 22));
    const outdir = await mkdtemp(join(tmpdir(), 'openfilm-local-'));
    try {
      const said = await generate(template, { prompt, sec, outdir }, ctx);
      if (asked !== null && asked !== sec) said.push(`whole seconds within the verb's range: ${sec} s`);
      const take = await pickTake(outdir);
      if (!take) throw new Error(`The local command left no audio in its folder (${template.split(/\s+/)[0]}). Its output is in Studio's log; make it write an mp3, wav, ogg, flac or m4a file.`);
      const bytes = new Uint8Array(await readFile(take.path));
      if (!bytes.length) throw new Error(`The local command left an empty file (${take.file}).`);
      const ext = extname(take.file).slice(1).toLowerCase();
      const path = landing(verb === 'sfx' ? 'audio/sfx' : 'audio/music', args.out, ext);
      const dur = ext === 'wav' ? (wavSeconds(bytes) ?? sec) : ext === 'mp3' ? mp3Seconds(bytes) : sec;
      return {
        files: [{ path, bytes }],
        index: [{ src: path, kind: 'audio', dur: round(dur), from: { mode: 'generate', prompt, ...(asked !== null && asked !== sec ? { sec: asked } : {}), provider: 'local', model: 'custom' } }],
        receipt: { provider: 'local', model: 'custom', src: path, dur: round(dur), ...notes(said) },
        cost: { note: 'made on this computer: no service was billed' },
      };
    } finally {
      await rm(outdir, { recursive: true, force: true });
    }
  },
};

/**
 * Run the person's command with its placeholders filled in, without a shell. Resolves with notes for the receipt
 * (what was run, when seconds were rounded). Rejects with what the command said, at most a screenful.
 * @param {string} template @param {{ prompt: string, sec: number, outdir: string }} values @param {RunContext} ctx
 * @returns {Promise<string[]>}
 */
async function generate(template, { prompt, sec, outdir }, ctx) {
  const argv = splitCommand(template)
    .map((part) => part.split('{prompt}').join(prompt).split('{sec}').join(String(sec)).split('{outdir}').join(outdir));
  if (!argv.length) throw new Error('The local command is empty.');
  const [command, ...rest] = /** @type {[string, ...string[]]} */ (argv);
  ctx.say(`Local model: ${command} ${rest.length ? '…' : ''}`.trim());
  /** @type {string} */
  let stderr = '';
  const child = spawn(command, rest, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const done = new Promise((resolve) => {
    child.on('error', () => resolve({ code: null }));
    child.on('exit', (code) => resolve({ code }));
  });
  child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const kill = () => { try { child.kill(); } catch { /* gone already */ } };
  if (ctx.signal.aborted) kill();
  else ctx.signal.addEventListener('abort', kill, { once: true });
  const { code } = /** @type {{ code: number | null }} */ (await done);
  ctx.signal.removeEventListener('abort', kill);
  if (ctx.signal.aborted) throw new Error('The local command was stopped.');
  if (code !== 0) {
    const said = stderr.trim().split(/\r?\n/).slice(-8).join('\n');
    throw new Error(`The local command failed (exit ${code === null ? 'no start' : code}).${said ? ` It said:\n${said}` : ''}`);
  }
  return [];
}

/**
 * The take: the largest audio file the command left in its folder, or null.
 * @param {string} outdir
 */
async function pickTake(outdir) {
  let take = null;
  for (const file of await readdir(outdir)) {
    if (!AUDIO_EXTS.has(extname(file).toLowerCase())) continue;
    const { size } = await stat(join(outdir, file));
    if (size > 0 && (!take || size > take.size)) take = { file, path: join(outdir, file), size };
  }
  return take;
}
