import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENTION_MENU_LIMIT, buildMentionMenu, matchMentionTrigger } from '../chat/src/components/prompt-editor/mention-menu.ts';

test('`@` is the one menu: a `/` at the start of the message is only a slash', () => {
  assert.deepEqual(matchMentionTrigger('@'), { leadOffset: 0, query: '', replaceableString: '@' });
  assert.equal(matchMentionTrigger('/'), null);
  assert.equal(matchMentionTrigger('/compact'), null);
});

test('each group is cut on its own: many files keep the skills after them, each group with its title', () => {
  const items = (kind, n) => Array.from({ length: n }, (_, i) => ({ id: `${kind}:${i}`, kind, label: `${kind} ${i}`, select: () => null }));
  const menu = buildMentionMenu([
    { id: 'skills', groupLabel: 'Skills', items: items('skill', 3) },
    { id: 'asset', groupLabel: 'Files', items: items('file', 50) },
    { id: 'more', groupLabel: 'More', items: items('file', 2) },
  ], '');
  assert.equal(menu.filter((e) => e.providerId === 'skills').length, 3);
  assert.equal(menu.filter((e) => e.providerId === 'asset').length, MENTION_MENU_LIMIT);
  assert.equal(menu.filter((e) => e.providerId === 'more').length, 2);
  assert.deepEqual(menu.filter((e) => e.firstOfGroup).map((e) => e.groupLabel), ['Skills', 'Files', 'More']);
});
