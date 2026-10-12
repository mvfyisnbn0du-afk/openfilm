// @ts-check
/**
 * The system's own folder and file dialogs, opened by Studio for a page in a browser (which can never learn a path):
 * the export's "Save to", and the media pane's "Import" and "Link" (pickFiles). The desktop app opens its own folder
 * dialog instead (lib/host.ts `folders.pick`).
 *
 *   macOS     osascript, `choose folder` / `choose file`
 *   Windows   PowerShell, the Windows Forms folder / file dialog
 *   Linux     zenity, else kdialog
 *
 * The page's words and the folder it starts in reach the dialog as arguments or environment variables, never inside
 * the script, so nothing typed can run as code.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

/**
 * How to open the dialog here: the program, its arguments and the environment it adds; null when this system has none.
 * @param {NodeJS.Platform} platform @param {{ title: string, at?: string | null }} ask @param {(name: string) => boolean} [has]
 * @returns {{ cmd: string, args: string[], env?: Record<string, string> } | null}
 */
export function folderPickerCommand(platform, { title, at }, has = () => true) {
  const start = at && isAbsolute(at) ? at : '';
  if (platform === 'darwin') {
    return {
      cmd: 'osascript',
      args: [
        '-e', 'on run argv',
        '-e', 'activate',
        '-e', 'if (item 2 of argv) is "" then',
        '-e', 'return POSIX path of (choose folder with prompt (item 1 of argv))',
        '-e', 'end if',
        '-e', 'return POSIX path of (choose folder with prompt (item 1 of argv) default location (POSIX file (item 2 of argv)))',
        '-e', 'end run',
        title, start,
      ],
    };
  }
  if (platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$d.Description = $env:OPENFILM_PICK_TITLE',
      '$d.UseDescriptionForTitle = $true',
      'if ($env:OPENFILM_PICK_AT) { $d.SelectedPath = $env:OPENFILM_PICK_AT }',
      '$w = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }',
      'if ($d.ShowDialog($w) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }',
    ].join('; ');
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-STA', '-Command', script], env: { OPENFILM_PICK_TITLE: title, OPENFILM_PICK_AT: start } };
  }
  if (has('zenity')) {
    return { cmd: 'zenity', args: ['--file-selection', '--directory', `--title=${title}`, ...(start ? [`--filename=${start}/`] : [])] };
  }
  if (has('kdialog')) return { cmd: 'kdialog', args: ['--getexistingdirectory', start || '.', '--title', title] };
  return null;
}

/**
 * How to open the dialog that picks files (several at once): the program, its arguments and the environment it adds;
 * null when this system has none. It prints one path a line.
 * @param {NodeJS.Platform} platform @param {{ title: string, at?: string | null }} ask @param {(name: string) => boolean} [has]
 * @returns {{ cmd: string, args: string[], env?: Record<string, string> } | null}
 */
export function filePickerCommand(platform, { title, at }, has = () => true) {
  const start = at && isAbsolute(at) ? at : '';
  if (platform === 'darwin') {
    return {
      cmd: 'osascript',
      args: [
        '-e', 'on run argv',
        '-e', 'activate',
        '-e', 'if (item 2 of argv) is "" then',
        '-e', 'set picked to choose file with prompt (item 1 of argv) with multiple selections allowed',
        '-e', 'else',
        '-e', 'set picked to choose file with prompt (item 1 of argv) default location (POSIX file (item 2 of argv)) with multiple selections allowed',
        '-e', 'end if',
        '-e', 'set out to ""',
        '-e', 'repeat with f in picked',
        '-e', 'set out to out & POSIX path of f & linefeed',
        '-e', 'end repeat',
        '-e', 'return out',
        '-e', 'end run',
        title, start,
      ],
    };
  }
  if (platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$d = New-Object System.Windows.Forms.OpenFileDialog',
      '$d.Title = $env:OPENFILM_PICK_TITLE',
      '$d.Multiselect = $true',
      'if ($env:OPENFILM_PICK_AT) { $d.InitialDirectory = $env:OPENFILM_PICK_AT }',
      '$w = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }',
      'if ($d.ShowDialog($w) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write(($d.FileNames -join "`n")) }',
    ].join('; ');
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-STA', '-Command', script], env: { OPENFILM_PICK_TITLE: title, OPENFILM_PICK_AT: start } };
  }
  if (has('zenity')) {
    return { cmd: 'zenity', args: ['--file-selection', '--multiple', '--separator=\n', `--title=${title}`, ...(start ? [`--filename=${start}/`] : [])] };
  }
  if (has('kdialog')) return { cmd: 'kdialog', args: ['--getopenfilename', start || '.', '--multiple', '--separate-output', '--title', title] };
  return null;
}

/** Whether a program is on the PATH (Linux: which dialog there is). @param {string} name */
const onPath = (name) => (process.env.PATH ?? '').split(':').some((dir) => dir && existsSync(`${dir}/${name}`));

/**
 * Ask the person for a folder. Resolves its path, or null when they cancelled; rejects when this system has no dialog
 * Studio can open (the page lets them type one then).
 * @param {{ title: string, at?: string | null }} ask @returns {Promise<string | null>}
 */
export function pickFolder(ask) {
  const command = folderPickerCommand(process.platform, ask, onPath);
  if (!command) return Promise.reject(new Error('no folder dialog on this system'));
  return new Promise((resolve, reject) => {
    execFile(command.cmd, command.args, { env: { ...process.env, ...command.env }, windowsHide: false, timeout: 15 * 60_000 }, (error, stdout) => {
      const path = String(stdout).trim().replace(/[\\/]+$/, '') || (String(stdout).trim() === '/' ? '/' : '');
      if (path) { resolve(path); return; }
      /* cancelled: osascript says error -128, zenity and kdialog exit 1, Windows prints nothing */
      if (!error || /-128|User canceled/i.test(String(error.message)) || error.code === 1) { resolve(null); return; }
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') { reject(new Error('no folder dialog on this system')); return; }
      reject(error);
    });
  });
}

/**
 * Ask the person for files. Resolves their paths (none when they cancelled); rejects when this system has no dialog
 * Studio can open.
 * @param {{ title: string, at?: string | null }} ask @returns {Promise<string[]>}
 */
export function pickFiles(ask) {
  const command = filePickerCommand(process.platform, ask, onPath);
  if (!command) return Promise.reject(new Error('no file dialog on this system'));
  return new Promise((resolve, reject) => {
    execFile(command.cmd, command.args, { env: { ...process.env, ...command.env }, windowsHide: false, timeout: 15 * 60_000 }, (error, stdout) => {
      const paths = String(stdout).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && isAbsolute(line));
      if (paths.length) { resolve(paths); return; }
      if (!error || /-128|User canceled/i.test(String(error.message)) || error.code === 1) { resolve([]); return; }
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') { reject(new Error('no file dialog on this system')); return; }
      reject(error);
    });
  });
}
