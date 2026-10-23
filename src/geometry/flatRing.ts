/**
 * Base ring for the flat strip: a revolved annulus with a groove in its top face that the strip's solid foot stands in.
 * Printed with its axis vertical. Plain revolve, nothing depends on the angle.
 */
import type { MeshBuilder } from './shellMesh';
import { FLAT } from './flatStrip';

export interface RingSpec {
  grooveRadius: number;   // mm, centre of the groove
  sheetThickness: number; // mm
  floor: number;          // mm of ring under the groove
  cx?: number;            // mm, ring centre on the bed
  cy?: number;
}

export function buildRingMesh(mb: MeshBuilder, spec: RingSpec, segments = 360): { outerRadius: number; height: number } {
  const w = spec.sheetThickness + FLAT.grooveClearance;
  const gIn = spec.grooveRadius - w / 2, gOut = spec.grooveRadius + w / 2;
  const rIn = gIn - FLAT.ringWallIn, rOut = gOut + FLAT.ringWallOut;
  const h = spec.floor + FLAT.grooveDepth;
  // (r, z) cross-section, counter-clockwise
  const profile: [number, number][] = [
    [rIn, 0], [rOut, 0], [rOut, h], [gOut, h], [gOut, spec.floor], [gIn, spec.floor], [gIn, h], [rIn, h],
  ];
  const cx = spec.cx ?? 0, cy = spec.cy ?? 0;
  const n = profile.length;
  const ids: number[] = [];
  for (let k = 0; k < segments; k++) {
    const th = (2 * Math.PI * k) / segments;
    for (const [r, z] of profile) ids.push(mb.vertex(cx + r * Math.cos(th), cy + r * Math.sin(th), z));
  }
  for (let k = 0; k < segments; k++) {
    const k1 = (k + 1) % segments;
    for (let e = 0; e < n; e++) {
      const e1 = (e + 1) % n;
      mb.quad(ids[k * n + e], ids[k1 * n + e], ids[k1 * n + e1], ids[k * n + e1]);
    }
  }
  return { outerRadius: rOut, height: h };
}
