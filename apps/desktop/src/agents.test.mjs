import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_CAPABILITIES, agentShell, allowOption, claudeKeyAnswer, claudeShell, codexDeveloperInstructions, legacyOptions, readAgentStatus } from './agents.mjs';

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

test('Claude Code takes the shell\'s API key as its terminal does: only once the person said yes to it there', () => {
  const key = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const said = (approved, rejected = []) => JSON.stringify({ customApiKeyResponses: { approved, rejected } });
  assert.equal(claudeKeyAnswer(said([key.slice(-20)]), key), 'approved');
  assert.equal(claudeKeyAnswer(said([], [key.slice(-20)]), key), 'rejected');
  assert.equal(claudeKeyAnswer(said([]), key), 'new');
  assert.equal(claudeKeyAnswer('', key), 'new', 'no config: never asked');
  assert.equal(claudeKeyAnswer('{not json', key), 'new');

  const shell = { PATH: '/bin', ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: 't', ANTHROPIC_BASE_URL: 'http://relay', OPENAI_API_KEY: 'o' };
  assert.equal(claudeShell(shell, said([key.slice(-20)])), shell, 'said yes to: given as it is');
  /* said no to, or never asked: left out, its own sign-in is used; a gateway and its token as the terminal has them */
  const { ANTHROPIC_API_KEY: _, ...rest } = shell;
  assert.deepEqual(claudeShell(shell, said([], [key.slice(-20)])), rest);
  assert.deepEqual(claudeShell(shell, ''), rest);
  assert.equal(agentShell('codex', shell), shell, 'the others have the shell as it is');
});

test("Claude Code's status says when its requests go through a gateway the person set", () => {
  const json = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'a@b.test' });
  assert.equal(readAgentStatus('claude', json, json).account.method, 'claude.ai');
  assert.equal(readAgentStatus('claude', json, json, { gateway: true }).account.method, 'gateway');
  const token = JSON.stringify({ loggedIn: true, authMethod: 'oauth_token' });
  assert.equal(readAgentStatus('claude', token, token, { gateway: true }).account.method, 'gateway');
  const out = JSON.stringify({ loggedIn: false, authMethod: 'none' });
  assert.deepEqual(readAgentStatus('claude', out, out, { gateway: true }), { signedIn: false, account: null });
});
