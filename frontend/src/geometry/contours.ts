/**
 * Smooth outlines of the open (perforated) regions of a cylindrical mask.
 *
 * The perforation mask is a binary grid, so the raw outline of any open region is a staircase.
 * Every consumer of the mask (shadow simulation, SVG export, 3D mesh) used to rasterize that
 * staircase, or smooth it only horizontally. This module traces the real outlines once and
 * removes the stair-steps in both directions, so all of them share one smooth geometry.
 *
 * Coordinates are in grid units: x = column (0..gridWidth), y = row (0..gridHeight, upwards).
 * Each loop has the open region on its left (outer boundaries run counter-clockwise, islands of
 * solid material inside an open region run clockwise).
 */

export type Loop = [number, number][];

/** Max distance (in cells, per axis) a vertex may move from its grid position. Keeps one-cell
 * walls between holes from collapsing and loops from touching. */
const MAX_DISPLACEMENT = 0.35;
/** Offset applied to vertices where two open cells touch only at a corner, so the two loops
 * passing through that grid point don't share a vertex. */
const PINCH_OFFSET = 0.15;
/** A short edge (<= this many cells) between corners that turn opposite ways is a stair-step. */
const MAX_STEP_LENGTH = 3;
const SMOOTHING_ITERATIONS = 16;
/** Longest horizontal span (in columns) of any output edge, so edges bend with the cylinder. */
const MAX_EDGE_COLUMNS = 1;

interface RawLoop {
  corners: [number, number][];
  pinched: boolean[]; // vertex is a corner-touch between two open cells
}

function traceLoops(mask: Uint8Array | Float32Array, gridWidth: number, gridHeight: number): RawLoop[] {
  const isOpen = (r: number, c: number) =>
    r >= 0 && r < gridHeight && c >= 0 && c < gridWidth && mask[r * gridWidth + c] > 0.5;
  const vw = gridWidth + 1;
  const vkey = (c: number, r: number) => r * vw + c;

  // Directed boundary edges with the open cell on the left.
  const from: number[] = [];
  const to: number[] = [];
  const outgoing = new Map<number, number[]>();
  const addEdge = (c0: number, r0: number, c1: number, r1: number) => {
    const id = from.length;
    from.push(vkey(c0, r0));
    to.push(vkey(c1, r1));
    const k = vkey(c0, r0);
    const list = outgoing.get(k);
    if (list) list.push(id);
    else outgoing.set(k, [id]);
  };

  for (let r = 0; r < gridHeight; r++) {
    for (let c = 0; c < gridWidth; c++) {
      if (!isOpen(r, c)) continue;
      if (!isOpen(r - 1, c)) addEdge(c, r, c + 1, r);
      if (!isOpen(r, c + 1)) addEdge(c + 1, r, c + 1, r + 1);
      if (!isOpen(r + 1, c)) addEdge(c + 1, r + 1, c, r + 1);
      if (!isOpen(r, c - 1)) addEdge(c, r + 1, c, r);
    }
  }

  const used = new Uint8Array(from.length);
  const loops: RawLoop[] = [];
  const xy = (k: number): [number, number] => [k % vw, Math.floor(k / vw)];

  for (let start = 0; start < from.length; start++) {
    if (used[start]) continue;
    const verts: number[] = [];
    const pinched: boolean[] = [];
    let e = start;
    for (;;) {
      used[e] = 1;
      verts.push(from[e]);
      const next = outgoing.get(to[e])!.filter((id) => !used[id] || id === start);
      let chosen = -1;
      let wasPinch = false;
      if (next.length === 1) {
        chosen = next[0];
      } else {
        // Two open cells meeting at a corner: turn left so they stay separate loops.
        const [x0, y0] = xy(from[e]);
        const [x1, y1] = xy(to[e]);
        const dx = x1 - x0;
        const dy = y1 - y0;
        for (const id of next) {
          const [a, b] = xy(to[id]);
          const [p, q] = xy(from[id]);
          if (dx * (b - q) - dy * (a - p) > 0) chosen = id;
        }
        wasPinch = true;
        if (chosen < 0) chosen = next[0];
      }
      pinched.push(wasPinch);
      if (chosen === start) break;
      e = chosen;
    }
    // pinched[i] describes the vertex AFTER edge i, i.e. verts[i + 1].
    const n = verts.length;
    const corners: [number, number][] = [];
    const flags: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const prev = xy(verts[(i + n - 1) % n]);
      const cur = xy(verts[i]);
      const nxt = xy(verts[(i + 1) % n]);
      const turn = (cur[0] - prev[0]) * (nxt[1] - cur[1]) - (cur[1] - prev[1]) * (nxt[0] - cur[0]);
      if (turn !== 0) {
        corners.push(cur);
        flags.push(pinched[(i + n - 1) % n]);
      }
    }
    loops.push({ corners, pinched: flags });
  }
  return loops;
}

