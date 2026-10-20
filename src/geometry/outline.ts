/**
 * Turns a grid of "hole" cells into closed outlines: one shape per connected region (an outer
 * boundary plus one loop per island inside it), with staircase edges simplified. Used for the
 * unwrapped SVG map so CAD imports each hole as a single path instead of hundreds of rectangles.
 */
export type Pt = [number, number];
export interface Shape { outer: Pt[]; holes: Pt[][]; }

/** Trace the boundaries of every region in `mask` (cols x rows, row-major) into simplified shapes. */
export function traceShapes(
  mask: Uint8Array, cols: number, rows: number,
  xs: ArrayLike<number>, ys: ArrayLike<number>, tolerance = 0,
): Shape[] {
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && mask[i + cols * j] > 0;
  const W = cols + 1;
  const vid = (x: number, y: number) => y * W + x;
  // Directed edges with the region on the right of travel (y grows downward): clockwise around a cell.
  // dir: 0 = +x, 1 = +y, 2 = -x, 3 = -y.
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  const out = new Map<number, number[]>(); // start vertex -> directions of unused edges
  const addEdge = (x: number, y: number, d: number) => {
    const k = vid(x, y);
    const l = out.get(k);
    if (l) l.push(d); else out.set(k, [d]);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!on(i, j)) continue;
    if (!on(i, j - 1)) addEdge(i, j, 0);
    if (!on(i + 1, j)) addEdge(i + 1, j, 1);
    if (!on(i, j + 1)) addEdge(i + 1, j + 1, 2);
    if (!on(i - 1, j)) addEdge(i, j + 1, 3);
  }

  type Loop = { pts: Pt[]; area: number };
  const loops: Loop[] = [];
  for (const [startKey, dirs0] of [...out.entries()]) {
    while (dirs0.length) {
      const sd = dirs0.pop()!;
      const sx = startKey % W, sy = Math.floor(startKey / W);
      let x = sx, y = sy, d = sd;
      const pts: Pt[] = [];
      for (;;) {
        pts.push([xs[x], ys[y]]);
        x += DX[d]; y += DY[d];
        const l = out.get(vid(x, y)) ?? [];
        const atStart = x === sx && y === sy;
        // right turn first (keeps diagonally touching cells apart), then straight, then left
        const pick = [(d + 1) % 4, d, (d + 3) % 4].find((c) => l.includes(c) || (atStart && c === sd));
        if (pick === undefined) break;
        if (atStart && pick === sd) break; // back where we began
        l.splice(l.indexOf(pick), 1);
        d = pick;
      }
      const corners = dropCollinear(pts);
      if (corners.length >= 3) loops.push({ pts: corners, area: signedArea(corners) });
    }
  }

  // Outer boundaries and island loops have opposite winding; every loop keeps its region on the right.
  const outers = loops.filter((l) => l.area > 0);
  const holeLoops = loops.filter((l) => l.area < 0);
  const shapes = outers.map((o) => ({ loop: o, holes: [] as Pt[][] }));
  for (const h of holeLoops) {
    const probe = rightOfFirstEdge(h.pts);
    let best: (typeof shapes)[number] | undefined;
    for (const s of shapes) {
      if (inside(probe, s.loop.pts) && (!best || s.loop.area < best.loop.area)) best = s;
    }
    best?.holes.push(h.pts);
  }
  return shapes.map((s) => ({
    outer: tolerance > 0 ? simplifyClosed(s.loop.pts, tolerance) : s.loop.pts,
    holes: s.holes.map((h) => (tolerance > 0 ? simplifyClosed(h, tolerance) : h)),
  }));
}

function dropCollinear(pts: Pt[]): Pt[] {
  let cur = pts;
  let changed = true;
  while (changed && cur.length >= 3) {
    changed = false;
    const next: Pt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[(i + cur.length - 1) % cur.length], b = cur[i], c = cur[(i + 1) % cur.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-12) changed = true; else next.push(b);
    }
    cur = next;
  }
  return cur;
}

function signedArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}

function rightOfFirstEdge(p: Pt[]): Pt {
  const [a, b] = [p[0], p[1]];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const eps = 1e-4;
  // right of travel in y-down coordinates is (-dy, dx)
  return [mx - (dy / len) * eps, my + (dx / len) * eps];
}

function inside(pt: Pt, poly: Pt[]): boolean {
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
  // anchor on the point farthest from the first so the cut is not through a long edge
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
  const a = half(0, far), b = half(far, 0);
  const res = [...a.slice(0, -1), ...b.slice(0, -1)];
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
  const left = rdp(seg.slice(0, idx + 1), tol);
  const right = rdp(seg.slice(idx), tol);
  return [...left.slice(0, -1), ...right];
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
