import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentSession } from './agents.mjs';
import { registerLocalAgentIpc } from './local-agents-ipc.mjs';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'of-working-'));
  let session, closed = 0;
  t.mock.method(AgentSession.prototype, 'start', async function () { session = this; return { sessionId: 'fixture-session' }; });
  t.mock.method(AgentSession.prototype, 'close', () => { closed++; });
  const handlers = new Map(), working = [], events = [];
  const ipc = registerLocalAgentIpc({ handle: (channel, handler) => handlers.set(channel, handler) }, {
    trusted: () => true, onWorking: (paths) => working.push(paths),
  });
  t.after(async () => { ipc.closeAll(); await rm(cwd, { recursive: true, force: true, maxRetries: 5 }); });
  const sender = { once() {}, isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  const invoke = (name, opts) => handlers.get(`desktop:local-agents:${name}`)({ sender }, opts);
  // Cursor has no external record reader: no personal agent transcript or sign-in is read by the fixture.
  const started = await invoke('start', { agent: 'cursor', cwd });
  assert.equal(started.ok, true);
  return { cwd, ipc, invoke, session, key: started.key, working, events, closed: () => closed };
}

async function pendingTurn(t) {
  const f = await fixture(t);
  let finish;
  const completion = new Promise((resolve) => { finish = resolve; });
  t.mock.method(AgentSession.prototype, 'prompt', () => completion);
  const turnId = 'local:fixture';
  const prompt = f.invoke('prompt', { key: f.key, text: 'local fixture', meta: { turnId } });
  return { ...f, turnId, complete: async () => { finish('end_turn'); return prompt; } };
}

test('the project stays working through the final renderer drain, until that completed turn is acknowledged', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = await pendingTurn(t);
  assert.deepEqual(f.ipc.working(), [f.cwd]);
  f.invoke('ack', { key: f.key, turnId: f.turnId });
  assert.equal(f.ipc.isBusy(), true, 'an early acknowledgement cannot release a running turn');
  assert.deepEqual(await f.complete(), { ok: true, stopReason: 'end_turn' });
  assert.equal(f.ipc.isBusy(), true, 'the page still needs to drain the last updates');
  assert.deepEqual(f.ipc.working(), [f.cwd]);
  assert.deepEqual(f.working.at(-1), [f.cwd], 'completion cannot announce a rename-safe gap');
  assert.equal(f.invoke('running')[0].done.ok, true, 'a reloaded page can recover the completed turn');
  f.ipc.refreshSkills('cursor');
  t.mock.timers.tick(3000);
  assert.equal(f.closed(), 0, 'a skill change cannot drop an unacknowledged turn');
  for (const ack of [{ key: f.key, turnId: 'local:other' }, { key: 'other-session', turnId: f.turnId }]) {
    f.invoke('ack', ack);
    assert.equal(f.ipc.isBusy(), true);
    assert.deepEqual(f.ipc.working(), [f.cwd]);
  }
  f.invoke('ack', { key: f.key, turnId: f.turnId });
  assert.equal(f.ipc.isBusy(), false);
  assert.deepEqual(f.ipc.working(), []);
  assert.deepEqual(f.working.at(-1), []);
  assert.deepEqual(f.invoke('running'), []);
  t.mock.timers.tick(3000);
  assert.equal(f.closed(), 1, 'the stale session closes after the page has finished');
});

for (const endedBy of ['close', 'exit']) {
  test(`${endedBy} releases a completed, unacknowledged turn`, async (t) => {
    const f = await pendingTurn(t);
    await f.complete();
    assert.equal(f.ipc.isBusy(), true);
    if (endedBy === 'close') f.invoke('close', { key: f.key });
    else f.session.opts.onExit({ code: 0, stderr: '' });
    assert.equal(f.ipc.isBusy(), false);
    assert.deepEqual(f.ipc.working(), []);
    assert.deepEqual(f.working.at(-1), []);
    assert.deepEqual(f.invoke('running'), []);
  });
}

test('background work protects its project from the first work event through adoption and settlement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = await fixture(t);
  const update = (sessionUpdate) => f.session.opts.onUpdate({ sessionUpdate });
  for (const kind of ['usage_update', 'available_commands_update', 'config_option_update', 'session_info_update', 'tool_call_update']) {
    update(kind);
    assert.equal(f.ipc.isBusy(), false, `${kind} alone is not new background work`);
  }
  update('agent_message_chunk');
  assert.deepEqual(f.ipc.working(), [f.cwd], 'work counts before the page adopts it');
  f.invoke('adopt', { key: f.key, turnId: 'local:background' });
  f.ipc.refreshSkills('cursor');
  t.mock.timers.tick(3000);
  assert.equal(f.closed(), 0, 'a skill change cannot close an adopted turn');
  f.invoke('adopt', { key: f.key, turnId: null });
  assert.equal(f.ipc.isBusy(), false);
  update('tool_call');
  t.mock.timers.tick(3000);
  assert.equal(f.closed(), 0, 'work resumed during the close delay remains protected');
  t.mock.timers.tick(27_000);
  assert.equal(f.ipc.isBusy(), false, 'unadopted work settles after thirty seconds of quiet');
  t.mock.timers.tick(3000);
  assert.equal(f.closed(), 1);
  assert.deepEqual(f.working.at(-1), []);
});

for (const endedBy of ['close', 'exit']) {
  test(`${endedBy} clears background work and its quiet-period timer`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const f = await fixture(t);
    f.session.opts.onUpdate({ sessionUpdate: 'plan' });
    assert.equal(f.ipc.isBusy(), true);
    if (endedBy === 'close') f.invoke('close', { key: f.key });
    else f.session.opts.onExit({ code: 0, stderr: '' });
    assert.deepEqual(f.ipc.working(), []);
    const changes = f.working.length;
    t.mock.timers.tick(30_000);
    assert.equal(f.working.length, changes, 'the removed session cannot publish another working-state change');
  });
}

for (const kind of ['permission', 'question']) {
  test(`a background ${kind} keeps its folder protected while waiting and handing the answer back`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const f = await fixture(t);
    f.session.opts.onUpdate({ sessionUpdate: 'tool_call' });
    f.invoke('adopt', { key: f.key, turnId: 'local:background' });
    const answer = kind === 'permission' ? f.session.opts.onPermission({ options: [] })
      : f.session.opts.onQuestion({ message: 'Continue?', questions: [] });
    const requestId = f.events.findLast((event) => event.kind === kind).requestId;
    t.mock.timers.tick(30_000);
    assert.equal(f.ipc.isBusy(), true, 'waiting for the person is still work');
    assert.deepEqual(f.ipc.working(), [f.cwd]);
    assert.deepEqual(f.working.at(-1), [f.cwd]);
    if (kind === 'permission') f.invoke('permission', { key: f.key, requestId, optionId: 'allow' });
    else f.invoke('answer', { key: f.key, requestId, answers: { answer: 'yes' } });
    await answer;
    assert.equal(f.ipc.isBusy(), true, 'the answer resumes an agent still using this folder');
    assert.deepEqual(f.working.at(-1), [f.cwd]);
    f.invoke('adopt', { key: f.key, turnId: null });
    assert.equal(f.ipc.isBusy(), false);
    assert.deepEqual(f.working.at(-1), []);
  });
}
