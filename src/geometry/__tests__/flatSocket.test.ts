import { describe, it, expect } from 'vitest';
import { MeshBuilder } from '../shellMesh';
import { checkMesh } from '../meshCheck';
import { socketProfile, buildSocketMesh } from '../flatSocket';
import { DEFAULT_TEALIGHT_PARAMS, deriveGeometry } from '../tealightShade';
import { flatTealightParams, DEFAULT_FLAT_STRIP_PARAMS, FLAT } from '../flatStrip';

const p = flatTealightParams({ ...DEFAULT_TEALIGHT_PARAMS, useLed: true }, DEFAULT_FLAT_STRIP_PARAMS);
const g = deriveGeometry(p);
const spec = { g, p, sheetThickness: 0.4 };

/** Volume of the revolved polygon by Pappus: 2 pi * centroid radius * area. */
const revolvedVolume = (pts: [number, number][]) => {
  let a = 0, cx = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const c = x0 * y1 - x1 * y0;
    a += c / 2; cx += (x0 + x1) * c;
  }
  return 2 * Math.PI * (cx / (6 * a)) * a;
};

describe('socketProfile', () => {
  it('starts at z = 0, opens a groove from the underside and carries the tealight tube', () => {
    const pts = socketProfile(spec);
    expect(Math.min(...pts.map((q) => q[1]))).toBe(0);
    const w = 0.4 + FLAT.grooveClearance;
    const gaps = pts.filter((q) => q[1] === FLAT.grooveDepth).map((q) => q[0]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThanOrEqual(w - 1e-9);
    expect(Math.max(...pts.map((q) => q[1]))).toBeCloseTo(FLAT.grooveDepth + g.lipT + p.bodyHeight, 6);
  });
});

describe('buildSocketMesh', () => {
  it('is watertight, outward facing, with the volume of its profile', () => {
    const mb = new MeshBuilder();
    buildSocketMesh(mb, spec, 360);
    const { positions, indices } = mb.toArrays();
    const c = checkMesh(positions, indices);
    expect(c.watertight).toBe(true);
    const exact = revolvedVolume(socketProfile(spec));
    expect(c.signedVolume).toBeGreaterThan(0);
    expect(Math.abs(c.signedVolume - exact) / exact).toBeLessThan(0.005);
  });
});
