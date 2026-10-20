/**
 * Shadow wall footprint: the closed outline (rounded rectangle or ellipse) the wall follows, sampled
 * uniformly in arc length. Pure functions only (no DOM / three.js) so this can run in a worker.
 *
 * Coordinates: centred on (0, 0), x right, y up. Sample 0 is at angle 0 (+x axis) and samples run
 * counter-clockwise seen from above.
 */
export type FootprintKind = 'rectangle' | 'ellipse';

export interface FootprintParams {
  kind: FootprintKind;
  width: number;          // mm, along x
  length: number;         // mm, along y
  cornerRadius: number;   // mm, rectangle only (clamped to half the shorter side)
  wallThickness: number;  // mm
  cellSize?: number;      // mm, target sample spacing (default 0.4, one nozzle width)
}

export interface Outline {
  cols: number;                          // samples around the perimeter, uniform in arc length (60..2400)
  perimeter: number;                     // mm
  px: Float64Array; py: Float64Array;    // outer points
  nx: Float64Array; ny: Float64Array;    // unit outward normals
  qx: Float64Array; qy: Float64Array;    // inner points = p - wallThickness * n
  dOut: Float64Array; dIn: Float64Array; // distances of p and q from the centre (0, 0)
}

const MIN_COLS = 60;
const MAX_COLS = 2400;
const DEFAULT_CELL = 0.4;

type PointAt = (s: number) => [number, number, number, number]; // x, y, nx, ny

/** Rounded rectangle as straight edges and quarter arcs, starting at the middle of the right edge. */
function rectangle(p: FootprintParams): { perimeter: number; at: PointAt } {
  const hw = p.width / 2, hl = p.length / 2;
  const r = Math.max(0, Math.min(p.cornerRadius, hw, hl));
  type Seg = { len: number; at: (u: number) => [number, number, number, number] };
  const line = (x0: number, y0: number, dx: number, dy: number, len: number): Seg => ({
    len,
    at: (u) => [x0 + dx * u, y0 + dy * u, dy, -dx], // outward normal is the right-hand side of the direction
  });
  const arc = (cx: number, cy: number, a0: number): Seg => ({
    len: (Math.PI / 2) * r,
    at: (u) => {
      const a = a0 + (r > 0 ? u / r : 0);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)];
    },
  });
  const segs: Seg[] = [
    line(hw, 0, 0, 1, hl - r),
    arc(hw - r, hl - r, 0),
    line(hw - r, hl, -1, 0, p.width - 2 * r),
    arc(-hw + r, hl - r, Math.PI / 2),
    line(-hw, hl - r, 0, -1, p.length - 2 * r),
    arc(-hw + r, -hl + r, Math.PI),
    line(-hw + r, -hl, 1, 0, p.width - 2 * r),
    arc(hw - r, -hl + r, (3 * Math.PI) / 2),
    line(hw, -hl + r, 0, 1, hl - r),
  ];
  const perimeter = segs.reduce((a, s) => a + s.len, 0);
  return {
    perimeter,
    at: (s) => {
      let rest = s;
      for (let k = 0; k < segs.length; k++) {
        if (rest <= segs[k].len || k === segs.length - 1) return segs[k].at(Math.min(Math.max(rest, 0), segs[k].len));
        rest -= segs[k].len;
      }
      return segs[0].at(0);
    },
  };
}

/** Ellipse parametrised by arc length through a fine numeric table of cumulative length over t. */
function ellipse(p: FootprintParams): { perimeter: number; at: PointAt } {
  const a = p.width / 2, b = p.length / 2;
  const N = 20000;
  const cum = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    const t = ((i - 0.5) / N) * 2 * Math.PI;
    cum[i] = cum[i - 1] + Math.hypot(a * Math.sin(t), b * Math.cos(t)) * ((2 * Math.PI) / N);
  }
  const perimeter = cum[N];
  return {
    perimeter,
    at: (s) => {
      const target = Math.min(Math.max(s, 0), perimeter);
      let lo = 0, hi = N;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid; }
      const f = cum[hi] > cum[lo] ? (target - cum[lo]) / (cum[hi] - cum[lo]) : 0;
      const t = ((lo + f) / N) * 2 * Math.PI;
      const c = Math.cos(t), sn = Math.sin(t);
      const gx = c / a, gy = sn / b, gl = Math.hypot(gx, gy);
      return [a * c, b * sn, gx / gl, gy / gl];
    },
  };
}

export function buildOutline(p: FootprintParams): Outline {
  const shape = p.kind === 'ellipse' ? ellipse(p) : rectangle(p);
  const perimeter = shape.perimeter;
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(perimeter / (p.cellSize ?? DEFAULT_CELL))));
  const px = new Float64Array(cols), py = new Float64Array(cols);
  const nx = new Float64Array(cols), ny = new Float64Array(cols);
  const qx = new Float64Array(cols), qy = new Float64Array(cols);
  const dOut = new Float64Array(cols), dIn = new Float64Array(cols);
  for (let i = 0; i < cols; i++) {
    const [x, y, ux, uy] = shape.at((i * perimeter) / cols);
    px[i] = x; py[i] = y; nx[i] = ux; ny[i] = uy;
    qx[i] = x - p.wallThickness * ux;
    qy[i] = y - p.wallThickness * uy;
    dOut[i] = Math.hypot(x, y);
    dIn[i] = Math.hypot(qx[i], qy[i]);
  }
  return { cols, perimeter, px, py, nx, ny, qx, qy, dOut, dIn };
}
