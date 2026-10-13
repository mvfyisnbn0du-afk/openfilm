/**
 * Where the person's own agents are (agents.mjs AGENTS: Claude Code, Codex, Gemini CLI, …). Only real installations count: a config folder survives an
 * uninstall and is never evidence. On Windows an install by npm, pnpm or Yarn leaves a `.cmd` shim, which no program
 * can start without a shell: what it runs is used instead (cmdTarget), and one that cannot be read is started through
 * cmd.exe (agents.mjs). A program the person chose themselves (Settings → Agents → Locate) comes before any of these.
 * Reads no Electron module, so `node --test` can use it.
 */
import { accessSync, constants, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';

export const AGENT_DOWNLOADS = Object.freeze({
  claude: 'https://claude.com/download',
  codex: 'https://developers.openai.com/codex',
  gemini: 'https://geminicli.com',
  copilot: 'https://github.com/features/copilot/cli',
  cursor: 'https://cursor.com/cli',
  opencode: 'https://opencode.ai/download',
  codebuddy: 'https://www.workbuddy.ai/docs/cli/installation',
  qwen: 'https://github.com/QwenLM/qwen-code',
  kimi: 'https://www.kimi.com/code',
});

/**
 * Each agent's program, by the names it installs (the first found counts), and the folders its own installer puts it
 * in beside the usual ones (HOME_BIN_CANDIDATES): those are not always on the PATH an app gets.
 */
export const AGENT_PROGRAMS = Object.freeze({
  claude: { names: ['claude'] },
  codex: { names: ['codex'] },
  gemini: { names: ['gemini'] },
  copilot: { names: ['copilot'] },
  cursor: { names: ['cursor-agent'] },
  opencode: { names: ['opencode'], dirs: (home) => [join(home, '.opencode', 'bin')] },
  codebuddy: { names: ['codebuddy', 'cbc'] },
  qwen: { names: ['qwen'] },
  /* Kimi Code's own installer keeps it in ~/.kimi-code/bin; kimi-cli (uv) puts it in ~/.local/bin */
  kimi: { names: ['kimi'], dirs: (home) => [join(home, '.kimi-code', 'bin')] },
});

export function executableFile(path) {
  try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; }
}

/**
 * Claude Code as the Claude app keeps it: one folder per version under Application Support, newest first, the program
 * either straight inside (`<version>/claude.app`) or one folder down (`<version>/<build>/claude.app`, newer apps).
 */
export function claudeAppCli(home = homedir()) {
  const root = join(home, 'Library/Application Support/Claude/claude-code');
  const inside = (dir) => {
    const direct = join(dir, 'claude.app/Contents/MacOS/claude');
    if (executableFile(direct)) return direct;
    let builds = [];
    try { builds = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'claude.app').map((d) => d.name); } catch { return null; }
    return builds.map((b) => join(dir, b, 'claude.app/Contents/MacOS/claude')).find(executableFile) ?? null;
  };
  try {
    return readdirSync(root).filter((v) => /^\d+(\.\d+)*$/.test(v))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((v) => inside(join(root, v))).find(Boolean) ?? null;
  } catch { return null; /* the Claude app has not downloaded Claude Code */ }
}

const windows = process.platform === 'win32';
const valueOf = (env, name) => Object.entries(env ?? {}).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] || undefined;

/**
 * The folders Windows installers put programs in, which an app's PATH does not always have: the agents' own
 * installers (~/.local/bin), npm, pnpm, Volta, nvm-windows, Yarn, Bun, Scoop, Chocolatey, winget, and the commands
 * of apps from the Microsoft Store.
 */
export function windowsBinDirs(env = process.env, home = homedir()) {
  const v = (name) => valueOf(env, name);
  const appData = v('APPDATA') ?? join(home, 'AppData', 'Roaming');
  const local = v('LOCALAPPDATA') ?? join(home, 'AppData', 'Local');
  return [
    join(home, '.local', 'bin'),
    join(appData, 'npm'),
    ...(v('PNPM_HOME') ? [v('PNPM_HOME')] : []), join(local, 'pnpm'),
    ...(v('VOLTA_HOME') ? [join(v('VOLTA_HOME'), 'bin')] : []), join(local, 'Volta', 'bin'),
    ...(v('NVM_SYMLINK') ? [v('NVM_SYMLINK')] : []),
    join(local, 'Yarn', 'bin'),
    join(home, '.bun', 'bin'),
    ...(v('SCOOP') ? [join(v('SCOOP'), 'shims')] : []), join(home, 'scoop', 'shims'),
    join(v('ProgramData') ?? join(home, '..', '..', 'ProgramData'), 'chocolatey', 'bin'),
    join(local, 'Microsoft', 'WinGet', 'Links'),
    join(local, 'Microsoft', 'WindowsApps'),
  ];
}

