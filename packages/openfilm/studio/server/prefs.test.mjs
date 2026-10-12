import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefsOf } from './prefs.mjs';

test('the version whose notes were last shown: a version, else none', () => {
  assert.equal(prefsOf(null).seenVersion, null, 'a new install has none');
  assert.equal(prefsOf({ seenVersion: '0.1.6' }).seenVersion, '0.1.6');
  assert.equal(prefsOf({ seenVersion: '1.0.0-beta.2' }).seenVersion, '1.0.0-beta.2');
  assert.equal(prefsOf({ seenVersion: '../../etc' }).seenVersion, null);
  assert.equal(prefsOf({ seenVersion: 7 }).seenVersion, null);
  assert.deepEqual(prefsOf({ seenVersion: '0.1.6' }).proxies, { on: true, height: 720 }, 'the rest as before');
});