function smoothLoop(raw: RawLoop): [number, number][] {
  const n = raw.corners.length;
  const base = raw.corners.map((p) => [p[0], p[1]] as [number, number]);

  // Pull corner-touching vertices apart, toward the inside of their own loop.
  for (let i = 0; i < n; i++) {
    if (!raw.pinched[i]) continue;
    const prev = raw.corners[(i + n - 1) % n];
    const cur = raw.corners[i];
    const nxt = raw.corners[(i + 1) % n];
    const inX = Math.sign(cur[0] - prev[0]);
    const inY = Math.sign(cur[1] - prev[1]);
    const outX = Math.sign(nxt[0] - cur[0]);
    const outY = Math.sign(nxt[1] - cur[1]);
    base[i] = [cur[0] + (outX - inX) * PINCH_OFFSET, cur[1] + (outY - inY) * PINCH_OFFSET];
  }

  const turnSign = (i: number) => {
    const a = raw.corners[(i + n - 1) % n];
    const b = raw.corners[i];
    const c = raw.corners[(i + 1) % n];
    return Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
  };
  const edgeLength = (i: number, j: number) =>
    Math.abs(raw.corners[i][0] - raw.corners[j][0]) + Math.abs(raw.corners[i][1] - raw.corners[j][1]);

  // Only stair-step corners move: a corner joined by a short edge to a corner that turns the
  // other way. True corners (rectangle ends, one-cell-wide strips) stay put.
  const movable = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const s = turnSign(i);
    for (const j of [(i + n - 1) % n, (i + 1) % n]) {
      if (turnSign(j) !== s && edgeLength(i, j) <= MAX_STEP_LENGTH) movable[i] = true;
    }
  }

  let cur = base.map((p) => [p[0], p[1]] as [number, number]);
  for (let it = 0; it < SMOOTHING_ITERATIONS; it++) {
    const next = cur.map((p) => [p[0], p[1]] as [number, number]);
    for (let i = 0; i < n; i++) {
      if (!movable[i]) continue;
      const a = cur[(i + n - 1) % n];
      const b = cur[(i + 1) % n];
      const tx = cur[i][0] + 0.5 * (0.5 * (a[0] + b[0]) - cur[i][0]);
      const ty = cur[i][1] + 0.5 * (0.5 * (a[1] + b[1]) - cur[i][1]);
      next[i] = [
        Math.min(Math.max(tx, base[i][0] - MAX_DISPLACEMENT), base[i][0] + MAX_DISPLACEMENT),
        Math.min(Math.max(ty, base[i][1] - MAX_DISPLACEMENT), base[i][1] + MAX_DISPLACEMENT),
      ];
    }
    cur = next;
  }
  return cur;
}

function subdivide(points: [number, number][]): Loop {
  const out: Loop = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / MAX_EDGE_COLUMNS - 1e-9));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Traces smooth outlines of every open region of the mask. Output edges are never longer than
 * one column horizontally, so they follow the cylinder's curvature when wrapped around it.
 */
export function extractSmoothLoops(
  mask: Uint8Array | Float32Array,
  gridWidth: number,
  gridHeight: number
): Loop[] {
  return traceLoops(mask, gridWidth, gridHeight).map((raw) => subdivide(smoothLoop(raw)));
}

export function signedArea(loop: Loop): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Even-odd point-in-region test over a set of loops, accelerated with per-row edge buckets. */
export class LoopIndex {
  private readonly strips: Float64Array[];

  constructor(loops: Loop[], gridHeight: number) {
    const buckets: number[][] = Array.from({ length: gridHeight }, () => []);
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const [x0, y0] = loop[i];
        const [x1, y1] = loop[(i + 1) % loop.length];
        if (y0 === y1) continue;
        const lo = Math.max(0, Math.floor(Math.min(y0, y1)));
        const hi = Math.min(gridHeight - 1, Math.floor(Math.max(y0, y1)));
        for (let s = lo; s <= hi; s++) buckets[s].push(x0, y0, x1, y1);
      }
    }
    this.strips = buckets.map((b) => Float64Array.from(b));
  }

  contains(x: number, y: number): boolean {
    const s = Math.floor(y);
    const edges = this.strips[s < 0 ? 0 : s >= this.strips.length ? this.strips.length - 1 : s];
    if (!edges) return false;
    let inside = false;
    for (let i = 0; i < edges.length; i += 4) {
      const y0 = edges[i + 1];
      const y1 = edges[i + 3];
      if (y0 <= y !== y1 <= y) {
        const xi = edges[i] + ((y - y0) / (y1 - y0)) * (edges[i + 2] - edges[i]);
        if (xi > x) inside = !inside;
      }
    }
    return inside;
  }
}

export interface Shape {
  outer: Loop;
  holes: Loop[]; // solid islands inside the open shape
}

/** Groups loops into connected open shapes: an outer boundary plus the islands inside it. */
export function groupShapes(loops: Loop[]): Shape[] {
  const info = loops.map((loop) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of loop) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, area: Math.abs(signedArea(loop)) };
  });

  const contains = (outerIdx: number, innerIdx: number): boolean => {
    const o = info[outerIdx];
    const [px, py] = loops[innerIdx][0];
    if (px < o.minX || px > o.maxX || py < o.minY || py > o.maxY) return false;
    let inside = false;
    const loop = loops[outerIdx];
    for (let i = 0; i < loop.length; i++) {
      const [x0, y0] = loop[i];
      const [x1, y1] = loop[(i + 1) % loop.length];
      if (y0 <= py !== y1 <= py && x0 + ((py - y0) / (y1 - y0)) * (x1 - x0) > px) inside = !inside;
    }
    return inside;
  };

  const parent = loops.map((_, i) => {
    let best = -1;
    for (let j = 0; j < loops.length; j++) {
      if (j === i || info[j].area <= info[i].area) continue;
      if (contains(j, i) && (best < 0 || info[j].area < info[best].area)) best = j;
    }
    return best;
  });
  const depth = (i: number): number => (parent[i] < 0 ? 0 : 1 + depth(parent[i]));

  const shapes = new Map<number, Shape>();
  loops.forEach((loop, i) => {
    if (depth(i) % 2 === 0) shapes.set(i, { outer: loop, holes: [] });
  });
  loops.forEach((loop, i) => {
    if (depth(i) % 2 === 1) shapes.get(parent[i])?.holes.push(loop);
  });
  return [...shapes.values()];
}
