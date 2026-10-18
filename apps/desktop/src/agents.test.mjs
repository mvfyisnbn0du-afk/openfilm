import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_CAPABILITIES, CODEX_UTF8_CMD, agentShell, allowOption, codexDeveloperInstructions, codexLaunchEnv, legacyOptions, powerShellScript, readAgentStatus, signInError, codexTooOld, AGENTS, ownSignIn, codexServiceError, codexRefusal, codexNotice, explainFailure, stderrReason } from './agents.mjs';

test('an agent that asks: yes for good where it offers that, else yes this once; nothing to say yes with is null', () => {
  const options = [
    { optionId: 'no', kind: 'reject_once' },
    { optionId: 'once', kind: 'allow_once' },
    { optionId: 'always', kind: 'allow_always' },
  ];
  assert.equal(allowOption({ options }), 'always');
  assert.equal(allowOption({ options: options.slice(0, 2) }), 'once');
  assert.equal(allowOption({ options: options.slice(0, 1) }), null);
  assert.equal(allowOption({}), null);
});

test("the older model and mode lists (Gemini CLI's) read as the config options the chat's menu has", () => {
  const options = legacyOptions({
    models: { currentModelId: 'auto', availableModels: [{ modelId: 'auto', name: 'Auto' }, { modelId: 'pro', name: 'Pro', description: 'slow' }] },
    modes: { currentModeId: 'yolo', availableModes: [{ id: 'default', name: 'Default' }, { id: 'yolo', name: 'YOLO' }] },
  });
  assert.deepEqual(options.map((o) => [o.id, o.category, o.currentValue]), [['model', 'model', 'auto'], ['mode', 'mode', 'yolo']]);
  assert.deepEqual(options[0].options[1], { value: 'pro', name: 'Pro', description: 'slow' });
  assert.deepEqual(legacyOptions({}), []);
});

test('whose sign-in it is, as each program says it, never a key', () => {
  const claude = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'a@b.test', orgName: 'Studio', subscriptionType: 'max' });
  assert.deepEqual(readAgentStatus('claude', claude, claude), { signedIn: true, account: { method: 'claude.ai', email: 'a@b.test', org: 'Studio', plan: 'max' } });
  const out = JSON.stringify({ loggedIn: false, authMethod: 'none' });
  assert.deepEqual(readAgentStatus('claude', out, out), { signedIn: false, account: null });
  assert.deepEqual(readAgentStatus('codex', 'Logged in using ChatGPT\n', 'Logged in using ChatGPT\n'), { signedIn: true, account: { method: 'chatgpt' } });
  const key = 'Logged in using an API key - sk-proj-***ABCD\n';
  const read = readAgentStatus('codex', key, key);
  assert.deepEqual(read, { signedIn: true, account: { method: 'api-key' } });
  assert.ok(!JSON.stringify(read).includes('sk-'), 'no part of a key');
  assert.deepEqual(readAgentStatus('codex', 'Not logged in\n', 'Not logged in\n'), { signedIn: false, account: null });
});

test('settings Codex cannot read: it cannot say whether it is signed in, and says why', () => {
  const out = '\nError loading configuration: ~/.codex/config.toml:2:16: unknown variant `full`, expected one of `read-only`, `workspace-write`, `danger-full-access`\n';
  assert.deepEqual(readAgentStatus('codex', '', out), {
    signedIn: null, account: null,
    problem: 'Error loading configuration: ~/.codex/config.toml:2:16: unknown variant `full`, expected one of `read-only`, `workspace-write`, `danger-full-access`',
  });
});

