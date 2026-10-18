import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLog } from './chat-store.mjs';
import { registerLocalAgentIpc } from './local-agents-ipc.mjs';

test("a start that fails is written in the log of the turn it was for, with why", async () => {
  const handlers = new Map();
  registerLocalAgentIpc({ handle: (channel, fn) => handlers.set(channel, fn) }, { trusted: () => true });
  const project = mkdtempSync(join(tmpdir(), 'openfilm-ipc-'));
  const event = { sender: { once() {}, isDestroyed: () => false, send() {} } };
  /* the own key with no models set up: refused before anything starts */
  const r = await handlers.get('desktop:local-agents:start')(event, { agent: 'byok', cwd: project, meta: { turnId: 'local:startfail1' } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not-ready');
  await new Promise((done) => setTimeout(done, 50));
  const start = readLog(project, 'local:startfail1')?.events.find((e) => e.kind === 'start');
  assert.ok(start, 'the turn has a log');
  assert.equal(start.ok, false);
  assert.equal(start.error, r.error);
  assert.equal(start.agent, 'byok');
  assert.equal(start.meta.turnId, 'local:startfail1');
});
