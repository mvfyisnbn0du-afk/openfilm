import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barLayout, barWidth } from './media-bar.ts';

/* about what the English words measure at 12.5px */
const words = { hint: 76, shortHint: 41, upload: 42 };

test('the bar takes the fullest form that fits, folding the hint, then Upload\'s word, then the search', () => {
  const full = { field: true, wholeHint: true, uploadWord: true, tight: false };
  const need = barWidth(full, words, 4, false);
  assert.deepEqual(barLayout(need, words, 4, false), full);
  /* a px less: the short hint first, Upload keeps its word */
  assert.deepEqual(barLayout(need - 1, words, 4, false), { field: true, wholeHint: false, uploadWord: true, tight: false });
  /* then Upload as its icon, the hint whole again while it fits */
  const shortNeed = barWidth({ field: true, wholeHint: false, uploadWord: true, tight: false }, words, 4, false);
  assert.deepEqual(barLayout(shortNeed - 1, words, 4, false), { field: true, wholeHint: true, uploadWord: false, tight: false });
  /* the narrowest pane (200 px): every button whole, the search a button */
  const narrow = barLayout(200, words, 4, false);
  assert.deepEqual(narrow, { field: false, wholeHint: false, uploadWord: false, tight: true });
  assert.ok(barWidth(narrow, words, 4, false) <= 200);
});

test('a search typed needs room for its clear button; a close button is one more square', () => {
  const full = { field: true, wholeHint: true, uploadWord: true, tight: false };
  assert.equal(barWidth(full, words, 4, true) - barWidth(full, words, 4, false), 18);
  assert.equal(barWidth(full, words, 5, false) - barWidth(full, words, 4, false), 32);
});
