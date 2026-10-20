import { describe, it, expect } from 'vitest';
import { buildOutline, FootprintParams } from '../footprint';

const rect: FootprintParams = { kind: 'rectangle', width: 100, length: 60, cornerRadius: 10, wallThickness: 0.8 };
const ell: FootprintParams = { kind: 'ellipse', width: 100, length: 60, cornerRadius: 0, wallThickness: 0.8 };
const shapes = { rect, ell };

const ramanujan = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

describe('buildOutline', () => {
  it('rectangle perimeter matches the analytic value', () => {
    const o = buildOutline(rect);
    const expected = 2 * (100 - 20) + 2 * (60 - 20) + 2 * Math.PI * 10;
    expect(Math.abs(o.perimeter - expected) / expected).toBeLessThan(0.005);
  });

  it('ellipse perimeter matches Ramanujan', () => {
    const o = buildOutline(ell);
    const expected = ramanujan(50, 30);
    expect(Math.abs(o.perimeter - expected) / expected).toBeLessThan(0.005);
  });

  for (const [name, p] of Object.entries(shapes)) {
    describe(name, () => {
      const o = buildOutline(p);
      it('samples are evenly spaced', () => {
        const gaps: number[] = [];
        for (let i = 0; i < o.cols; i++) {
          const j = (i + 1) % o.cols;
          gaps.push(Math.hypot(o.px[j] - o.px[i], o.py[j] - o.py[i]));
        }
        const mean = o.perimeter / o.cols;
        for (const g of gaps) expect(Math.abs(g - mean) / mean).toBeLessThan(0.02);
      });
      it('normals are unit and outward', () => {
        for (let i = 0; i < o.cols; i++) {
          expect(Math.hypot(o.nx[i], o.ny[i])).toBeCloseTo(1, 9);
          expect(o.px[i] * o.nx[i] + o.py[i] * o.ny[i]).toBeGreaterThan(0);
        }
      });
      it('inner points are wallThickness inside', () => {
        for (let i = 0; i < o.cols; i += 7) {
          let d = Infinity;
          for (let j = 0; j < o.cols; j++) d = Math.min(d, Math.hypot(o.qx[i] - o.px[j], o.qy[i] - o.py[j]));
          expect(Math.abs(d - p.wallThickness)).toBeLessThan(0.02);
          expect(o.qx[i]).toBeCloseTo(o.px[i] - p.wallThickness * o.nx[i], 12);
        }
      });
      it('runs counter-clockwise from (width/2, 0)', () => {
        let area = 0;
        for (let i = 0; i < o.cols; i++) {
          const j = (i + 1) % o.cols;
          area += o.px[i] * o.py[j] - o.px[j] * o.py[i];
        }
        expect(area).toBeGreaterThan(0);
        expect(o.px[0]).toBeCloseTo(p.width / 2, 6);
        expect(o.py[0]).toBeCloseTo(0, 6);
      });
      it('dOut and dIn are distances from the centre', () => {
        for (let i = 0; i < o.cols; i += 11) {
          expect(o.dOut[i]).toBeCloseTo(Math.hypot(o.px[i], o.py[i]), 9);
          expect(o.dIn[i]).toBeCloseTo(Math.hypot(o.qx[i], o.qy[i]), 9);
        }
      });
    });
  }

  it('rectangle inner points sit exactly t inside the rounded box', () => {
    const o = buildOutline(rect);
    for (let i = 0; i < o.cols; i++) {
      const dx = Math.abs(o.qx[i]) - (50 - 10), dy = Math.abs(o.qy[i]) - (30 - 10);
      const sdf = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - 10;
      expect(-sdf).toBeCloseTo(0.8, 9);
    }
  });

  it('clamps cols', () => {
    expect(buildOutline({ ...rect, width: 5, length: 5, cornerRadius: 1 }).cols).toBe(60);
    expect(buildOutline({ ...rect, width: 2000, length: 2000 }).cols).toBe(2400);
    const o = buildOutline({ ...rect, cellSize: 1 });
    expect(o.cols).toBe(Math.round(o.perimeter / 1));
  });

  it('clamps the corner radius', () => {
    const o = buildOutline({ ...rect, cornerRadius: 500 });
    const stadium = 2 * (100 - 60) + 2 * Math.PI * 30;
    expect(Math.abs(o.perimeter - stadium) / stadium).toBeLessThan(0.005);
  });

  it('circle has constant dOut', () => {
    const o = buildOutline({ kind: 'ellipse', width: 80, length: 80, cornerRadius: 0, wallThickness: 1 });
    for (let i = 0; i < o.cols; i++) {
      expect(o.dOut[i]).toBeCloseTo(40, 6);
      expect(o.dIn[i]).toBeCloseTo(39, 6);
    }
  });
});
