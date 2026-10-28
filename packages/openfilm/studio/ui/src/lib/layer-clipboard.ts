/**
 * Copy and paste of layers inside a page (⌘C / ⌘V and the menus, on the picture and in the Layers panel), as a design
 * tool does: a pasted layer is a new layer of the same page, over what is beside it, a little lower and to the right
 * each time it is pasted at the same spot, and selected, to be moved.
 *
 * The page is shared by every clip of it and is the agent's, so a paste never writes it: the copy is an override of
 * the clip (SPEC §1 `copy`), `{"at": <the page's own element>, "copy": k}`, which draws a copy of the element after
 * each frame, as the page draws it then, so it moves as the copied one does, in Studio and in an export. What made the
 * copied layer look as it does (its own changes and those of the layers in it) is said again of the copy
 * (`[data-film-copy="k"] …`), so the copy is the copied one as it was, and changing one later leaves the other be. It
 * is one edit of the clip's overrides: one undo takes it away.
 *
 * Into a clip of the same page under the playhead (the one copied from, or another clip of that page). Another page,
 * or another project, cannot draw what its code does not: there the copy is a clip of its own instead (pastePlan), a
 * clip of the copied layer's page on a track above showing that layer alone (every other element hidden, the page's
 * background taken away), from the moment copied, at the playhead, where it was on the picture.
 *
 * The clipboard is the timeline's or this one's, whichever was copied last; it is kept in the browser's storage, so
 * another window and another project of the same Studio paste it too (lib: no React, no DOM, so `node --test` runs it).
 */
import { fittedFade, pictureRect } from '../../../../src/film-doc.mjs';
import type { Op } from '../api.ts';
import type { FilmClip, FilmDoc, FilmOverride } from './film.ts';
import type { OverrideTarget } from './film-overrides.ts';
import { propsAttr, propsOf } from './component-props.ts';
import { TOUCH_MS, type EditModel } from './timeline-edit.ts';

/** One page clip's copied layers, as they are put down. */
export interface CopiedClip {
  /** The id of the clip they were copied from. */
  from: string;
  /** Its time on the film when copied. */
  startMs: number;
  endMs: number;
  /** Its picture's own px (a page's size), for where it is drawn without a box; null when not known. */
  own: { w: number; h: number } | null;
  /** The clip put down: the copied one's, showing the copied layers alone (no id, no time on the film). */
  clip: Omit<FilmClip, 'id' | 'at'>;
  /** A selector naming each copied layer: the first is selected once pasted. */
  layers: string[];
  /** Per copied layer, the page's own element it is (or a copy of it copies), named alone; null: none. */
  bases?: (string | null)[];
  /** Per copied layer, what made it look as it does, said of the layers it finds in it (`''`: the layer itself). */
  tweaks?: CopiedTweak[][];
}

/** A change of a copied layer or of layers in it: `rels` where in it, from it (`''` it, ` > h1:nth-of-type(2)` …). */
export interface CopiedTweak {
  rels: string[];
  tweak: Omit<FilmOverride, 'at' | 'n' | 'copy' | 'lock'>;
}

export interface LayerClipboard {
  /** The project copied from: another one brings the page's files in first. */
  project: string;
  /** The film's time copied at. */
  atMs: number;
  clips: CopiedClip[];
  /** The pastes made at one spot so far (each one further off), and the spot. */
  pasted?: { spot: string; n: number };
}

/** How far each paste at the same spot goes, right and down (stage px). */
export const PASTE_OFFSET = 24;

/**
 * Everything but `keep` (each a selector naming a layer alone) and what is inside them. The stage knows a clip of
 * pasted layers by it (studio/server/stage.js `pastedOnly`): only they are the clip's, not its box.
 */
const ALL_BUT = 'body *:not(';
const allBut = (keep: readonly string[]) => `${ALL_BUT}${keep.flatMap((at) => [at, `${at} *`]).join(', ')})`;
/** The entry hiding everything but some layers. */
const isPastedOnly = (o: FilmOverride) => Boolean(o.at?.startsWith(ALL_BUT) && o.style?.visibility === 'hidden');
/** The page's own background taken away: only the layers are drawn. */
const BACKGROUND: FilmOverride = { at: ':root, body', style: { background: 'none' } };

/**
 * A copied clip's overrides: those of its own (`near`, one answer per entry: of the copied layers, inside them or
 * around them, studio/server/stage.js `copying`) and its fades, without locks (a copy is made to be moved); then
 * everything else hidden, the page's background gone, and the copied layers shown.
 */
