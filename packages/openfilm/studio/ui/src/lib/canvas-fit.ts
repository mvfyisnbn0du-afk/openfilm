/**
 * A film's canvas changing shape, as an editor's (CapCut's) does: the canvas takes the new shape with its short side
 * kept (a 1920×1080 film made 3:4 is 1080×1440), and every picture on it is scaled by one factor, the largest that
 * keeps the old canvas whole inside the new one, about the middle: the film shows as it was, smaller or larger,
 * centered, with room around it. Nothing is cut. What a picture is drawn as (film-doc's pictureRect) is written as its
 * box, so a video that filled the old canvas (no box of its own) keeps that place rather than filling the new one.
 * A page that sets no size of its own is laid out at the canvas's: it is given the old canvas as its `size`, so it is
 * scaled as a video is rather than laid out again in the new shape.
 */
import { pictureRect } from '../../../../src/film-doc.mjs';
import { frameRatioOf, type FilmFrameId } from './film-frame.ts';
import type { FilmBox, FilmSrcKind } from './film.ts';

type Size = { w: number; h: number };

/** Even sizes: H.264 samples chroma in 2×2 blocks and refuses odd dimensions. At most 8192 a side. */
const even = (n: number) => Math.max(2, Math.min(8192, Math.round(n / 2) * 2));

/** The canvas in another shape, its short side kept (a typed size is taken as it is elsewhere). */
export function canvasFor(stage: Size, frame: FilmFrameId): Size {
  const ratio = frame === 'native' ? null : frameRatioOf(frame);
  if (ratio == null) return { w: even(stage.w), h: even(stage.h) };
  const short = Math.min(stage.w, stage.h);
  return ratio >= 1 ? { w: even(short * ratio), h: even(short) } : { w: even(short), h: even(short / ratio) };
}

/**
 * A picture clip as the fit needs it: its kind, its picture's own size (unknown: the old canvas), its box if any, and
 * for a page, whether it sets no size of its own (`reflows`) and the `size` its clip gives it.
 */
export interface CanvasClip { id: string; kind: FilmSrcKind | null; own?: Size | null; box?: FilmBox | null; reflows?: boolean; size?: Size | null }

/** A clip on the new canvas: its box, and for a page laid out at the old canvas, that size. */
export interface CanvasFit { id: string; box: FilmBox; size?: Size }

/**
 * Each picture clip's box on the new canvas `to` (the old one is `from`): scaled by min(to.w / from.w, to.h / from.h)
 * about the middle of each canvas. Sounds have no picture and are left out.
 */
export function fitToCanvas(clips: readonly CanvasClip[], from: Size, to: Size): CanvasFit[] {
  const k = Math.min(to.w / from.w, to.h / from.h);
  const out: CanvasFit[] = [];
  for (const clip of clips) {
    if (!clip.kind || clip.kind === 'sound') continue;
    const own = clip.own && clip.own.w > 0 && clip.own.h > 0 ? clip.own : from;
    const at = pictureRect(clip.kind, own, from, clip.box ?? undefined);
    const w = at.w * k, h = at.h * k;
    const cx = (at.x + at.w / 2 - from.w / 2) * k + to.w / 2;
    const cy = (at.y + at.h / 2 - from.h / 2) * k + to.h / 2;
    const box: FilmBox = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
    if (at.r) box.r = at.r;
    out.push(clip.kind === 'page' && clip.reflows && !clip.size ? { id: clip.id, box, size: { w: from.w, h: from.h } } : { id: clip.id, box });
  }
  return out;
}
