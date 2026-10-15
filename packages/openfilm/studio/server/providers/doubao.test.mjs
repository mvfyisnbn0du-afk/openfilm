import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import doubao, { doubaoResult } from './doubao.mjs';
import { providerKey, changeSettings } from '../keys.mjs';
import { chooseProvider } from './index.mjs';
import { runGet } from '../get.mjs';
import { readTranscript } from '../transcripts.mjs';

const fixture = () => ({ result: { text: '你好，AI native。', utterances: [{ words: [
  { text: '你', start_time: 100, end_time: 300 }, { text: '好', start_time: 300, end_time: 600 },
  { text: ' ', start_time: -1, end_time: -1 }, { text: 'AI', start_time: 800, end_time: 1000 },
  { text: 'native', start_time: 1100, end_time: 1800 },
] }] } });
let server;
let reply = (_req, res) => res.writeHead(200, { 'Content-Type': 'application/json', 'X-Api-Status-Code': '20000000' }).end(JSON.stringify(fixture()));
const seen = [];
const oldUrl = process.env.OPENFILM_DOUBAO_URL;
before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks)) });
    reply(req, res);
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  process.env.OPENFILM_DOUBAO_URL = `http://127.0.0.1:${server.address().port}/recognize/flash`;
});
after(async () => {
  await new Promise(done => server.close(done));
  if (oldUrl === undefined) delete process.env.OPENFILM_DOUBAO_URL;
  else process.env.OPENFILM_DOUBAO_URL = oldUrl;
});

test('word timings are real, complete and numeric; whitespace-only tokens are ignored', () => {
  const result = doubaoResult(fixture(), '20000000', 2);
  assert.deepEqual(result.words[2], { token: 'AI', start: 0.8, end: 1 });
  assert.equal(result.words.length, 4);
  assert.throws(() => doubaoResult(fixture(), '45000001', 2));
  for (const change of [
    b => b.result.utterances[0].words.pop(),
    b => b.result.utterances[0].words[0].end_time = 9000,
    b => b.result.utterances[0].words[1].start_time = 0,
    b => b.result.utterances[0].words[0].start_time = null,
    b => b.result.utterances[0].words = {},
  ]) {
    const body = fixture(); change(body);
    assert.throws(() => doubaoResult(body, '20000000', 2));
  }
});

test('native key settings honor explicit keys, environment keys and disconnect', () => {
  const settings = { keys: {}, use: {}, model: {}, off: [], custom: [] };
  const env = { DOUBAO_ASR_API_KEY: 'fake-env-key' };
  assert.equal(providerKey(doubao, settings, env).source, 'env');
  assert.equal(providerKey(doubao, { ...settings, off: ['doubao'] }, env), null);
  assert.equal(providerKey(doubao, { ...settings, keys: { doubao: 'fake-explicit-key' } }, env).key, 'fake-explicit-key');
});

test('MP4 to fake Doubao to word-timed VTT; cache reuse, HTTP failures and uncertain requests', async () => {
  // Retain this isolated synthetic project for inspection; never use an installed Studio or real credentials.
  const root = mkdtempSync(join(tmpdir(), 'openfilm-doubao-test-'));
  mkdirSync(join(root, 'assets'));
  const oldHome = process.env.OPENFILM_HOME;
  process.env.OPENFILM_HOME = join(root, 'settings');
  try {
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', join(root, 'assets', 'speech.mp4')], { windowsHide: true });
    await changeSettings(s => { s.keys.doubao = 'fake-test-key'; s.use.asr = 'doubao'; });
    assert.equal((await chooseProvider('asr')).id, 'doubao');
    await runGet(root, 'asr', { src: 'assets/speech.mp4' });
    assert.equal(seen.length, 1);
    const sent = seen[0];
    assert.equal(sent.url, '/recognize/flash');
    assert.equal(sent.headers['x-api-key'], 'fake-test-key');
    assert.equal(sent.headers['x-api-resource-id'], 'volc.bigasr.auc_turbo');
    assert.equal(sent.headers['x-api-sequence'], '-1');
    assert.ok(sent.headers['x-api-request-id']);
    assert.equal(sent.body.request.show_utterances, true);
    assert.equal(sent.body.request.enable_ddc, false);
    const audio = Buffer.from(sent.body.audio.data, 'base64');
    assert.ok(audio.toString('ascii', 0, 3) === 'ID3' || audio[0] === 255);
    const transcript = await readTranscript(root, 'assets/speech.mp4');
    assert.ok(transcript.lines.some(l => l.text.includes('AI native')));
    const vtt = readFileSync(join(root, 'assets', 'speech.vtt'), 'utf8');
    assert.ok(vtt.includes('<00:00:00.800>AI'));
    const raw = readFileSync(join(root, 'assets', 'asr', readdirSync(join(root, 'assets', 'asr'))[0]), 'utf8');
    assert.ok(!raw.includes('fake-test-key'));
    assert.equal(JSON.parse(raw).state, 'received');
    await runGet(root, 'asr', { src: 'assets/speech.mp4' });
    assert.equal(seen.length, 1);
    const force = () => runGet(root, 'asr', { src: 'assets/speech.mp4', force: true });
    for (const status of [401, 403, 429, 500]) {
      reply = (_req, res) => res.writeHead(status).end('fake-test-key');
      const count = seen.length;
      await assert.rejects(force(), e => e.message.includes(`HTTP ${status}`) && !e.message.includes('fake-test-key'));
      assert.equal(seen.length, count + 1);
    }
    reply = (_req, res) => res.writeHead(402).end();
    await assert.rejects(force(), /balance/);
    reply = (_req, res) => res.writeHead(302, { location: process.env.OPENFILM_DOUBAO_URL }).end();
    const beforeRedirect = seen.length;
    await assert.rejects(force(), /Not retried/);
    assert.equal(seen.length, beforeRedirect + 1, 'redirects do not resend credentials');
    reply = (_req, res) => res.writeHead(200, { 'X-Api-Status-Code': '45000001' }).end(JSON.stringify(fixture()));
    await assert.rejects(force(), /did not report recognition success/);
    reply = (req) => req.socket.destroy();
    const count = seen.length;
    await assert.rejects(force(), /Not retried/);
    assert.equal(seen.length, count + 1);
    assert.equal(readFileSync(join(root, 'assets', 'speech.vtt'), 'utf8'), vtt);
  } finally {
    if (oldHome === undefined) delete process.env.OPENFILM_HOME;
    else process.env.OPENFILM_HOME = oldHome;
  }
});