export function copiedOverrides(all: readonly FilmOverride[] | undefined, near: readonly boolean[], keep: readonly string[]): FilmOverride[] {
  const shows: FilmOverride[] = [
    { at: allBut(keep), style: { visibility: 'hidden' } },
    BACKGROUND,
    ...keep.map((at): FilmOverride => ({ at, style: { visibility: 'visible' } })),
  ];
  /* copied from a copy: what made that one show its layers alone is made anew (a layer is shown again by its
     `visibility: visible`; the person's own show takes a hide away) */
  const own = (all ?? []).flatMap((o, i): FilmOverride[] => {
    if (o.at === undefined) return [o];
    if (!near[i] || isPastedOnly(o) || JSON.stringify(o) === JSON.stringify(BACKGROUND)) return [];
    const { lock: _lock, style, ...rest } = o;
    const { visibility, ...look } = style ?? {};
    const kept: FilmOverride = { ...rest, ...(visibility !== undefined && visibility !== 'visible' ? { style: { ...look, visibility } } : Object.keys(look).length ? { style: look } : {}) };
    return Object.keys(kept).some((k) => k !== 'at' && k !== 'n') ? [kept] : [];
  });
  return [...own, ...shows];
}

/**
 * The clip a copy of layers puts down, from `clip` as film.html has it: no id, time or link; its properties
 * (`data-props`) those naming the copied layers or what is in them (`nearProps`, one answer per property; a variable
 * names no layer and stays), its overrides as copiedOverrides makes them.
 */
export function copiedClip(
  clip: FilmClip, keep: readonly string[], near: readonly boolean[], nearProps: readonly boolean[],
): CopiedClip['clip'] {
  const { id: _id, at: _at, attrs, overrides, ...rest } = structuredClone(clip);
  const out: CopiedClip['clip'] = { ...rest, overrides: copiedOverrides(overrides, near, keep) };
  const kept: Record<string, string> = { ...attrs };
  delete kept['data-link'];
  const props = propsOf(clip);
  const left = propsAttr(props.filter((p, i) => p.type === 'var' || nearProps[i]));
  if (left) kept['data-props'] = left; else delete kept['data-props'];
  if (Object.keys(kept).length) out.attrs = kept;
  return out;
}

/** Where each property of a clip points (a variable at no layer): what `copying` is asked of them. */
export function propTargets(clip: FilmClip): (OverrideTarget | null)[] {
  return propsOf(clip).map((p) => (p.type === 'var' || !p.at ? null : { at: p.at, ...(p.n != null ? { n: p.n } : {}) }));
}

/** What a paste is put into: the film as it is now, and where. */
export interface PasteContext {
  project: string;
  /** The playhead. */
  atMs: number;
  film: FilmDoc;
  model: EditModel;
  /** The track of the clip pasted into (one selected, else the top picture under the playhead); null: the top. */
  into: number | null;
}

export interface PastePlan {
  ops: Op[];
  /** Each new clip's id, with the layer to select in it. */
  made: { id: string; layer: string }[];
  /** The clipboard with this paste counted. */
  board: LayerClipboard;
}

/** A clip as an insert takes it (api.ts's own type of a clip). */
type InsertClip = NonNullable<Extract<Op, { op: 'insert' }>['clip']>;

const clipsOf = (film: FilmDoc) => film.tracks.flatMap((t, track) => t.clips.map((clip) => ({ clip, track })));

/** An id the film does not use yet, from the copied clip's (a copy's copy is the first one's next copy). */
function freshId(from: string, taken: Set<string>): string {
  const base = from.replace(/-copy(-\d+)?$/, '');
  let id = `${base}-copy`;
  for (let n = 2; taken.has(id); n++) id = `${base}-copy-${n}`;
  taken.add(id);
  return id;
}

/** `box` moved `d` px right and down; without one, from where the page is drawn by default (its own size, centered). */
export function offsetBox(box: FilmClip['box'], own: CopiedClip['own'], stage: FilmDoc['stage'], d: number): NonNullable<FilmClip['box']> {
  if (box) return { ...box, x: box.x + d, y: box.y + d };
  const at = pictureRect('page', own, stage, null);
  return { x: Math.round(at.x + d), y: Math.round(at.y + d) };
}

/**
 * A copy's fades when it starts at the moment copied instead of the clip's start, `lenSec` long: no fade in, the fade
 * out as it was (no longer than the copy).
 */
const fromMoment = (overrides: readonly FilmOverride[] | undefined, lenSec: number) => (overrides ?? []).flatMap((o): FilmOverride[] => {
  if (o.at !== undefined || !o.fade) return [o];
  const fade = fittedFade([0, o.fade[1]], lenSec);
  return fade && fade[1] > 0 ? [{ ...o, fade: [0, Math.round(fade[1] * 1000) / 1000] }] : [];
});

/**
 * The paste of `board` into the film (see the top): each copied clip a new clip, onto the track right above the one it
 * goes over when that track is free then (unlocked, shown, not a sound track), else onto a new track there. Null when
 * there is nothing to paste.
 */
