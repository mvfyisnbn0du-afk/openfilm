// @ts-check
/**
 * A project's version history: a git repository of its own in `.film/history`. It never touches a `.git` the folder
 * may have (the person's or the agent's own repository): every call names this one explicitly.
 *
 * A version holds the project: film.html and every file it uses (closure.mjs), and every other file of the folder
 * that is not a video, a sound or a picture the film does not use, nor larger than UNUSED_MAX (versionFiles). So the
 * pages, their code, data and fonts, Studio's settings and markers of the film, and the agent's notes and scripts are
 * all kept, however a page names them; renders, frames and other takes are not, and history never writes, moves or
 * deletes them. Media is kept by its content outside git, as clones where the disk can (history-store.mjs), so keeping
 * a version of a large project takes moments and no space.
 *
 * It is a list of versions, as a person knows it from Google Docs or Figma, not branches and commits. A version is
 * saved by the person (named or not), or on its own while they work when they asked for that (auto-versions.mjs).
 * Restoring one makes the folder hold its files and saves that as the newest version, after saving what was there
 * first when it was not saved yet: nothing is ever lost, and nothing is deleted from the folder but Studio's state of
 * the film that the version did not have (its markers, say: it had none). What a version
 * changed is told in the film's terms (scenes and sounds added, removed, edited: `summary`), not as files; smaller
 * steps are the editor's undo, not versions.
 *
 * Each version is a commit on the branch checked out. Its message is a readable subject (the person's name for it, or
 * what kind of version it is) and a trailer saying its kind: `Openfilm-Version: named` and so on (Kind). A name given
 * later is a tag on it. Histories of earlier editions had branches and changes parked on them: their versions are
 * listed too, and any of them can be restored.
 *
 * Every action takes an optional `onProgress` (history-store.mjs Progress) to say how far it is; a history an earlier
 * Studio made is brought up to date on first use (history-migrate.mjs).
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FILM_FILE, kindOf, readFilmFile } from '../../src/film-doc.mjs';
import { STUDIO_STATE, clipFile, filmClosure, folderView, isMediaFile, projectFiles } from './closure.mjs';
import { FORMAT, formatOf, markFormat, migrateHistory, upgradeHistory } from './history-migrate.mjs';
import {
  HistoryError, gitRun, keepFiles, openRepo, readVersion, sameAs, writeFiles, writeTree,
} from './history-store.mjs';
import { TOOL_DIR } from './projects.mjs';

export { HistoryError };

/** @typedef {import('./history-store.mjs').Progress} Progress */
/** @typedef {{ onProgress?: Progress }} Options */

const historyDir = (/** @type {string} */ root) => join(root, TOOL_DIR, 'history');

/**
 * git, run on the project's history only, on the folder where the project is now: both named on every call, never
 * taken from the history's settings (its `core.worktree` is where the folder was when the history was made, and a
 * project moved or renamed since would have every call fail). Its hooks are never run (history-store.mjs gitRun).
 */
async function git(/** @type {string} */ root, /** @type {string[]} */ args, /** @type {{ input?: string }} */ o = {}) {
  const gitDir = historyDir(root);
  if (!ownHistory(gitDir)) throw new HistoryError('this project\'s version history was not made by Studio, so Studio does not use it', 409);
  await followMove(root, gitDir);
  return gitRun(root, gitDir, args, o);
}

/**
 * The settings a history Studio made has: the ones `git init` and `ready` write. A folder from elsewhere (a film
 * downloaded or cloned) can bring a `.film/history` of its own, whose settings would have git run its commands (an
 * fsmonitor, a filter, an include of other settings…). git is never run on such a history; `ready` puts it aside.
 */
const OWN_SETTINGS = new Set(['core.repositoryformatversion', 'core.filemode', 'core.bare', 'core.logallrefupdates', 'core.worktree',
  'core.ignorecase', 'core.precomposeunicode', 'core.symlinks', 'core.autocrlf', 'commit.gpgsign', 'extensions.objectformat', 'extensions.refstorage']);

