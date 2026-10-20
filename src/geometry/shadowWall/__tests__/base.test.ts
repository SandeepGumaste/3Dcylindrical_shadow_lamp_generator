import { describe, it, expect } from 'vitest';
import { DEFAULT_SHADOW_WALL_PARAMS, ShadowWallParams, deriveGeometry, surfaceMaps } from '../shadowWall';
import { buildOutline } from '../footprint';
import { MeshBuilder, buildShell } from '../../shellMesh';
import { checkMesh } from '../../meshCheck';
import { BaseSpec, addBase, validateBase } from '../base';

const P = DEFAULT_SHADOW_WALL_PARAMS;
const SPEC: BaseSpec = { thickness: 3, holeDiameter: 12.5, magnets: true, magnetDiameter: 8.1, magnetDepth: 2.1, magnetOffset: 12 };
const SHAPES: [string, ShadowWallParams][] = [
  ['rectangle 80x80 r10', { ...P }],
  ['ellipse 90x70', { ...P, kind: 'ellipse', width: 90, length: 70 }],
];

/** A solid shell (all nodes solid) with an open bottom, plus the base. */
function build(p: ShadowWallParams, spec: BaseSpec) {
  const g = deriveGeometry(p);
  const zs = Float64Array.from([0, 5, 40, p.height]);
  const field = new Float32Array(g.outline.cols * zs.length).fill(1);
  const { inner, outer } = surfaceMaps(g, p);
  const mb = new MeshBuilder();
  const r = buildShell(mb, { cols: g.outline.cols, zs, field, inner, outer }, { skipBottomBorder: true });
  addBase(mb, r.bottomInner, r.bottomOuter, spec);
  const { positions, indices } = mb.toArrays();
  return { g, positions, indices, check: checkMesh(positions, indices) };
}
function area(x: Float64Array, y: Float64Array): number {
  let a = 0;
  for (let i = 0; i < x.length; i++) { const j = (i + 1) % x.length; a += x[i] * y[j] - x[j] * y[i]; }
  return a / 2;
}

