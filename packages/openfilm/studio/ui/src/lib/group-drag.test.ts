import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupDragged, type GroupDrag } from './stage-gesture.ts';

const t = (x: number, y: number, s = 1, rotate = 0) => ({ x, y, scaleX: s, scaleY: s, rotate });
const size = { w: 100, h: 50 };
const drag = (d: Partial<GroupDrag>): GroupDrag => ({ kind: 'move', dx: 0, dy: 0, kx: 1, ky: 1, turn: 0, anchor: { x: 0, y: 0 }, ...d });
const near = (a: Record<string, number>, b: Record<string, number>) => {
  for (const k of Object.keys(b)) assert.ok(Math.abs(a[k]! - b[k]!) < 1e-9, `${k}: ${a[k]} vs ${b[k]}`);
};

test('several clips dragged together move by the same amount', () => {
  assert.deepEqual(groupDragged(drag({ dx: 30, dy: -10 }), t(100, 40), size), t(130, 30));
});

test('scaled from a corner, every clip keeps its place in proportion about the corner that stays', () => {
  const d = drag({ kind: 'scale', kx: 0.5, ky: 0.5, anchor: { x: 100, y: 40 } });
  near(groupDragged(d, t(100, 40, 2), size), t(100, 40, 1));
  near(groupDragged(d, t(700, 340), size), t(400, 190, 0.5));
});

test('stretched from an edge, only that way: each clip is stretched too', () => {
  const d = drag({ kind: 'scale', kx: 2, ky: 1, anchor: { x: 0, y: 0 } });
  near(groupDragged(d, t(100, 0), size), { x: 200, y: 0, scaleX: 2, scaleY: 1, rotate: 0 });
});

test('turned, each clip goes round the middle of the frame and turns by as much', () => {
  /* a clip whose center is 100 px right of the middle, turned a quarter: its center 100 px below, itself turned 90° */
  const d = drag({ kind: 'rotate', turn: 90, anchor: { x: 0, y: 0 } });
  near(groupDragged(d, t(50, -25), size), t(-50, 75, 1, 90));
});
