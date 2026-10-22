import { KIT, type WallId } from './kitSpec';

/**
 * Shadow geometry of the box. The light is a point on the post axis at height L above the panel;
 * the mounting wall is T behind the panel. A rim point at horizontal distance d from the axis and
 * height h above the panel (h < L) grazes the ray that lands at r = d (L + T) / (L - h).
 * The outer top edge is the grazing edge, so d is measured to the wall's outer face.
 */
export function reachForHeight(h: number, d: number, L: number, T: number): number {
  return h >= L ? Infinity : (d * (L + T)) / (L - h);
}

export function heightForReach(r: number, d: number, L: number, T: number): number {
  return L - (d * (L + T)) / r;
}

/** Length of a wall's footprint along the box edge (the outer faces form a 120 x 150 rectangle). */
export function wallSpan(wall: WallId): number {
  return KIT.walls[wall].plan.fixed === 'y' ? KIT.boxW : KIT.boxD;
}

/**
 * Where position `s` (mm along the wall's footprint, from its start corner) sits relative to the
 * light axis: distance d and direction angle (counter-clockwise from +x, front view, y up).
 * Neighbouring walls give identical values at their shared corner.
 */
export function rimPoint(wall: WallId, s: number): { d: number; angle: number } {
  const { fixed, at } = KIT.walls[wall].plan;
  const x = fixed === 'y' ? s : at;
  const y = fixed === 'y' ? at : s;
  const dx = x - KIT.lightAxis.x, dy = y - KIT.lightAxis.y;
  return { d: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}
