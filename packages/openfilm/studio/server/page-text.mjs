// @ts-check
/**
 * A page of a project read and written as text, for what Studio writes into a page (layers pasted, the editor's
 * lib/layer-paste). Each read says the text's `rev`; a write names the rev it was made from and is refused when the
 * page changed since (the agent wrote it meanwhile), so nothing written by someone else is written over. A page
 * written where there was none (`expect: null`) is a new one; `text: null` takes a page away (to the trash).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FileError, inside, trashFile } from './files.mjs';

const PAGE = /\.html?$/i;

/** A text's rev: what a write names to say which text it was made from. */
export const revOf = (/** @type {string} */ text) => createHash('sha1').update(text).digest('hex');

/** @param {string} root @param {unknown} rel */
function pagePath(root, rel) {
  if (typeof rel !== 'string' || !PAGE.test(rel)) throw new FileError('a page of the project (.html), please');
  return inside(root, rel);
}

/**
 * The page `rel` of the project at `root`, as text, with its rev.
 * @param {string} root @param {unknown} rel
 */
export async function readPage(root, rel) {
  const abs = pagePath(root, rel);
  if (!existsSync(abs)) throw new FileError(`${rel} is not there`, 404);
  const text = await readFile(abs, 'utf8');
  return { text, rev: revOf(text) };
}

/**
 * The page `rel` written as `text` (null: taken away), when it is still the text of rev `expect` (null: when there is
 * no page there yet). Its new rev (null once taken away).
 * @param {string} root @param {unknown} rel @param {string | null} text @param {string | null} expect
 */
export async function writePage(root, rel, text, expect) {
  const abs = pagePath(root, rel);
  const now = existsSync(abs) ? revOf(await readFile(abs, 'utf8')) : null;
  if (now !== expect) {
    throw new FileError(expect == null ? `${rel} is there already` : `${rel} was changed since (by the agent, or in another window)`, 409);
  }
  if (text == null) {
    if (now != null) await trashFile(root, /** @type {string} */ (rel));
    return { rev: null };
  }
  if (typeof text !== 'string') throw new FileError('the page\'s text, please');
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text);
  return { rev: revOf(text) };
}
