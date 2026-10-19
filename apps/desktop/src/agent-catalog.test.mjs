import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { AGENT_CATALOG, OWN_AGENT_IDS, AGENT_IDS, AGENT_NAMES, AGENT_FORCED_PREFS } from 'openfilm/agents';
import { AGENTS, AgentSession, agentSignInMethods, checkAgentProgram, isAgentId, setChosenPaths } from './agents.mjs';
import { AGENT_DOWNLOADS, AGENT_PROGRAMS, detectAgentInstallation } from './agent-installation.mjs';
import { readChoices } from './agent-roster.mjs';

// A real stdio process: fail if the launcher loses or changes the native ACP arguments.
const server = String.raw`
import { createInterface } from 'node:readline';
const args = process.argv.slice(2);
if (args[0] === '--profile' && !import.meta.main) throw new Error('Harness entry must remain main');
const correct = JSON.stringify(args) === JSON.stringify(args[0] === '--profile' ? ['--profile', 'acp'] : ['acp']);
if (!correct) throw new Error('Incorrect ACP arguments: ' + JSON.stringify(args));
const send = (value) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
let model = 'first', prompt, permission, waiting;
const options = () => [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: model,
  options: [{ group: 'provider', name: 'Provider', options: [{ value: 'first', name: 'First' }, { value: 'second', name: 'Second' }] }] }];
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  const { id, method, params } = request;
  if (method === 'initialize') send({ id, result: { protocolVersion: 1, agentCapabilities: { sessionCapabilities: { resume: {} } },
    agentInfo: { name: 'fixture', version: '1' }, authMethods: [{ id: 'hermes-setup', name: 'Configure Hermes provider', type: 'terminal', args: ['--setup'] }] } });
  else if (method === 'session/new' || method === 'session/resume') {
    if (process.env.OPENFILM_TEST_SIGNED_OUT === '1') send({ id, error: { code: -32000, message: 'Authentication required' } });
    else send({ id, result: { sessionId: params.sessionId ?? 'fixture-session', configOptions: options() } });
  } else if (method === 'session/set_config_option') {
    model = params.value;
    send({ method: 'session/update', params: { sessionId: params.sessionId, update: { sessionUpdate: 'config_option_update', configOptions: options() } } });
    send({ id, result: { configOptions: options() } });
  } else if (method === 'session/prompt') {
    prompt = id; permission = 'permission';
    waiting = params.prompt.some((block) => block.text === 'wait for cancellation');
    if (params.prompt.some((block) => block.text === 'disconnect')) process.exit(1);
    send({ id: permission, method: 'session/request_permission', params: { sessionId: params.sessionId,
      toolCall: { toolCallId: 'edit', title: 'Edit the test project' }, options: [{ optionId: 'once', name: 'Allow', kind: 'allow_once' }] } });
  } else if (method === 'session/cancel') {
    send({ id: prompt, result: { stopReason: 'cancelled' } });
  } else if (id === permission) {
    if (request.result?.outcome?.optionId !== 'once') throw new Error('Permission was not answered');
    send({ method: 'session/update', params: { sessionId: 'fixture-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: waiting ? 'waiting' : model } } } });
    if (!waiting) send({ id: prompt, result: { stopReason: 'end_turn' } });
  }
}
`;