export const HOME_BIN_CANDIDATES = (home = homedir()) => (windows
  ? windowsBinDirs(process.env, home)
  : [join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']);

/** What a program is called on Windows, in the order cmd.exe tries (an extensionless file there is a shell script). */
const WIN_SUFFIXES = ['.exe', '.cmd', '.bat'];
const isCmdScript = (path) => /\.(?:cmd|bat)$/i.test(path);

/**
 * A program file on Windows. A Microsoft Store app's command (WindowsApps) is a link that cannot be followed like a
 * file, yet starts like one: there, being there is enough.
 */
function presentFile(path) {
  try { return statSync(path).isFile(); } catch { /* maybe a Store app's command */ }
  try { const s = lstatSync(path); return s.isFile() || s.isSymbolicLink(); } catch { return false; }
}

/** each folder once (on Windows whatever its case), as first spelled */
function unique(dirs, win) {
  const seen = new Map();
  for (const d of dirs) if (d && isAbsolute(d) && !seen.has(win ? d.toLowerCase() : d)) seen.set(win ? d.toLowerCase() : d, d);
  return [...seen.values()];
}
/* an environment spread from Windows' own has its Path as well as the PATH set on purpose: that one wins */
const pathIn = (env) => env?.PATH ?? valueOf(env, 'PATH') ?? '';

export function findExecutable(name, extraDirs = [], env = process.env, { win = windows } = {}) {
  const path = pathIn(env);
  for (const dir of unique([...path.split(win ? ';' : delimiter), ...extraDirs], win)) {
    for (const suffix of win ? WIN_SUFFIXES : ['']) {
      const file = join(dir, name + suffix);
      if (win ? presentFile(file) : executableFile(file)) return win && isCmdScript(file) ? cmdTarget(file) ?? file : file;
    }
  }
  return null;
}

/* what a shim runs: "%dp0%\…" (npm), "%~dp0\…" (pnpm, Yarn); never the node.exe it may run it with */
const SHIM_TARGET = /"%(?:~dp0|_?dp0%)\\?([^"%]+?\.(?:js|cjs|mjs|exe|cmd|bat))"/gi;
const scriptFirst = (rel) => (/\.(?:c|m)?js$/i.test(rel) ? 0 : /\.exe$/i.test(rel) ? 1 : 2);

/**
 * What a `.cmd` shim runs (Windows): the package's script or program, which can be started without a shell (a `.cmd`
 * cannot be). Yarn's shim runs another shim, which is read in turn. Codex's script only starts its own program, so
 * the program itself, for this machine's chip; when there is none, not the script (the chat starts Codex as a shell
 * command, which a script is not): the shim it came from instead. Null when the shim says nothing that is there.
 */
export function cmdTarget(cmd, depth = 0) {
  let text = '';
  try { text = readFileSync(cmd, 'utf8'); } catch { return null; }
  const rels = [...new Set([...text.matchAll(SHIM_TARGET)].map((m) => m[1]))]
    .filter((rel) => !/(?:^|[\\/])node\.exe$/i.test(rel))
    .sort((a, b) => scriptFirst(a) - scriptFirst(b));
  for (const rel of rels) {
    const target = join(dirname(cmd), ...rel.split(/[\\/]+/));
    if (isCmdScript(target)) {
      const next = depth < 3 && existsFile(target) ? cmdTarget(target, depth + 1) : null;
      if (next) return next;
      continue;
    }
    if (/[\\/]@openai[\\/]codex[\\/]/i.test(target) && /\.js$/i.test(target)) {
      const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
      const pkg = target.replace(/[\\/]bin[\\/][^\\/]+$/, '');
      /* the platform package it installs beside its script, or one folder up when that was hoisted, and the one it
         ships itself: `bin`, as the package's own script says, `codex` in older ones */
      const exe = [
        join(pkg, 'node_modules', '@openai', `codex-win32-${process.arch}`, 'vendor', triple, 'bin', 'codex.exe'),
        join(pkg, '..', `codex-win32-${process.arch}`, 'vendor', triple, 'bin', 'codex.exe'),
        join(pkg, 'vendor', triple, 'bin', 'codex.exe'),
        join(pkg, 'vendor', triple, 'codex', 'codex.exe'),
        join(pkg, 'node_modules', '@openai', `codex-win32-${process.arch}`, 'vendor', triple, 'codex', 'codex.exe'),
      ].find(existsFile);
      if (exe) return exe;
      /* a shell command cannot start the script, so the shim it came from (null here) is used instead */
      continue;
    }
    if (existsFile(target)) return target;
  }
  return null;
}

function existsFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

/* where Codex is inside Codex.app and ChatGPT.app */
const CODEX_IN_APP = ['Contents/Resources/codex', 'Contents/Resources/codex-cli/bin/codex'];

/**
 * The program the person chose for an agent, as it can be started: a `.cmd` shim's target, the `.cmd` beside a
 * PowerShell shim (`.ps1`), the program inside a folder or an app chosen instead of it. Null when it is not there.
 */
export function chosenProgram(path, { names = [], win = windows } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path)) return null;
  let folder = false;
  try { folder = statSync(path).isDirectory(); } catch { /* a file, or not there */ }
  if (folder) {
    const inApp = /\.app$/i.test(path) ? [...CODEX_IN_APP, ...names.map((n) => `Contents/MacOS/${n}`)].map((p) => join(path, p)).find(executableFile) : null;
    return inApp ?? names.map((n) => findExecutable(n, [path, join(path, 'bin')], { PATH: '' }, { win })).find(Boolean) ?? null;
  }
  if (win) {
    if (/\.ps1$/i.test(path)) {
      const cmd = path.replace(/\.ps1$/i, '.cmd');
      return presentFile(cmd) ? cmdTarget(cmd) ?? cmd : null;
    }
    if (!presentFile(path)) return null;
    return isCmdScript(path) ? cmdTarget(path) ?? path : path;
  }
  return executableFile(path) || (/\.(?:c|m)?js$/i.test(path) && existsFile(path)) ? path : null;
}

/**
 * The command line program, or the copy inside the maker's own desktop app (many people only ever installed the
 * app): Codex ships inside Codex.app and ChatGPT.app; the Claude app keeps Claude Code under Application Support, one
 * folder per version, the newest used. `chosen`: the program the person chose, first. `others`: programs found some
 * other way (a Store app's own copy, agents.mjs), after the rest. `source` says which it is: chosen · path · app.
 */
export function detectAgentInstallation(id, { home = homedir(), env = process.env, pathDirs = HOME_BIN_CANDIDATES(home),
  applicationDirs = ['/Applications', join(home, 'Applications')], chosen = null, others = [], win = windows } = {}) {
  const program = AGENT_PROGRAMS[id] ?? { names: [id] };
  const install = AGENT_DOWNLOADS[id] ?? null;
  const picked = chosen ? chosenProgram(chosen, { names: program.names, win }) : null;
  if (picked) return { installed: true, cli: picked, source: 'chosen', install };
  const dirs = [...pathDirs, ...(program.dirs?.(home) ?? [])];
  let cli = null;
  for (const name of program.names) if (!cli) cli = findExecutable(name, dirs, env, { win });
  if (cli) return { installed: true, cli, source: 'path', install };
  if (id === 'codex') {
    cli = applicationDirs.flatMap((dir) => ['Codex.app', 'ChatGPT.app'].flatMap((app) => CODEX_IN_APP.map((p) => join(dir, app, p)))).find(executableFile) ?? null;
  }
  if (!cli && id === 'claude') cli = claudeAppCli(home);
  if (!cli) cli = others.find((file) => (win ? presentFile(file) : executableFile(file))) ?? null;
  return { installed: Boolean(cli), cli, source: cli ? 'app' : null, install };
}

/**
 * For a person whose agent is not found, what was looked at: every folder searched, and each file there with one of
 * the agent's names (any suffix, a PowerShell shim too) with what it runs, if that can be told.
 */
export function searchReport(id, { home = homedir(), env = process.env, pathDirs = HOME_BIN_CANDIDATES(home), win = windows } = {}) {
  const program = AGENT_PROGRAMS[id] ?? { names: [id] };
  const searched = unique([...pathIn(env).split(win ? ';' : delimiter), ...pathDirs, ...(program.dirs?.(home) ?? [])], win);
  const files = [];
  for (const dir of searched) {
    for (const name of program.names) {
      for (const suffix of ['', '.exe', '.cmd', '.bat', '.ps1']) {
        const file = join(dir, name + suffix);
        if (!presentFile(file)) continue;
        const runs = isCmdScript(file) ? cmdTarget(file) : /\.ps1$/i.test(file) ? null : file;
        files.push({ file, runs, usable: win ? suffix !== '' && suffix !== '.ps1' : executableFile(file) });
      }
    }
  }
  return { searched, files };
}
