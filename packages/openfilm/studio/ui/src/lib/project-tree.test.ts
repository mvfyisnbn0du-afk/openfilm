import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentProjectName, windowNameFor } from './project-tree.ts';

const show = { id: 'p1', path: '/a/Show', name: 'Show' };
const window = { id: 'w1', path: '/a/Show/Version 2', name: 'Version 2', parentId: 'p1' };

test('the name of the project a window is in', () => {
  assert.equal(parentProjectName(window, [show, window]), 'Show');
});

test('a project of its own has no parent', () => {
  assert.equal(parentProjectName(show, [show]), null);
});

test('a window whose project is not in the list has no name to say', () => {
  const orphan = { id: 'w2', path: '/a/Show/Version 3', name: 'Version 3', parentId: 'gone' };
  assert.equal(parentProjectName(orphan, [orphan]), null);
});

test('the name a new window is offered with: the second one, the third, and so on', () => {
  assert.equal(windowNameFor(show, [show]), 2, 'the project itself is the first window');
  assert.equal(windowNameFor(show, [show, window]), 3);
});
