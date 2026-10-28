import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiedClip, copiedOverrides, offsetBox, pastePlan, PASTE_OFFSET, propTargets, type LayerClipboard, type PasteContext } from './layer-clipboard.ts';
import type { FilmClip, FilmDoc } from './film.ts';
import type { EditModel } from './timeline-edit.ts';

const HIDE = (keep: string) => ({ at: `body *:not(${keep}, ${keep} *)`, style: { visibility: 'hidden' } });
const BG = { at: ':root, body', style: { background: 'none' } };

test('a copy shows the copied layers alone, with the changes of them, inside them and around them, unlocked', () => {
  const out = copiedOverrides([
    { fade: [0.5, 0.5] },
    { at: '#title', t: [10, 0], lock: true },
    { at: '#card', s: 1.2 },
    { at: '#other', style: { color: 'red' } },
    { at: '#title b', lock: true },
  ], [false, true, true, false, true], ['#title']);
  assert.deepEqual(out, [
    { fade: [0.5, 0.5] },
    { at: '#title', t: [10, 0] },
    { at: '#card', s: 1.2 },
    HIDE('#title'),
    BG,
    { at: '#title', style: { visibility: 'visible' } },
  ]);
  assert.equal(copiedOverrides(undefined, [], ['#a', '#b'])[0]!.at, 'body *:not(#a, #a *, #b, #b *)', 'several, each with what is inside it');
  /* a copy of a copy: one of each, made for what is copied now */
  const again = copiedOverrides(out, out.map(() => true), ['#title b']);
  assert.deepEqual(again, [
    { fade: [0.5, 0.5] }, { at: '#title', t: [10, 0] }, { at: '#card', s: 1.2 },
    HIDE('#title b'), BG, { at: '#title b', style: { visibility: 'visible' } },
  ]);
});

test('a copied clip has no id, time or link, and keeps the properties of what it shows', () => {
  const clip: FilmClip = {
    id: 'title', src: 'pages/title.html', at: 5, time: [1, 4], box: { x: 10, y: 20, w: 400 }, class: 'card',
    attrs: { 'data-link': 'L', alt: 'Title', 'data-props': JSON.stringify([
      { name: 'Title', type: 'text', at: '#title' },
      { name: 'Note', type: 'text', at: '#note' },
      { name: 'Accent', type: 'var', var: '--accent' },
    ]) },
  };
  assert.deepEqual(propTargets(clip), [{ at: '#title' }, { at: '#note' }, null]);
  const out = copiedClip(clip, ['#title'], [], [true, false, false]);
  assert.equal('id' in out || 'at' in out, false);
  assert.deepEqual([out.src, out.time, out.box, out.class], ['pages/title.html', [1, 4], { x: 10, y: 20, w: 400 }, 'card']);
  assert.equal(out.attrs?.['data-link'], undefined);
  assert.equal(out.attrs?.alt, 'Title');
  assert.deepEqual(JSON.parse(out.attrs!['data-props']!).map((p: { name: string }) => p.name), ['Title', 'Accent']);
  assert.equal(copiedClip({ id: 'x', src: 'p.html', attrs: { 'data-link': 'L' } }, ['#a'], [], []).attrs, undefined, 'no attributes left: none');
});

test('a box moved for a paste: its own, or the page where it is drawn without one', () => {
  const stage = { w: 1920, h: 1080 };
  assert.deepEqual(offsetBox({ x: 10, y: 20, w: 400, r: 5 }, null, stage, 24), { x: 34, y: 44, w: 400, r: 5 });
  assert.deepEqual(offsetBox(undefined, { w: 1080, h: 1080 }, stage, 24), { x: 444, y: 24 });
  assert.deepEqual(offsetBox(undefined, null, stage, 24), { x: 24, y: 24 }, 'a page of the stage\'s size');
});

