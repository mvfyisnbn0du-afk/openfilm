import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch } from '../../src/host.mjs';

/* the stage script in a page of its own, one page clip on it: asked as the editor asks, from the page's own origin */
const ORIGIN = 'http://stage.test';
const STAGE = readFileSync(new URL('./stage.js', import.meta.url), 'utf8').replace('__EDITOR__', JSON.stringify(ORIGIN));
const PAGE = `<!doctype html><body style="margin:0;background:#000">
<div id="a" style="position:absolute;left:20px;top:20px;width:100px;height:100px;background:#f00"></div>
<div id="b" style="position:absolute;left:150px;top:50px;width:100px;height:100px;background:#0f0">
<div id="c" style="position:absolute;left:80px;top:0;width:100px;height:100px"></div></div></body>`;
const HOST = `<!doctype html><body style="margin:0">
<iframe id="p" style="position:absolute;left:0;top:0;width:400px;height:200px;border:0;visibility:visible" srcdoc="${PAGE.replace(/"/g, '&quot;')}"></iframe>
<script>
  const el = document.getElementById('p');
  const clips = [{ id: 'p', kind: 'page', el, w: 400, h: 200, ti: 0, overrides: [], get win() { return el.contentWindow; } }];
  window.__filmEditor = { stage: { clips: () => clips } };
  window.film = { ready: new Promise((r) => el.addEventListener('load', r)) };
</script>
<script>${STAGE}</script></body>`;

async function stage() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: HOST }));
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => window.film.ready);
  const ask = (op, args) => page.evaluate(([op, args]) => new Promise((resolve) => {
    const seq = Math.random();
    addEventListener('message', function on(e) {
      if (e.data?.source !== 'openfilm-film' || e.data.seq !== seq) return;
      removeEventListener('message', on);
      resolve(e.data.result);
    });
    postMessage({ source: 'openfilm-studio', type: 'stage', seq, op, ...args }, '*');
  }), [op, args]);
  const style = (sel, css) => page.evaluate(([sel, css]) => {
    const el = sel === 'clip' ? document.getElementById('p') : document.getElementById('p').contentDocument.querySelector(sel);
    el.style.cssText += css;
  }, [sel, css]);
  const layer = async (x, y) => (await ask('hit', { x, y, detail: true }))?.at ?? null;
  return { browser, ask, style, layer };
}

test('what a mask or a crop cuts away is not found: the clip and its layers', { timeout: 60_000 }, async () => {
  const { browser, ask, style, layer } = await stage();
  try {
    assert.equal(await ask('clipAt', { x: 10, y: 10 }), 'p');
    assert.equal(await layer(30, 30), '#a');

    /* the clip's circle: its corners are not the clip, nor its layers */
    await style('clip', 'mask-image: radial-gradient(25% 50% at 50% 50%, #000 99%, transparent 100%)');
    assert.equal(await ask('clipAt', { x: 10, y: 10 }), null);
    assert.equal(await layer(30, 30), null);
    assert.equal(await ask('clipAt', { x: 200, y: 100 }), 'p');
    assert.equal(await layer(200, 100), '#b');
    assert.equal(await layer(115, 100), '#a');

    /* a crop (clip-path) cuts the same way */
    await style('clip', 'mask-image: none; clip-path: inset(0 50% 0 0)');
    assert.equal(await ask('clipAt', { x: 300, y: 100 }), null);
    assert.equal(await ask('clipAt', { x: 100, y: 100 }), 'p');

    /* a layer's own mask, two layers intersected: only where both show */
    await style('clip', 'clip-path: none');
    await style('#a', 'mask-image: linear-gradient(to right, #000 50%, transparent 50%), linear-gradient(#000 50%, transparent 50%); mask-composite: intersect');
    assert.equal(await layer(40, 40), '#a');
    assert.equal(await layer(100, 40), null);
    assert.equal(await layer(40, 100), null);

    /* a parent that clips what overflows it: its child past its edge is not found there */
    await style('#b', 'overflow: hidden');
    await style('#c', 'background: #00f');
    assert.equal(await layer(240, 100), '#c');
    assert.equal(await layer(300, 100), null);
  } finally {
    await browser.close();
  }
});