test('an error the agent sends as "Internal error" carries its reason; a sign-in refused is said so', () => {
  const why = 'failed to load configuration: config.toml:1:26: unknown variant `ultra`';
  const e = signInError('Codex', Object.assign(new Error('Internal error'), { code: -32603, data: `${why}\n` }));
  assert.equal(e.message, why);
  assert.equal(e.code, -32603);
  assert.equal(signInError('Codex', Object.assign(new Error('Internal error'), { code: -32603, data: { message: why } })).message, why);
  assert.equal(signInError('Codex', Object.assign(new Error('Internal error'), { code: -32603, data: { details: 'connection got disposed' } })).message, 'connection got disposed');
  const plain = new Error('Codex process has exited with code 1');
  assert.equal(signInError('Codex', plain), plain);
  assert.equal(signInError('Codex', Object.assign(new Error('Authentication required'), { code: -32000 })).code, 'sign-in');
  const own = signInError('Codex', Object.assign(new Error('Authentication required'), { code: -32000 }), { own: true });
  assert.equal(own.code, 'sign-in');
  assert.equal(own.message, 'Codex is not signed in. Sign in in Codex, then try again.');
});

test('Codex is signed in in Codex: one found is never signed out here, and keeps whose account it is', () => {
  assert.equal(AGENTS.codex.login, null);
  assert.deepEqual(ownSignIn(AGENTS.codex, { signedIn: false, account: null }), { signedIn: null, account: null });
  const account = { method: 'chatgpt' };
  assert.deepEqual(ownSignIn(AGENTS.codex, { signedIn: true, account }), { signedIn: true, account });
  assert.deepEqual(ownSignIn(AGENTS.claude, { signedIn: false, account: null }), { signedIn: false, account: null });
});

