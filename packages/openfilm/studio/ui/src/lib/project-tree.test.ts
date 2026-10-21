import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentProjectName, windowNameFor, withWindows, depthsOf } from './project-tree.ts';

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
  assert.equal(windowNameFor('p1', [show]), 2, 'the project itself is the first window');
  assert.equal(windowNameFor('p1', [show, window]), 3);
});

test('a window is shown under the project it is in, and the project keeps its place', () => {
  const list = [window, show];   // the window was opened last, so it sorts first
  const tree = withWindows(list);
  assert.deepEqual(tree.map((i) => [i.project.name, i.depth]), [['Show', 0], ['Version 2', 1]]);
});

test('a window of a window is two deep', () => {
  const inner = { id: 'w2', path: '/a/Show/Version 2/Inner', name: 'Inner', parentId: 'w1' };
  const tree = withWindows([inner, window, show]);
  assert.deepEqual(tree.map((i) => [i.project.name, i.depth]), [['Show', 0], ['Version 2', 1], ['Inner', 2]]);
});

test('a window whose project is not in the list stands on its own', () => {
  const tree = withWindows([window]);
  assert.deepEqual(tree.map((i) => [i.project.name, i.depth]), [['Version 2', 0]]);
});

test('how deep each one is under the one it belongs to', () => {
  const depths = depthsOf([{ id: 'a' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }]);
  assert.equal(depths.get('a'), 0);
  assert.equal(depths.get('b'), 1);
  assert.equal(depths.get('c'), 2);
});

test('a window that is its own ancestor does not for ever', () => {
  const depths = depthsOf([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }]);
  assert.ok(depths.get('a') !== undefined && depths.get('b') !== undefined);
});
