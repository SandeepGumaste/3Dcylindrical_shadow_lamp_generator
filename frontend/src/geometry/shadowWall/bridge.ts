/**
 * Bridges floating solid pieces of the wall field to the material that holds the wall together.
 *
 * Field layout as in buildField: index i + C * j, i = column (periodic: wraps), j = row at height zs[j],
 * solid where > 0, rows 0 .. footRows - 1 are the foot (anchored). A floating piece (not connected to
 * the foot) gets one straight strip along the shortest path in 8 directions (node steps) to a node of an
 * already attached piece; passes repeat so nested pieces chain. Path length is measured in millimetres
 * (columns are `cell` apart, rows by their heights), at most `reachMm`. A piece with nothing in reach
 * is dropped (made holes). Tie-break as for the Box plate (box/plateField.ts bridgeFloatingPieces): among
 * the nearest candidates the thickest part of the piece wins.
 */
import { labelComponents } from '../tealightShade';

const DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const TIE_MM = 0.75;
const MAX_PASSES = 50;

export function bridgeFloatingPieces(
  field: Float32Array, C: number, zs: ArrayLike<number>, footRows: number, cell: number, widthMm: number, reachMm: number,
): { bridged: number; dropped: number } {
  const rowsN = zs.length;
  const wCols = Math.floor((Math.ceil(widthMm / cell) + 1) / 2); // half width in columns
  const wz = widthMm / 2;                                         // half width in mm along z
  const mask = (): Uint8Array => { const m = new Uint8Array(field.length); for (let n = 0; n < m.length; n++) m[n] = field[n] > 0 ? 1 : 0; return m; };
  const setSolid = (idx: number) => { if (!(field[idx] > 0)) field[idx] = Math.max(Math.abs(field[idx]), 1); };
  let bridged = 0;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { labels, count } = labelComponents(mask(), C, rowsN, 1);
    const anchored = new Uint8Array(count);
    for (let idx = 0; idx < C * footRows; idx++) if (labels[idx] >= 0) anchored[labels[idx]] = 1;
    const cells = new Map<number, number[]>();
    for (let l = 0; l < count; l++) if (!anchored[l]) cells.set(l, []);
    for (let idx = 0; idx < labels.length; idx++) if (labels[idx] >= 0 && !anchored[labels[idx]]) cells.get(labels[idx])!.push(idx);
    if (!cells.size) break;

    let progress = false;
    for (const [l, nodes] of cells) {
      // candidates: from each edge node of the piece, along each direction to the first other solid node, if attached
      const found: { dist: number; i0: number; j0: number; du: number; dj: number; steps: number }[] = [];
      for (const idx of nodes) {
        const i0 = idx % C, j0 = (idx - i0) / C;
        const edge = labels[((i0 + 1) % C) + C * j0] !== l || labels[((i0 + C - 1) % C) + C * j0] !== l
          || (j0 + 1 < rowsN && labels[idx + C] !== l) || (j0 > 0 && labels[idx - C] !== l);
        if (!edge) continue;
        for (const [du, dj] of DIRS) {
          let i = i0, j = j0, dist = 0;
          for (let m = 1; ; m++) {
            const nj = j + dj;
            if (nj < 0 || nj >= rowsN) break;
            dist += Math.hypot(du * cell, zs[nj] - zs[j]);
            if (dist > reachMm) break;
            i = (((i + du) % C) + C) % C; j = nj;
            const lab = labels[i + C * j];
            if (lab === l) continue;
            if (lab >= 0) { if (anchored[lab]) found.push({ dist, i0, j0, du, dj, steps: m }); break; }
          }
        }
      }
      if (!found.length) continue;
      const nearest = found.reduce((m, f) => Math.min(m, f.dist), Infinity);
      const room = (i0: number, j0: number) => {   // piece nodes around a point: more = a thicker part, fewer = a tip
        let n = 0;
        for (let j = Math.max(0, j0 - 12); j <= Math.min(rowsN - 1, j0 + 12); j++) {
          if (Math.abs(zs[j] - zs[j0]) > 2 * widthMm + cell) continue;
          for (let di = -(wCols + 2); di <= wCols + 2; di++) if (labels[((((i0 + di) % C) + C) % C) + C * j] === l) n++;
        }
        return n;
      };
      let best = found[0], bestRoom = -1;
      for (const f of found) {
        if (f.dist > nearest + TIE_MM) continue;
        const r = room(f.i0, f.j0);
        if (r > bestRoom) { bestRoom = r; best = f; }
      }
      // lay the strip over the open nodes between the piece and its target
      let i = best.i0, j = best.j0;
      for (let m = 1; m < best.steps; m++) {
        i = (((i + best.du) % C) + C) % C; j += best.dj;
        for (let k = j; k < rowsN && zs[k] - zs[j] <= wz; k++) for (let di = -wCols; di <= wCols; di++) setSolid((((i + di) % C) + C) % C + C * k);
        for (let k = j - 1; k >= 0 && zs[j] - zs[k] <= wz; k--) for (let di = -wCols; di <= wCols; di++) setSolid((((i + di) % C) + C) % C + C * k);
      }
      bridged++;
      progress = true;
    }
    if (!progress) break;
  }

  // whatever is still not attached has nothing in reach
  const { labels, count } = labelComponents(mask(), C, rowsN, 1);
  const anchored = new Uint8Array(count);
  for (let idx = 0; idx < C * footRows; idx++) if (labels[idx] >= 0) anchored[labels[idx]] = 1;
  let dropped = 0;
  for (let idx = 0; idx < labels.length; idx++) if (labels[idx] >= 0 && !anchored[labels[idx]]) field[idx] = -Math.max(Math.abs(field[idx]), 1);
  for (let l = 0; l < count; l++) if (!anchored[l]) dropped++;
  return { bridged, dropped };
}
