// @ts-check
import { isAbsolute } from 'node:path';

/**
 * The system's folder dialog, as Studio asks for it: to open a project (no options, the File menu's words), or with
 * Studio's own words and starting folder (the export's "Save to"). What the page sends is checked: short text only,
 * and a starting folder only when it is a full path.
 * @param {unknown} options
 * @returns {import('electron').OpenDialogOptions}
 */
export function folderDialogOptions(options) {
  const o = options && typeof options === 'object' ? /** @type {Record<string, unknown>} */ (options) : {};
  const text = (/** @type {unknown} */ v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const title = text(o.title) ?? 'Open Project';
  const at = typeof o.at === 'string' && o.at.length < 4096 && isAbsolute(o.at) ? o.at : null;
  return {
    title,
    /* macOS shows no title on this dialog: the message line says it instead */
    message: title,
    buttonLabel: text(o.button) ?? 'Open',
    ...(at ? { defaultPath: at } : {}),
    properties: ['openDirectory', 'createDirectory'],
  };
}
