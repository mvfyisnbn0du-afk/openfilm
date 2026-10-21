import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentProjectName, windowNameFor, withWindows, depthsOf, windowTabMetrics } from './project-tree.ts';

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

/* The tab strip draws the same tree: a window's tab sits right under the project it is in. */
test("a window's tab is drawn right under the project it is in, even when the app's order is not", () => {
  const tabs = [
    { id: 't-window', title: 'Version 2', parentId: 't-project' },
    { id: 't-other', title: 'Other', parentId: undefined },
    { id: 't-project', title: 'Show', parentId: undefined },
  ];
  const arranged = withWindows(tabs);
  assert.deepEqual(
    arranged.map((i) => [i.project.title, i.depth]),
    [['Other', 0], ['Show', 0], ['Version 2', 1]],
    'the window is brought out to just after the project it is in',
  );
});

test('a window of a window is drawn two deep', () => {
  const tabs = [
    { id: 't-inner', title: 'Inner', parentId: 't-window' },
    { id: 't-window', title: 'Version 2', parentId: 't-project' },
    { id: 't-project', title: 'Show', parentId: undefined },
  ];
  const arranged = withWindows(tabs);
  assert.deepEqual(arranged.map((i) => [i.project.title, i.depth]), [['Show', 0], ['Version 2', 1], ['Inner', 2]]);
});

test('a tab whose project is not open stands on its own', () => {
  const tabs = [{ id: 't-window', title: 'Version 2', parentId: 't-gone' }];
  assert.deepEqual(withWindows(tabs).map((i) => [i.project.title, i.depth]), [['Version 2', 0]]);
});

/* The strip is a row, not a list: an indent alone says nothing there. A window's tab has to be drawn so that the row
   says what belongs to what — a window drawn like a project reads as a project, and that was the mistake. */
test("a project's tab is drawn at the strip's own padding and full width", () => {
  const project = windowTabMetrics(0);
  assert.equal(project.indent, 12);
  assert.equal(project.width, 184);
  assert.equal(project.guide, 0, 'a project has no line joining it to a window');
});

test("a window's tab is drawn deeper and narrower than the project's", () => {
  const project = windowTabMetrics(0);
  const win = windowTabMetrics(1);
  assert.ok(win.indent > project.indent, 'the window is indented deeper than the project');
  assert.ok(win.width < project.width, 'the window is narrower than the project');
  assert.ok(win.guide > 0, 'a hairline joins it to the project on its left');
});

test('a window of a window is deeper still, and narrower still', () => {
  const one = windowTabMetrics(1);
  const two = windowTabMetrics(2);
  assert.ok(two.indent > one.indent);
  assert.ok(two.width < one.width);
  assert.ok(two.guide > one.guide);
});

test('a window is never drawn narrower than the strip can show', () => {
  assert.ok(windowTabMetrics(9).width >= 120);
});
