import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasFor, fitToCanvas } from './canvas-fit.ts';

test('another shape keeps the canvas short side (1920×1080 made 3:4 is 1080×1440)', () => {
  assert.deepEqual(canvasFor({ w: 1920, h: 1080 }, '3:4'), { w: 1080, h: 1440 });
  assert.deepEqual(canvasFor({ w: 1920, h: 1080 }, '9:16'), { w: 1080, h: 1920 });
  assert.deepEqual(canvasFor({ w: 1080, h: 1920 }, '16:9'), { w: 1920, h: 1080 });
  assert.deepEqual(canvasFor({ w: 1920, h: 1080 }, '2.35:1'), { w: 2538, h: 1080 });
});

test('the film is scaled whole into the new canvas, centered, as an editor does: a full-frame video, a placed title', () => {
  const from = { w: 1920, h: 1080 }, to = { w: 1080, h: 1440 };
  const out = fitToCanvas([
    { id: 'v', kind: 'video', own: { w: 1920, h: 1080 } },
    { id: 't', kind: 'still', own: { w: 400, h: 200 }, box: { x: 760, y: 0, w: 400, h: 200 } },
    { id: 's', kind: 'sound' },
  ], from, to);
  /* k = 1080 / 1920: the video spans the width, centered in height */
  assert.deepEqual(out.find((c) => c.id === 'v')?.box, { x: 0, y: 416, w: 1080, h: 608 });
  assert.deepEqual(out.find((c) => c.id === 't')?.box, { x: 428, y: 416, w: 225, h: 113 });
  assert.equal(out.some((c) => c.id === 's'), false);
});

test('a page laid out at the canvas keeps the old canvas as its size, so it is scaled as a video is', () => {
  const from = { w: 1920, h: 1080 }, to = { w: 1080, h: 1440 };
  const out = fitToCanvas([
    { id: 'free', kind: 'page', own: from, reflows: true },
    { id: 'sized', kind: 'page', own: { w: 800, h: 600 } },
    { id: 'given', kind: 'page', own: { w: 1280, h: 720 }, reflows: true, size: { w: 1280, h: 720 } },
  ], from, to);
  assert.deepEqual(out.find((c) => c.id === 'free'), { id: 'free', box: { x: 0, y: 416, w: 1080, h: 608 }, size: { w: 1920, h: 1080 } });
  assert.equal(out.find((c) => c.id === 'sized')?.size, undefined);
  assert.equal(out.find((c) => c.id === 'given')?.size, undefined);
});
