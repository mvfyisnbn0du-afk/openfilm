import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import local, { cleanCommand, splitCommand } from './local.mjs';
import { wav } from './common.mjs';
import { chooseProvider } from './index.mjs';

before(() => {
  /* this machine's own setup must not decide these */
  delete process.env.OPENFILM_LOCAL_MUSIC_CMD;
});

const dir = mkdtempSync(join(tmpdir(), 'of-local-'));
let script = 0;
const commonUrl = new URL('./common.mjs', import.meta.url).href;

/**
 * A fake local model: a node script the provider runs as the person's command. It writes the audio files `takes`
 * (name → seconds of WAV, or raw bytes) into {outdir} and says `stderr`, then exits with `code`.
 */
async function fakeCommand({ takes = { 'take.wav': 2 }, code = 0, stderr = '' } = {}) {
  const file = join(dir, `fake-${script += 1}.mjs`);
  const writes = Object.entries(takes).map(([name, seconds]) => {
    const bytes = typeof seconds === 'number'
      ? `Buffer.from(wav(new Uint8Array(${seconds * 16000}), 8000))`
      : `Buffer.from(${JSON.stringify(Buffer.from(/** @type {string} */ (seconds), 'base64').toString('base64'))}, 'base64')`;
    return `writeFileSync(join(outdir, ${JSON.stringify(name)}), ${bytes});`;
  }).join('\n');
  await writeFile(file, `import { writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\nimport { wav } from ${JSON.stringify(commonUrl)};\nconst [, , prompt, sec, outdir] = process.argv;\nif (${JSON.stringify(stderr)}) process.stderr.write(${JSON.stringify(stderr)});\nif (${code} !== 0) process.exit(${code});\nif (!prompt || !sec || !outdir) { process.stderr.write('missing args'); process.exit(9); }\n${writes}\n`);
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(file)} {prompt} {sec} "{outdir}"`;
}

const ctx = (key, files = {}, signal = new AbortController().signal) => ({
  key, model: undefined, root: '/project', signal, say: () => {}, read: async (p) => files[p],
});

test('music from a local command: its file lands, measured in seconds', async () => {
  const result = await local.run('music', { out: 'bed', prompt: 'slow pads', sec: 30 }, ctx(await fakeCommand()));
  assert.equal(result.receipt.provider, 'local');
  assert.equal(result.receipt.model, 'custom');
  assert.match(result.receipt.src, /(^|\/)audio\/music\/bed\.wav$/);
  assert.equal(result.receipt.dur, 2);
  assert.equal(result.index[0].kind, 'audio');
  assert.equal(result.index[0].from.provider, 'local');
  assert.equal(result.cost.note, 'made on this computer: no service was billed');
});

test('sound effects likewise, seconds clamped to the verb with a note', async () => {
  const result = await local.run('sfx', { out: 'hit', prompt: 'door slam', sec: 30 }, ctx(await fakeCommand()));
  assert.match(result.receipt.src, /(^|\/)audio\/sfx\/hit\.wav$/);
  assert.deepEqual(result.receipt.notes, [`whole seconds within the verb's range: 22 s`]);
});

test('the largest take wins; anything that is not audio is ignored', async () => {
  const result = await local.run(
    'music',
    { out: 'bed', prompt: 'p', sec: 10 },
    ctx(await fakeCommand({ takes: { 'small.wav': 1, 'notes.txt': 'not audio', 'big.wav': 4 } })),
  );
  assert.equal(result.receipt.dur, 4);
});

test('no audio left behind says what to do', async () => {
  await assert.rejects(
    local.run('music', { out: 'bed', prompt: 'p', sec: 10 }, ctx(await fakeCommand({ takes: {} }))),
    /left no audio/,
  );
});

test('a failing command says how it exited and what it said', async () => {
  await assert.rejects(
    local.run('music', { out: 'bed', prompt: 'p', sec: 10 }, ctx(await fakeCommand({ code: 3, stderr: 'line one\nline two\n' }))),
    /exit 3[\s\S]*line two/,
  );
});

test('a command that cannot start says so', async () => {
  await assert.rejects(
    local.run('music', { out: 'bed', prompt: 'p', sec: 10 }, ctx('definitely-missing-binary-xyz --prompt {prompt} --sec {sec} --outdir {outdir}')),
    /no start/,
  );
});

test('anything but music and sfx is refused; without a command nothing runs', async () => {
  await assert.rejects(local.run('image', { out: 'x', prompt: 'p' }, ctx('whatever {outdir}')), /does not do image/);
  await assert.rejects(local.run('music', { out: 'bed', prompt: 'p' }, ctx('')), /No local command/);
});

test('a pasted command names its output folder on one line', () => {
  assert.equal(cleanCommand('  python m.py --prompt {prompt} --sec {sec} --outdir {outdir}  '), 'python m.py --prompt {prompt} --sec {sec} --outdir {outdir}');
  assert.throws(() => cleanCommand('python m.py --prompt {prompt}'), /{outdir}/);
  assert.throws(() => cleanCommand('python m.py {outdir}\nrm -rf /'), /one line/);
  assert.throws(() => cleanCommand('x'.repeat(2001) + ' {outdir}'), /too long/);
  assert.throws(() => cleanCommand(''), /Paste the command/);
});

test('command lines split without a shell, quotes group words', () => {
  assert.deepEqual(splitCommand(`python "C:\\my models\\m.py" --prompt {prompt} --outdir "{outdir}"`), ['python', 'C:\\my models\\m.py', '--prompt', '{prompt}', '--outdir', '{outdir}']);
  assert.deepEqual(splitCommand(`it 'two words' plain`), ['it', 'two words', 'plain']);
});

test('a kept command or the environment serves music through --via', async () => {
  const settings = { keys: { local: await fakeCommand(), use: {}, model: {} }, use: {}, model: {} };
  assert.equal((await chooseProvider('music', { via: 'local', settings }))?.id, 'local');
  await assert.rejects(chooseProvider('music', { via: 'local', settings: { keys: {}, use: {}, model: {} } }), /no.*key|OPENFILM_LOCAL_MUSIC_CMD/);
  process.env.OPENFILM_LOCAL_MUSIC_CMD = await fakeCommand();
  try {
    assert.equal((await chooseProvider('sfx', { via: 'local', settings: { keys: {}, use: {}, model: {} } }))?.id, 'local');
  } finally {
    delete process.env.OPENFILM_LOCAL_MUSIC_CMD;
  }
});

test('aborting stops the command', async () => {
  const controller = new AbortController();
  const slow = join(dir, `slow-${Date.now()}.mjs`);
  await writeFile(slow, `await new Promise((r) => setTimeout(r, 60000));`);
  const promise = local.run(
    'music',
    { out: 'bed', prompt: 'p', sec: 10 },
    ctx(`${JSON.stringify(process.execPath)} ${JSON.stringify(slow)} {prompt} {sec} {outdir}`, {}, controller.signal),
  );
  controller.abort();
  await assert.rejects(promise, /stopped/);
});
