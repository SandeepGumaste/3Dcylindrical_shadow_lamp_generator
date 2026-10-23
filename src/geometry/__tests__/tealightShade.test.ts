import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEALIGHT_PARAMS, TealightParams, deriveGeometry, tableRadiusAt, wallHeightForTableRadius,
  zMaxFormula, tableToPixel, pixelToTable, labelComponents, generateTealightShade, compareShadow,
  validateTealightParams, buildTealightField, suggestRibs, ribBump, generateTealightMapSvg,
} from '../tealightShade';
import { TEALIGHT_SAMPLES, asymmetricTestImage } from '../../image/tealightSamples';

const P = (o: Partial<TealightParams> = {}): TealightParams => ({ ...DEFAULT_TEALIGHT_PARAMS, ...o });

describe('tealight formulas', () => {
  it('r(z) = R(z) hf / (hf - z)', () => {
    const g = deriveGeometry(P());
    // z = 0 lands at the wall radius itself; hf = 25, Rb = 30, k = -10/70
    expect(tableRadiusAt(g, 0)).toBeCloseTo(30, 9);
    const z = 10;
    expect(tableRadiusAt(g, z)).toBeCloseTo(((30 + g.k * z) * 25) / 15, 9);
  });

  it('z_max formula puts r(z_max) exactly at the shadow radius', () => {
    const p = P();
    const Rb = p.innerDiameter / 2;
    const k = (p.topDiameter / 2 - Rb) / p.height;
    const zm = zMaxFormula(Rb, k, p.flameHeight, p.shadowRadius);
    expect(zm).toBeCloseTo((25 * (150 - 30)) / (150 + k * 25), 9);
    expect(tableRadiusAt({ Rb, k, hf: 25 }, zm)).toBeCloseTo(150, 6);
  });

  it('clamps z_max below hf - 1 mm', () => {
    const g = deriveGeometry(P({ shadowRadius: 5000 }));
    expect(g.zmax).toBeLessThanOrEqual(g.hf - 1 + 1e-9);
  });

  it('inverse then forward mapping round-trips within half a pixel', () => {
    const img = asymmetricTestImage(400);
    const p = P();
    const g = deriveGeometry(p);
    const rMin = tableRadiusAt(g, g.baseBand), rMax = tableRadiusAt(g, g.zmax);
    let worst = 0, n = 0;
    for (let py = 3; py < 400; py += 17) {
      for (let px = 5; px < 400; px += 13) {
        const [x, y] = pixelToTable(img, p.shadowRadius, px, py);
        const r = Math.hypot(x, y);
        if (r < rMin || r > rMax) continue;
        const th = Math.atan2(y, x);
        const z = wallHeightForTableRadius(g, r);          // inverse: table -> wall
        const r2 = tableRadiusAt(g, z);                     // forward: wall -> table
        const [qx, qy] = tableToPixel(img, p.shadowRadius, r2 * Math.cos(th), r2 * Math.sin(th));
        worst = Math.max(worst, Math.hypot(qx - px, qy - py)); n++;
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(worst).toBeLessThan(0.5);
  });
});

describe('tealight table shadow', () => {
  const flipH = (m: Uint8Array, n: number) => Uint8Array.from(m, (_, i) => m[Math.floor(i / n) * n + (n - 1 - (i % n))]);
  const flipV = (m: Uint8Array, n: number) => Uint8Array.from(m, (_, i) => m[(n - 1 - Math.floor(i / n)) * n + (i % n)]);
  const iou = (a: Uint8Array, b: Uint8Array, valid: Uint8Array) => {
    let i = 0, u = 0;
    for (let k = 0; k < a.length; k++) { if (!valid[k]) continue; if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; }
    return u ? i / u : 1;
  };

  it('is not mirrored (asymmetric image)', () => {
    const img = asymmetricTestImage(512);
    const p = P({ vents: 0, ribs: 0 });
    const res = generateTealightShade(img, p);
    const cmp = compareShadow(img, p, res, 256);
    expect(cmp.iou).toBeGreaterThan(0.9);
    expect(iou(cmp.projected, flipH(cmp.target, cmp.size), cmp.valid)).toBeLessThan(0.6);
    expect(iou(cmp.projected, flipV(cmp.target, cmp.size), cmp.valid)).toBeLessThan(0.6);
  });

  for (const s of TEALIGHT_SAMPLES) {
    it(`sample "${s.name}" matches its thresholded image (IoU >= 0.9) and is watertight`, () => {
      const p = P(s.params);
      const img = s.make(512);
      const res = generateTealightShade(img, p);
      const cmp = compareShadow(img, p, res, 256);
      expect(cmp.iou).toBeGreaterThanOrEqual(0.9);
      expect(res.report.check.errors).toEqual([]);
      expect(res.report.check.watertight).toBe(true);
      expect(res.triangleCount).toBeLessThan(1_000_000);
    });
  }
});

describe('islands and printability', () => {
  it('finds the middle of an "O"', () => {
    const W = 40, Hh = 20;
    const m = new Uint8Array(W * Hh).fill(0);
    // solid everywhere except a hole ring; the centre stays solid inside the ring
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) m[i + W * j] = 1;
    for (let j = 5; j <= 14; j++) for (let i = 10; i <= 29; i++) {
      const d = Math.hypot((i - 19.5) / 10, (j - 9.5) / 5);
      if (d > 0.45 && d < 0.9) m[i + W * j] = 0;
    }
    const { labels, count } = labelComponents(m, W, Hh, 1);
    expect(count).toBe(2); // outer material and the centre of the O
    const centre = labels[20 + W * 10];
    const outer = labels[0];
    expect(centre).not.toBe(outer);
  });

  it('reports an island for an O shape and bridges it when asked', () => {
    // black ring (hole) with a solid centre, far from the ribs
    const n = 512;
    const pixels = new Float32Array(n * n).fill(1);
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const x = ((px + 0.5) / n - 0.5) * 2, y = -((py + 0.5) / n - 0.5) * 2;
      const r = Math.hypot(x - 0.0, y - 0.62); // ring centred on the +y axis at r = 0.62
      if (r > 0.12 && r < 0.2) pixels[py * n + px] = 0;
    }
    const img = { width: n, height: n, pixels };
    const off = buildTealightField(img, P({ ribs: 0, vents: 0, autoBridge: false }));
    expect(off.report.islandsFound).toBe(1);
    const on = buildTealightField(img, P({ ribs: 0, vents: 0, autoBridge: true }));
    expect(on.report.islandsFound).toBe(1);
    expect(on.report.islandsBridged).toBe(1);
    expect(on.report.islandsRemaining).toBe(0);
    const res = generateTealightShade(img, P({ ribs: 0, vents: 0, autoBridge: true }));
    expect(res.report.check.watertight).toBe(true);
  });
});