/** Whether the history in `gitDir` has Studio's settings only (and takes none from elsewhere). None yet counts. */
function ownHistory(/** @type {string} */ gitDir) {
  if (existsSync(join(gitDir, 'commondir'))) return false;
  let text;
  try { text = readFileSync(join(gitDir, 'config'), 'utf8'); } catch { return true; }
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    const header = /^\[([A-Za-z0-9.-]+)\]\s*(.*)$/.exec(line);
    if (header) { section = header[1].toLowerCase(); line = header[2]; }
    else if (line.startsWith('[')) return false;
    if (!line || /^[#;]/.test(line)) continue;
    const key = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=|$)/.exec(line)?.[1];
    if (!key || line.endsWith('\\') || !OWN_SETTINGS.has(`${section}.${key.toLowerCase()}`)) return false;
  }
  return true;
}

/**
 * The history's own record of its folder (`core.worktree`) put right when the project was moved or renamed since (by
 * this Studio or an earlier one), so git run on it any other way (a person's `git --git-dir`) finds the folder too.
 */
async function followMove(/** @type {string} */ root, /** @type {string} */ gitDir) {
  let text = '';
  try { text = readFileSync(join(gitDir, 'config'), 'utf8'); } catch { return; }
  const value = /^\s*worktree\s*=\s*(.*?)\s*$/m.exec(text)?.[1];
  if (value == null) return;
  /* as git writes it: quoted when it has to be, with \" and \\ escaped */
  const said = value.replace(/^"(.*)"$/, '$1').replace(/\\(["\\])/g, '$1');
  if (said !== root) await gitRun(root, gitDir, ['config', 'core.worktree', root]);
}

/**
 * The history repository, made on first use (without the person's git templates: nothing in it but git's own), or
 * brought up to date when an earlier Studio made it. Returns it, open.
 * @param {string} root @param {Progress} [progress]
 */
async function ready(root, progress) {
  if (!existsSync(root)) throw new HistoryError('the project\'s folder is not there', 404, 'none');
  const gitDir = historyDir(root);
  if (existsSync(gitDir) && !ownHistory(gitDir)) await rename(gitDir, `${gitDir}-from-elsewhere-${Date.now()}`);
  if (!existsSync(join(gitDir, 'HEAD'))) {
    await mkdir(join(gitDir, 'info'), { recursive: true });
    await git(root, ['init', '--quiet', '--template=', '--initial-branch=main', '--object-format=sha1']);
    await git(root, ['config', 'core.autocrlf', 'false']);
    await git(root, ['config', 'commit.gpgsign', 'false']);
    /* git is never shown the folder (history-store.mjs); should a person run it there, it sees nothing */
    await writeFile(join(gitDir, 'info', 'exclude'), '*\n');
    await markFormat(gitDir);
  } else {
    await followMove(root, gitDir);
    const format = formatOf(gitDir);
    if (format < 2) await migrateHistory(root, gitDir, versionFiles, progress);
    else if (format < FORMAT) await upgradeHistory(root, gitDir, versionFiles);
  }
  return openRepo(root, gitDir);
}

/** Tidy the history now and then, after the answer (git decides when it is worth it; it never blocks anything). */
function maintain(/** @type {string} */ root) {
  void git(root, ['gc', '--auto', '--quiet']).catch(() => {});
}

/** A progress callback that speaks at most ten times a second, and always at the end of a phase. */
function throttled(/** @type {Progress | undefined} */ fn) {
  if (!fn) return undefined;
  let last = 0;
  /** @type {Progress} */
  return (p) => {
    const now = Date.now();
    if (p.done < p.total && now - last < 100) return;
    last = now;
    fn(p);
  };
}

/* ── one thing at a time ─────────────────────────────────────────────────── */

/** @type {Map<string, Promise<void>>} what waits per project */
const queues = new Map();

/**
 * Run `job` once whatever the project is doing in its history is done: two at once would write the same files, and a
 * read in the middle of a switch sees half of it.
 * @template T @param {string} root @param {() => Promise<T>} job @returns {Promise<T>}
 */
function queued(root, job) {
  const next = (queues.get(root) ?? Promise.resolve()).then(job);
  const settled = next.then(() => {}, () => {});
  queues.set(root, settled);
  settled.then(() => { if (queues.get(root) === settled) queues.delete(root); });
  return next;
}

/* ── what is there ───────────────────────────────────────────────────────── */

const headOf = async (/** @type {string} */ root) => (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).catch(() => '')).trim() || null;

/** The branch checked out (a new history's first branch has no commit yet). */
const currentBranch = async (/** @type {string} */ root) => (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim();

/** Larger than this, a file the film does not use is not kept (a disk image, an archive, a project of another app). */
export const UNUSED_MAX = 50 << 20;

/* what is never the project's own, wherever it is: a tool's dot folder or file, what builds and packages make */
const NOT_KEPT = /(^|\/)(\.[^/]*|node_modules|dist|build)(\/|$)/;

/**
 * The files a version of the folder at `root` holds: path → size. The film's (filmClosure), and the folder's others
 * but videos, sounds and pictures, files over UNUSED_MAX, and what NOT_KEPT says. None without a film.html.
 * @param {string} root @returns {Promise<Map<string, number>>}
 */
export async function versionFiles(root) {
  const held = await filmClosure(folderView(root));
  if (!held.size) return held;
  for (const [path, size] of await projectFiles(root)) {
    if (!held.has(path) && !isMediaFile(path) && size <= UNUSED_MAX && !NOT_KEPT.test(path)) held.set(path, size);
  }
  return held;
}

/** @typedef {{ path: string, change: 'added' | 'modified' | 'deleted' }} Change */

/**
 * What the film in the folder holds that the version `head` does not: its files added, changed, or gone (from the
 * folder, or no longer used by the film). Also the film's files now (the closure: path → size).
 * @param {import('./history-store.mjs').Repo} repo @param {string | null} head @param {Progress} [progress]
 * @returns {Promise<{ changes: Change[], closure: Map<string, number> }>}
 */
async function changesNow(repo, head, progress) {
  const closure = await versionFiles(repo.root);
  const was = head ? await readVersion(repo, head) : new Map();
  /** @type {Change[]} */
  const changes = [];
  const paths = [...new Set([...closure.keys(), ...was.keys()])].sort();
  let done = 0;
  for (const path of paths) {
    const entry = was.get(path);
    if (closure.has(path) && entry) {
      if (!(await sameAs(repo, path, entry))) changes.push({ path, change: 'modified' });
    } else changes.push({ path, change: entry ? 'deleted' : 'added' });
    progress?.({ phase: 'scan', done: ++done, total: paths.length });
  }
  await repo.hashes.save();
  return { changes, closure };
}

/** film.html as it is at `rev` ('' when there is none); `null`: as it is in the folder now. */
async function filmAt(/** @type {string} */ root, /** @type {string | null} */ rev) {
  if (rev == null) return readFile(join(root, FILM_FILE), 'utf8').catch(() => '');
  return git(root, ['show', `${rev}:${FILM_FILE}`]).catch(() => '');
}

/** The clips of a film.html text by id: what each is (a picture or a sound), its file, and all it says, to compare. */
function clipsOf(/** @type {string} */ text) {
  /** @type {Map<string, { sound: boolean, file: string, said: string }>} */
  const clips = new Map();
  const doc = text.trim() ? readFilmFile(text).doc : null;
  for (const track of doc?.tracks ?? []) {
    for (const clip of track.clips) {
      const src = String(clip.src);
      clips.set(clip.id, { sound: kindOf(clip) === 'sound', file: clipFile(src) ?? src, said: JSON.stringify(clip) });
    }
  }
  return { clips, stage: doc ? `${doc.stage.w}x${doc.stage.h}` : '' };
}

/**
 * @typedef {{ added: number, removed: number, edited: number }} Counts
 * @typedef {{ scenes: Counts, sounds: Counts, stage: boolean, other: boolean }} Summary
 *   what changed, as the film tells it: its scenes (the clips with a picture) and its sounds, each added, removed or
 *   edited (moved, trimmed, restyled, or its file changed); `stage`: the picture's size; `other`: files no clip names
 *   changed that a page may draw with (its shared code, a font, a picture): the picture may look different though no
 *   clip did. Notes, scripts and Studio's markers change nothing of the picture.
 */

/* what a page may draw with */
const PICTURE = /\.(html?|css|[cm]?js|json|svg|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|mp4|mov|m4v|webm|mp3|m4a|wav|aac|ogg|opus|flac)$/i;

/**
 * What changed from `from` (a commit; null: nothing, the start) to `to` (a commit; null: the folder now), `paths` being
 * the files that changed between them.
 * @param {string} root @param {string | null} from @param {string | null} to @param {string[]} paths @returns {Promise<Summary>}
 */
async function summarize(root, from, to, paths) {
  const before = clipsOf(from ? await filmAt(root, from) : '');
  const after = clipsOf(await filmAt(root, to));
  const changed = new Set(paths);
  const counts = () => ({ added: 0, removed: 0, edited: 0 });
  /** @type {Summary} */
  const summary = { scenes: counts(), sounds: counts(), stage: Boolean(from) && before.stage !== after.stage, other: false };
  const files = new Set();
  for (const [id, clip] of after.clips) {
    files.add(clip.file);
    const was = before.clips.get(id);
    const tally = clip.sound ? summary.sounds : summary.scenes;
    if (!was) tally.added += 1;
    else if (was.said !== clip.said || changed.has(clip.file)) tally.edited += 1;
  }
  for (const [id, clip] of before.clips) {
    if (!after.clips.has(id)) (clip.sound ? summary.sounds : summary.scenes).removed += 1;
  }
  summary.other = paths.some((path) => path !== FILM_FILE && !files.has(path) && PICTURE.test(path) && !path.startsWith(`${TOOL_DIR}/`));
  return summary;
}

/** @type {Map<string, Summary>} what each commit changed (a commit never changes, nor does what it changed) */
const summaries = new Map();

/** What `commit` changed from its first parent. */
async function commitSummary(/** @type {string} */ root, /** @type {string} */ commit, /** @type {string | undefined} */ parent) {
  const key = `${root}\0${commit}`;
  const known = summaries.get(key);
  if (known) return known;
  const paths = (await git(root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', commit])).split('\0').filter(Boolean);
  const summary = await summarize(root, parent ?? null, commit, paths);
  summaries.set(key, summary);
  if (summaries.size > 5000) summaries.delete(summaries.keys().next().value ?? '');
  return summary;
}

/**
 * @typedef {{ held: number, heldBytes: number, ignored: number }} Files
 *   the files a version holds now, and how many other files the folder has (never in history)
 * @typedef {{ head: string | null, changes: { count: number, summary: Summary } | null, files: Files }} Status
 */

/**
 * Where the history is: the newest version (null: none yet), what the folder holds that it does not (null: nothing),
 * and what a version holds against what the folder has. A project never saved holds all it has as changes.
 * @param {string} root @param {Options} [o] @returns {Promise<Status>}
 */
export function status(root, { onProgress } = {}) {
  return queued(root, async () => {
    const repo = await ready(root, throttled(onProgress));
    const head = await headOf(root);
    const { changes: paths, closure } = await changesNow(repo, head);
    const changes = paths.length ? { count: paths.length, summary: await summarize(root, head, null, paths.map((p) => p.path)) } : null;
    const all = await projectFiles(root, { sizes: false });
    const files = {
      held: closure.size,
      heldBytes: [...closure.values()].reduce((n, s) => n + s, 0),
      ignored: [...all.keys()].filter((p) => !closure.has(p)).length,
    };
    return { head, changes, files };
  });
}

/**
 * The files a version holds now, and the folder's other files (which history leaves alone), each with its size.
 * @param {string} root @returns {Promise<{ held: { path: string, size: number }[], ignored: { path: string, size: number }[] }>}
 */
export function historyFiles(root) {
  return queued(root, async () => {
    if (!existsSync(root)) throw new HistoryError('the project\'s folder is not there', 404, 'none');
    const held = await versionFiles(root);
    const all = await projectFiles(root);
    const list = (/** @type {Iterable<[string, number]>} */ m) => [...m].map(([path, size]) => ({ path, size })).sort((a, b) => a.path.localeCompare(b.path));
    return { held: list(held), ignored: list([...all].filter(([p]) => !held.has(p))) };
  });
}

/**
 * What a version is, as its trailer says: `named` (saved by the person with a name), `saved` (by the person, without
 * one), `auto` (on its own while they worked), `agent` (on its own before an agent's turn), `before-restore` (what
 * was there before a version was restored), `restore` (a version restored: `restored` is which), `upgrade` (what
 * an earlier history did not keep, added when it was brought up to date), `parked` (changes an earlier edition left on
 * a branch). A commit with no trailer is the person's, named by its message.
 * @typedef {'named' | 'saved' | 'auto' | 'agent' | 'before-restore' | 'restore' | 'upgrade' | 'parked'} Kind
 */
const KINDS = new Set(['named', 'saved', 'auto', 'agent', 'before-restore', 'restore', 'upgrade', 'parked']);

/** The subject a version of `kind` gets when the person gave it no name (what plain git shows of it). */
const SUBJECT = { saved: 'Saved version', auto: 'Auto-saved', agent: 'Before agent\'s turn', 'before-restore': 'Before restoring', restore: 'Restored', upgrade: 'Kept all the project\'s files' };

/** A version's message: its subject, then its trailers. */
const messageOf = (/** @type {Kind} */ kind, /** @type {string} */ name, /** @type {string} */ restored = '') =>
  `${name || SUBJECT[/** @type {keyof typeof SUBJECT} */ (kind)] || kind}\n\nOpenfilm-Version: ${kind}${restored ? `\nOpenfilm-Restored: ${restored}` : ''}\n`;

/* a name given to a version later: a tag on it, `v-<the name, base64url>.<the version's first 12 hex>`, so two
   versions may have the same name; earlier editions wrote `v-<name>` */
const decodeName = (/** @type {string} */ tag) => (tag.startsWith('v-') ? Buffer.from(tag.slice(2).split('.')[0], 'base64url').toString('utf8') : tag);
const nameTag = (/** @type {string} */ name, /** @type {string} */ commit) => `refs/tags/v-${Buffer.from(name).toString('base64url')}.${commit.slice(0, 12)}`;

/**
 * @typedef {{ commit: string, at: number, kind: Kind, name: string, restored: string | null, summary: Summary }} Version
 *   `name`: the person's name for it ('' when it has none: it is told by its kind); `restored`: the version a
 *   `restore` brought back
 */

/**
 * The versions of the project, newest first, `limit` of them (more: there are older ones), each with what it changed.
 * Every branch's, and the changes an earlier edition parked on one, as well as the one checked out.
 * @param {string} root @param {{ limit?: number } & Options} [options] @returns {Promise<{ versions: Version[], more: boolean }>}
 */
export function log(root, { limit = 50, onProgress } = {}) {
  return queued(root, async () => {
    const gitDir = historyDir(root);
    if (!existsSync(join(gitDir, 'HEAD')) || !ownHistory(gitDir)) return { versions: [], more: false };
    await ready(root, throttled(onProgress));
    if (!(await headOf(root))) return { versions: [], more: false };
    /** @type {Map<string, string>} */
    const names = new Map();
    const refs = await git(root, ['for-each-ref', '--sort=creatordate', '--format=%(objectname)%1f%(*objectname)%1f%(refname:strip=2)', 'refs/tags']);
    for (const line of refs.split('\n')) {
      const [tag, peeled, name] = line.split('\x1f');
      const sha = peeled || tag;
      if (sha && name) names.set(sha, decodeName(name));
    }
    const out = await git(root, ['log', '--date-order', `--max-count=${limit + 1}`, '--format=%H%x1f%P%x1f%ct%x1f%s%x1f%b%x1e',
      'HEAD', '--branches', '--glob=refs/openfilm/parked/*', '--']);
    /** @type {Version[]} */
    const versions = [];
    for (const record of out.split('\x1e')) {
      const [commit, parents = '', at, subject = '', body = ''] = record.replace(/^\n/, '').split('\x1f');
      if (!commit) continue;
      const said = /^Openfilm-Version: (\S+)$/m.exec(body)?.[1] ?? '';
      const parked = /^parked: (.*)$/.exec(subject);
      const kind = /** @type {Kind} */ (KINDS.has(said) ? said : parked ? 'parked' : 'named');
      const own = kind === 'named' ? shownMessage(subject) : kind === 'parked' ? (parked?.[1] ?? '') : '';
      const parent = parents.split(' ')[0] || undefined;
      versions.push({
        commit, at: Number(at) * 1000, kind, name: names.get(commit) ?? own,
        restored: /^Openfilm-Restored: ([0-9a-f]+)$/m.exec(body)?.[1] ?? null, summary: await commitSummary(root, commit, parent),
      });
    }
    return { versions: versions.slice(0, limit), more: versions.length > limit };
  });
}

/**
 * A commit's message as it is shown: a commit Studio's earlier editions made says what it was in their words
 * (`studio: named "Final"`), shown as the name the person gave it.
 */
function shownMessage(/** @type {string} */ subject) {
  const named = /^studio: named "(.*)"$/.exec(subject);
  return named ? named[1] : subject;
}

/* ── changing it ─────────────────────────────────────────────────────────── */

/** A version the person named, as git knows it: its full id, or a 404. */
async function resolveCommit(/** @type {string} */ root, /** @type {string} */ rev) {
  if (!/^[0-9a-f]{7,64}$/.test(String(rev))) throw new HistoryError('which version?', 400, 'none');
  const full = (await git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).catch(() => '')).trim();
  if (!full) throw new HistoryError('no such version', 404, 'none');
  return full;
}

/** The files a version holds, as they are in the folder now, kept as a tree (`head`: the version they are compared with). */
async function keepFolder(/** @type {import('./history-store.mjs').Repo} */ repo, /** @type {string | null} */ head, /** @type {Progress | undefined} */ progress) {
  const files = await versionFiles(repo.root);
  const version = await keepFiles(repo, files.keys(), head ? await readVersion(repo, head) : null, progress);
  return writeTree(repo, version);
}

const treeOf = async (/** @type {string} */ root, /** @type {string} */ commit) => (await git(root, ['rev-parse', `${commit}^{tree}`])).trim();

/**
 * The folder as it is, saved as the newest version of the branch checked out, unless the newest holds it already
 * (null). Not queued: the caller is.
 * @param {import('./history-store.mjs').Repo} repo @param {Kind} kind @param {string} name @param {Progress} [progress] @param {string} [restored]
 */
async function saveFolder(repo, kind, name, progress, restored) {
  const root = repo.root;
  const head = await headOf(root);
  const branchRef = (await git(root, ['symbolic-ref', '--quiet', 'HEAD']).catch(() => '')).trim() || 'refs/heads/main';
  const tree = await keepFolder(repo, head, progress);
  if (head && tree === await treeOf(root, head)) return null;
  const commit = (await git(root, ['commit-tree', tree, ...(head ? ['-p', head] : []), '-F', '-'], { input: messageOf(kind, name, restored) })).trim();
  await git(root, ['update-ref', '-m', `${kind}: ${name || kind}`, branchRef, commit, head ?? '']);
  maintain(root);
  return commit;
}

/**
 * Save the folder as a version. By the person: `name` is theirs (none: 'saved'); asked with nothing changed, a name
 * names the newest version instead (and that is returned), and no name is refused ('nothing'). On its own (`kind`
 * 'auto' or 'agent'): null when nothing changed. Returns the version.
 * @param {string} root @param {{ name?: string, kind?: 'auto' | 'agent' } & Options} [o] @returns {Promise<string | null>}
 */
export function saveVersion(root, { name = '', kind, onProgress } = {}) {
  return queued(root, async () => {
    const text = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    const repo = await ready(root, throttled(onProgress));
    const saved = await saveFolder(repo, kind ?? (text ? 'named' : 'saved'), kind ? '' : text, throttled(onProgress));
    if (saved || kind) return saved;
    const head = await headOf(root);
    if (!head || !text) throw new HistoryError('nothing changed since the last version', 409, 'nothing');
    await nameCommit(root, head, text);
    return head;
  });
}

/** Give `commit` the name `name` (its earlier name, if any, goes). */
async function nameCommit(/** @type {string} */ root, /** @type {string} */ commit, /** @type {string} */ name) {
  const tags = await git(root, ['for-each-ref', `--points-at=${commit}`, '--format=%(refname)', 'refs/tags']);
  for (const ref of tags.split('\n').filter(Boolean)) await git(root, ['update-ref', '-d', ref]);
  await git(root, ['update-ref', nameTag(name, commit), commit]);
}

/** Name a version, or name it again. */
export function renameVersion(/** @type {string} */ root, /** @type {string} */ commit, /** @type {string} */ name) {
  return queued(root, async () => {
    const text = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!text) throw new HistoryError('a version\'s name cannot be empty', 400, 'name');
    await ready(root);
    await nameCommit(root, await resolveCommit(root, commit), text);
  });
}

/**
 * Make the folder hold `commit`'s files, and save that as the newest version ('restore'). What the folder held that
 * was not saved yet is saved first ('before-restore'), so it can be restored in turn. Files made since stay where
 * they are (nothing is deleted); a version keeps them if they are its kind of file. Studio's state of the film
 * (closure.mjs STUDIO_STATE) is the version's: a file of it the version did not have goes. Returns the newest version, the
 * one saved before it (null: there was nothing to save), and the media `commit` holds that could not be found (none,
 * unless the history's store lost some).
 * @param {string} root @param {string} commit @param {Options} [o]
 */
export function restoreVersion(root, commit, { onProgress } = {}) {
  return queued(root, async () => {
    const progress = throttled(onProgress);
    const repo = await ready(root, progress);
    const full = await resolveCommit(root, commit);
    const before = await saveFolder(repo, 'before-restore', '', progress);
    const version = await readVersion(repo, full);
    const { missing } = await writeFiles(repo, version, { progress });
    /* Studio's state of the film (markers, settings, subtitle style) the version did not have: it had none */
    for (const path of STUDIO_STATE) if (!version.has(path)) await rm(join(root, path), { force: true });
    const restored = await saveFolder(repo, 'restore', '', progress, full);
    return { commit: restored ?? /** @type {string} */ (await headOf(root)), before, missing };
  });
}

/**
 * Put `commit`'s files in the folder `into` (a new project's): a copy of that version, to try another way from it.
 * Media comes from the store as clones where the disk can. Returns the media that could not be found.
 * @param {string} root @param {string} commit @param {string} into @param {Options} [o]
 */
export function copyVersion(root, commit, into, { onProgress } = {}) {
  return queued(root, async () => {
    const progress = throttled(onProgress);
    const repo = await ready(root, progress);
    const version = await readVersion(repo, await resolveCommit(root, commit));
    const { missing } = await writeFiles(openRepo(into, repo.gitDir), version, { progress });
    return { missing };
  });
}
