import { KIT, type WallId } from './kitSpec';
import { MIN_WALL_HEIGHT, PROFILE_STEP, type BoxParams, type RimProfile } from './rimProfile';
import { rimPoint, wallSpan } from './shadowModel';

/** Cell size of the wall mask, mm: one nozzle width. */
export const PLATE_CELL = 0.4;
/** Material right under the rim profile is always kept, mm, so a lit sliver there never erodes the outline. */
const EDGE_BAND = 0.6;

export interface PlateField {
  /** Cells along the plate's length (y) and up its height from the seat. */
  cols: number;
  rows: number;
  /** 1 = material, 0 = open; cell (col, row) is at index row * cols + col. */
  solid: Uint8Array;
  /** Exact rim profile height from the seat at each column centre, mm; the mesh snaps the top outline to it. */
  topHs?: Float64Array;
  report: {
    /** Openings fully enclosed by material. */
    openings: number;
    /** Thin dark strokes that were thickened. */
    thickened: number;
    /** Small bridges added to hold floating pieces to the wall (one each at the nearest point; a piece as long as the wall gets several), and pieces dropped because nothing was in reach. */
    bridged: number;
    dropped: number;
  };
}

/**
 * Which cells of a wall plate are material. A point of the wall lets light through exactly when the
 * shadow pixel it maps to is light, so a lit area inside a dark shape becomes an opening. The foot
 * stays solid, the top edge is the rim profile's, and the result is cleaned for printing: thin
 * strokes thickened, narrow openings filled, floating pieces bridged to the wall or dropped.
 */
export function buildPlateField(id: WallId, profile: RimProfile, p: BoxParams): PlateField {
  const spec = KIT.walls[id];
  const cols = Math.round(spec.length / PLATE_CELL);
  const rows = Math.ceil(spec.maxHeight / PLATE_CELL);
  const L = p.lightHeight, T = KIT.T, span = wallSpan(id);
  const solid = new Uint8Array(cols * rows);
  const topOf = new Float64Array(cols); // processed rim height from the seat at each column
  // the mesh stretches the grid to the plate's exact size, so the field samples with the same pitches
  const pitchY = spec.length / cols, pitchH = spec.maxHeight / rows;

  const along = (arr: Float32Array, s: number) => {
    const f = s / PROFILE_STEP, i = Math.min(Math.floor(f), arr.length - 2);
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  for (let c = 0; c < cols; c++) {
    const s = Math.min(Math.max(spec.plan.from + spec.plan.dir * (c + 0.5) * pitchY, 0), span);
    const { d, angle } = rimPoint(id, s);
    const top = KIT.panelPlaneX + along(profile.heights[id], s);
    topOf[c] = top;
    const rawTop = KIT.panelPlaneX + along(profile.rawHeights[id], s);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (let r = 0; r < rows; r++) {
      const hs = (r + 0.5) * pitchH;
      let on = false;
      if (hs <= MIN_WALL_HEIGHT) on = true;
      else if (hs > top) on = false;
      else if (hs > rawTop - EDGE_BAND) on = true; // spike widening, and the outermost sliver under the profile, so the outline is the profile
      else {
        const h = hs - KIT.panelPlaneX;
        const reach = (d * (L + T)) / (L - h);
        on = profile.darkAt(reach * cos, reach * sin);
      }
      solid[r * cols + c] = on ? 1 : 0;
    }
  }

  const report = { openings: 0, thickened: 0, bridged: 0, dropped: 0 };
  const foot = Math.ceil(MIN_WALL_HEIGHT / pitchH);

  // Thicken strokes thinner than the minimum spike width.
  const mS = Math.max(1, Math.ceil(p.minSpike / PLATE_CELL));
  const opened = open(solid, cols, rows, mS, 1); // the plate edge is not a thin stroke
  const thin = new Uint8Array(solid.length);
  for (let i = 0; i < thin.length; i++) thin[i] = solid[i] && !opened[i] ? 1 : 0;
  const thinParts = labelComponents(thin, cols, rows, 1);
  const thinSize = new Int32Array(thinParts.count);
  for (let i = 0; i < thinParts.labels.length; i++) if (thinParts.labels[i] >= 0) thinSize[thinParts.labels[i]]++;
  report.thickened = thinSize.filter((n) => n >= 8).length; // corners and tips of ordinary shapes are not strokes
  const fat = dilate(thin, cols, rows, mS, 0);
  for (let i = 0; i < solid.length; i++) if (fat[i]) solid[i] = 1;

  // Fill openings narrower than the minimum notch width.
  const mG = Math.max(1, Math.ceil(p.minGap / PLATE_CELL));
  const fillNarrowOpenings = () => {
    const openCells = new Uint8Array(solid.length);
    for (let i = 0; i < openCells.length; i++) openCells[i] = solid[i] ? 0 : 1;
    const wide = open(openCells, cols, rows, mG, 1);
    for (let i = 0; i < solid.length; i++) if (openCells[i] && !wide[i]) solid[i] = 1;
  };
  fillNarrowOpenings();

  // Floating pieces: hold each to the wall with a bridge at its nearest point, or drop it (below).
  report.bridged = bridgeFloatingPieces(solid, cols, rows, mS);
  fillNarrowOpenings(); // bridges can leave one-cell pockets in corners
  // The rim profile is a ceiling: cleanup may widen things but never lift the top edge, so walls still meet at the corners.
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) if ((r + 0.5) * pitchH > topOf[c]) solid[r * cols + c] = 0;
  {
    const { labels, count } = labelComponents(solid, cols, rows, 1);
    const anchored = new Uint8Array(count);
    for (let c = 0; c < cols; c++) if (labels[c] >= 0) anchored[labels[c]] = 1;
    const dropped = new Set<number>();
    for (let i = 0; i < labels.length; i++) if (labels[i] >= 0 && !anchored[labels[i]]) { solid[i] = 0; dropped.add(labels[i]); }
    report.dropped = dropped.size;
  }
  for (let r = 0; r < foot; r++) for (let c = 0; c < cols; c++) solid[r * cols + c] = 1;

  // Openings fully enclosed by material (open regions that do not reach the grid edge).
  const { labels: openLabels, count: openCount } = labelComponents(solid, cols, rows, 0);
  const outside = new Uint8Array(openCount);
  for (let c = 0; c < cols; c++) { if (openLabels[c] >= 0) outside[openLabels[c]] = 1; if (openLabels[(rows - 1) * cols + c] >= 0) outside[openLabels[(rows - 1) * cols + c]] = 1; }
  for (let r = 0; r < rows; r++) { if (openLabels[r * cols] >= 0) outside[openLabels[r * cols]] = 1; if (openLabels[r * cols + cols - 1] >= 0) outside[openLabels[r * cols + cols - 1]] = 1; }
  for (let l = 0; l < openCount; l++) if (!outside[l]) report.openings++;

  return { cols, rows, solid, topHs: topOf, report };
}