describe('validation', () => {
  it('rejects bad inputs with inline messages', () => {
    expect(validateTealightParams(P({ innerDiameter: 40 })).join(' ')).toMatch(/Inner Diameter/);
    expect(validateTealightParams(P({ flameHeight: 80 })).join(' ')).toMatch(/Flame Height/);
    expect(validateTealightParams(P({ shadowRadius: 20 })).join(' ')).toMatch(/Shadow Radius/);
    expect(validateTealightParams(P())).toEqual([]);
  });
});

describe('LED socket + vents + ribs', () => {
  it('produces a watertight shade in LED mode', () => {
    const img = TEALIGHT_SAMPLES[0].make(512);
    const p = P({ useLed: true, vents: 0 });
    const res = generateTealightShade(img, p);
    expect(res.report.check.errors).toEqual([]);
    expect(res.report.check.signedVolume).toBeGreaterThan(0);
  });
  it('LED socket lip is a 45 degree chamfer: nothing above the rim faces down flatter than that', () => {
    const p = P({ useLed: true, vents: 0 });
    const res = generateTealightShade(TEALIGHT_SAMPLES[0].make(512), p);
    const { positions: v, indices: ix } = res;
    let worst = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      if (Math.min(v[a + 2], v[b + 2], v[c + 2]) < p.height - 1e-6) continue;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-12) worst = Math.min(worst, nz / len);
    }
    expect(worst).toBeGreaterThan(-0.72);   // cos(45 deg) = 0.707; a flat underside would be -1
  });
  it('rests on z = 0 and fits a 1M triangle budget at 360 cols', () => {
    const res = generateTealightShade(TEALIGHT_SAMPLES[0].make(512), P());
    let minZ = Infinity;
    for (let i = 2; i < res.positions.length; i += 3) minZ = Math.min(minZ, res.positions[i]);
    expect(minZ).toBeCloseTo(0, 6);
    expect(res.triangleCount).toBeLessThan(1_000_000);
  });
});

