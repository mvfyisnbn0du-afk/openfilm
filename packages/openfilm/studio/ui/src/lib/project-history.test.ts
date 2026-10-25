import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  byDay, dayOf, historyErrorKey, historyMoved, historyProgressOf, isAutomatic, normalizeHistory, summaryParts, versionLabel,
  type Summary, type Version,
} from './project-history.ts';

const none = { added: 0, removed: 0, edited: 0 };
const summary = (s: Partial<Summary>): Summary => ({ scenes: none, sounds: none, stage: false, other: false, ...s });
const version = (v: Partial<Version>): Version => ({ commit: 'c', at: 0, kind: 'saved', name: '', restored: null, summary: summary({}), ...v });

test('what changed reads scenes before sounds, added before edited before removed', () => {
  assert.deepEqual(summaryParts(summary({ scenes: { added: 2, removed: 1, edited: 3 }, sounds: { added: 1, removed: 0, edited: 0 } })), [
    { key: 'scenesAdded', n: 2 }, { key: 'scenesEdited', n: 3 }, { key: 'scenesRemoved', n: 1 }, { key: 'soundsAdded', n: 1 },
  ]);
  assert.deepEqual(summaryParts(summary({ other: true })), [{ key: 'look', n: 0 }], 'a shared file changed: the look');
  assert.deepEqual(summaryParts(summary({})), [{ key: 'same', n: 0 }]);
});

test('the server\'s answer is checked: what cannot be read is left out, not drawn empty', () => {
  assert.equal(normalizeHistory(null), null);
  assert.equal(normalizeHistory({ status: {} }), null, 'no versions list');
  const read = normalizeHistory({
    status: { head: 'abc', changes: { count: 2, summary: { scenes: { added: 1 } } } },
    versions: [{ commit: 'abc', kind: 'auto', at: 5, summary: {} }, { kind: 'named' }, { commit: 'def', kind: 'dance', name: 'Old' }],
    more: true,
  });
  assert.deepEqual(read?.status.changes?.summary.scenes, { added: 1, removed: 0, edited: 0 });
  assert.deepEqual(read?.versions.map((v) => [v.commit, v.kind, v.name]), [['abc', 'auto', ''], ['def', 'named', 'Old']]);
  assert.equal(read?.more, true);
  assert.equal(normalizeHistory({ status: { changes: null }, versions: [] })?.status.changes, null);
  assert.equal(normalizeHistory({ status: {}, versions: [] })?.status.files, null);
  assert.deepEqual(normalizeHistory({ status: { files: { held: 3, heldBytes: '9', ignored: 2 } }, versions: [] })?.status.files, { held: 3, heldBytes: 0, ignored: 2 });
});

test('a version is called by its name, else by what it is; a restore names the version it brought back', () => {
  const named = version({ commit: 'a', kind: 'named', name: 'Rough cut', at: 100 });
  const auto = version({ commit: 'b', kind: 'auto', at: 200 });
  const all = [named, auto];
  assert.deepEqual(versionLabel(named, all), { key: '', name: 'Rough cut' });
  assert.deepEqual(versionLabel(auto, all), { key: 'versions.kindAuto' });
  assert.deepEqual(versionLabel(version({ kind: 'auto', name: 'Renamed' }), all), { key: '', name: 'Renamed' }, 'a name given later wins');
  assert.deepEqual(versionLabel(version({ kind: 'restore', restored: 'a' }), all), { key: 'versions.kindRestore', name: 'Rough cut' });
  assert.deepEqual(versionLabel(version({ kind: 'restore', restored: 'b' }), all), { key: 'versions.kindRestoreAt', at: 200 });
  assert.deepEqual(versionLabel(version({ kind: 'restore', restored: 'zzz' }), all), { key: 'versions.kindRestoreOlder' });
  assert.deepEqual(versionLabel(version({ kind: 'parked', name: 'idea' }), all), { key: 'versions.kindParked', name: 'idea' });
  assert.deepEqual(versionLabel(version({ kind: 'saved' }), all), { key: 'versions.kindSaved' });
  assert.equal(isAutomatic(auto), true);
  assert.equal(isAutomatic(named), false);
});

test('versions are grouped by the day they were saved: today, yesterday, then each day', () => {
  const now = new Date(2026, 9, 25, 15, 0).getTime();
  const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).getTime();
  assert.equal(dayOf(at(25, 0), now), 'today');
  assert.equal(dayOf(at(24, 23), now), 'yesterday');
  assert.equal(dayOf(at(22, 9), now), new Date(2026, 9, 22).getTime());
  const groups = byDay([version({ commit: '1', at: at(25, 14) }), version({ commit: '2', at: at(25, 9) }), version({ commit: '3', at: at(24, 18) }),
    version({ commit: '4', at: at(20, 10) }), version({ commit: '5', at: at(20, 8) })], now);
  assert.deepEqual(groups.map((g) => [g.day, g.versions.map((v) => v.commit)]), [
    ['today', ['1', '2']], ['yesterday', ['3']], [new Date(2026, 9, 20).getTime(), ['4', '5']],
  ]);
});

test('a progress event is read only when it is one; a restore says the folder moved', () => {
  assert.deepEqual(historyProgressOf({ type: 'history-progress', op: 'save', phase: 'store', done: 2, total: 5 }), { op: 'save', phase: 'store', done: 2, total: 5 });
  assert.equal(historyProgressOf({ type: 'history' }), null);
  assert.equal(historyProgressOf({ type: 'history-progress', phase: 'dance' }), null);
  assert.equal(historyMoved({ type: 'history', moved: true }), true);
  assert.equal(historyMoved({ type: 'history' }), false);
  assert.equal(historyMoved({ type: 'files', moved: true }), false);
});

test('a refusal is said in our own words', () => {
  assert.equal(historyErrorKey({ status: 409, code: 'nothing' }), 'versions.errorNothing');
  assert.equal(historyErrorKey({ status: 400, code: 'name' }), 'versions.errorName');
  assert.equal(historyErrorKey({ status: 501, code: null }), 'versions.errorUnavailable');
  assert.equal(historyErrorKey({ status: 500, code: null }), 'versions.errorGeneric');
});
