/**
 * Contours of a scalar field as smooth closed shapes. Used for the unwrapped SVG map so CAD imports
 * each hole as one smooth path instead of hundreds of pieces. The contour is found by marching
 * squares on the node grid (the same field and linear interpolation the 3D mesh is built from), so
 * the drawn edge matches the printed one to sub-cell accuracy rather than following cell stairs.
 */
export type Pt = [number, number];
export interface Shape { outer: Pt[]; holes: Pt[][]; }

/**
 * Shapes where `values` (cols x rows nodes, row-major) is <= 0. Node coordinates are xs[i], ys[j].
 * Anything running off the grid is closed along the grid border. Nodes meeting only at a saddle
 * stay separate shapes.
 */
export function contourShapes(
  values: ArrayLike<number>, cols: number, rows: number,
  xs: ArrayLike<number>, ys: ArrayLike<number>,
): Shape[] {
  const OUT = 1; // padding is solid, at the same position as the border node, so shapes close on the border
  const val = (i: number, j: number) => (i < 0 || j < 0 || i >= cols || j >= rows ? OUT : values[i + cols * j]);
  const px = (i: number) => xs[Math.min(cols - 1, Math.max(0, i))];
  const py = (j: number) => ys[Math.min(rows - 1, Math.max(0, j))];
  const inside = (i: number, j: number) => val(i, j) <= 0;
  const stride = cols + 2;
  const vOffset = stride * (rows + 2);
  const hKey = (i: number, j: number) => (j + 1) * stride + (i + 1);          // edge (i,j)-(i+1,j)
  const vKey = (i: number, j: number) => vOffset + (j + 1) * stride + (i + 1); // edge (i,j)-(i,j+1)

  const point = new Map<number, Pt>();
  const crossing = (key: number, i0: number, j0: number, i1: number, j1: number): number => {
    if (!point.has(key)) {
      const f0 = val(i0, j0), f1 = val(i1, j1);
      const t = f0 === f1 ? 0.5 : Math.min(1, Math.max(0, f0 / (f0 - f1)));
      point.set(key, [px(i0) + t * (px(i1) - px(i0)), py(j0) + t * (py(j1) - py(j0))]);
    }
    return key;
  };

  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };

  for (let cj = -1; cj < rows; cj++) {
    for (let ci = -1; ci < cols; ci++) {
      const a = inside(ci, cj), b = inside(ci + 1, cj), c = inside(ci + 1, cj + 1), d = inside(ci, cj + 1);
      if (a === b && b === c && c === d) continue;
      const top = a !== b ? crossing(hKey(ci, cj), ci, cj, ci + 1, cj) : -1;
      const right = b !== c ? crossing(vKey(ci + 1, cj), ci + 1, cj, ci + 1, cj + 1) : -1;
      const bottom = d !== c ? crossing(hKey(ci, cj + 1), ci, cj + 1, ci + 1, cj + 1) : -1;
      const left = a !== d ? crossing(vKey(ci, cj), ci, cj, ci, cj + 1) : -1;
      const keys = [top, right, bottom, left].filter((k) => k >= 0);
      if (keys.length === 2) link(keys[0], keys[1]);
      else if (keys.length === 4) {
        // saddle: keep the inside corners apart
        if (a && c) { link(left, top); link(right, bottom); } else { link(top, right); link(bottom, left); }
      }
    }
  }

  const loops: Pt[][] = [];
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const pts: Pt[] = [];
    let prev = -1, cur = start;
    for (;;) {
      seen.add(cur);
      const p = point.get(cur)!;
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
      const next = adj.get(cur)!.find((n) => n !== prev && (!seen.has(n) || n === start)) ?? -1;
      if (next < 0 || next === start) break;
      prev = cur; cur = next;
    }
    while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length >= 3) loops.push(pts);
  }

  // Nest the loops: even depth = outer boundary, odd depth = an island loop of its parent.
  const areas = loops.map((l) => Math.abs(signedArea(l)));
  const probes = loops.map((l) => [(l[0][0] + l[1][0]) / 2, (l[0][1] + l[1][1]) / 2] as Pt);
  const parent = loops.map((_, k) => {
    let best = -1;
    for (let m = 0; m < loops.length; m++) {
      if (m === k || areas[m] <= areas[k]) continue;
      if (containsPoint(probes[k], loops[m]) && (best < 0 || areas[m] < areas[best])) best = m;
    }
    return best;
  });
  const depth = (k: number): number => (parent[k] < 0 ? 0 : 1 + depth(parent[k]));
  const shapes = new Map<number, Shape>();
  loops.forEach((l, k) => { if (depth(k) % 2 === 0) shapes.set(k, { outer: l, holes: [] }); });
  loops.forEach((l, k) => { if (depth(k) % 2 === 1) shapes.get(parent[k])?.holes.push(l); });
  return [...shapes.values()];
}

function signedArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}

function containsPoint(pt: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Douglas-Peucker for a closed polygon; never returns fewer than 3 points. */
export function simplifyClosed(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 3) return pts;
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const half = (from: number, to: number): Pt[] => {
    const seg: Pt[] = [];
    for (let i = from; ; i = (i + 1) % pts.length) { seg.push(pts[i]); if (i === to) break; }
    return rdp(seg, tol);
  };
  const res = [...half(0, far).slice(0, -1), ...half(far, 0).slice(0, -1)];
  return res.length >= 3 ? res : pts;
}

function rdp(seg: Pt[], tol: number): Pt[] {
  if (seg.length < 3) return seg;
  const [a, b] = [seg[0], seg[seg.length - 1]];
  let idx = -1, md = -1;
  for (let i = 1; i < seg.length - 1; i++) {
    const d = distToSegment(seg[i], a, b);
    if (d > md) { md = d; idx = i; }
  }
  if (md <= tol) return [a, b];
  return [...rdp(seg.slice(0, idx + 1), tol).slice(0, -1), ...rdp(seg.slice(idx), tol)];
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const CORNER_COS = Math.cos((50 * Math.PI) / 180); // turns sharper than this stay corners

/**
 * SVG path data for the loops of one shape: each loop is thinned to `tol`, then drawn as cubic
 * curves through its points (smooth), except at sharp turns, which stay corners. Every loop is closed.
 */
export function smoothPath(loops: Pt[][], tol: number, digits = 3): string {
  const f = (n: number) => String(+n.toFixed(digits));
  let d = '';
  for (const loop of loops) {
    const p = simplifyClosed(loop, tol);
    const n = p.length;
    const dir = (a: Pt, b: Pt): Pt => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    // tangent at each point (null = corner)
    const tan: (Pt | null)[] = p.map((q, i) => {
      const prev = p[(i + n - 1) % n], next = p[(i + 1) % n];
      const din = dir(prev, q), dout = dir(q, next);
      if (din[0] * dout[0] + din[1] * dout[1] < CORNER_COS) return null;
      return dir(prev, next);
    });
    d += `M${f(p[0][0])} ${f(p[0][1])}`;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ta = tan[i], tb = tan[(i + 1) % n];
      const da = ta ?? dir(a, b), db = tb ?? dir(a, b);
      const c1: Pt = [a[0] + (da[0] * len) / 3, a[1] + (da[1] * len) / 3];
      const c2: Pt = [b[0] - (db[0] * len) / 3, b[1] - (db[1] * len) / 3];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b[0])} ${f(b[1])}`;
    }
    d += 'Z';
  }
  return d;
}