describe('triangular ribs', () => {
  it('is a 2 mm base triangle (equilateral), centred on each rib', () => {
    const p = P({ ribs: 6, ribWidth: 2 });
    const g = deriveGeometry(p);
    const z = g.baseBand + 1, r = 30;
    expect(ribBump(g, p, 0, z, r)).toBeCloseTo(Math.sqrt(3), 6);                 // apex
    expect(ribBump(g, p, 0.5 / r, z, r)).toBeCloseTo(Math.sqrt(3) / 2, 6);      // half way up the flank
    expect(ribBump(g, p, 1 / r, z, r)).toBeCloseTo(0, 6);                        // base edge at 1 mm
    expect(ribBump(g, p, Math.PI / 6, z, r)).toBe(0);                            // between ribs
    expect(ribBump(g, p, 0, g.H, r)).toBe(0);                                    // faded out at the rim
  });
  it('stays watertight with ribs on', () => {
    const res = generateTealightShade(TEALIGHT_SAMPLES[0].make(512), P({ ribs: 6 }));
    expect(res.report.check.watertight).toBe(true);
  });
});

describe('closed bottom', () => {
  const img = () => TEALIGHT_SAMPLES[0].make(512);
  it('adds a watertight floor (0.4 mm default, adjustable) and rests on z = 0', () => {
    const open = generateTealightShade(img(), P({ closeBottom: false }));
    const closed = generateTealightShade(img(), P({ closeBottom: true }));
    expect(closed.report.check.watertight).toBe(true);
    expect(closed.report.check.errors).toEqual([]);
    let minZ = Infinity, maxZ = -Infinity, openMax = -Infinity;
    for (let i = 2; i < closed.positions.length; i += 3) { minZ = Math.min(minZ, closed.positions[i]); maxZ = Math.max(maxZ, closed.positions[i]); }
    for (let i = 2; i < open.positions.length; i += 3) openMax = Math.max(openMax, open.positions[i]);
    expect(minZ).toBeCloseTo(0, 6);
    expect(maxZ - openMax).toBeCloseTo(0.4, 5);
    const thick = generateTealightShade(img(), P({ floorThickness: 1.4 }));
    let thickMax = -Infinity;
    for (let i = 2; i < thick.positions.length; i += 3) thickMax = Math.max(thickMax, thick.positions[i]);
    expect(thickMax - openMax).toBeCloseTo(1.4, 5);
  });
  it('rejects vents with a closed bottom', () => {
    expect(validateTealightParams(P({ closeBottom: true, vents: 4 })).join(' ')).toMatch(/vents/i);
  });
});

describe('image size', () => {
  it('scales the image inside the shadow disk', () => {
    const img = asymmetricTestImage(512);
    const full = P({ vents: 0, ribs: 0, closeBottom: false });
    const half = { ...full, imageScale: 50 };
    const a = compareShadow(img, full, generateTealightShade(img, full), 256);
    const b = compareShadow(img, half, generateTealightShade(img, half), 256);
    let ta = 0, tb = 0;
    for (let k = 0; k < a.target.length; k++) { ta += a.target[k]; tb += b.target[k]; }
    expect(tb / ta).toBeGreaterThan(0.2);
    expect(tb / ta).toBeLessThan(0.3); // about (50 %)^2 of the black area
    expect(validateTealightParams(P({ imageScale: 5 })).join(' ')).toMatch(/Image Size/);
  });
});

describe('image offset', () => {
  it('shifts the target on the table', () => {
    const img = asymmetricTestImage(512);
    const base = P({ vents: 0, ribs: 0, closeBottom: false });
    const moved = { ...base, imageOffsetX: 40 };
    const a = compareShadow(img, base, generateTealightShade(img, base), 256);
    const b = compareShadow(img, moved, generateTealightShade(img, moved), 256);
    const cx = (t: Uint8Array, n: number) => { let s = 0, c = 0; for (let k = 0; k < t.length; k++) if (t[k]) { s += k % n; c++; } return s / c; };
    const pxPerMm = a.size / (2 * base.shadowRadius);
    expect(cx(b.target, b.size) - cx(a.target, a.size)).toBeGreaterThan(30 * pxPerMm);
  });
});

