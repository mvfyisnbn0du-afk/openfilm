import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPreferences, registerChatIpc } from './chat-ipc.mjs';

function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'openfilm-prefs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('UI debugging defaults off for new, older, and malformed preferences', (t) => {
  const dir = directory(t), file = join(dir, 'preferences.json');
  assert.deepEqual(readPreferences(dir), { developer: false, changes: true, debug: false });
  writeFileSync(file, JSON.stringify({ developer: true, changes: false }));
  assert.deepEqual(readPreferences(dir), { developer: true, changes: false, debug: false });
  writeFileSync(file, '{');
  assert.deepEqual(readPreferences(dir), { developer: false, changes: true, debug: false });
});
test('trusted settings changes persist and broadcast debugging independently of agent logs', async (t) => {
  const dir = directory(t), handlers = new Map(), events = [];
  registerChatIpc({ handle: (name, fn) => handlers.set(name, fn) }, {
    trusted: (event) => event.trusted === true, projects: async () => [], dataDir: dir,
    reveal: () => {}, tell: (channel, value) => events.push({ channel, value }), log: () => {},
  });
  const set = handlers.get('desktop:prefs:set');
  await assert.rejects(set({ trusted: false }, { debug: true }), /not the window/);
  assert.equal(readPreferences(dir).debug, false);
  await set({ trusted: true }, { debug: true });
  assert.deepEqual(readPreferences(dir), { developer: false, changes: true, debug: true });
  assert.deepEqual(events.at(-1), { channel: 'desktop:prefs', value: readPreferences(dir) });
  await set({ trusted: true }, { developer: true, debug: false });
  assert.deepEqual(readPreferences(dir), { developer: true, changes: true, debug: false });
  await set({ trusted: true }, { debug: 'true', developer: null, unexpected: true });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'preferences.json'), 'utf8')), { developer: true, changes: true, debug: false });
});