export function pastePlan(board: LayerClipboard, ctx: PasteContext): PastePlan | null {
  if (!board.clips.length) return null;
  const all = clipsOf(ctx.film);
  const taken = new Set(all.map((x) => x.clip.id));
  /* the copied clips still where they were, under the playhead: the same spot */
  const here = board.project === ctx.project && board.clips.every((c) => (
    ctx.atMs >= c.startMs && ctx.atMs < c.endMs && all.some((x) => x.clip.id === c.from)
  ));
  const spot = here ? `${ctx.project}:here` : `${ctx.project}:${Math.round(ctx.atMs)}`;
  const n = board.pasted?.spot === spot ? board.pasted.n + 1 : here ? 1 : 0;
  const placed: { track: number; startMs: number; endMs: number }[] = [];
  const free = (track: number, startMs: number, endMs: number) => {
    const t = ctx.model.find((x) => x.index === track);
    if (!t || t.locked || t.role === 'audio' || ctx.film.tracks[track]?.hidden) return false;
    const overlaps = (c: { startMs: number; endMs: number }) => c.startMs < endMs - TOUCH_MS && c.endMs > startMs + TOUCH_MS;
    return !t.clips.some(overlaps) && !placed.some((p) => p.track === track && overlaps(p));
  };
  const onTracks: Op[] = [];
  const newTracks: { at: number; op: Op }[] = [];
  const made: PastePlan['made'] = [];
  for (const c of board.clips) {
    const id = freshId(c.from, taken);
    const lenMs = here ? c.endMs - c.startMs : Math.max(1, c.endMs - board.atMs);
    const startMs = here ? c.startMs : Math.max(0, Math.round(ctx.atMs));
    const inSec = c.clip.time?.[0] ?? 0;
    const moment = Math.round((inSec + (board.atMs - c.startMs) / 1000) * 1000) / 1000;
    const clip: FilmClip = here
      ? { ...structuredClone(c.clip), id }
      : { ...structuredClone(c.clip), id, time: [moment, Math.round((moment + lenMs / 1000) * 1000) / 1000], overrides: fromMoment(c.clip.overrides, lenMs / 1000) };
    if (n > 0) clip.box = offsetBox(c.clip.box, c.own, ctx.film.stage, PASTE_OFFSET * n);
    const over = here ? all.find((x) => x.clip.id === c.from)!.track : ctx.into ?? 0;
    const at = startMs / 1000;
    if (over > 0 && free(over - 1, startMs, startMs + lenMs)) {
      placed.push({ track: over - 1, startMs, endMs: startMs + lenMs });
      onTracks.push({ op: 'insert', clip: clip as InsertClip, at, track: over - 1 });
    } else {
      newTracks.push({ at: over, op: { op: 'insert', clip: clip as InsertClip, at, track: { insert: over } } });
    }
    made.push({ id, layer: c.layers[0] ?? '' });
  }
  /* onto the tracks that are there first, then the new ones from the lowest up, so every place written holds */
  const ops = [...onTracks, ...newTracks.sort((a, b) => b.at - a.at).map((x) => x.op)];
  return { ops, made, board: { ...board, pasted: { spot, n } } };
}

/* ── kept in the browser, for every window and project of this Studio ── */

const KEY = 'openfilm.layer-clipboard';

export function readLayerClipboard(): LayerClipboard | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v = raw ? JSON.parse(raw) as LayerClipboard : null;
    return v && typeof v.project === 'string' && Array.isArray(v.clips) && v.clips.length ? v : null;
  } catch {
    return null;
  }
}

/** Kept, or (null) emptied: the timeline's clipboard was copied to since. */
export function writeLayerClipboard(board: LayerClipboard | null): void {
  try {
    if (board) globalThis.localStorage?.setItem(KEY, JSON.stringify(board));
    else globalThis.localStorage?.removeItem(KEY);
  } catch { /* storage refused (a private window): the clipboard lives in this window only */ }
}

/** Whether a storage event is this clipboard's (another window copied or emptied it). */
export const isLayerClipboardKey = (key: string | null) => key === KEY || key === null;

/* ── into the same page: a copy of the layer, in the clip ── */

/** The attribute a copy carries (src/overrides.mjs COPY_ATTR): the entries of it name it, or what is in it, by it. */
const COPY_ATTR = 'data-film-copy';
export const copySelector = (k: number) => `[${COPY_ATTR}="${k}"]`;

/**
 * What is said again of a copy of each layer, from the clip's overrides as copied: per layer, the changes that find it
 * or layers in it (`inside`, one answer per override, studio/server/stage.js `copying`), each with where in it, without
 * a lock (a copy is made to be moved). The clip's own entry (its fades) is no layer's.
 */
