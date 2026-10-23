import { describe, it, expect } from 'vitest';
import { MeshBuilder } from '../shellMesh';
import { checkMesh } from '../meshCheck';
import { buildRingMesh } from '../flatRing';
import { FLAT } from '../flatStrip';

describe('buildRingMesh', () => {
  const spec = { grooveRadius: 22.2, sheetThickness: 0.4, floor: 1.1 };

  it('is a watertight outward-facing ring with the analytic volume', () => {
    const mb = new MeshBuilder();
    const ring = buildRingMesh(mb, spec);
    const { positions, indices } = mb.toArrays();
    const c = checkMesh(positions, indices);
    expect(c.watertight).toBe(true);
    const w = spec.sheetThickness + FLAT.grooveClearance;
    const gIn = spec.grooveRadius - w / 2, gOut = spec.grooveRadius + w / 2;
    const rIn = gIn - FLAT.ringWallIn, rOut = gOut + FLAT.ringWallOut;
    const h = spec.floor + FLAT.grooveDepth;
    const exact = Math.PI * (rOut ** 2 - rIn ** 2) * h - Math.PI * (gOut ** 2 - gIn ** 2) * FLAT.grooveDepth;
    expect(Math.abs(c.signedVolume - exact) / exact).toBeLessThan(0.005);
    expect(c.signedVolume).toBeGreaterThan(0);
    expect(ring.outerRadius).toBeCloseTo(rOut, 9);
    expect(ring.height).toBeCloseTo(h, 9);
  });

  it('can be centred away from the origin', () => {
    const mb = new MeshBuilder();
    buildRingMesh(mb, { ...spec, cx: 100, cy: 30 });
    let sx = 0, sy = 0;
    for (let v = 0; v < mb.positions.length; v += 3) { sx += mb.positions[v]; sy += mb.positions[v + 1]; }
    expect(sx / (mb.positions.length / 3)).toBeCloseTo(100, 3);
    expect(sy / (mb.positions.length / 3)).toBeCloseTo(30, 3);
  });
});
