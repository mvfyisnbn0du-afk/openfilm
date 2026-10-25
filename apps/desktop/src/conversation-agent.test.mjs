import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationAgent, conversationPrefs } from '../chat/src/lib/conversation-agent.ts';

const roster = (...agents) => agents.map(([id, status, shown = true]) => ({ id, name: id, shown, status }));

test('a conversation goes on with the agent it used, not the one picked last in another project', () => {
  assert.deepEqual(conversationAgent('deepseek', roster(['deepseek', 'ready'], ['codex', 'ready']), 'codex'), { agent: 'deepseek', was: null });
  /* the roster not told yet, or the agent still being checked as the app starts: no change, nothing said */
  assert.deepEqual(conversationAgent('deepseek', null, 'codex'), { agent: 'deepseek', was: null });
  assert.deepEqual(conversationAgent('deepseek', roster(['deepseek', 'checking'], ['codex', 'ready']), 'codex'), { agent: 'deepseek', was: null });
});

test('a new conversation, one that has said nothing yet, takes the agent picked last', () => {
  assert.deepEqual(conversationAgent(undefined, roster(['deepseek', 'ready'], ['codex', 'ready']), 'codex'), { agent: 'codex', was: null });
});

test('the agent it used gone, signed out or switched off: the one picked last, and which one it used is said', () => {
  assert.deepEqual(conversationAgent('deepseek', roster(['deepseek', 'sign-in'], ['codex', 'ready']), 'codex'), { agent: 'codex', was: 'deepseek' });
  assert.deepEqual(conversationAgent('deepseek', roster(['deepseek', 'ready', false], ['codex', 'ready']), 'codex'), { agent: 'codex', was: 'deepseek' });
  assert.deepEqual(conversationAgent('deepseek', roster(['codex', 'ready']), 'codex'), { agent: 'codex', was: 'deepseek' });
  /* nothing else to go on with: the one it used, as before */
  assert.deepEqual(conversationAgent('deepseek', roster(['deepseek', 'sign-in']), 'deepseek'), { agent: 'deepseek', was: null });
});

test("a conversation's own options for an agent stand over the ones picked last for it; the other agents' are left as they are", () => {
  const picked = { codex: { model: 'gpt-6', reasoning_effort: 'high' }, claude: { model: 'opus' } };
  assert.deepEqual(conversationPrefs(picked, { codex: { model: 'gpt-5' } }), { codex: { model: 'gpt-5', reasoning_effort: 'high' }, claude: { model: 'opus' } });
  assert.equal(conversationPrefs(picked, undefined), picked);
});