const MAX_REACH = 80;   // cells: a bridge never spans more than 32 mm
const SPACING = 60;     // cells: extra bridges on a very long piece are at least this far apart
const DIRECTIONS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Joins every piece of material that is not attached to the plate (4-connected to its bottom row, the seat)
 * by laying a strip `strip` cells wide along the shortest straight line to attached material, in any of 8
 * directions, within reach. Where several points are equally close (a long edge facing the wall) the
 * thickest part of the piece wins, nearest its middle, so bridges never sit on a thin tip or at an end.
 * An ordinary piece gets one bridge; a piece at least two spacings long gets more, spaced out along it.
 * Pieces with nothing in reach are left for the caller to drop. Edits `solid` in place; returns the
 * number of bridges laid.
 */
export function bridgeFloatingPieces(solid: Uint8Array, cols: number, rows: number, strip: number): number {
  let bridged = 0;
  const lo = -Math.floor((strip - 1) / 2), hi = Math.ceil((strip - 1) / 2);
  for (let pass = 0; pass < 8; pass++) {
    const { labels, count } = labelComponents(solid, cols, rows, 1);
    const anchored = new Uint8Array(count);
    for (let c = 0; c < cols; c++) if (labels[c] >= 0) anchored[labels[c]] = 1;
    const cellsOf = new Map<number, number[]>();
    for (let l = 0; l < count; l++) if (!anchored[l]) cellsOf.set(l, []);
    for (let i = 0; i < labels.length; i++) if (labels[i] >= 0 && !anchored[labels[i]]) cellsOf.get(labels[i])!.push(i);
    if (!cellsOf.size) break;
    let progress = false;
    for (const [l, cells] of cellsOf) {
      let minX = Infinity, maxX = -Infinity, sumX = 0, sumY = 0;
      for (const i of cells) { const x = i % cols, y = (i - x) / cols; minX = Math.min(minX, x); maxX = Math.max(maxX, x); sumX += x; sumY += y; }
      const cx = sumX / cells.length, cy = sumY / cells.length;
      const found: { dist: number; x0: number; y0: number; dx: number; dy: number; steps: number }[] = [];
      for (const i of cells) {
        const x0 = i % cols, y0 = (i - x0) / cols;
        const edge = (x0 === 0 || labels[i - 1] !== l) || (x0 === cols - 1 || labels[i + 1] !== l)
          || (y0 === 0 || labels[i - cols] !== l) || (y0 === rows - 1 || labels[i + cols] !== l);
        if (!edge) continue;
        for (const [dx, dy, len] of DIRECTIONS) {
          for (let m = 1; m <= MAX_REACH; m++) {
            const x = x0 + dx * m, y = y0 + dy * m;
            if (x < 0 || y < 0 || x >= cols || y >= rows) break;
            const q = y * cols + x;
            if (labels[q] === l) continue;
            if (solid[q] && labels[q] >= 0) { if (anchored[labels[q]]) found.push({ dist: m * len, x0, y0, dx, dy, steps: m }); break; }
          }
        }
      }
      if (!found.length) continue;
      const nearest = found.reduce((m, f) => Math.min(m, f.dist), Infinity);
      // roominess of the piece around a point: more cells around it means a thicker part, fewer a tip or an end
      const R = strip + 1;
      const roomAround = (x0: number, y0: number) => {
        let n = 0;
        for (let y = Math.max(0, y0 - R); y <= Math.min(rows - 1, y0 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(cols - 1, x0 + R); x++) if (labels[y * cols + x] === l) n++;
        return n;
      };
      const rank = (f: (typeof found)[number]) => ({ f, room: roomAround(f.x0, f.y0), toCentre: Math.hypot(f.x0 - cx, f.y0 - cy) });
      const best = (list: (typeof found)) => list.map(rank).sort((a, b) => b.room - a.room || a.toCentre - b.toCentre)[0].f;
      const chosen = [best(found.filter((f) => f.dist <= nearest + 0.75))];
      if (maxX - minX + 1 >= 2 * SPACING) {
        const extra = found.filter((f) => f.dist <= nearest * 2 + 5).map(rank).sort((a, b) => a.f.dist - b.f.dist || b.room - a.room);
        for (const { f } of extra) if (chosen.every((o) => Math.hypot(f.x0 - o.x0, f.y0 - o.y0) >= SPACING)) chosen.push(f);
      }
      for (const b of chosen) {
        for (let m = 1; m < b.steps; m++) {
          for (let wx = lo; wx <= hi; wx++) for (let wy = lo; wy <= hi; wy++) {
            const x = b.x0 + b.dx * m + wx, y = b.y0 + b.dy * m + wy;
            if (x >= 0 && y >= 0 && x < cols && y < rows) solid[y * cols + x] = 1;
          }
        }
        bridged++;
      }
      progress = true;
    }
    if (!progress) break;
  }
  return bridged;
}

/** 4-connected components of cells equal to `value`; labels are -1 elsewhere. Does not wrap. */
function labelComponents(mask: Uint8Array, cols: number, rows: number, value: number) {
  const labels = new Int32Array(mask.length).fill(-1);
  const queue = new Int32Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== value || labels[start] >= 0) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; labels[start] = count;
    while (head < tail) {
      const i = queue[head++], x = i % cols, y = (i - x) / cols;
      if (x > 0 && mask[i - 1] === value && labels[i - 1] < 0) { labels[i - 1] = count; queue[tail++] = i - 1; }
      if (x < cols - 1 && mask[i + 1] === value && labels[i + 1] < 0) { labels[i + 1] = count; queue[tail++] = i + 1; }
      if (y > 0 && mask[i - cols] === value && labels[i - cols] < 0) { labels[i - cols] = count; queue[tail++] = i - cols; }
      if (y < rows - 1 && mask[i + cols] === value && labels[i + cols] < 0) { labels[i + cols] = count; queue[tail++] = i + cols; }
    }
    count++;
  }
  return { labels, count };
}

