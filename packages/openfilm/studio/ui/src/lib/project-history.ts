/**
 * A project's version history as the Version history panel shows it, and the calls that change it
 * (studio/server/history.mjs): a list of versions, as a person knows it from Google Docs or Figma. A version is saved
 * by the person, or on its own when Auto versions is on; restoring one goes back to it and saves what was there first.
 *
 *   GET    /api/projects/:id/history[?limit=n]             → { status, versions, more }
 *   GET    /api/projects/:id/history/files                 → { held, ignored }: what a version keeps, and the others
 *   GET    /api/projects/:id/history/poster/:commit        the film's picture when the version was saved
 *   POST   /api/projects/:id/history/save     { name? }
 *   POST   /api/projects/:id/history/restore  { commit }
 *   PATCH  /api/projects/:id/history/versions/:commit { name }
 *   POST   /api/projects/:id/history/copy     { commit, name } → { project }
 *
 * While an action runs, the project's events say how far it is ({ type: 'history-progress' }: HistoryProgress); when
 * it is done, `{ type: 'history', moved? }` (`moved`: the folder's files changed). A refusal comes with a `code`
 * ('nothing', 'name', 'none'), which the panel says in its own words.
 */

export interface Counts { added: number; removed: number; edited: number }
/** What changed, as the film tells it (see history.mjs Summary). */
export interface Summary { scenes: Counts; sounds: Counts; stage: boolean; other: boolean }
/** What a version keeps of the folder now, and how many other files the folder has (never kept). */
export interface HistoryFiles { held: number; heldBytes: number; ignored: number }
export interface HistoryStatus {
  /** the newest version; null: none yet */
  head: string | null;
  /** what the folder holds that the newest version does not; null: nothing */
  changes: { count: number; summary: Summary } | null;
  files: HistoryFiles | null;
}
/** A file, by its path in the project, and its size. */
export interface HistoryFile { path: string; size: number }
/** How far an action is: `phase` reading the files, keeping media, writing files, or updating the history. */
export interface HistoryProgress { op: string; phase: 'scan' | 'store' | 'write' | 'migrate'; done: number; total: number }
/** What a version is (history.mjs Kind). */
export type VersionKind = 'named' | 'saved' | 'auto' | 'agent' | 'before-restore' | 'restore' | 'upgrade' | 'parked';
export interface Version {
  commit: string;
  at: number;
  kind: VersionKind;
  /** the person's name for it; '' when it has none and is told by its kind */
  name: string;
  /** the version a 'restore' brought back */
  restored: string | null;
  summary: Summary;
}
export interface HistoryState { status: HistoryStatus; versions: Version[]; more: boolean }

const KINDS = new Set<VersionKind>(['named', 'saved', 'auto', 'agent', 'before-restore', 'restore', 'upgrade', 'parked']);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const counts = (raw: unknown): Counts => {
  const c = (raw ?? {}) as Record<string, unknown>;
  return { added: num(c.added), removed: num(c.removed), edited: num(c.edited) };
};
const summaryOf = (raw: unknown): Summary => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { scenes: counts(s.scenes), sounds: counts(s.sounds), stage: s.stage === true, other: s.other === true };
};
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** The server's answer, checked: anything unreadable is dropped rather than drawn as an empty row. */
export function normalizeHistory(raw: unknown): HistoryState | null {
  const body = raw as { status?: Record<string, unknown>; versions?: unknown; more?: unknown } | null;
  const s = body?.status;
  if (!s || typeof s !== 'object' || !Array.isArray(body.versions)) return null;
  const changes = s.changes && typeof s.changes === 'object'
    ? { count: num((s.changes as Record<string, unknown>).count), summary: summaryOf((s.changes as Record<string, unknown>).summary) }
    : null;
  const versions: Version[] = body.versions.flatMap((v) => {
    const r = v as Record<string, unknown> | null;
    if (!r || typeof r.commit !== 'string' || !r.commit) return [];
    return [{
      commit: r.commit,
      at: num(r.at),
      kind: KINDS.has(r.kind as VersionKind) ? r.kind as VersionKind : 'named',
      name: text(r.name),
      restored: typeof r.restored === 'string' && r.restored ? r.restored : null,
      summary: summaryOf(r.summary),
    }];
  });
  const f = s.files as Record<string, unknown> | null | undefined;
  const files = f && typeof f === 'object' ? { held: num(f.held), heldBytes: num(f.heldBytes), ignored: num(f.ignored) } : null;
  return { status: { head: typeof s.head === 'string' ? s.head : null, changes, files }, versions, more: body.more === true };
}

/**
 * What changed, as the parts of a sentence, in the order a person reads them: scenes before sounds, added before
 * edited before removed. Each is a string key and its count (the sentence is the strings' job). Nothing that a scene
 * or a sound tells: 'look' (the picture's size, or a file the scenes share) when that changed, else 'same'.
 */
export function summaryParts(summary: Summary): Array<{ key: string; n: number }> {
  const parts: Array<{ key: string; n: number }> = [];
  for (const [what, c] of [['scenes', summary.scenes], ['sounds', summary.sounds]] as const) {
    if (c.added) parts.push({ key: `${what}Added`, n: c.added });
    if (c.edited) parts.push({ key: `${what}Edited`, n: c.edited });
    if (c.removed) parts.push({ key: `${what}Removed`, n: c.removed });
  }
  if (!parts.length) parts.push({ key: summary.stage || summary.other ? 'look' : 'same', n: 0 });
  return parts;
}