export function copiedTweaks(
  all: readonly FilmOverride[] | undefined, inside: readonly (readonly { layer: number; rel: string }[])[], layers: number,
): CopiedTweak[][] {
  const out: CopiedTweak[][] = Array.from({ length: layers }, () => []);
  (all ?? []).forEach((o, i) => {
    if (o.at === undefined) return;
    const { at: _at, n: _n, copy: _copy, lock: _lock, ...tweak } = o;
    if (!Object.keys(tweak).length) return;
    for (let layer = 0; layer < layers; layer++) {
      const rels = [...new Set((inside[i] ?? []).filter((x) => x.layer === layer).map((x) => x.rel))];
      if (rels.length) out[layer]!.push({ rels, tweak });
    }
  });
  return out;
}

/**
 * The entries of copy `k` of the page's element `base`, `d` px lower and to the right of the copied layer: the copy,
 * then what is said again of it (`tweaks`). Its move goes where it counts: on the last change moving the layer itself
 * when that is the layer's alone, else on the copy's own entry.
 */
export function copyEntries(base: string, k: number, tweaks: readonly CopiedTweak[], d: number): FilmOverride[] {
  const root = copySelector(k);
  const entries: FilmOverride[] = tweaks.map(({ rels, tweak }) => ({ at: rels.map((rel) => `${root}${rel}`).join(', '), ...structuredClone(tweak) }));
  const moved = tweaks.map((x, i) => (x.rels.includes('') && x.tweak.t ? i : -1)).filter((i) => i >= 0).pop();
  const own: FilmOverride = { at: base, copy: k };
  if (moved === undefined) {
    if (d) own.t = [d, d];
  } else if (tweaks[moved]!.rels.length === 1) {
    const t = entries[moved]!.t!;
    entries[moved]!.t = [t[0] + d, t[1] + d];
    /* a move alone, the last word on it: the copy's own entry says it */
    if (Object.keys(tweaks[moved]!.tweak).length === 1 && moved === entries.length - 1) own.t = entries.pop()!.t;
  } else {
    const t = tweaks[moved]!.tweak.t!;
    entries.push({ at: root, t: [t[0] + d, t[1] + d] });
  }
  return [own, ...entries];
}

/** What a paste into the same page is put into: the film now, the playhead, and the clip in hand (its id), if any. */
export interface InPageContext {
  project: string;
  atMs: number;
  film: FilmDoc;
  model: EditModel;
  /** The page clip of the layer or clip in hand. */
  held: string | null;
}

export interface InPagePlan {
  /** The clip pasted into, with its overrides as they are to be written. */
  clip: string;
  overrides: FilmOverride[];
  /** The copy to select. */
  layer: string;
  /** The clipboard with this paste counted. */
  board: LayerClipboard;
}

/**
 * The paste of `board` into a clip of its layers' page under the playhead (see the top): the one in hand, else the one
 * copied from, else the top one; on a track that is not locked. Null when there is none, or the copy cannot be one
 * (copied from another project, or before the page's own elements were known): a clip of its own then (pastePlan).
 */
export function inPagePlan(board: LayerClipboard, ctx: InPageContext): InPagePlan | null {
  if (board.project !== ctx.project || board.clips.length !== 1) return null;
  const c = board.clips[0]!;
  if (!c.bases?.length || c.bases.some((b) => !b) || !c.tweaks) return null;
  const spanOf = (id: string) => ctx.model.flatMap((t) => t.clips.map((clip) => ({ clip, locked: Boolean(t.locked) }))).find((x) => x.clip.id === id);
  const all = ctx.film.tracks.flatMap((t) => t.clips);
  const here = all.filter((clip) => {
    const span = spanOf(clip.id);
    return clip.src === c.clip.src && span && !span.locked && ctx.atMs >= span.clip.startMs && ctx.atMs < span.clip.endMs;
  });
  const into = here.find((x) => x.id === ctx.held) ?? here.find((x) => x.id === c.from) ?? here[0];
  if (!into) return null;
  const used = (into.overrides ?? []).flatMap((o) => (o.copy != null ? [o.copy] : []));
  const spot = `${ctx.project}:${into.id}:${c.bases.join('|')}`;
  const n = board.pasted?.spot === spot ? board.pasted.n + 1 : 1;
  let k = Math.max(0, ...used);
  const added = c.bases.flatMap((base, i) => copyEntries(base!, ++k, c.tweaks![i] ?? [], PASTE_OFFSET * n));
  return {
    clip: into.id,
    overrides: [...(into.overrides ?? []), ...added],
    layer: copySelector(Math.max(0, ...used) + 1),
    board: { ...board, pasted: { spot, n } },
  };
}
