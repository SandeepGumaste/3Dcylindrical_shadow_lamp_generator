import type { ShadowWallParams } from './shadowWall';

/** Allowed corner radius (rectangle only), as in validateShadowWallParams: twice the wall up to half the shorter side. */
export function cornerRadiusLimits(p: Pick<ShadowWallParams, 'width' | 'length' | 'wallThickness'>): { min: number; max: number } {
  const min = 2 * p.wallThickness;
  return { min, max: Math.max(min, Math.min(p.width, p.length) / 2) };
}