describe.each(SHAPES)('addBase %s', (_n, p) => {
  const full = build(p, SPEC);
  it('is watertight with positive volume and no degenerate triangles', () => {
    expect(full.check.errors).toEqual([]);
    expect(full.check.watertight).toBe(true);
    expect(full.check.degenerateTriangles).toBe(0);
    expect(full.check.signedVolume).toBeGreaterThan(0);
  });
  it('keeps z within [-thickness, top]', () => {
    let lo = Infinity, hi = -Infinity;
    for (let v = 2; v < full.positions.length; v += 3) { lo = Math.min(lo, full.positions[v]); hi = Math.max(hi, full.positions[v]); }
    expect(lo).toBeCloseTo(-3, 5);
    expect(hi).toBeGreaterThan(p.height - 1);
  });
  it('plate volume matches area * thickness minus hole and pockets', () => {
    const o = buildOutline(p);
    const A = area(o.px, o.py);
    // reference: the same shell with a closed bottom and no plate (independent of addBase)
    const g = deriveGeometry(p);
    const zs = Float64Array.from([0, 5, 40, p.height]);
    const field = new Float32Array(g.outline.cols * zs.length).fill(1);
    const { inner, outer } = surfaceMaps(g, p);
    const mb = new MeshBuilder();
    buildShell(mb, { cols: g.outline.cols, zs, field, inner, outer }, {});
    const ref = checkMesh(mb.toArrays().positions, mb.toArrays().indices);
    expect(ref.watertight).toBe(true);
    const bare = build(p, { ...SPEC, holeDiameter: 0, magnets: false });
    const noMag = build(p, { ...SPEC, magnets: false });
    expect(Math.abs(bare.check.signedVolume - (ref.signedVolume + A * 3))).toBeLessThan(0.01 * A * 3);
    const holeVol = Math.PI * 6.25 ** 2 * 3;
    expect(Math.abs(bare.check.signedVolume - noMag.check.signedVolume - holeVol)).toBeLessThan(0.01 * holeVol);
    const pocketVol = 2 * Math.PI * 4.05 ** 2 * 2.1;
    expect(Math.abs(noMag.check.signedVolume - full.check.signedVolume - pocketVol)).toBeLessThan(0.01 * pocketVol);
  });
  it('has no pocket vertices when magnets are off', () => {
    const off = build(p, { ...SPEC, magnets: false });
    const near = (m: typeof off) => {
      let n = 0;
      for (let v = 0; v < m.positions.length; v += 3) if (Math.abs(m.positions[v + 2] - (-3 + 2.1)) < 1e-6) n++;
      return n;
    };
    expect(near(off)).toBe(0);
    expect(near(full)).toBeGreaterThan(0);
  });
  it('puts the hole at the centre and the pockets at (0, +-offset)', () => {
    const pts = (z: number) => {
      const out: [number, number][] = [];
      for (let v = 0; v < full.positions.length; v += 3) if (Math.abs(full.positions[v + 2] - z) < 1e-6) out.push([full.positions[v], full.positions[v + 1]]);
      return out;
    };
    const ceiling = pts(-3 + 2.1).filter(([x, y]) => Math.hypot(x, y) < 20);
    const alongX = p.width > p.length; // longer axis, y on a tie
    const ring = (c: number) => ceiling.filter(([x, y]) => Math.abs(Math.hypot(x - (alongX ? c : 0), y - (alongX ? 0 : c)) - 4.05) < 1e-5);
    expect(ring(12).length).toBeGreaterThanOrEqual(64);
    expect(ring(-12).length).toBeGreaterThanOrEqual(64);
    const holeRing = pts(0).filter(([x, y]) => Math.abs(Math.hypot(x, y) - 6.25) < 1e-5);
    expect(holeRing.length).toBeGreaterThanOrEqual(64);
  });
});

describe('validateBase', () => {
  const o = buildOutline(P);
  it('accepts the defaults on 80x80 r10', () => expect(validateBase(SPEC, o)).toEqual([]));
  it('rejects a thickness out of range', () => {
    expect(validateBase({ ...SPEC, thickness: 0.2 }, o).join(' ')).toMatch(/thickness/i);
    expect(validateBase({ ...SPEC, thickness: 11 }, o).join(' ')).toMatch(/thickness/i);
  });
  it('rejects a hole that is too small or too big', () => {
    expect(validateBase({ ...SPEC, holeDiameter: 3 }, o).join(' ')).toMatch(/Centre Hole Diameter/);
    expect(validateBase({ ...SPEC, holeDiameter: 80 }, o).join(' ')).toMatch(/hole/i);
  });
  it('rejects pockets outside the inner outline, overlapping the hole or each other, or too deep', () => {
    expect(validateBase({ ...SPEC, magnetOffset: 36 }, o).join(' ')).toMatch(/inside the wall/i);
    expect(validateBase({ ...SPEC, magnetOffset: 9 }, o).join(' ')).toMatch(/centre hole/i);
    expect(validateBase({ ...SPEC, holeDiameter: 4, magnetOffset: 2.9, magnetDiameter: 5 }, o).join(' ')).toMatch(/each other/i);
    expect(validateBase({ ...SPEC, magnetDepth: 2.8 }, o).join(' ')).toMatch(/deep/i);
  });
  it('ignores pocket rules when magnets are off', () => {
    expect(validateBase({ ...SPEC, magnets: false, magnetOffset: 36, magnetDepth: 9 }, o)).toEqual([]);
  });
  it('fails clearly on a footprint that is too small', () => {
    const small = buildOutline({ ...P, width: 24, length: 24, cornerRadius: 4 });
    expect(validateBase(SPEC, small).length).toBeGreaterThan(0);
  });
});