/* a film: a title page on track 1 from 2 s to 6 s, a video under it, a free track above */
const film = (): FilmDoc => ({
  stage: { w: 1920, h: 1080 },
  tracks: [
    { clips: [{ id: 'logo', src: 'logo.png', at: 8, time: [0, 2] }] },
    { clips: [{ id: 'title', src: 'title.html', at: 2 }] },
    { clips: [{ id: 'shot', src: 'shot.mp4', time: [0, 10] }] },
  ],
});
const model = (): EditModel => [
  { index: 0, role: 'mg', clips: [{ id: 'logo', startMs: 8000, endMs: 10000, inMs: 0, speed: 1, sourceMs: Infinity, still: true }] },
  { index: 1, role: 'mg', clips: [{ id: 'title', startMs: 2000, endMs: 6000, inMs: 0, speed: 1, sourceMs: Infinity }] },
  { index: 2, role: 'video', clips: [{ id: 'shot', startMs: 0, endMs: 10000, inMs: 0, speed: 1, sourceMs: 10000 }] },
];
const board = (): LayerClipboard => ({
  project: 'p1',
  atMs: 3000,
  clips: [{
    from: 'title', startMs: 2000, endMs: 6000, own: null, layers: ['#title'],
    clip: { src: 'title.html', overrides: [{ fade: [0.5, 1] }, HIDE('#title'), BG, { at: '#title', style: { visibility: 'visible' } }] },
  }],
});
const ctx = (over: Partial<PasteContext> = {}): PasteContext => ({ project: 'p1', atMs: 4000, film: film(), model: model(), into: null, ...over });

test('pasted where it was copied: over the clip\'s time on the free track above, a little off each time', () => {
  const first = pastePlan(board(), ctx())!;
  assert.deepEqual(first.ops, [{
    op: 'insert', at: 2, track: 0,
    clip: { ...board().clips[0]!.clip, id: 'title-copy', box: { x: PASTE_OFFSET, y: PASTE_OFFSET } },
  }]);
  assert.deepEqual(first.made, [{ id: 'title-copy', layer: '#title' }]);
  /* the track above is taken now (the first copy is in the film): the second opens a track, further off */
  const f = film();
  f.tracks[0]!.clips.push({ id: 'title-copy', src: 'title.html', at: 2 });
  const m = model();
  m[0]!.clips.push({ id: 'title-copy', startMs: 2000, endMs: 6000, inMs: 0, speed: 1, sourceMs: Infinity });
  const second = pastePlan(first.board, ctx({ film: f, model: m }))!;
  assert.deepEqual(second.ops.map((op) => op.op === 'insert' && [op.track, op.clip?.id, op.clip?.box]), [[{ insert: 1 }, 'title-copy-2', { x: 48, y: 48 }]]);
  const ofCopy: LayerClipboard = { ...board(), clips: [{ ...board().clips[0]!, from: 'title-copy' }] };
  assert.equal(pastePlan(ofCopy, ctx({ film: f, model: m, project: 'p2' }))!.made[0]!.id, 'title-copy-2', 'a copy of a copy: the next copy');
});

test('pasted at another time or in another project: from the moment copied, at the playhead, where it was', () => {
  const later = pastePlan(board(), ctx({ atMs: 8500, into: 2 }))!;
  assert.deepEqual(later.ops, [{
    op: 'insert', at: 8.5, track: 1,
    clip: { src: 'title.html', id: 'title-copy', time: [1, 4], overrides: [{ fade: [0, 1] }, HIDE('#title'), BG, { at: '#title', style: { visibility: 'visible' } }] },
  }], 'over the video, on the title\'s track, free then');
  const again = pastePlan(later.board, ctx({ atMs: 8500, into: 2 }))!;
  assert.deepEqual(again.ops[0]!.op === 'insert' && again.ops[0]!.clip?.box, { x: PASTE_OFFSET, y: PASTE_OFFSET }, 'pasted there again: a little off');
  const elsewhere = pastePlan(board(), ctx({ project: 'p2' }))!;
  assert.deepEqual(elsewhere.ops.map((op) => op.op === 'insert' && [op.at, op.track, op.clip?.box]), [[4, { insert: 0 }, undefined]], 'nothing under it to go over: on top');
});

test('a paste never lands on a locked, hidden or sound track, nor over another copy of the same paste', () => {
  const two: LayerClipboard = { ...board(), clips: [board().clips[0]!, { ...board().clips[0]!, from: 'title', layers: ['#note'] }] };
  const plan = pastePlan(two, ctx({ atMs: 8500, into: 2 }))!;
  assert.deepEqual(plan.ops.map((op) => op.op === 'insert' && op.track), [1, { insert: 2 }]);
  const locked = model();
  locked[1]!.locked = true;
  assert.deepEqual(pastePlan(board(), ctx({ atMs: 8500, into: 2, model: locked }))!.ops.map((op) => op.op === 'insert' && op.track), [{ insert: 2 }]);
  const hidden = film();
  hidden.tracks[1]!.hidden = true;
  assert.deepEqual(pastePlan(board(), ctx({ atMs: 8500, into: 2, film: hidden }))!.ops.map((op) => op.op === 'insert' && op.track), [{ insert: 2 }]);
  assert.equal(pastePlan({ ...board(), clips: [] }, ctx()), null);
});
