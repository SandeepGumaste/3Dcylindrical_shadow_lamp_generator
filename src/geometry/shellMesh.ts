/**
 * Marching-squares shell mesher.
 *
 * A thin shell is described by a scalar field over an unwrapped (theta, z) grid: material where
 * field > 0. Each cell's solid piece is a convex polygon (corners cut by edge crossings), emitted
 * once on an inner surface and once on an outer surface, with side walls along every contour
 * segment and along any border of the grid that does not wrap. Vertices are shared by grid-edge
 * index (and column `cols` is column 0), so the result is a closed 2-manifold by construction.
 *
 * Saddles (two diagonal solid corners) are resolved as "solid corners joined".
 */

export class MeshBuilder {
  positions: number[] = [];
  indices: number[] = [];

  vertex(x: number, y: number, z: number): number {
    this.positions.push(x, y, z);
    return this.positions.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }
  toArrays(): { positions: Float32Array; indices: Uint32Array } {
    return { positions: new Float32Array(this.positions), indices: new Uint32Array(this.indices) };
  }
}

export type SurfaceMap = (theta: number, z: number) => [number, number, number];

export interface ShellSpec {
  cols: number;
  /** Ascending node heights; rows of cells = zs.length - 1. */
  zs: ArrayLike<number>;
  /** cols * zs.length values, index i + cols * j; solid where > 0. */
  field: ArrayLike<number>;
  inner: SurfaceMap;
  outer: SurfaceMap;
}

export interface ShellOptions {
  /** Leave the top border open (caller closes it with its own faces). Top row must be all solid. */
  skipTopBorder?: boolean;
  /** Leave the bottom border open (caller closes it with its own faces). Bottom row must be all solid. */
  skipBottomBorder?: boolean;
  /**
   * Default true: the grid wraps around (column `cols` is column 0). False: `cols` is the number of node columns of a
   * flat sheet, there are `cols - 1` cell columns, and the left and right borders get end walls. Needs `dTheta`.
   */
  wrap?: boolean;
  /** Angle step handed to the surface maps per column when `wrap` is false (theta = dTheta * column). */
  dTheta?: number;
}

export interface ShellResult {
  /** Vertex indices of the top row's nodes (only filled when skipTopBorder). */
  topInner: Int32Array;
  topOuter: Int32Array;
  /** Vertex indices of the bottom row's nodes (only filled when skipBottomBorder). */
  bottomInner: Int32Array;
  bottomOuter: Int32Array;
}

const CLAMP = 0.01;

