import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupDragged } from './stage-gesture.ts';

const t = (x: number, y: number, s = 1) => ({ x, y, scaleX: s, scaleY: s, rotate: 0 });

test('several clips dragged together move by the same amount', () => {
  const d = { kind: 'move' as const, dx: 30, dy: -10, k: 1, anchor: { x: 0, y: 0 } };
  assert.deepEqual(groupDragged(d, t(100, 40)), t(130, 30));
  assert.deepEqual(groupDragged(d, t(700, 340, 0.5)), t(730, 330, 0.5));
});

test('several clips scaled together keep their places in proportion about the corner that stays', () => {
  /* the group from (100, 40) to (1900, 1015), pulled from its bottom right to half its size */
  const d = { kind: 'scale' as const, dx: 0, dy: 0, k: 0.5, anchor: { x: 100, y: 40 } };
  assert.deepEqual(groupDragged(d, t(100, 40, 0.4)), t(100, 40, 0.2));
  assert.deepEqual(groupDragged(d, t(700, 340, 0.6)), t(400, 190, 0.3));
});
