/**
 * LED socket ring for the flat strip's LED mode: the upright shade's LED holder (45 degree lip, seat, tube for the
 * inverted tealight body) as a separate ring, with a groove in its underside that grips the strip's top edge. Printed
 * on its underside (z = 0), so the groove is an open slot and the lip is a 45 degree overhang.
 */
import type { MeshBuilder } from './shellMesh';
import { TealightParams, TealightGeometry, LED_CLEARANCE, LIP_WIDTH, coneRadius } from './tealightShade';
import { FLAT } from './flatStrip';
import { revolveProfile } from './flatRing';

export interface SocketSpec { g: TealightGeometry; p: TealightParams; sheetThickness: number }

/** (r, z) cross-section, counter-clockwise, heights relative to the ring's underside. */
export function socketProfile({ g, p, sheetThickness: t }: SocketSpec): [number, number][] {
  const Gd = FLAT.grooveDepth;
  const w = t + FLAT.grooveClearance;
  const rg = coneRadius(g.Rb, g.k, g.H) + t / 2;   // strip centre at its top edge
  const gIn = rg - w / 2, gOut = rg + w / 2;
  const a = (p.tealightDiameter + LED_CLEARANCE) / 2;
  const b = a + t;
  const lipR = a - LIP_WIDTH;
  const pOut = Math.max(gOut + FLAT.ringWallOut, b);
  const rSkirt = gIn - FLAT.ringWallIn;
  const seat = Gd + g.lipT;                         // the upright seat height (lipT above the rim), the rim sitting at Gd
  return [
    [rSkirt, 0], [gIn, 0], [gIn, Gd], [gOut, Gd], [gOut, 0], [pOut, 0],
    [pOut, seat], [b, seat], [b, seat + p.bodyHeight], [a, seat + p.bodyHeight], [a, seat],
    [lipR, seat], [lipR, Gd + (gIn - lipR)],        // 45 degrees down and out to the skirt
    [rSkirt, Gd + FLAT.ringWallIn],
  ];
}

export function buildSocketMesh(mb: MeshBuilder, spec: SocketSpec, segments = 360, cx = 0, cy = 0): { outerRadius: number } {
  const profile = socketProfile(spec);
  revolveProfile(mb, profile, cx, cy, segments);
  return { outerRadius: Math.max(...profile.map((q) => q[0])) };
}
