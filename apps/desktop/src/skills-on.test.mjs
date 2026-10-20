import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentAfter, skillsOnLine, skillsToSend } from '../chat/src/lib/skills-on.ts';

test('a skill kept on goes to each agent once a conversation, and not again beside its own pill', () => {
  assert.deepEqual(skillsToSend(['brand', 'pace'], undefined, 'codex', []), ['brand', 'pace']);
  const sent = sentAfter(undefined, 'codex', ['brand', 'pace']);
  assert.deepEqual(skillsToSend(['brand', 'pace'], sent, 'codex', []), [], 'the agent has them');
  assert.deepEqual(skillsToSend(['brand', 'pace'], sent, 'claude', []), ['brand', 'pace'], 'another agent has not');
  assert.deepEqual(skillsToSend(['brand', 'pace', 'new'], sent, 'codex', []), ['new'], 'one kept on since');
  assert.deepEqual(skillsToSend(['brand'], undefined, 'codex', ['brand']), [], 'named in the message, it goes with its pill');
  assert.deepEqual(sentAfter(sent, 'codex', ['new']).codex, ['brand', 'pace', 'new']);
});

test('the agent reads them named as a pill names a skill', () => {
  assert.equal(skillsOnLine([]), '');
  assert.equal(skillsOnLine(['brand', 'pace']), '\n\nKept on in this project: skill “brand”, skill “pace”.');
});
