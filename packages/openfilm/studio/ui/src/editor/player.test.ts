import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorTime, EASE_STEP, easedLead, fadeSteps, JUMP, soundsDue, soundSpeed, stretchedSpan } from './player.ts';

test('a sound\'s fades as ramps: where it is now, then each corner after it', () => {
  /* 4 s long, 1 s in, 2 s out */
  assert.deepEqual(fadeSteps(0, 4, [1, 2]), [[0, 0], [1, 1], [2, 1], [4, 0]]);
  assert.deepEqual(fadeSteps(0.5, 4, [1, 2]), [[0.5, 0.5], [1, 1], [2, 1], [4, 0]]);
  /* played from inside the fade out */
  assert.deepEqual(fadeSteps(3, 4, [1, 2]), [[3, 0.5], [4, 0]]);
  assert.deepEqual(fadeSteps(1, 4, undefined), [[1, 1]]);
  /* only a fade out: full until it starts */
  assert.deepEqual(fadeSteps(0, 2, [0, 0.5]), [[0, 1], [1.5, 1], [2, 0]]);
});

test('the film plays on a line: held at its second until its moment comes, then on at its rate', () => {
  const a = { t: 10, at: 1000, rate: 1 };
  assert.equal(anchorTime(a, 900), 10, 'before the sound is heard the picture waits where it starts');
  assert.equal(anchorTime(a, 1000), 10);
  assert.equal(anchorTime(a, 1500), 10.5);
  assert.equal(anchorTime({ ...a, rate: 2 }, 1500), 11);
});

test('the sound\'s lead over the page\'s clock is eased in a little at a time, taken at once when far off or new', () => {
  assert.equal(easedLead(null, 3.25), 3.25, 'the first one is taken as it is');
  assert.equal(easedLead(3.25, 3.2502), 3.2502, 'within a step: taken');
  assert.equal(easedLead(3.25, 3.26), 3.25 + EASE_STEP, 'further: one step toward it');
  assert.equal(easedLead(3.25, 3.24), 3.25 - EASE_STEP);
  assert.equal(easedLead(3.25, 3.25 + JUMP + 0.01), 3.25 + JUMP + 0.01, 'far off: another device, taken at once');
});

test('sounds are started a few seconds ahead of the film, each once, solo leaving the others out', () => {
  const s = (at: number, length: number, clip: string) => ({ src: `${clip}.wav`, at, from: 0, to: length, volume: 1, speed: 1, clip });
  const sounds = [s(0, 2, 'a'), s(1, 20, 'b'), s(9, 1, 'c'), s(30, 1, 'd')];
  assert.deepEqual(soundsDue(sounds, 1.5, 9.5, new Set(), null), [0, 1, 2], 'playing at 1.5, or starting before 9.5');
  assert.deepEqual(soundsDue(sounds, 1.5, 9.5, new Set([0, 2]), null), [1], 'not started twice');
  assert.deepEqual(soundsDue(sounds, 2.5, 9.5, new Set(), null), [1, 2], 'one that ended before is not');
  assert.deepEqual(soundsDue(sounds, 1.5, 9.5, new Set(), new Set(['b'])), [1], 'solo: only the clips heard');
  /* a sound of a faster clip lasts less on the film */
  assert.deepEqual(soundsDue([{ ...s(0, 4, 'e'), speed: 2 }], 2.5, 3, new Set(), null), []);
});

test('a sound at another speed is played from a copy stretched to it: where to start in it and for how long', () => {
  /* a clip at 2× of the file's seconds 10–20, at film second 4: 5 film seconds long */
  const s = { src: 'a.wav', at: 4, from: 10, to: 20, volume: 1, speed: 2 };
  assert.equal(soundSpeed(2, 1), 2);
  assert.equal(soundSpeed(2, 0.75), 1.5);
  assert.equal(soundSpeed(1, 1 / 3), 0.3333);
  /* from its start, the viewer at 1×: the 2× copy from 10 / 2, all 10 file seconds as 5 */
  assert.deepEqual(stretchedSpan(s, 4, 2), { offset: 5, duration: 5 });
  /* the film started 1 s into it, the viewer at 1.5× (the copy at 3×): file second 12, 8 file seconds left */
  assert.deepEqual(stretchedSpan(s, 5, 3), { offset: 4, duration: 8 / 3 });
  /* at 1× of a 1× clip it is the file itself */
  assert.deepEqual(stretchedSpan({ ...s, speed: 1, to: 15 }, 6, 1), { offset: 12, duration: 3 });
});