test("the model service's refusal Codex sends as its reply fails the turn; a model this Codex is too old for says to update it", () => {
  const chunk = (text) => ({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
  const said = `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account."}}\n\n`;
  const refused = codexServiceError(chunk(said));
  assert.deepEqual(refused, { message: "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.", status: 400 });
  assert.equal(codexServiceError(chunk('Hi!')), null);
  assert.equal(codexServiceError(chunk('{"type":"error"')), null, 'not JSON');
  assert.equal(codexServiceError(chunk('{"type":"error","error":{}}')), null, 'no message');
  assert.equal(codexServiceError({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: said } }), null);

  const old = codexRefusal(refused, '/usr/local/bin/codex', () => '0.156.1');
  assert.equal(old.code, 'outdated');
  assert.equal(old.message, "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account. Update Codex (this one is 0.156.1), or choose another model.");
  assert.match(codexRefusal(refused, '/usr/local/bin/codex', () => null).message, / Update Codex, or choose another model\.$/);
  const other = codexRefusal({ message: 'Rate limit reached.', status: 429 }, '/usr/local/bin/codex', () => '0.163.0');
  assert.equal(other.message, 'Rate limit reached.');
  assert.equal(other.code, undefined);
});

test("the person's own developer_instructions in Codex's config, read as TOML writes them; a profile's is not theirs at the top", () => {
  assert.equal(codexDeveloperInstructions('model = "gpt"\ndeveloper_instructions = "Be brief.\\nSay \\"why\\"."\n'), 'Be brief.\nSay "why".');
  assert.equal(codexDeveloperInstructions("developer_instructions = 'C:\\no\\escapes'"), 'C:\\no\\escapes');
  assert.equal(codexDeveloperInstructions('developer_instructions = """\nLine one.\nLine two.\n"""\n[profiles.x]\n'), 'Line one.\nLine two.');
  assert.equal(codexDeveloperInstructions("developer_instructions = '''\nAs is: \\n\n'''"), 'As is: \\n');
  assert.equal(codexDeveloperInstructions('[profiles.work]\ndeveloper_instructions = "not at the top"\n'), null);
  assert.equal(codexDeveloperInstructions('model = "gpt"\n'), null);
  assert.equal(codexDeveloperInstructions(''), null);
});

test('the chat says it shows notices, so an agent sends its warnings as notices and not as words in its reply', async () => {
  /* the SDK's own parser, which drops a malformed capability without a word */
  const { zClientCapabilities } = await import(new URL('../node_modules/@agentclientprotocol/sdk/dist/schema/zod.gen.js', import.meta.url).href);
  const parsed = zClientCapabilities.parse(CLIENT_CAPABILITIES);
  /* the check Codex's adapter makes (codex-acp: clientSupportsNotices) */
  const notices = parsed.session?.notices;
  assert.ok(typeof notices === 'object' && notices !== null && !Array.isArray(notices));
  assert.deepEqual(parsed.elicitation, { form: {} });
});

test('Claude Code is given of the shell only its PATH and the like: a key or gateway there never stands in for the subscription', () => {
  const shell = { PATH: '/bin', HTTPS_PROXY: 'http://proxy', CLAUDE_CONFIG_DIR: '/c', LANG: 'zh_CN.UTF-8',
    ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't', ANTHROPIC_BASE_URL: 'http://relay', OPENAI_API_KEY: 'o' };
  const given = agentShell('claude', shell);
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY']) assert.equal(given[key], undefined, key);
  assert.equal(given.HTTPS_PROXY, 'http://proxy');
  assert.equal(given.CLAUDE_CONFIG_DIR, '/c', 'where its own sign-in is kept');
  assert.equal(given.LANG, 'zh_CN.UTF-8');
  assert.equal(agentShell('codex', shell), shell, 'the others have the shell as it is');
});

test('the chat says it signs in in Terminal, so Claude Code offers its subscription sign-in (ACP terminal auth)', async () => {
  const { zClientCapabilities } = await import(new URL('../node_modules/@agentclientprotocol/sdk/dist/schema/zod.gen.js', import.meta.url).href);
  /* the check Claude Code's adapter makes before it offers its terminal sign-ins */
  assert.equal(zClientCapabilities.parse(CLIENT_CAPABILITIES).auth?.terminal, true);
});

test('a Windows sign-in is a PowerShell script: each path whole however it is spelled, read as UTF-8', () => {
  const script = powerShellScript('Claude Code sign-in', 'C:\\Program Files\\OpenFilm\\OpenFilm.exe',
    ['C:\\Program Files\\OpenFilm\\app.asar\\src\\as-node.mjs', 'D:\\用户\\it\'s\\index.js', '--cli', 'auth', 'login', '--claudeai']);
  assert.ok(script.startsWith('\ufeff'), 'a BOM: Windows PowerShell reads it as UTF-8');
  const lines = script.slice(1).split('\r\n');
  assert.equal(lines[0], "$Host.UI.RawUI.WindowTitle = 'Claude Code sign-in'");
  assert.equal(lines[1], "& 'C:\\Program Files\\OpenFilm\\OpenFilm.exe' 'C:\\Program Files\\OpenFilm\\app.asar\\src\\as-node.mjs' "
    + "'D:\\用户\\it''s\\index.js' '--cli' 'auth' 'login' '--claudeai'");
});

test('on Windows, Codex is started through a script that turns the console to UTF-8, so a reason comes out readable', async () => {
  const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const exe = 'C:\\Users\\李\\AppData\\Roaming\\npm\\codex.exe';
  assert.deepEqual(codexLaunchEnv('/usr/local/bin/codex', { win: false }), { CODEX_PATH: '/usr/local/bin/codex' });
  const dir = join(mkdtempSync(join(tmpdir(), 'of-codex-')), 'launch');
  const env = codexLaunchEnv(exe, { win: true, dir });
  assert.deepEqual(env, { CODEX_PATH: join(dir, 'codex-utf8.cmd'), OPENFILM_CODEX: exe });
  assert.equal(readFileSync(env.CODEX_PATH, 'utf8'), CODEX_UTF8_CMD);
  assert.match(CODEX_UTF8_CMD, /^@echo off\r\nchcp 65001 >nul\r\n"%OPENFILM_CODEX%" %\*\r\n$/, 'UTF-8 first, then Codex with what the adapter asks (app-server, login)');
  /* a script changed since: written again */
  writeFileSync(env.CODEX_PATH, 'echo old');
  codexLaunchEnv(exe, { win: true, dir });
  assert.equal(readFileSync(env.CODEX_PATH, 'utf8'), CODEX_UTF8_CMD);
  /* nowhere to write it: Codex as before */
  const blocked = join(mkdtempSync(join(tmpdir(), 'of-codex-')), 'file');
  writeFileSync(blocked, '');
  assert.deepEqual(codexLaunchEnv(exe, { win: true, dir: join(blocked, 'launch') }), { CODEX_PATH: exe });
});

test('a Codex older than the ones tried, that did not start, is said to need an update; a later one, or a sign-in, as it was', () => {
  const failed = new Error('Pending response rejected since connection got disposed');
  const old = codexTooOld('codex', '/usr/local/bin/codex', failed, () => '0.104.0');
  assert.equal(old.code, 'outdated');
  assert.match(old.message, /^Codex 0\.104\.0 is older than OpenFilm needs \(0\.132\.0 or later\): update Codex, then try again\. Pending response/);
  assert.equal(codexTooOld('codex', '/usr/local/bin/codex', failed, () => '0.163.0'), failed);
  assert.equal(codexTooOld('codex', '/usr/local/bin/codex', failed, () => null), failed, 'a version it cannot tell');
  const signIn = Object.assign(new Error('Codex is not signed in.'), { code: 'sign-in' });
  assert.equal(codexTooOld('codex', '/usr/local/bin/codex', signIn, () => '0.104.0'), signIn);
  assert.equal(codexTooOld('claude', '/usr/local/bin/claude', failed, () => '0.104.0'), failed);
});

test("Codex's reconnects and retries, which it says where the chat does not look, are notices in its words", () => {
  const info = (error) => ({ sessionUpdate: 'session_info_update', _meta: { codex: { error } } });
  assert.deepEqual(codexNotice(info({ message: 'Reconnecting... 2/5', additionalDetails: 'stream disconnected before completion: Connection refused (os error 61)', willRetry: true })), {
    sessionUpdate: 'notice', severity: 'warning', title: 'Reconnecting... 2/5', description: 'stream disconnected before completion: Connection refused (os error 61)',
  });
  assert.deepEqual(codexNotice(info({ message: 'Quota exceeded.', additionalDetails: null, willRetry: false })), { sessionUpdate: 'notice', severity: 'error', title: 'Quota exceeded.' });
  assert.equal(codexNotice(info({ message: ' ' })), null);
  assert.equal(codexNotice({ sessionUpdate: 'session_info_update', _meta: { codex: { threadStatus: { type: 'idle' } } } }), null);
  assert.equal(codexNotice({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi' } }), null);
});

test('a failure keeps what the agent said; one that says nothing says where it stopped, how its process ended and what it wrote', () => {
  const said = Object.assign(new Error('Codex process has exited with code 3:\nerror: failed to connect'), { code: 1001 });
  assert.equal(explainFailure(said, { label: 'Codex', step: 'session/new' }), said);

  const bare = explainFailure(Object.assign(new Error('Internal error'), { code: -32603 }), { label: 'Codex', step: 'session/prompt' });
  assert.equal(bare.message, 'Codex stopped while answering without saying why. If it cannot reach its service, check the network or proxy, then try again.');
  assert.equal(bare.code, -32603);
  assert.equal(bare.step, 'session/prompt');

  const crashed = explainFailure(new Error('ACP connection closed'), {
    label: 'Codex', step: 'initialize', exited: { code: 1 },
    stderr: "node:events:487\n      throw er; // Unhandled 'error' event\n      ^\n\nError: write EPIPE\n    at afterWriteDispatched (node:internal/stream_base_commons:159:15)\nEmitted 'error' event on Socket instance at:\n  errno: -32,\n  code: 'EPIPE',\n}\n\nNode.js v26.0.0\n",
  });
  assert.equal(crashed.message, 'Codex stopped as it started without saying why. Its process ended with code 1. It last wrote: Error: write EPIPE');

  const ended = explainFailure(new Error('Rate limit reached.'), { label: 'Kimi', exited: { code: null } });
  assert.equal(ended.message, 'Rate limit reached. Its process ended.');
});

test("what an agent's stderr says: the lines that name an error, else its last lines", () => {
  assert.equal(stderrReason('starting\nwarning: slow disk\nlistening'), 'starting | warning: slow disk | listening');
  assert.equal(stderrReason('ok\nError: cannot read config.toml\n    at load (x.js:1:1)\ndone'), 'Error: cannot read config.toml');
  assert.equal(stderrReason(''), '');
});
