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
    /** Small bridges added to hold floating pieces to the wall (long pieces get several), and pieces dropped because nothing was in reach. */
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

  // Floating pieces: hold each to the wall with bridges, one every ~24 mm of its length, or drop it.
  const strip = mS;
  const MAX_REACH = 80, SPACING = 60; // cells
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
      const found: { dist: number; i: number; dx: number; dy: number }[] = [];
      for (const i of cells) {
        const x0 = i % cols, y0 = (i - x0) / cols;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          for (let m = 1; m <= MAX_REACH; m++) {
            const x = x0 + dx * m, y = y0 + dy * m;
            if (x < 0 || y < 0 || x >= cols || y >= rows) break;
            const q = y * cols + x;
            if (labels[q] === l) continue;
            if (solid[q] && labels[q] >= 0) { if (anchored[labels[q]]) found.push({ dist: m, i, dx, dy }); break; }
          }
        }
      }
      if (!found.length) continue;
      found.sort((a, b) => a.dist - b.dist);
      const nearest = found[0].dist, chosen: typeof found = [];
      for (const cand of found) {
        if (cand.dist > nearest * 2 + 5) break;
        const cx = cand.i % cols, cy = (cand.i - cx) / cols;
        if (chosen.every((o) => Math.hypot(cx - (o.i % cols), cy - Math.floor(o.i / cols)) >= SPACING)) chosen.push(cand);
      }
      for (const best of chosen) {
        const x0 = best.i % cols, y0 = (best.i - x0) / cols;
        for (let m = 1; m < best.dist; m++) {
          for (let w = -Math.floor((strip - 1) / 2); w <= Math.ceil((strip - 1) / 2); w++) {
            const x = x0 + best.dx * m + (best.dx === 0 ? w : 0), y = y0 + best.dy * m + (best.dy === 0 ? w : 0);
            if (x >= 0 && y >= 0 && x < cols && y < rows) solid[y * cols + x] = 1;
          }
        }
        report.bridged++;
      }
      progress = true;
    }
    if (!progress) break;
  }
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