export function buildShell(mb: MeshBuilder, spec: ShellSpec, opts: ShellOptions = {}): ShellResult {
  const { cols: C, zs, field: f } = spec;
  const wrap = opts.wrap !== false;
  const cellCols = wrap ? C : C - 1;
  const rows = zs.length - 1; // cell rows
  const N = C * (rows + 1);
  const TWO_PI = Math.PI * 2;

  const wrapI = (i: number) => (wrap && i >= C ? i - C : i);
  const thetaOf = (i: number) => (wrap ? (TWO_PI * i) / C : (opts.dTheta ?? 0) * i);
  const fAt = (i: number, j: number) => f[wrapI(i) + C * j];
  const solidAt = (i: number, j: number) => fAt(i, j) > 0;

  const innerIdx = new Int32Array(3 * N).fill(-1);
  const outerIdx = new Int32Array(3 * N).fill(-1);

  function make(id: number, theta: number, z: number): number {
    if (innerIdx[id] < 0) {
      const a = spec.inner(theta, z);
      const b = spec.outer(theta, z);
      innerIdx[id] = mb.vertex(a[0], a[1], a[2]);
      outerIdx[id] = mb.vertex(b[0], b[1], b[2]);
    }
    return id;
  }
  const node = (i: number, j: number) => make(j * C + wrapI(i), thetaOf(wrapI(i)), zs[j]);

  // Crossing on the horizontal edge (i,j)-(i+1,j).
  function hCross(i: number, j: number): number {
    const fa = fAt(i, j), fb = fAt(i + 1, j);
    const aSolid = fa > 0;
    const tp = clampT(aSolid ? fa / (fa - fb) : fb / (fb - fa));
    const t = aSolid ? tp : 1 - tp;
    return make(N + j * C + i, thetaOf(i + t), zs[j]);
  }
  // Crossing on the vertical edge (i,j)-(i,j+1).
  function vCross(i: number, j: number): number {
    const fa = fAt(i, j), fb = fAt(i, j + 1);
    const aSolid = fa > 0;
    const tp = clampT(aSolid ? fa / (fa - fb) : fb / (fb - fa));
    const t = aSolid ? tp : 1 - tp;
    const ic = wrapI(i);
    return make(2 * N + j * C + ic, thetaOf(ic), zs[j] + t * (zs[j + 1] - zs[j]));
  }
  function clampT(t: number): number {
    return t < CLAMP ? CLAMP : t > 1 - CLAMP ? 1 - CLAMP : t;
  }

  const poly: number[] = [];
  const follow: number[] = []; // 0 = chord, 1 = along a cell side (side tracked separately)
  const sideOf: number[] = [];

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cellCols; i++) {
      const s0 = solidAt(i, j), s1 = solidAt(i + 1, j), s2 = solidAt(i + 1, j + 1), s3 = solidAt(i, j + 1);
      if (!(s0 || s1 || s2 || s3)) continue;
      const s = [s0, s1, s2, s3];
      const corner = [() => node(i, j), () => node(i + 1, j), () => node(i + 1, j + 1), () => node(i, j + 1)];
      const cross = [() => hCross(i, j), () => vCross(i + 1, j), () => hCross(i, j + 1), () => vCross(i, j)];

      poly.length = 0; follow.length = 0; sideOf.length = 0;
      for (let k = 0; k < 4; k++) {
        const nk = (k + 1) & 3;
        if (s[k]) { poly.push(corner[k]()); follow.push(1); sideOf.push(k); }
        if (s[k] !== s[nk]) {
          poly.push(cross[k]());
          // solid -> hole crossing leaves the side and cuts across the cell (chord);
          // hole -> solid crossing continues along the side to the next corner.
          if (s[k]) { follow.push(0); sideOf.push(-1); } else { follow.push(1); sideOf.push(k); }
        }
      }

      // Skins: CCW in (theta,z) faces outward on the outer surface, inward on the inner one.
      for (let m = 1; m + 1 < poly.length; m++) {
        mb.tri(outerIdx[poly[0]], outerIdx[poly[m]], outerIdx[poly[m + 1]]);
        mb.tri(innerIdx[poly[0]], innerIdx[poly[m + 1]], innerIdx[poly[m]]);
      }

      // Free edges: contour chords and non-wrapping grid borders get a wall facing the void.
      for (let m = 0; m < poly.length; m++) {
        let free = follow[m] === 0;
        if (!free) {
          const side = sideOf[m];
          if (side === 0 && j === 0 && !opts.skipBottomBorder) free = true;
          else if (side === 2 && j === rows - 1 && !opts.skipTopBorder) free = true;
          else if (!wrap && ((side === 3 && i === 0) || (side === 1 && i === cellCols - 1))) free = true;
        }
        if (!free) continue;
        const p = poly[m], q = poly[(m + 1) % poly.length];
        mb.quad(innerIdx[p], innerIdx[q], outerIdx[q], outerIdx[p]);
      }
    }
  }

  const topInner = new Int32Array(C).fill(-1);
  const topOuter = new Int32Array(C).fill(-1);
  if (opts.skipTopBorder) {
    for (let i = 0; i < C; i++) {
      const id = rows * C + i;
      topInner[i] = innerIdx[id];
      topOuter[i] = outerIdx[id];
    }
  }
  const bottomInner = new Int32Array(C).fill(-1);
  const bottomOuter = new Int32Array(C).fill(-1);
  if (opts.skipBottomBorder) {
    for (let i = 0; i < C; i++) {
      bottomInner[i] = innerIdx[i];
      bottomOuter[i] = outerIdx[i];
    }
  }
  return { topInner, topOuter, bottomInner, bottomOuter };
}
