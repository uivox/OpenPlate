/**
 * When a sideways drag on the diary changes the day. Pure, so it can be tested; the gesture itself
 * lives in src/components/DaySwipe.tsx.
 */

/** Distance before the drag is taken over from scrolling and taps. */
export const SWIPE_START = 14;

/** True once a drag is clearly sideways, so vertical scrolling and taps keep working. */
export function isSideways(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_START && Math.abs(dx) > Math.abs(dy) * 2;
}

/**
 * Which way the day moves when the finger (or mouse) lets go: -1 for the previous day (dragged to the
 * right), +1 for the next day (dragged to the left), 0 to stay. A quarter of the width, or a quick
 * flick of at least 60 px, is enough.
 */
export function swipeResult(dx: number, vx: number, width: number): -1 | 0 | 1 {
  const far = Math.abs(dx) > Math.max(60, width * 0.25);
  const flick = Math.abs(vx) > 0.5 && Math.abs(dx) > 60 && Math.sign(vx) === Math.sign(dx);
  if (!far && !flick) return 0;
  return dx > 0 ? -1 : 1;
}

/** The page follows the finger one to one, but only up to its own width. */
export function dragOffset(dx: number, width: number): number {
  const w = Math.max(1, width);
  return Math.max(-w, Math.min(w, dx));
}