test('one catalog drives discovery, launch, names, roster choices and session preferences', () => {
  assert.deepEqual(Object.keys(AGENTS).sort(), [...OWN_AGENT_IDS].sort());
  assert.deepEqual(Object.keys(AGENT_PROGRAMS).sort(), [...OWN_AGENT_IDS].sort());
  assert.deepEqual(Object.keys(AGENT_DOWNLOADS).sort(), [...OWN_AGENT_IDS].sort());
  const dir = mkdtempSync(join(tmpdir(), 'of-catalog-'));
  try {
    const paths = Object.fromEntries(OWN_AGENT_IDS.map((id) => [id, `/chosen/${id}`]));
    writeFileSync(join(dir, 'agents.json'), JSON.stringify({ paths, shown: { deepseek: true, hermes: true }, disconnected: ['hermes'] }));
    const choices = readChoices(dir);
    assert.deepEqual(choices.paths, paths);
    assert.equal(choices.shown.deepseek, true);
    assert.equal(choices.shown.hermes, true);
    assert.deepEqual(choices.disconnected, ['hermes']);
    for (const id of OWN_AGENT_IDS) {
      const agent = AGENT_CATALOG[id];
      assert.match(id, /^[a-z][a-z0-9-]*$/);
      assert.ok(agent.label && agent.names.length);
      assert.equal(AGENT_NAMES[id], agent.label);
      assert.equal(AGENTS[id].adapter, agent.adapter);
      assert.deepEqual(AGENTS[id].args, agent.args);
      assert.ok(agent.adapter || agent.args?.length, id);
      assert.equal(new URL(agent.install).protocol, 'https:');
    }
    assert.equal(isAgentId('__proto__'), false);
    assert.equal(isAgentId('toString'), false);
    assert.equal(AGENT_IDS.includes('byok'), true);
    assert.deepEqual(AGENT_FORCED_PREFS.minimax, { permissionMode: 'bypassPermissions' });
    assert.equal(AGENT_FORCED_PREFS.deepseek, undefined, 'do not invent protocol modes');
    assert.equal(AGENT_FORCED_PREFS.hermes, undefined, "use the agent's advertised options");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('DeepSeek Harness and Hermes are detected as native installations, including Windows shims', () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'of-agent-path-')));
  try {
    const bin = join(home, 'bin'); mkdirSync(bin);
    writeFileSync(join(home, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', bin: { dsh: 'bin/dsh.mjs' } }));
    const none = { home, env: { PATH: '' }, pathDirs: [bin], applicationDirs: [] };
    for (const [id, name] of [['deepseek', 'dsh'], ['hermes', 'hermes']]) {
      assert.equal(detectAgentInstallation(id, none).installed, false);
      const script = join(bin, `${name}.mjs`); writeFileSync(script, '', { mode: 0o755 });
      if (process.platform !== 'win32') {
        const executable = join(bin, name); symlinkSync(script, executable);
        assert.equal(detectAgentInstallation(id, { ...none, win: false }).cli, id === 'deepseek' ? script : executable);
      }
      writeFileSync(join(bin, `${name}.cmd`), `@echo off\r\nnode "%dp0%${name}.mjs" %*\r\n`);
      assert.equal(detectAgentInstallation(id, { ...none, win: true }).cli, script);
    }
    writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dancers-shell' }));
    assert.equal(detectAgentInstallation('deepseek', { ...none, win: false }).installed, false);
    assert.equal(detectAgentInstallation('deepseek', { ...none, win: true }).installed, false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('both new native agents complete ACP sessions, switch models, stream replies and resume', { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-agent-acp-'));
  const program = join(dir, 'fixture.mjs'); writeFileSync(program, server);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', bin: { dsh: 'fixture.mjs' } }));
  try {
    for (const agent of ['deepseek', 'hermes']) {
      setChosenPaths({ [agent]: program });
      const updates = [];
      let began;
      const waiting = new Promise((resolve) => { began = resolve; });
      const session = new AgentSession({ agent, cwd: dir, onUpdate: (update) => {
        updates.push(update);
        if (update.content?.text === 'waiting') began();
      } });
      try {
        const info = await session.start();
        assert.equal(info.sessionId, 'fixture-session');
        assert.equal(info.configOptions[0].currentValue, 'first');
        assert.deepEqual(info.configOptions[0].options.map((o) => o.value), ['first', 'second']);
        assert.equal(await session.prompt([{ type: 'text', text: 'Check this project' }]), 'end_turn');
        const changed = await session.setConfigOption('model', 'second');
        assert.deepEqual(changed.configOptions[0].options.map((o) => o.value), ['first', 'second']);
        assert.equal(await session.prompt([{ type: 'text', text: 'Continue' }]), 'end_turn');
        assert.deepEqual(updates.filter((u) => u.content).map((u) => u.content.text), ['first', 'second']);
        const configUpdate = updates.find((u) => u.sessionUpdate === 'config_option_update');
        assert.equal(configUpdate.configOptions[0].currentValue, 'second');
        assert.deepEqual(configUpdate.configOptions[0].options.map((o) => o.value), ['first', 'second']);
        const turn = session.prompt([{ type: 'text', text: 'wait for cancellation' }]);
        await waiting;
        await session.cancel();
        assert.equal(await turn, 'cancelled');
        await assert.rejects(session.prompt([{ type: 'text', text: 'disconnect' }]), /closed|disposed/i);
      } finally { session.close(); }
      const resumed = new AgentSession({ agent, cwd: dir, resume: 'saved-session' });
      try {
        const info = await resumed.start();
        assert.equal(info.resumed, true);
        assert.equal(info.sessionId, 'saved-session');
      } finally { resumed.close(); }
      const signedOut = new AgentSession({ agent, cwd: dir, env: { OPENFILM_TEST_SIGNED_OUT: '1' } });
      try { await assert.rejects(signedOut.start(), (error) => error.code === 'sign-in'); }
      finally { signedOut.close(); }
    }
    setChosenPaths({ hermes: program });
    assert.deepEqual(await agentSignInMethods('hermes'), [{ id: 'hermes-setup', name: 'Configure Hermes provider', args: ['--setup'], env: {} }]);
  } finally { setChosenPaths({}); rmSync(dir, { recursive: true, force: true }); }
});


test('locating a Harness JS entry checks its version with the same main-module semantics as a session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-harness-version-'));
  try {
    const file = join(dir, 'entry.mjs');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', bin: { dsh: 'entry.mjs' } }));
    writeFileSync(file, "if (!import.meta.main) throw new Error('entry is not main'); console.log('dsh 1.0.0');");
    const result = await checkAgentProgram('deepseek', file);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.version, 'dsh 1.0.0');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('an ACP status probe exits after closing its session without leaving its timeout behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-agent-probe-'));
  try {
    const program = join(dir, 'fixture.mjs'); writeFileSync(program, server);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', bin: { dsh: 'fixture.mjs' } }));
    const module = new URL('./agents.mjs', import.meta.url).href;
    const code = `import { acpSignedIn, setChosenPaths } from ${JSON.stringify(module)};
      setChosenPaths({ deepseek: ${JSON.stringify(program)} });
      console.log(await acpSignedIn('deepseek'));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'true');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
