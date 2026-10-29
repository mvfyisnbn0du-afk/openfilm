import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canChangeSpeed, speedForLength, speedRoomMs } from './clip-speed.ts';

test('videos and sounds playing a part of their source have a speed; stills and pages do not', () => {
  assert.equal(canChangeSpeed({ kind: 'video', src: 'a.mp4', anchor: { trimFrom: 0 } }), true);
  assert.equal(canChangeSpeed({ kind: 'music', src: 'a.wav', anchor: { trimFrom: 2 } }), true);
  assert.equal(canChangeSpeed({ kind: 'video', src: 'a.png', anchor: { trimFrom: 0 } }), false);
  assert.equal(canChangeSpeed({ kind: 'video', src: 'a.mp4', anchor: { trimFrom: 0, still: true } }), false);
  assert.equal(canChangeSpeed({ kind: 'mg', src: 'title.html', anchor: {} }), false);
  assert.equal(canChangeSpeed({ kind: 'video', src: 'a.mp4' }), false);
});

test('the speed is the source over the new length: on the hundredth when let go anywhere', () => {
  /* 8 s of source on the film for 8 s, pulled to 5 s: 1.6× */
  const clip = { startMs: 0, endMs: 8000 };
  assert.equal(speedForLength(clip, 5000), 1.6);
  assert.equal(speedForLength(clip, 16000), 0.5);
  /* already at 2×: 4 s on the film are 8 s of source */
  assert.equal(speedForLength({ startMs: 1000, endMs: 5000, speed: 2 }, 8000), 1);
  assert.equal(speedForLength(clip, 4789), 1.67);
});

test('snapped, the speed lands the edge where it snapped, never past it', () => {
  const clip = { startMs: 0, endMs: 8000 };
  const speed = speedForLength(clip, 4789, true);
  assert.equal(speed, 1.6705);
  const length = 8000 / speed;
  assert.ok(length <= 4789 && 4789 - length < 1, `${length} is within a millisecond, not past`);
  assert.equal(speedForLength(clip, 4000, true), 2, 'a speed that lands exactly stays as is');
  /* 23.2 s of source at 1.51× is 15364.24 ms on the film, drawn as 15364: its source is still 23.2 s */
  assert.equal(speedForLength({ startMs: 0, endMs: 15364, speed: 1.51 }, 15200, true), 1.5264);
});

test('no faster than 4× and no slower than 0.25×; the room to get longer stops at the slowest', () => {
  const clip = { startMs: 0, endMs: 8000 };
  assert.equal(speedForLength(clip, 1000), 4);
  assert.equal(speedForLength(clip, 0), 4);
  assert.equal(speedForLength(clip, 64000), 0.25);
  assert.equal(speedRoomMs(clip), 24000);
  assert.equal(speedRoomMs({ startMs: 0, endMs: 8000, speed: 0.25 }), 0);
});
