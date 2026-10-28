/**
 * Copy and paste of layers inside a page (⌘C / ⌘V and the menus, on the picture and in the Layers panel).
 *
 * The page is shared by every clip of it and is the agent's, so a paste never writes it, and an override can only
 * change what a page draws, not add to it. A pasted layer is a new clip of the same page instead, on a track above,
 * showing that layer alone: every other element hidden (`visibility`, so nothing moves in the page's own layout), the
 * page's background taken away, and the changes that make the layer look as it does (its own, those inside it and
 * those of the layers around it) kept. It plays as the page plays, so it moves as the copied one does, and it is drawn
 * the same wherever the film is (Studio, an export). The person moves it as any layer. It is one insert in film.html:
 * one undo takes it away.
 *
 * Where it goes: pasted while the copied clip is under the playhead, the copy spans that clip's time, a little lower
 * and to the right of it each time (pasted at the same spot it would hide under itself); elsewhere (another time,
 * another page, another project) it starts at the playhead from the moment copied, where it was on the picture.
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
