/**
 * How the app runs a Node program of its own (an agent's adapter, the app's own agent) on Electron as Node: this file
 * first, then the program. ELECTRON_RUN_AS_NODE is what made Electron a Node; it is taken out of the environment before
 * the program starts, so what the program starts (the person's agent, and every command that agent runs) does not
 * have it. An Electron app the agent runs, or its tests, would start as Node too.
 *
 * On Windows, what the program starts opens no console window (hidden-windows.mjs).
 *
 *   electron as-node.mjs <program> [args…]
 */
import childProcess from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hideChildWindows } from './hidden-windows.mjs';

delete process.env.ELECTRON_RUN_AS_NODE;
if (process.platform === 'win32') hideChildWindows(childProcess);
/* Native CLIs preload this file with --import so their entry remains the main module (DSH checks import.meta.main).
   The app's adapters also keep the older wrapper invocation. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const program = process.argv[2];
  /* the program sees itself as the script it is: argv[1] is its path, its own arguments follow */
  process.argv.splice(1, 1);
  await import(pathToFileURL(program).href);
}