describe('unwrapped map svg', () => {
  it('is a mm-sized svg with one closed path per hole shape (not a pile of rectangles)', () => {
    const p = P();
    const res = generateTealightShade(TEALIGHT_SAMPLES[0].make(512), p);
    const svg = generateTealightMapSvg(res, p);
    expect(svg).toMatch(/<svg[^>]+width="[\d.]+mm" height="70mm"/);
    const paths = svg.match(/<path [^>]*d="[^"]+"/g) ?? [];
    expect(paths.length).toBeGreaterThan(5);
    expect(svg.match(/<rect /g) ?? []).toHaveLength(1);                       // only the black wall background
    for (const d of paths) {
      const subpaths = d.match(/M/g)!.length;
      expect(d.match(/Z/g)!.length).toBe(subpaths);                             // every loop is closed
      expect(d).not.toMatch(/[HVL]/);                                           // smooth curves, no per-cell strokes
    }
    expect(svg).toContain('fill-rule="evenodd"');
  });
  it('has far fewer segments than one rectangle per run of cells', () => {
    const p = P();
    const res = generateTealightShade(TEALIGHT_SAMPLES[0].make(512), p);
    const svg = generateTealightMapSvg(res, p);
    const segments = (svg.match(/C/g) ?? []).length;
    let runs = 0;
    const g = res.geometry, C = g.cols;
    for (let j = g.bandStart; j < g.bandEnd; j++) {
      let inRun = false;
      for (let i = 0; i < C; i++) {
        const i1 = (i + 1) % C;
        const hole = res.field[i + C * j] + res.field[i1 + C * j] + res.field[i + C * (j + 1)] + res.field[i1 + C * (j + 1)] <= 0;
        if (hole && !inRun) runs++;
        inRun = hole;
      }
    }
    expect(segments).toBeLessThan(runs * 2);
  });
});

describe('rib optimizer', () => {
  // one wide open band around the whole shade (a ring-shaped hole)
  const n = 256;
  const pixels = new Float32Array(n * n).fill(1);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const r = Math.hypot(((px + 0.5) / n - 0.5) * 2, ((py + 0.5) / n - 0.5) * 2);
    if (r > 0.45 && r < 0.6) pixels[py * n + px] = 0;
  }
  const ring = { width: n, height: n, pixels };

  it('places ribs only where needed and fewer when more bridging is allowed', () => {
    const tight = suggestRibs(ring, P({ maxBridge: 6 }));
    const loose = suggestRibs(ring, P({ maxBridge: 20 }));
    expect(tight.spanWithoutRibs).toBeGreaterThan(20);
    expect(tight.achievable).toBe(true);
    expect(tight.worstSpan).toBe(0);
    expect(tight.angles).toHaveLength(tight.ribs);
    expect(loose.achievable).toBe(true);
    expect(loose.ribs).toBeLessThan(tight.ribs);
  });

  it('always suggests an even number of evenly spaced ribs', () => {
    for (const maxBridge of [4, 6, 12, 20]) {
      const r = suggestRibs(ring, P({ maxBridge }));
      expect(r.ribs % 2).toBe(0);
      expect(r.angles).toHaveLength(r.ribs);
      const gap = (2 * Math.PI) / r.ribs;
      for (let k = 1; k < r.angles.length; k++) expect(r.angles[k] - r.angles[k - 1]).toBeCloseTo(gap, 6);
    }
  });

  it('suggests no ribs for an image with no wide flat-roofed holes', () => {
    const blank = { width: 64, height: 64, pixels: new Float32Array(64 * 64).fill(1) };
    const r = suggestRibs(blank, P());
    expect(r.ribs).toBe(0);
    expect(r.achievable).toBe(true);
  });

  it('treats both invert settings the same: a flat-roofed band needs ribs either way', () => {
    for (const invert of [false, true]) {
      const r = suggestRibs(ring, P({ maxBridge: 6, invert }));
      expect(r.spanWithoutRibs).toBeGreaterThan(6);
      expect(r.ribs).toBeGreaterThan(0);
      expect(r.achievable).toBe(true);
    }
  });

  it('is not achievable when the limit is tiny', () => {
    const r = suggestRibs(ring, P({ maxBridge: 0.5 }));
    expect(r.achievable).toBe(false);
    expect(r.ribs).toBe(48);
  });

  it('meshes with explicit rib angles and stays watertight', () => {
    const r = suggestRibs(ring, P({ maxBridge: 12 }));
    const res = generateTealightShade(ring, P({ ribs: r.ribs, ribAngles: r.angles }));
    expect(res.report.check.watertight).toBe(true);
  });
});

