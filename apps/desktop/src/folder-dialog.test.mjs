import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderDialogOptions } from './folder-dialog.mjs';

test('with no options the dialog opens a project', () => {
  const o = folderDialogOptions(undefined);
  assert.equal(o.title, 'Open Project');
  assert.equal(o.buttonLabel, 'Open');
  assert.equal(o.defaultPath, undefined);
  assert.deepEqual(o.properties, ['openDirectory', 'createDirectory']);
});

test("Studio's words and starting folder are used", () => {
  const o = folderDialogOptions({ title: 'Export to', button: 'Choose', at: '/Users/me/Movies' });
  assert.equal(o.title, 'Export to');
  assert.equal(o.message, 'Export to');
  assert.equal(o.buttonLabel, 'Choose');
  assert.equal(o.defaultPath, '/Users/me/Movies');
});

test('a starting folder that is not a full path, and text that is not text, are left out', () => {
  const o = folderDialogOptions({ title: 42, button: '  ', at: 'Movies' });
  assert.equal(o.title, 'Open Project');
  assert.equal(o.buttonLabel, 'Open');
  assert.equal(o.defaultPath, undefined);
});
