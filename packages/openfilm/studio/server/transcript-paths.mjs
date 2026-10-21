// @ts-check
/** The filenames shared by a media file's transcript and its translations. */
import { readdir, realpath } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

/** @param {string} src @param {string} [language] */
export function transcriptPath(src, language) {
  const name = basename(src, extname(src));
  const dir = dirname(src);
  return `${dir === '.' ? '' : `${dir}/`}${name}${language ? `.${language}` : ''}.vtt`;
}

/** A possible sidecar's canonical name; a case difference still needs checking on disk. @param {string} src @param {string} file */
export function transcriptName(src, file) {
  const stem = basename(src, extname(src));
  const suffix = file.slice(stem.length).replace(/\.vtt$/i, '.vtt');
  const translation = /^\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.vtt$/.exec(suffix);
  const name = `${stem}${suffix}`;
  if ((suffix !== '.vtt' && !translation) || file.toLowerCase() !== name.toLowerCase()) return null;
  return { name, ...(translation ? { language: translation[1] } : {}) };
}

/**
 * The sidecars beside `src`, as spelt on disk. A different case matches only where the disk reads it as the same
 * file: a case-only media rename must not lose translations still shared with another media file.
 * @param {string} src @returns {Promise<{ path: string, language?: string }[]>}
 */
export async function transcriptFiles(src) {
  const dir = dirname(src);
  const entries = await readdir(dir, { withFileTypes: true });
  /** @type {{ path: string, language?: string }[]} */
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const match = transcriptName(src, entry.name);
    if (!match) continue;
    const expected = match.name, path = join(dir, entry.name);
    if (entry.name !== expected) {
      if (entry.name.toLowerCase() !== expected.toLowerCase()) continue;
      const found = await realpath(path).catch(() => null);
      if (!found || found !== await realpath(join(dir, expected)).catch(() => null)) continue;
    }
    out.push({ path, ...(match.language ? { language: match.language } : {}) });
  }
  return out;
}
