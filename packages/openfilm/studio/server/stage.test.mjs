import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOST_FLAG, folderFiles, launch } from '../../src/host.mjs';
import { filmHtml } from '../../src/film-doc.mjs';

const STAGE = readFileSync(new URL('./stage.js', import.meta.url), 'utf8');

/** A film served with Studio's stage in it, the page itself standing in for the editor (its own origin). */
async function stageOf(dir) {
  let files = null;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!files(req, res, url.pathname, url.searchParams)) res.writeHead(403).end();
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  files = folderFiles(dir, { timelineInject: `<script>${HOST_FLAG}</script><script>${STAGE.replaceAll('__EDITOR__', JSON.stringify(origin))}</script>` });
  const browser = await launch();
  const close = async () => { await browser.close(); server.closeAllConnections?.(); server.close(); };
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  /* a setup that fails closes what it opened: a browser left open keeps the test file, and the run, from ending */
  try {
    await page.goto(`${origin}/film.html`);
    /* window.film may not be there yet when the page has loaded */
    await page.waitForFunction(() => Boolean(window.film));
    await page.evaluate(async () => { await window.film.ready; await window.film.frame(0.5); });
  } catch (e) {
    await close();
    throw e;
  }
  let seq = 0;
  /** Ask the stage what the editor asks it. */
  const ask = (op, args) => page.evaluate(({ op, args, seq }) => new Promise((done) => {
    const hear = (e) => {
      if (e.data?.source !== 'openfilm-film' || e.data.type !== 'stage' || e.data.seq !== seq) return;
      window.removeEventListener('message', hear);
      done(e.data.error ? { error: e.data.error } : e.data.result);
    };
    window.addEventListener('message', hear);
    window.postMessage({ source: 'openfilm-studio', type: 'stage', seq, op, ...args }, '*');
  }), { op, args, seq: ++seq });
  return { ask, close };
}

test('a click on a page\'s backdrop (a box filling the page) takes the clip, not the box; a smaller box is taken', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-stage-backdrop-'));
  writeFileSync(join(dir, 'logistics.html'), `<!doctype html><body style="margin:0">
<div id="root" style="position:absolute;inset:0;background:#f7f1e9">
  <h1 id="title" style="position:absolute;left:20px;top:20px;margin:0;font:700 24px sans-serif">Every parcel</h1>
  <div id="card" style="position:absolute;left:200px;top:100px;width:80px;height:50px;background:#f60"></div>
</div>
<script>window.film={duration:2,frame(){}}</script></body>`);
  writeFileSync(join(dir, 'film.html'), filmHtml({ stage: { w: 320, h: 180 }, tracks: [{ clips: [{ id: 'logistics', src: 'logistics.html' }] }] }));
  const stage = await stageOf(dir);
  try {
    assert.equal(await stage.ask('hit', { x: 150, y: 160, detail: true }), null, 'the empty part: no layer, so the clip is taken');
    assert.equal((await stage.ask('hit', { x: 40, y: 30, detail: true }))?.label, 'Every parcel');
    const card = await stage.ask('hit', { x: 240, y: 125, detail: true });
    assert.equal(card?.kind, 'box', 'a box smaller than the page is a layer');
    /* with Alt, the layers under the point in turn: the backdrop is one of them, and once in hand a click keeps it */
    const root = await stage.ask('hit', { x: 240, y: 125, cycleFrom: card.handle, detail: true });
    assert.equal(root?.kind, 'box');
    assert.notEqual(root.handle, card.handle);
    assert.equal((await stage.ask('hit', { x: 150, y: 160, from: root.handle, detail: true }))?.handle, root.handle);
  } finally {
    await stage.close();
  }
});
