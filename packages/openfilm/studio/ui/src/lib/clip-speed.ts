/**
 * A clip's speed set on the timeline by dragging its edges: the clip toolbar's Speed button turns a clip's edge
 * handles into speed handles. The clip keeps the part of its source it plays, so what changes is its length on the
 * film, and its speed is that source over the new length.
 *
 * Written as the clip's `speed` (SPEC §1: 0.25× to 4×, its sound keeping its pitch), with the edits a speed typed in
 * the inspector makes (lib/timeline-edit planSpeed): one write, one undo step.
 *
 * Pure: the timeline draws the speed while the hand is on the edge, and writes it on release.
 */
import { SPEED_MAX, SPEED_MIN, isStill } from '../../../../src/film-doc.mjs';
import { snapToFrame } from './timecode.ts';

/** A clip as a speed drag sees it: its place on the film and its speed now. */
export interface SpeedClip { startMs: number; endMs: number; speed?: number }

/** Whether a clip has a speed to change: a video or a sound with a part of its source on the film (not a still, not a page). */
export function canChangeSpeed(block: { kind: string; src?: string; anchor?: { trimFrom?: number; still?: boolean } }): boolean {
  return (block.kind === 'video' || block.kind === 'voice' || block.kind === 'music' || block.kind === 'sfx')
    && block.anchor?.trimFrom != null && !block.anchor.still && !(block.src && isStill(block.src));
}

/**
 * The source the clip plays, in source ms: what stays while its speed changes. Whole ms, as film.html writes it: the
 * clip's length on the film is rounded, and times its speed it misses the source by a little.
 */
const sourceMsOf = (clip: SpeedClip): number => Math.round((clip.endMs - clip.startMs) * (clip.speed && clip.speed > 0 ? clip.speed : 1));

/** How much longer the clip can get at that edge before it is at the slowest speed (film ms; 0 when it is already). */
export function speedRoomMs(clip: SpeedClip): number {
  return Math.max(0, sourceMsOf(clip) / SPEED_MIN - (clip.endMs - clip.startMs));
}

/**
 * The speed for the clip at `lengthMs` on the film, inside the speeds a clip can have. Let go anywhere it is on the
 * hundredth (`1.6×`, as the inspector writes it); `exact`, when the edge snapped to something, the speed that lands it
 * there, a hair faster rather than slower so it never runs past what it snapped to.
 */
export function speedForLength(clip: SpeedClip, lengthMs: number, exact = false): number {
  if (!(lengthMs > 0)) return SPEED_MAX;
  const raw = sourceMsOf(clip) / lengthMs;
  const stepped = exact ? Math.ceil(raw * 1e4 - 1e-6) / 1e4 : Math.round(raw * 100) / 100;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, stepped));
}

/**
 * Which edge a speed handle's drag moves, and by how much: its own, but rippling (the main track with the magnet) the
 * start stays and what follows moves, as a magnet's trim of the head: the start knob then moves the end the other way,
 * left longer, right shorter.
 */
export function speedDragEdge(edge: 'start' | 'end', ripple: boolean, deltaMs: number): { edge: 'start' | 'end'; deltaMs: number } {
  return edge === 'start' && ripple ? { edge: 'end', deltaMs: -deltaMs } : { edge, deltaMs };
}

/**
 * Whether the edge stopped away from the hand (`handMs`, where the hand puts it): a neighbor, the film's start, a snap.
 * A free edge only goes to the nearest frame, and that is not held, however many pixels a frame is zoomed in.
 */
export function edgeHeld(edgeMs: number, handMs: number): boolean {
  return Math.abs(edgeMs - snapToFrame(handMs)) >= 0.5;
}
