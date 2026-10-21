/**
 * Which project a window belongs to: a window is a folder inside a project (a project can hold more than one window,
 * each with a film, a conversation and an agent of its own). The list says so with `parentId` (the server finds it
 * there); this finds the name that goes with it.
 */

/** A project as the list holds it. */
export interface TreeProject {
  id: string;
  path: string;
  name: string;
  /** the project this one is a window of, when it is one */
  parentId?: string;
}

/**
 * The name of the project a window is in, or null when it is a project of its own. The nearest ancestor wins: a window
 * of a window is in the window it is in.
 */
export function parentProjectName(project: TreeProject, projects: readonly TreeProject[]): string | null {
  if (!project.parentId) return null;
  const parent = projects.find((p) => p.id === project.parentId);
  return parent ? parent.name : null;
}

/**
 * The name a new window in a project is offered with: the second one is "Window 2", the next "Window 3" (the project's
 * own name is the first window). The person can type another name; this only saves the typing.
 */
export function windowNameFor(projectId: string, projects: readonly TreeProject[]): number {
  const windows = projects.filter((p) => p.parentId === projectId).length;
  return windows + 2;
}

/** A project in the list, and how deep it is: a window is one level in, a window of a window two. */
export interface TreeItem<T> {
  project: T;
  depth: number;
}

/**
 * The projects with their windows right behind them: a window is shown under the project it is in, indented, so that
 * the list says what belongs to what. The order the projects come in is kept (the person's sort); only a window is
 * moved to just after the project it is in.
 *
 * **The same rule serves the tab strip**: there a window's tab is drawn under the project it is in, so the project
 * reads as the window's home. Both lists say the same thing, so both use this one.
 */
export function withWindows<T extends { id: string; parentId?: string }>(projects: readonly T[]): TreeItem<T>[] {
  const ids = new Set(projects.map((p) => p.id));
  const childrenOf = new Map<string, T[]>();
  for (const p of projects) {
    if (!p.parentId || !ids.has(p.parentId)) continue;
    const list = childrenOf.get(p.parentId) ?? [];
    list.push(p);
    childrenOf.set(p.parentId, list);
  }
  const out: TreeItem<T>[] = [];
  const done = new Set<string>();
  const walk = (p: T, depth: number) => {
    if (done.has(p.id)) return;
    done.add(p.id);
    out.push({ project: p, depth });
    for (const child of childrenOf.get(p.id) ?? []) walk(child, depth + 1);
  };
  for (const p of projects) {
    /* a window is brought out by the project it is in; one whose project is not here is on its own */
    if (p.parentId && ids.has(p.parentId)) continue;
    walk(p, 0);
  }
  for (const p of projects) if (!done.has(p.id)) walk(p, 0);
  return out;
}

/**
 * How deep each one is under the one it belongs to: a window is one level in, a window of a window two. A cycle (a
 * window that is its own ancestor) stops there rather than for ever.
 */
export function depthsOf<T extends { id: string; parentId?: string }>(items: readonly T[]): Map<string, number> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const depths = new Map<string, number>();
  for (const item of items) {
    if (depths.has(item.id)) continue;
    /* the chain up from here, the deepest first */
    const chain: T[] = [];
    const seen = new Set<string>();
    let one = item;
    while (one?.parentId && byId.has(one.parentId) && !seen.has(one.parentId)) {
      seen.add(one.parentId);
      chain.push(one);
      one = byId.get(one.parentId)!;
    }
    /* the chain is as deep as the item is (its parent is above it), and each one up is one less */
    if (!chain.length) depths.set(item.id, 0);
    else for (let n = 0; n < chain.length; n++) depths.set(chain[n].id, chain.length - n);
  }
  return depths;
}

/** The tab strip's own padding: a tab's words start this far from its left edge. */
const TAB_PADDING = 12;
/** How much deeper a window is drawn than the project it is in, one level down. */
const WINDOW_LEVEL = 18;
/** A project's tab is this wide. */
const TAB_WIDTH = 184;
/** A window's tab is never narrower than this, however deep it is. */
const WINDOW_MIN_WIDTH = 120;

/**
 * How a window's tab is drawn under the project it is in, so the strip **says** what belongs to what: the window is
 * indented a level deeper than the project, drawn narrower than it, and joined to it by a hairline `guide` wide (the
 * gutter between the tab's edge and the line).
 *
 * The strip is a row, not a list: an indent alone says nothing in a row, so these numbers are here to be **checked**
 * and not only looked at — a window that is drawn like a project reads as a project, which is the mistake this rule
 * exists to prevent.
 */
export function windowTabMetrics(depth: number): { indent: number; width: number; guide: number } {
  const level = Math.max(0, Math.trunc(depth)) * WINDOW_LEVEL;
  return {
    indent: TAB_PADDING + level,
    width: Math.max(WINDOW_MIN_WIDTH, TAB_WIDTH - level),
    guide: level,
  };
}

