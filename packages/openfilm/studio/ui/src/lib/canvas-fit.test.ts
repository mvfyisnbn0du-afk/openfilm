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

test('shapes picked one after another never shrink the film: what it shows is fitted to each canvas, an edge met', () => {
  const clip = (box?: { x: number; y: number; w: number; h: number }) => [{ id: 'v', kind: 'video' as const, own: { w: 1920, h: 1080 }, box }];
  const wide = { w: 1920, h: 1080 }, tall = { w: 1080, h: 1440 }, cinema = { w: 2538, h: 1080 };
  const first = fitToCanvas(clip(), wide, tall)[0].box;
  assert.deepEqual(first, { x: 0, y: 416, w: 1080, h: 608 });
  /* 3:4 → 2.35:1: the 16:9 picture fills the height, centered (not 3:4's small picture made smaller) */
  const second = fitToCanvas(clip(first as never), tall, cinema)[0].box;
  assert.deepEqual(second, { x: 310, y: 0, w: 1918, h: 1080 });
  /* back to 16:9: the whole frame again */
  const third = fitToCanvas(clip(second as never), cinema, wide)[0].box;
  assert.deepEqual(third, { x: 0, y: 0, w: 1920, h: 1080 });
});

test('a film already shrunk in its canvas is fitted out to the edge on the next shape; a title alone fills it too', () => {
  const small = fitToCanvas([{ id: 'v', kind: 'video', own: { w: 1920, h: 1080 }, box: { x: 1000, y: 400, w: 540, h: 304 } }], { w: 2538, h: 1080 }, { w: 1920, h: 1080 });
  assert.deepEqual(small[0].box, { x: 0, y: 0, w: 1920, h: 1080 });
  const title = fitToCanvas([{ id: 't', kind: 'still', own: { w: 400, h: 200 }, box: { x: 760, y: 440, w: 400, h: 200 } }], { w: 1920, h: 1080 }, { w: 1080, h: 1440 });
  assert.deepEqual(title[0].box, { x: 0, y: 450, w: 1080, h: 540 });
});
