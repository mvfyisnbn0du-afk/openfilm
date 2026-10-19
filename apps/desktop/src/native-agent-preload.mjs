/** Preload for native Node agents: keep their entry as main and hide child console windows on Windows. */
import childProcess from 'node:child_process';
import { hideChildWindows } from './hidden-windows.mjs';

delete process.env.ELECTRON_RUN_AS_NODE;
if (process.platform === 'win32') hideChildWindows(childProcess);
