import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageScaleFor, reloaded, shownAfter, updateKeys, zoomedPageScale } from './preview-frames.ts';

test('a load behind the picture: the frame shown stays until the new one has drawn, and only then goes', () => {
  const first = [{ key: 1, ready: true }];
  const loading = reloaded(first);
  assert.deepEqual(loading, [{ key: 1, ready: true }, { key: 2, ready: false }], 'shown, and loading behind it');
  /* loaded again before that one drew: the one shown stays, the one loading is let go */
  const again = reloaded(loading);
  assert.deepEqual(again, [{ key: 1, ready: true }, { key: 3, ready: false }]);
  assert.deepEqual(shownAfter(again, 3), [{ key: 3, ready: true }], 'drawn: it replaces the one shown');
  /* a moment drawn by the frame shown changes nothing; nor does one of a frame gone */
  assert.equal(shownAfter(again, 1), again);
  assert.equal(shownAfter(again, 2), again);
  /* the very first load: nothing shown until it draws */
  assert.deepEqual(reloaded([]), [{ key: 1, ready: false }]);
});

test('an edit reaches the frame shown and the one loading behind it once its film is up, so that one does not come up without it', () => {
  assert.deepEqual(updateKeys(1, new Set()), [1]);
  assert.deepEqual(updateKeys(1, new Set([1, 2])), [1, 2]);
  assert.deepEqual(updateKeys(2, new Set([2])), [2]);
});

test('a page draws at what the viewer shows of the film: in quarter steps up, never more than the screen\'s pixels', () => {
  /* a 1920 px film in a 1102 px viewer on a 2x screen: 1.15 device px a stage px, drawn at 1.25 */
  assert.equal(pageScaleFor(1102 / 1920, 2), 1.25);
  assert.equal(pageScaleFor(1, 2), 2, 'shown at full size: the screen\'s');
  assert.equal(pageScaleFor(1.5, 2), 2, 'shown larger than the film: no more than the screen has');
  assert.equal(pageScaleFor(0.5, 1), 0.5);
  assert.equal(pageScaleFor(0.05, 1), 0.25, 'a tiny viewer: a quarter at least');
});

test('a zoom on the move keeps the film as it was drawn; settled, the film is drawn as sharp as it is seen', () => {
  /* a 1920-wide film fitted at 480 px on a 2× screen: drawn at 0.5 */
  const fitted = 480 / 1920;
  assert.equal(zoomedPageScale(fitted, 1, 1, 2), 0.5);
  /* pinched to 1.5× and 3×: still drawn for the fitted picture */
  assert.equal(zoomedPageScale(fitted * 1.5, 1.5, 1, 2), 0.5);
  assert.equal(zoomedPageScale(fitted * 3, 3, 1, 2), 0.5);
  /* settled at 3×: 0.75 px per film px on screen, 1.5 device px */
  assert.equal(zoomedPageScale(fitted * 3, 3, 3, 2), 1.5);
  /* settled far in: never more than the screen's pixels */
  assert.equal(zoomedPageScale(fitted * 10, 10, 10, 2), 2);
  /* back to fitted: drawn for it again once that settles */
  assert.equal(zoomedPageScale(fitted, 1, 10, 2), 2);
  assert.equal(zoomedPageScale(fitted, 1, 1, 2), 0.5);
});
