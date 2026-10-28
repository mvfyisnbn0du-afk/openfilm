import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPage, revOf, writePage } from './page-text.mjs';

test('a page is written only over the text it was made from, a new one only where there is none, and taken away only as it was', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-page-text-'));
  writeFileSync(join(root, 'title.html'), '<h1>Hi</h1>');
  const { text, rev } = await readPage(root, 'title.html');
  assert.deepEqual([text, rev], ['<h1>Hi</h1>', revOf('<h1>Hi</h1>')]);
  const made = await writePage(root, 'title.html', '<h1>Hi</h1><h1>Hi</h1>', rev);
  assert.equal(made.rev, revOf('<h1>Hi</h1><h1>Hi</h1>'));
  await assert.rejects(writePage(root, 'title.html', '<p>late</p>', rev), /changed since/, 'written meanwhile: refused');
  assert.equal(readFileSync(join(root, 'title.html'), 'utf8'), '<h1>Hi</h1><h1>Hi</h1>');
  await assert.rejects(writePage(root, 'title.html', 'x', null), /there already/);
  await writePage(root, 'scenes/title-2.html', '<p>own</p>', null);
  assert.equal(readFileSync(join(root, 'scenes/title-2.html'), 'utf8'), '<p>own</p>');
  await assert.rejects(readPage(root, 'notes.txt'), /a page of the project/);
  await assert.rejects(readPage(root, '../title.html'), /not a path inside/);
  await assert.rejects(writePage(root, 'scenes/title-2.html', null, revOf('<p>other</p>')), /changed since/, 'taken away only as it was written');
  assert.ok(existsSync(join(root, 'scenes/title-2.html')));
});
