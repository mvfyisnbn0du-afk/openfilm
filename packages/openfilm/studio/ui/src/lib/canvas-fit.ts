/**
 * A film's canvas changing shape, as an editor's (CapCut's) does: the canvas takes the new shape with its short side
 * kept (a 1920×1080 film made 3:4 is 1080×1440), and what the film shows is scaled whole into it, centered, as large
 * as fits: the part of the old canvas its pictures cover is fitted to the new canvas, so at least one side of it meets
 * the canvas's edge. It is worked out from where the pictures are, not from the old canvas, so shapes picked one after
 * another never shrink the film further. Nothing is cut. What a picture is drawn as (film-doc's pictureRect) is
 * written as its box, so a video that filled the old canvas (no box of its own) keeps that place rather than filling
 * the new one. A page that sets no size of its own is laid out at the canvas's: it is given the old canvas as its
 * `size`, so it is scaled as a video is rather than laid out again in the new shape.
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

type Rect = { x: number; y: number; w: number; h: number; r: number };

/** The upright rectangle around a picture as drawn (turned about its center by `r` degrees). */
function bounds(at: Rect) {
  const t = (at.r * Math.PI) / 180;
  const w = Math.abs(at.w * Math.cos(t)) + Math.abs(at.h * Math.sin(t));
  const h = Math.abs(at.w * Math.sin(t)) + Math.abs(at.h * Math.cos(t));
  const cx = at.x + at.w / 2, cy = at.y + at.h / 2;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}

/**
 * Each picture clip's box on the new canvas `to` (the old one is `from`): what the pictures cover of the old canvas
 * (the canvas itself when they cover none of it) is scaled to fit `to` whole and centered in it. Sounds have no
 * picture and are left out.
 */
export function fitToCanvas(clips: readonly CanvasClip[], from: Size, to: Size): CanvasFit[] {
  const drawn = clips.flatMap((clip) => {
    if (!clip.kind || clip.kind === 'sound') return [];
    const own = clip.own && clip.own.w > 0 && clip.own.h > 0 ? clip.own : from;
    return [{ clip, at: pictureRect(clip.kind, own, from, clip.box ?? undefined) as Rect }];
  });
  /* what the film shows: its pictures' extent, as far as the old canvas shows it */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { at } of drawn) {
    const b = bounds(at);
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(from.w, x1); y1 = Math.min(from.h, y1);
  if (!(x1 - x0 >= 1 && y1 - y0 >= 1)) { x0 = 0; y0 = 0; x1 = from.w; y1 = from.h; }
  const k = Math.min(to.w / (x1 - x0), to.h / (y1 - y0));
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return drawn.map(({ clip, at }) => {
    const w = at.w * k, h = at.h * k;
    const cx = (at.x + at.w / 2 - mx) * k + to.w / 2;
    const cy = (at.y + at.h / 2 - my) * k + to.h / 2;
    /* whole px; an edge within 2 px of the canvas's meets it, so rounding never leaves a hairline of black */
    const near = (v: number, edge: number) => (Math.abs(v - edge) <= 2 ? edge : Math.round(v));
    const left = near(cx - w / 2, 0), top = near(cy - h / 2, 0);
    const box: FilmBox = { x: left, y: top, w: near(cx + w / 2, to.w) - left, h: near(cy + h / 2, to.h) - top };
    if (at.r) box.r = at.r;
    return clip.kind === 'page' && clip.reflows && !clip.size ? { id: clip.id, box, size: { w: from.w, h: from.h } } : { id: clip.id, box };
  });
}