/** Separable min or max over an m x m window; cells outside the grid count as `outside`. */
function window2(src: Uint8Array, cols: number, rows: number, m: number, outside: number, lo: number, hi: number, pickMin: boolean): Uint8Array {
  const pass = (input: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(input.length);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let v = pickMin ? 1 : 0;
        for (let k = lo; k <= hi; k++) {
          const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
          const val = xx < 0 || yy < 0 || xx >= cols || yy >= rows ? outside : input[yy * cols + xx];
          if (pickMin) { if (!val) { v = 0; break; } } else if (val) { v = 1; break; }
        }
        out[y * cols + x] = v;
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}
const erode = (src: Uint8Array, cols: number, rows: number, m: number, outside: number) =>
  window2(src, cols, rows, m, outside, -Math.floor((m - 1) / 2), Math.ceil((m - 1) / 2), true);
const dilate = (src: Uint8Array, cols: number, rows: number, m: number, outside: number) =>
  window2(src, cols, rows, m, outside, -Math.ceil((m - 1) / 2), Math.floor((m - 1) / 2), false);
/** Morphological opening: removes parts of the shape narrower than m cells. */
const open = (src: Uint8Array, cols: number, rows: number, m: number, outside: number) =>
  dilate(erode(src, cols, rows, m, outside), cols, rows, m, 0);
