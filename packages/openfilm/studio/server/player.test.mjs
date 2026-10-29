import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { folderFiles, launch } from '../../src/host.mjs';
import { soundOf } from './derived.mjs';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('the real mixer keeps fast sound in step, including a source trim and changing viewer speed', { skip: !hasFfmpeg && 'no ffmpeg', timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-fast-player-'));
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=144', '-c:a', 'aac', join(root, 'tone.m4a')]);
  /* Warm the same copy Studio serves; this test measures the mixer, not ffmpeg's startup time. */
  await soundOf(root, 'tone.m4a', 4);
  const modules = new Map(['editor/player.ts', 'lib/playback-speed.ts'].map((path) => [
    `/${path}`, stripTypeScriptTypes(readFileSync(new URL(`../ui/src/${path}`, import.meta.url), 'utf8')),
  ]));
  let delay = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://test');
    if (modules.has(url.pathname)) { res.writeHead(200, { 'content-type': 'text/javascript' }).end(modules.get(url.pathname)); return; }
    if (url.pathname === '/tone.m4a') {
      if (delay) { const wait = delay; delay = 0; await new Promise((resolve) => setTimeout(resolve, wait)); }
      const file = await soundOf(root, 'tone.m4a', Number(url.searchParams.get('film-sound') || 1));
      if (res.destroyed) return;
      folderFiles(dirname(file))(req, res, `/${basename(file)}`, url.searchParams);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><button>Play</button>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      const { Player } = await import('/editor/player.ts');
      const OriginalAudio = window.Audio;
      window.audios = [];
      window.Audio = function () {
        const el = new OriginalAudio();
        el.addEventListener('playing', () => { el.firstPlaying ??= { sourceTime: el.currentTime, filmTime: window.player.time() }; });
        window.audios.push(el);
        return el;
      };
      const p = window.player = new Player();
      p.load(location.origin, [{ clip: 'fast', src: '/tone.m4a', at: 1, from: 8, to: 136, speed: 16, volume: 0.5, fade: [0.2, 0.2] }], 9);
      p.setRate(4);
      document.querySelector('button').onclick = () => p.play(2.5);
    });
    await page.click('button');
    await page.waitForFunction(() => window.audios.some((a) => a.readyState >= 2 && !a.paused && a.currentTime > 0));
    const snapshot = () => page.evaluate(() => {
      const a = window.audios.findLast((a) => a.hasAttribute('src'));
      const levels = window.player.levels();
      return { src: a.src, rate: a.playbackRate, pitch: a.preservesPitch, sourceTime: a.currentTime, filmTime: window.player.time(), level: levels ? Math.max(...levels[0].map(Math.abs)) : 0 };
    });
    const fast = await snapshot();
    assert.equal(new URL(fast.src).searchParams.get('film-sound'), '4');
    assert.equal(fast.rate, 16);
    assert.equal(fast.pitch, true);
    assert.ok(Math.abs(fast.sourceTime * 4 - (8 + (fast.filmTime - 1) * 16)) < 4, JSON.stringify(fast));
    await page.waitForFunction(() => window.player.levels()?.[0].some((v) => Math.abs(v) > 0.001));
    /* Switching down must use the original file again, still at the same film/source position. */
    await page.evaluate(() => window.player.setRate(1));
    await page.waitForFunction(() => window.audios.some((a) => a.hasAttribute('src') && new URL(a.src).searchParams.get('film-sound') === '1' && a.readyState >= 2 && !a.paused && a.currentTime > 0));
    const normal = await snapshot();
    assert.equal(normal.rate, 16);
    assert.ok(Math.abs(normal.sourceTime - (8 + (normal.filmTime - 1) * 16)) < 4, JSON.stringify(normal));
    assert.ok(normal.filmTime >= fast.filmTime && normal.filmTime - fast.filmTime < 2, 'changing speed keeps the film position');
    await page.evaluate(() => window.player.seek(4));
    await page.waitForFunction(() => window.audios.findLast((a) => a.hasAttribute('src'))?.firstPlaying);
    const sought = await snapshot();
    assert.ok(Math.abs(sought.sourceTime - (8 + (sought.filmTime - 1) * 16)) < 4, `seeking keeps the source trim: ${JSON.stringify(sought)}`);
    /* A cold cache (or slow media read) must join at the current playhead, not where loading started. */
    delay = 600;
    await page.evaluate(() => {
      window.player.pause();
      window.player.setVersions(() => 2);
      window.player.setRate(4);
      window.player.play(2.5);
    });
    await page.waitForFunction(() => window.audios.some((a) => a.hasAttribute('src') && new URL(a.src).searchParams.get('v') === '2' && a.firstPlaying));
    const late = await page.evaluate(() => window.audios.findLast((a) => a.hasAttribute('src')).firstPlaying);
    assert.ok(Math.abs(late.sourceTime * 4 - (8 + (late.filmTime - 1) * 16)) < 8, `late sound joins in step: ${JSON.stringify(late)}`);
    delay = 600;
    const expired = await page.evaluate(async () => {
      window.player.pause();
      window.player.setVersions(() => 3);
      window.player.load(location.origin, [{ src: '/tone.m4a', at: 0, from: 0, to: 16, speed: 16, volume: 1 }], 1);
      const before = window.audios.length;
      window.player.play(0);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return window.audios.slice(before).some((a) => a.firstPlaying);
    });
    assert.equal(expired, false, 'a copy arriving after its clip ended never starts playing');
    await page.evaluate(() => window.player.close());
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});
