/** Program launch plans for agent sessions, sign-in and version checks. No process is started here.
 * System-Node preload support adapted from bhhxx, openfilm/openfilm#91.
 */
import { fileURLToPath } from 'node:url';
import { findExecutable } from './agent-installation.mjs';
import { nodeBinary } from './node-runtime.mjs';

const AS_NODE = fileURLToPath(new URL('./as-node.mjs', import.meta.url));
const PRELOAD = new URL('./native-agent-preload.mjs', import.meta.url).href.replace('/app.asar/', '/app.asar.unpacked/');
const winArg = (a) => (/^[\w.:\\/=+@-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);

/** The definition decides the runtime; the resolved program decides the executable. `win` also permits portable tests. */
export function launchProgram(definition, path, args, shell, { win = process.platform === 'win32' } = {}) {
  if (definition.runtime === 'node') {
    const node = findExecutable('node', [], shell, { win });
    if (!node) throw new Error(`${definition.label} needs Node.js on PATH. Install Node.js, then reconnect.`);
    return { cmd: node, args: ['--import', PRELOAD, path, ...args], env: {}, options: {} };
  }
  if (/\.(?:c|m)?js$/i.test(path)) {
    return { cmd: nodeBinary(), args: [AS_NODE, path, ...args], env: { ELECTRON_RUN_AS_NODE: '1' }, options: {} };
  }
  if (win && /\.(?:cmd|bat)$/i.test(path)) {
    return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${[path, ...args].map(winArg).join(' ')}"`], env: {}, options: { windowsVerbatimArguments: true } };
  }
  return { cmd: path, args, env: {}, options: {} };
}