describe('open bands above and below the pattern', () => {
  const img = () => TEALIGHT_SAMPLES[0].make(512);
  const holeRows = (g: ReturnType<typeof deriveGeometry>, lo: number, hi: number) =>
    Array.from({ length: g.zs.length }, (_, j) => j).filter((j) => g.zs[j] >= lo - 1e-9 && g.zs[j] <= hi + 1e-9);
  it('default to no extra openings', () => {
    expect(DEFAULT_TEALIGHT_PARAMS.patternGapTop).toBe(0);
    expect(DEFAULT_TEALIGHT_PARAMS.patternGapBottom).toBe(0);
    const g = deriveGeometry(P());
    expect(g.zs.length - 1 - g.bandEnd).toBe(1);                       // only the rim node above the pattern
  });
  it('a top gap adds an open band of that height above the pattern, below a solid rim', () => {
    const base = deriveGeometry(P());
    const g = deriveGeometry(P({ patternGapTop: 6 }));
    expect(g.zmax).toBeCloseTo(base.zmax, 6);                          // the pattern itself does not move
    const { field } = buildTealightField(img(), P({ patternGapTop: 6, ribs: 0, autoRibs: false }));
    const rows = holeRows(g, g.zmax + 1e-6, g.zmax + 6).filter((j) => j > g.bandEnd);
    expect(rows.length).toBeGreaterThan(5);
    for (const j of rows) for (let i = 0; i < g.cols; i++) expect(field[i + g.cols * j]).toBeLessThanOrEqual(0);
    for (let i = 0; i < g.cols; i++) expect(field[i + g.cols * (g.zs.length - 1)]).toBeGreaterThan(0);   // top rim solid
  });
  it('a top gap leaves no hair-thin solid ring along the top of the pattern', () => {
    const p = P({ patternGapTop: 6, ribs: 0, autoRibs: false });
    const g = deriveGeometry(p);
    const { field } = buildTealightField(img(), p);
    let solid = 0;
    for (let i = 0; i < g.cols; i++) if (field[i + g.cols * g.bandEnd] > 0) solid++;
    expect(solid).toBeLessThan(g.cols);
  });
  it('a bottom gap raises the pattern and opens a band of that height above the foot', () => {
    const base = deriveGeometry(P());
    const g = deriveGeometry(P({ patternGapBottom: 5 }));
    expect(g.baseBand).toBeCloseTo(base.baseBand + 5, 6);
    const { field } = buildTealightField(img(), P({ patternGapBottom: 5, ribs: 0, autoRibs: false }));
    const rows = holeRows(g, base.baseBand, g.baseBand).filter((j) => g.zs[j] < g.baseBand - 1e-9);
    expect(rows.length).toBeGreaterThan(5);
    for (const j of rows) for (let i = 0; i < g.cols; i++) expect(field[i + g.cols * j]).toBeLessThanOrEqual(0);
    for (let i = 0; i < g.cols; i++) expect(field[i]).toBeGreaterThan(0);                              // foot stays solid
  });
  it('keeps the rib strips solid through the open bands so nothing floats', () => {
    const p = P({ patternGapTop: 6, patternGapBottom: 5, ribs: 6, autoRibs: false });
    const { geometry: g, field } = buildTealightField(img(), p);
    for (let j = 0; j < g.zs.length; j++) expect(field[0 + g.cols * j]).toBeGreaterThan(0);          // column at angle 0 is a rib centre
  });
  it('builds a watertight shade with no loose pieces when ribs bridge the openings', () => {
    const p = P({ patternGapTop: 6, patternGapBottom: 5, ribs: 24, autoRibs: false });
    const res = generateTealightShade(img(), p);
    expect(res.report.check.watertight).toBe(true);
    expect(res.report.islandsRemaining).toBe(0);
  });
  it('auto ribs account for the openings', () => {
    const p = P({ patternGapTop: 6 });
    const s = suggestRibs(img(), p);
    expect(s.ribs).toBeGreaterThanOrEqual(8);   // a full-width flat-roofed opening needs many bridges
  });
  it('validates the gaps', () => {
    expect(validateTealightParams(P({ patternGapTop: -1 }))).not.toEqual([]);
    expect(validateTealightParams(P({ patternGapBottom: -1 }))).not.toEqual([]);
    expect(validateTealightParams(P({ patternGapTop: 6, autoRibs: false, ribs: 2 }))).not.toEqual([]);
    expect(validateTealightParams(P({ patternGapTop: 6, autoRibs: false, ribs: 12 }))).toEqual([]);
  });
});
