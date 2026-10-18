import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './host.mjs';
import { locate } from './shared.mjs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { get } from 'node:http';
import { once } from 'node:events';

test('cancelled media requests close their files so the project can be renamed', { timeout: 10000 }, async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'of-host-cancel-'));
  const root = join(scratch, 'film');
  mkdirSync(root);
  const data = Buffer.alloc(16 * 1024 * 1024);
  data.write('0123456789');
  writeFileSync(join(root, 'video.mp4'), data);
  const streams = [];
  const create = fs.createReadStream;
  const mocked = t.mock.method(fs, 'createReadStream', (...args) => {
    const stream = create(...args);
    streams.push(stream);
    return stream;
  });
  syncBuiltinESMExports();
  const site = await serve(root);
  try {
    const head = await fetch(`${site.url}/video.mp4`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(streams.length, 0, 'HEAD opens no file stream');
    const part = await fetch(`${site.url}/video.mp4`, { headers: { range: 'bytes=0-7' } });
    assert.equal(part.status, 206);
    assert.equal(await part.text(), '01234567');
    for (const range of [undefined, 'bytes=0-']) {
      await new Promise((done, fail) => {
        const req = get(`${site.url}/video.mp4`, { headers: range ? { range } : {} }, (res) => {
          res.on('error', () => {});
          res.once('data', () => { res.destroy(); done(); });
        });
        req.on('error', fail);
      });
      const stream = streams.at(-1);
      if (!stream.closed) await new Promise((done, fail) => {
        const timer = setTimeout(() => fail(new Error('cancelled request left its file open')), 1500);
        stream.once('close', () => { clearTimeout(timer); done(); });
      });
      assert.equal(stream.closed, true, `${range ?? 'full'} request releases its file`);
    }
    await fs.promises.rename(root, join(scratch, 'renamed'));
    assert.equal(fs.existsSync(join(scratch, 'renamed', 'video.mp4')), true);
  } finally {
    for (const stream of streams) {
      stream.destroy();
      if (!stream.closed) await once(stream, 'close');
    }
    await site.close();
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
});

test('the served folder is all a page reads: no way out through .., a link or a malformed address', { skip: process.platform === 'win32' && 'links need Developer Mode on Windows' }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'of-host-'));
  const root = join(scratch, 'film');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'assets', 'a.txt'), 'mine');
  writeFileSync(join(scratch, 'secret.txt'), 'secret');
  /* a film from elsewhere can bring links to anywhere: to a file, and to a folder above it */
  symlinkSync(join(scratch, 'secret.txt'), join(root, 'assets', 'notes.txt'));
  symlinkSync(scratch, join(root, 'assets', 'up'));
  /* a link that stays inside is followed */
  symlinkSync(join(root, 'assets', 'a.txt'), join(root, 'same.txt'));
  const site = await serve(root);
  try {
    const get = async (path) => { const r = await fetch(site.url + path); return [r.status, await r.text()]; };
    assert.deepEqual(await get('/assets/a.txt'), [200, 'mine']);
    assert.deepEqual(await get('/same.txt'), [200, 'mine']);
    assert.equal((await get('/assets/notes.txt'))[0], 403);
    assert.equal((await get('/assets/up/secret.txt'))[0], 403);
    assert.notEqual((await get('/%2e%2e/secret.txt'))[1], 'secret');
    assert.notEqual((await get('/assets/..%2f..%2fsecret.txt'))[1], 'secret');
    assert.equal((await get('/%E0%A4%A'))[0], 400);
    assert.deepEqual(await get('/assets/a.txt'), [200, 'mine'], 'and it still serves');
  } finally {
    await site.close();
  }
});

test('look and render serve the film\'s project, never the folders around it', () => {
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'of-work-')));
  const film = join(work, 'forked');
  mkdirSync(join(film, 'scenes'), { recursive: true });
  writeFileSync(join(film, 'film.html'), '{"stage":{"w":16,"h":9},"tracks":[]}');
  writeFileSync(join(film, 'scenes', 'title.html'), '<!doctype html>');
  mkdirSync(join(work, 'page'));
  writeFileSync(join(work, 'page', 'index.html'), '<!doctype html>');
  writeFileSync(join(work, '.env'), 'SECRET=1');
  const was = process.cwd();
  process.chdir(work);
  try {
    /* run from a folder that holds other things (a workspace, a home folder) */
    assert.equal(locate('forked').root, film);
    assert.equal(locate('forked/scenes/title.html').root, film, 'a scene page still reaches ../ inside its project');
    assert.equal(locate('page').root, join(work, 'page'), 'a page on its own is served from its own folder');
    /* a host that names the project serves it */
    assert.equal(locate(join(film, 'scenes', 'title.html'), film).root, film);
  } finally {
    process.chdir(was);
  }
});
