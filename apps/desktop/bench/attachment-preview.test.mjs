/** The light picture viewer through the real component: closes three ways, Download only in its right-click menu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import shellConfig from '../shell/vite.config.ts';

test('a picture opens in a light viewer: dimmed window, picture centered at its own size, Esc, a click beside it or × close it, Download in its right-click menu', { timeout: 60_000 }, async () => {
  const server = await createServer({
    ...shellConfig, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [...shellConfig.plugins, {
      name: 'attachment-preview-fixture',
      configureServer(app) {
        app.middlewares.use('/attachment-preview', (_req, res, next) => {
          res.setHeader('content-type', 'text/html');
          void app.transformIndexHtml('/attachment-preview', '<!doctype html><html><body><div id="root"></div><script type="module" src="/bench/attachment-preview.tsx"></script></body></html>')
            .then((html) => res.end(html), next);
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/attachment-preview`);
    const open = (which) => page.evaluate((w) => window.attachmentPreviewFixture.open(w), which);
    const dialog = page.getByRole('dialog', { name: 'screenshot.png' });
    const picture = dialog.getByRole('img', { name: 'screenshot.png' });

    await open('picture');
    await picture.waitFor();
    const box = await picture.boundingBox();
    assert.deepEqual([Math.round(box.width), Math.round(box.height)], [600, 400], 'at its own size, not enlarged to the window');
    assert.ok(Math.abs(box.x + box.width / 2 - 600) < 2, 'centered across the window');
    assert.match(await dialog.evaluate((el) => getComputedStyle(el).backgroundColor), /^(?:rgba\(0, 0, 0, |oklab\(0 0 0 \/ )0\.75\)$/, 'the window behind is dimmed');
    assert.equal(await dialog.getByText(/Fit|100%/).count(), 0, 'no Fit / 100% bar');
    assert.equal(await dialog.getByRole('link', { name: 'Download' }).count(), 0, 'no Download until the right-click menu');

    await picture.click({ button: 'right' });
    const download = page.getByRole('menuitem', { name: 'Download' });
    await download.waitFor();
    assert.equal(await download.getAttribute('download'), 'screenshot.png');
    await page.keyboard.press('Escape');
    await download.waitFor({ state: 'hidden' });
    assert.equal(await dialog.isVisible(), true, 'Esc closes the menu first');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });

    await open('picture');
    await picture.click();
    assert.equal(await dialog.isVisible(), true, 'a click on the picture keeps it open');
    await page.mouse.click(20, 780);
    await dialog.waitFor({ state: 'hidden' });

    await open('picture');
    const close = await dialog.getByRole('button', { name: 'Close' }).boundingBox();
    assert.ok(close.x + close.width > 1150 && close.y < 60, 'the × at the top right');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'hidden' });

    await open('thumb');
    await picture.waitFor();
    assert.equal(await dialog.getByText(/A thumbnail kept with the message/).isVisible(), true, 'a thumbnail says so');
    await picture.click({ button: 'right' });
    assert.equal(await page.getByRole('menuitem', { name: 'Download' }).count(), 0, 'a thumbnail has no Download: it would pass for the original');
    if (process.env.OPENFILM_PREVIEW_SHOT) await page.screenshot({ path: process.env.OPENFILM_PREVIEW_SHOT });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