/**
 * How a version is called, as a string key and what fills it: its name when it has one; else what kind of version
 * it is. A restore names the version it brought back, by its name, else by when it was saved (`at`), else (not in
 * the list) says it was an earlier one.
 */
export function versionLabel(v: Version, all: readonly Version[]): { key: string; name?: string; at?: number } {
  if (v.name && v.kind !== 'parked') return { key: '', name: v.name };
  switch (v.kind) {
    case 'restore': {
      const from = all.find((x) => x.commit === v.restored);
      if (!from) return { key: 'versions.kindRestoreOlder' };
      return from.name && from.kind !== 'parked' ? { key: 'versions.kindRestore', name: from.name } : { key: 'versions.kindRestoreAt', at: from.at };
    }
    case 'parked': return { key: 'versions.kindParked', name: v.name };
    case 'auto': return { key: 'versions.kindAuto' };
    case 'agent': return { key: 'versions.kindAgent' };
    case 'before-restore': return { key: 'versions.kindBeforeRestore' };
    case 'upgrade': return { key: 'versions.kindUpgrade' };
    default: return { key: 'versions.kindSaved' };
  }
}

/** Saved on its own (shown quieter than what the person saved). */
export const isAutomatic = (v: Version) => v.kind === 'auto' || v.kind === 'agent' || v.kind === 'before-restore' || v.kind === 'upgrade';

/** The day a time falls on, as the list groups it: 'today', 'yesterday', or that day's midnight (local time). */
export function dayOf(at: number, now: number): 'today' | 'yesterday' | number {
  const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const day = midnight(at);
  const today = midnight(now);
  if (day >= today) return 'today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return day >= yesterday.getTime() ? 'yesterday' : day;
}

/** The versions in days, newest first, as the list shows them. */
export function byDay(versions: readonly Version[], now: number): Array<{ day: 'today' | 'yesterday' | number; versions: Version[] }> {
  const out: Array<{ day: 'today' | 'yesterday' | number; versions: Version[] }> = [];
  for (const v of versions) {
    const day = dayOf(v.at, now);
    const last = out[out.length - 1];
    if (last && last.day === day) last.versions.push(v);
    else out.push({ day, versions: [v] });
  }
  return out;
}

/** A history call's outcome: done (with what came back), or refused with the server's `code`. */
export type HistoryResult<T = Record<string, unknown>> = { ok: true; body: T } | { ok: false; status: number; code: string | null };

async function call<T = Record<string, unknown>>(projectId: string, path: string, method = 'GET', json?: unknown): Promise<HistoryResult<T>> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/history${path}`, {
      method,
      ...(json === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.ok) return { ok: true, body: body as T };
    return { ok: false, status: res.status, code: typeof body.code === 'string' ? body.code : null };
  } catch {
    return { ok: false, status: 503, code: null };
  }
}

const fileList = (raw: unknown): HistoryFile[] => (Array.isArray(raw) ? raw : []).flatMap((f) => {
  const r = f as Record<string, unknown> | null;
  return r && typeof r.path === 'string' ? [{ path: r.path, size: num(r.size) }] : [];
});

export const historyApi = {
  load: async (id: string, limit = 50) => {
    const r = await call(id, `?limit=${limit}`);
    return r.ok ? normalizeHistory(r.body) : null;
  },
  files: async (id: string): Promise<{ held: HistoryFile[]; ignored: HistoryFile[] } | null> => {
    const r = await call(id, '/files');
    return r.ok ? { held: fileList(r.body.held), ignored: fileList(r.body.ignored) } : null;
  },
  save: (id: string, name: string) => call<{ commit: string }>(id, '/save', 'POST', { name }),
  restore: (id: string, commit: string) => call<{ commit: string; before: string | null; missing?: string[] }>(id, '/restore', 'POST', { commit }),
  rename: (id: string, commit: string, name: string) => call(id, `/versions/${commit}`, 'PATCH', { name }),
  copy: (id: string, commit: string, name: string) => call<{ project: { id: string; name: string }; missing?: string[] }>(id, '/copy', 'POST', { commit, name }),
};

/** The picture of a version (taken when it was saved). */
export const versionPoster = (projectId: string, commit: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/history/poster/${commit}`;

/** Which sentence a refusal gets: always our own words, never the server's text. */
export function historyErrorKey(result: { status: number; code: string | null }): string {
  switch (result.code) {
    case 'nothing': return 'versions.errorNothing';
    case 'name': return 'versions.errorName';
    default: break;
  }
  if (result.status === 404 || result.status === 501 || result.status === 503) return 'versions.errorUnavailable';
  return 'versions.errorGeneric';
}

/** A progress event's numbers, checked: null when it is not one. */
export function historyProgressOf(raw: unknown): HistoryProgress | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || r.type !== 'history-progress') return null;
  const phase = r.phase === 'scan' || r.phase === 'store' || r.phase === 'write' || r.phase === 'migrate' ? r.phase : null;
  if (!phase) return null;
  return { op: text(r.op), phase, done: num(r.done), total: num(r.total) };
}

/** Whether a project event says a version was restored: the folder's files changed under the editor. */
export const historyMoved = (event: { type: string; moved?: unknown }) => event.type === 'history' && event.moved === true;
