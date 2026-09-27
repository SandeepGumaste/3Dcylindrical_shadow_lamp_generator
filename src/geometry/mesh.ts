import { LampConfig, MeshData } from '../types';
import { cross, length, normalize, subtract, Vec3 } from './vectors';
import { getRowSpans, findOverlappingSpan, Span } from './svg';

interface CellEdges {
  bottom: number[]; // theta values at y0, ascending
  top: number[];    // theta values at y1, ascending
}

interface CapOverride {
  suppress: boolean; // true = no cap wall at all (fully covered by a neighboring wedge)
  west: number;      // shrunk cap span [west, east] when suppress is false but narrower than raw
  east: number;
}

export interface TriangleMesh {
  positions: Float32Array; // 3 floats per vertex
  normals: Float32Array;   // 3 floats per vertex
  indices: Uint32Array;    // 3 ints per triangle
  vertexCount: number;
  triangleCount: number;
}

/**
 * Builds a watertight 3D-printable cylindrical perforated lamp mesh.
 * Consists of:
 * - Outer shell at radius R
 * - Inner shell at radius R - wallThickness
 * - Wall boundary facets around every perforation opening
 * - Top continuous solid rim
 * - Bottom solid base / rim with LED cavity
 */
export function generateLampMesh(
  mask: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  lamp: LampConfig
): TriangleMesh {
  const rOut = lamp.diameter / 2;
  const rIn = Math.max(rOut - lamp.wallThickness, rOut * 0.5);
  const height = lamp.height;

  // Dynamic vertex and index builder
  const positionsArr: number[] = [];
  const normalsArr: number[] = [];
  const indicesArr: number[] = [];

  function addQuad(
    p0: Vec3,
    p1: Vec3,
    p2: Vec3,
    p3: Vec3,
    overrideNormal?: Vec3
  ) {
    // Normal calculation via cross product
    const e1 = subtract(p1, p0);
    const e2 = subtract(p2, p0);
    const norm = overrideNormal ?? normalize(cross(e1, e2));

    const baseIdx = positionsArr.length / 3;

    // 4 vertices: p0, p1, p2, p3
    positionsArr.push(p0.x, p0.y, p0.z);
    positionsArr.push(p1.x, p1.y, p1.z);
    positionsArr.push(p2.x, p2.y, p2.z);
    positionsArr.push(p3.x, p3.y, p3.z);

    for (let i = 0; i < 4; i++) {
      normalsArr.push(norm.x, norm.y, norm.z);
    }

    // Two triangles: (0, 1, 2) and (0, 2, 3)
    indicesArr.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indicesArr.push(baseIdx, baseIdx + 2, baseIdx + 3);
  }

  // Helper to get cylindrical 3D point
  function getCylPoint(radius: number, theta: number, y: number): Vec3 {
    return {
      x: radius * Math.cos(theta),
      y,
      z: radius * Math.sin(theta),
    };
  }

  // Precompute thetas and Y values
  const thetas = new Float64Array(gridWidth + 1);
  for (let c = 0; c <= gridWidth; c++) {
    thetas[c] = (c / gridWidth) * 2 * Math.PI - Math.PI;
  }

  const yVals = new Float64Array(gridHeight + 1);
  for (let r = 0; r <= gridHeight; r++) {
    yVals[r] = (r / gridHeight) * height;
  }

  // Row index of the grid line the LED cavity cup's shelf snaps to (0 when there's no base).
  // Using an exact grid line - rather than the raw baseHeight mm value - guarantees the shelf
  // lands on real wall vertices instead of floating mid-face partway through whichever row
  // happens to contain that Y coordinate, which otherwise leaves the shelf's inner edge
  // permanently unwelded to the wall (a real gap, not just an unsmoothed stair-step).
  // generateCylindricalMask forces every row up to and including this one fully solid so the
  // seam this snaps to is always a plain, wedge-free row boundary.
  const baseTopRow = lamp.hasBase
    ? Math.min(gridHeight, Math.max(1, Math.ceil((Math.max(4, lamp.baseHeight) / height) * gridHeight)))
    : 0;

  function colTheta(c: number): number {
    return (c / gridWidth) * 2 * Math.PI - Math.PI;
  }

  // --- Row-to-row hole-boundary smoothing -----------------------------------------------
  //
  // Each solid cell's vertical edges normally sit exactly on the raw grid column line, so a
  // perforation boundary that drifts diagonally across the image becomes a literal staircase,
  // one grid-cell step per row - both in the printed mesh and in any shadow it casts. To turn
  // that into a smooth diagonal facet without cracking the mesh open, every row-to-row
  // transition of a hole's left/right boundary is handled as a matched pair:
  //
  //   - Whichever row has LESS solid material there (its void starts/ends earlier) has its
  //     single bordering solid cell get a "wedge": its near edge is extended, through every
  //     raw grid boundary it needs to cross, out to the smoothed midpoint - guaranteeing (by
  //     using the exact same raw column values the other row already has) that every vertex
  //     the other row's cells expose at this seam has a matching vertex here.
  //   - Whichever row has MORE solid material there (the "mismatch zone", cells that are solid
  //     here but void in the other row) needs its north/south cap wall reduced or removed to
  //     match: fully covered by the wedge -> no cap; beyond the wedge's reach -> full cap as
  //     before; straddling the smoothed point -> a narrower cap covering only the uncovered part.
  //
  // Without that second half, the original per-cell mask lookup would still draw a full-width
  // cap under material the wedge already covers, and a raw-mask-driven decision would still
  // draw NO cap where the smoothed boundary needs one - either way, a hole in the surface.
  const rawSpansByRow: Span[][] = [];
  for (let r = 0; r < gridHeight; r++) {
    rawSpansByRow.push(getRowSpans(mask, r, gridWidth));
  }

  const edgesByCell = new Map<number, CellEdges>();
  function getEdges(row: number, col: number): CellEdges {
    const key = row * gridWidth + col;
    let e = edgesByCell.get(key);
    if (!e) {
      e = { bottom: [thetas[col], thetas[col + 1]], top: [thetas[col], thetas[col + 1]] };
      edgesByCell.set(key, e);
    }
    return e;
  }

  const southCapOverride = new Map<number, CapOverride>();
  const northCapOverride = new Map<number, CapOverride>();

  // Tracks which (row, col, edge) slots a transition has already claimed, so a second,
  // independent transition can never silently overwrite a wedge or a straddling
  // mismatch-cell's inserted point out from under the first one.
  const claimedEdges = new Set<string>();
  function claim(row: number, col: number, edge: 'top' | 'bottom'): boolean {
    const key = `${row}:${col}:${edge}`;
    if (claimedEdges.has(key)) return false;
    claimedEdges.add(key);
    return true;
  }

  function applyWedge(
    row: number,
    col: number,
    edge: 'top' | 'bottom',
    lo: number,
    hi: number,
    smoothedCol: number,
    smoothedTheta: number,
    direction: 'east' | 'west'
  ): void {
    if (col < 0 || col >= gridWidth) return;
    if (mask[row * gridWidth + col] !== 0) return; // must be solid to carry a wedge

    const e = getEdges(row, col);
    const base = edge === 'top' ? e.top : e.bottom;
    let newPts: number[];

    if (direction === 'east') {
      const extra: number[] = [];
      for (let c = lo; c <= Math.floor(smoothedCol); c++) extra.push(colTheta(c));
      // Only append the smoothed point if it's not already the same point as the last raw
      // one (smoothedCol can land exactly on an integer when hi-lo is even) - otherwise this
      // pushes a duplicate vertex, producing a zero-length segment and a degenerate triangle.
      if (Math.floor(smoothedCol) !== smoothedCol) extra.push(smoothedTheta);
      newPts = [base[0], ...extra];
    } else {
      const extra: number[] = [];
      for (let c = hi; c >= Math.ceil(smoothedCol); c--) extra.push(colTheta(c));
      if (Math.ceil(smoothedCol) !== smoothedCol) extra.push(smoothedTheta);
      newPts = [...extra.reverse(), base[base.length - 1]];
    }

    if (edge === 'top') e.top = newPts;
    else e.bottom = newPts;
  }

  function applyMismatchCaps(
    row: number,
    lo: number,
    hi: number,
    smoothedCol: number,
    smoothedTheta: number,
    side: 'north' | 'south',
    coveredSide: 'west' | 'east'
  ): void {
    const overrideMap = side === 'south' ? southCapOverride : northCapOverride;
    for (let c = lo; c < hi; c++) {
      const key = row * gridWidth + c;
      if (mask[key] !== 0) continue;

      const fullyCovered = coveredSide === 'west' ? c + 1 <= smoothedCol : c >= smoothedCol;
      const fullyUncovered = coveredSide === 'west' ? c >= smoothedCol : c + 1 <= smoothedCol;

      if (fullyCovered) {
        overrideMap.set(key, { suppress: true, west: thetas[c], east: thetas[c + 1] });
      } else if (fullyUncovered) {
        // no override: full natural cap
      } else {
        // Straddles the smoothed point: the wedge's tip lands strictly inside this cell's own
        // natural span. The cell's SKIN keeps its full natural width (it's solid material for
        // its whole height regardless of what's below/above) but needs the smoothed point
        // INSERTED as an extra vertex on its near edge (facing the seam), so the wedge's tip
        // has something to connect to. Only the CAP (the horizontal seal, needed solely for
        // the portion the wedge does NOT reach) is trimmed to the uncovered half.
        const nearEdge = side === 'south' ? 'bottom' : 'top';
        const e = getEdges(row, c);
        e[nearEdge] = [thetas[c], smoothedTheta, thetas[c + 1]];
        if (coveredSide === 'west') {
          overrideMap.set(key, { suppress: false, west: smoothedTheta, east: thetas[c + 1] });
        } else {
          overrideMap.set(key, { suppress: false, west: thetas[c], east: smoothedTheta });
        }
      }
    }
  }

  function handleSideTransition(
    b: number,
    side: 'west' | 'east',
    colBelow: number,
    colAbove: number
  ): void {
    if (colBelow === colAbove) return;

    const lo = Math.min(colBelow, colAbove);
    const hi = Math.max(colBelow, colAbove);
    const smoothedCol = 0.5 * (lo + hi);
    const smoothedTheta = colTheta(smoothedCol);

    // Which row has LESS solid material on this side (its void starts/ends sooner) determines
    // where the wedge goes; the other row holds the mismatch zone. For the west boundary,
    // "less solid" means the smaller column value; for the east boundary it's mirrored (the
    // smaller column value means solid resumes SOONER, i.e. MORE solid, since the void ends
    // there) - so which row gets the wedge flips between the two sides.
    const belowHasLess = side === 'west' ? colBelow < colAbove : colBelow > colAbove;
    const wedgeDirection: 'east' | 'west' = side === 'west' ? 'east' : 'west';
    const wedgeCol = wedgeDirection === 'east' ? lo - 1 : hi;
    const wedgeRow = belowHasLess ? b - 1 : b;
    const wedgeEdge: 'top' | 'bottom' = belowHasLess ? 'top' : 'bottom';
    const mismatchRow = belowHasLess ? b : b - 1;
    const capSide: 'north' | 'south' = belowHasLess ? 'south' : 'north';
    const coveredSide: 'west' | 'east' = wedgeDirection === 'east' ? 'west' : 'east';

    // If the wedge cell would fall outside the grid, this transition touches the wraparound
    // seam (a hole's boundary sits at column 0 or gridWidth). getRowSpans doesn't merge spans
    // across that seam, so there is no well-defined wedge cell to extend here - skip smoothing
    // for this transition rather than modify the mismatch-zone side with no wedge to match it,
    // which would leave a one-sided, unmatched vertex (safe fallback to the raw grid step).
    if (wedgeCol < 0 || wedgeCol >= gridWidth) return;

    // A dense cluster of nearby holes can produce two independent transitions that want to
    // modify the exact same cell edge (e.g. one transition's wedge cell is another
    // transition's straddling mismatch cell). Reserve every edge this transition needs
    // BEFORE touching anything, and back out entirely if any of them is already claimed -
    // the same "skip rather than silently overwrite" rule as the merge/split and seam guards
    // above, since a partially-applied transition is exactly what creates an unmatched vertex.
    const nearEdge: 'top' | 'bottom' = capSide === 'south' ? 'bottom' : 'top';
    const straddleCol = Number.isInteger(smoothedCol) ? null : Math.floor(smoothedCol);
    const wedgeClaimed = claim(wedgeRow, wedgeCol, wedgeEdge);
    const straddleClaimed = straddleCol === null || claim(mismatchRow, straddleCol, nearEdge);
    if (!wedgeClaimed || !straddleClaimed) return;

    applyWedge(wedgeRow, wedgeCol, wedgeEdge, lo, hi, smoothedCol, smoothedTheta, wedgeDirection);
    applyMismatchCaps(mismatchRow, lo, hi, smoothedCol, smoothedTheta, capSide, coveredSide);
  }

  function countOverlaps(spans: Span[], target: Span): number {
    let n = 0;
    for (const s of spans) {
      if (Math.max(s.start, target.start) <= Math.min(s.end, target.end)) n++;
    }
    return n;
  }

  for (let b = 1; b < gridHeight; b++) {
    const spansBelow = rawSpansByRow[b - 1];
    const spansAbove = rawSpansByRow[b];
    for (const spanBelow of spansBelow) {
      const spanAbove = findOverlappingSpan(spansAbove, spanBelow);
      if (!spanAbove) continue;

      // A hole merging (several spans below collapsing into one above) or splitting (the
      // reverse) is a different topology event than a simple 1:1 boundary shift, and the
      // shift-interpolation formula below is only meaningful for a unique, mutual match.
      // Applying it to an ambiguous merge/split conflates unrelated boundaries (e.g. an
      // already-aligned neighboring hole gets misread as "the same hole having shifted a long
      // way"). Skip smoothing for these pairs and leave that boundary as the original raw
      // grid step - safe and still correct, just not smoothed at this specific spot.
      const isUnique = countOverlaps(spansBelow, spanAbove) === 1 && countOverlaps(spansAbove, spanBelow) === 1;
      if (!isUnique) continue;

      handleSideTransition(b, 'west', spanBelow.start, spanAbove.start);
      handleSideTransition(b, 'east', spanBelow.end + 1, spanAbove.end + 1);
    }
  }

  // --- Triangle-strip stitching between two theta-sorted point lists --------------------
  //
  // Bottom and top each have at least 2 points; wedge cells have more. Walking both lists
  // together and always advancing whichever side has the smaller next theta produces a
  // valid, non-self-intersecting strip covering the full span, regardless of how the two
  // lists' lengths differ. For the simple 2-and-2 case (no smoothing) this produces the same
  // two triangles as the original single addQuad call, just via an explicit diagonal choice.
  function addSkinTriangle(p0: Vec3, p1: Vec3, p2: Vec3, inward: boolean): void {
    // p0->p1->p2 is wound so the normal faces outward (+R) when inward is false, matching
    // the original addQuad(out00,out10,out11,out01) orientation; reversed (p0->p2->p1) when
    // inward is true, matching the original addQuad(in00,in01,in11,in10).
    const a = p0;
    const b = inward ? p2 : p1;
    const c = inward ? p1 : p2;

    const e1 = subtract(b, a);
    const e2 = subtract(c, a);
    const norm = normalize(cross(e1, e2));

    const baseIdx = positionsArr.length / 3;
    positionsArr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) normalsArr.push(norm.x, norm.y, norm.z);
    indicesArr.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  function stitchStrip(
    radius: number,
    bottom: number[],
    top: number[],
    y0: number,
    y1: number,
    inward: boolean
  ): void {
    let i = 0;
    let j = 0;
    while (i < bottom.length - 1 || j < top.length - 1) {
      const stepBottom =
        i >= bottom.length - 1 ? false : j >= top.length - 1 ? true : bottom[i + 1] <= top[j + 1];

      if (stepBottom) {
        const p0 = getCylPoint(radius, bottom[i], y0);
        const p1 = getCylPoint(radius, bottom[i + 1], y0);
        const p2 = getCylPoint(radius, top[j], y1);
        addSkinTriangle(p0, p1, p2, inward);
        i++;
      } else {
        const p0 = getCylPoint(radius, bottom[i], y0);
        const p1 = getCylPoint(radius, top[j], y1);
        const p2 = getCylPoint(radius, top[j + 1], y1);
        addSkinTriangle(p0, p1, p2, inward);
        j++;
      }
    }
  }

  // 1. Generate Wall Cells (Outer, Inner, and Opening Boundary Walls)
  // Runs uniformly over every row, including the base region: the lamp is a thin hollow shell
  // (wallThickness between rIn and rOut) top to bottom, the same as the "no base" case. The
  // base region is just forced fully solid by generateCylindricalMask (see requiredBaseRows
  // there) so it prints as a plain, unperforated band rather than carrying the silhouette
  // pattern - it isn't a separate solid-filled block.
  //
  // Rows below baseTopRow skip their INNER skin only (outer skin, the visible outside of the
  // riser, is unaffected). The LED cavity cup's shelf (below) welds its outer edge to row
  // baseTopRow's own inner-skin bottom edge - the only other thing that could claim that same
  // edge is this continuous inner tube arriving from below, which would make it a 3-way
  // junction (non-manifold) instead of a clean 2-way weld. Leaving the riser's interior (r <
  // rIn) without its own inner wall isn't a defect: nothing needs it, since the space it would
  // enclose is already open to the outside through the un-floored center of the bottom rim
  // annulus below - the riser is simply a hollow, open-bottomed cylinder, same as a cup or pipe
  // is normally modeled and prints fine despite that boundary loop.
  for (let row = 0; row < gridHeight; row++) {
    const y0 = yVals[row];
    const y1 = yVals[row + 1];

    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      const isCellOpen = mask[idx] === 1;

      // If cell is open, it has no outer or inner skin (light passes through)
      if (isCellOpen) {
        continue;
      }

      const edges = getEdges(row, col);
      const th0y0 = edges.bottom[0];
      const th0y1 = edges.top[0];
      const th1y0 = edges.bottom[edges.bottom.length - 1];
      const th1y1 = edges.top[edges.top.length - 1];

      // Outer skin: outward-facing strip between the bottom and top edge point lists.
      stitchStrip(rOut, edges.bottom, edges.top, y0, y1, false);
      // Inner skin: inward-facing (reversed winding). Omitted within the base riser (see the
      // comment above the row loop) so the LED cavity cup's shelf has a clean, single row
      // boundary to weld to instead of an already-continuous tube.
      const isBaseRiserRow = lamp.hasBase && row < baseTopRow;
      if (!isBaseRiserRow) {
        stitchStrip(rIn, edges.bottom, edges.top, y0, y1, true);
      }

      const out00 = getCylPoint(rOut, th0y0, y0);
      const out10 = getCylPoint(rOut, th1y0, y0);
      const out11 = getCylPoint(rOut, th1y1, y1);
      const out01 = getCylPoint(rOut, th0y1, y1);
      const in00 = getCylPoint(rIn, th0y0, y0);
      const in10 = getCylPoint(rIn, th1y0, y0);
      const in11 = getCylPoint(rIn, th1y1, y1);
      const in01 = getCylPoint(rIn, th0y1, y1);

      // North neighbor: row + 1. The default (un-overridden) cap must use this cell's own raw,
      // un-extended column boundary - not th0y1/th1y1, which can reach past it when this same
      // cell is also a wedge for a row-to-row transition. Using the extended value here would
      // over-cap into territory already properly skin-to-skin connected to the adjacent row,
      // overlapping rather than sealing it.
      const key = row * gridWidth + col;
      const northOverride = northCapOverride.get(key);
      const isNorthOpenRaw = row + 1 < gridHeight && mask[(row + 1) * gridWidth + col] === 1;
      if (northOverride ? !northOverride.suppress : isNorthOpenRaw) {
        const w = northOverride ? northOverride.west : thetas[col];
        const e = northOverride ? northOverride.east : thetas[col + 1];
        addQuad(
          getCylPoint(rOut, w, y1),
          getCylPoint(rOut, e, y1),
          getCylPoint(rIn, e, y1),
          getCylPoint(rIn, w, y1),
          { x: 0, y: 1, z: 0 }
        );
      }

      // South neighbor: row - 1 (same reasoning as the north cap above).
      const southOverride = southCapOverride.get(key);
      const isSouthOpenRaw = row > 0 && mask[(row - 1) * gridWidth + col] === 1;
      if (southOverride ? !southOverride.suppress : isSouthOpenRaw) {
        const w = southOverride ? southOverride.west : thetas[col];
        const e = southOverride ? southOverride.east : thetas[col + 1];
        addQuad(
          getCylPoint(rOut, e, y0),
          getCylPoint(rOut, w, y0),
          getCylPoint(rIn, w, y0),
          getCylPoint(rIn, e, y0),
          { x: 0, y: -1, z: 0 }
        );
      }

      // East neighbor: (col + 1) % gridWidth
      const eastCol = (col + 1) % gridWidth;
      const isEastOpen = mask[row * gridWidth + eastCol] === 1;
      if (isEastOpen) {
        // Wall following the (possibly wedge-extended) east edge
        addQuad(out10, in10, in11, out11);
      }

      // West neighbor: (col - 1 + gridWidth) % gridWidth
      const westCol = (col - 1 + gridWidth) % gridWidth;
      const isWestOpen = mask[row * gridWidth + westCol] === 1;
      if (isWestOpen) {
        // Wall following the (possibly wedge-extended) west edge
        addQuad(in00, out00, out01, in01);
      }
    }
  }

  // 2. Top Rim Capping (annulus from rIn to rOut at y = height)
  const topY = height;
  for (let c = 0; c < gridWidth; c++) {
    const th0 = thetas[c];
    const th1 = thetas[c + 1];
    const pOut0 = getCylPoint(rOut, th0, topY);
    const pOut1 = getCylPoint(rOut, th1, topY);
    const pIn0 = getCylPoint(rIn, th0, topY);
    const pIn1 = getCylPoint(rIn, th1, topY);

    // Facing +Y
    addQuad(pOut0, pOut1, pIn1, pIn0, { x: 0, y: 1, z: 0 });
  }

  // 3. Bottom rim: a thin annulus (rIn..rOut) at y = 0, same as the top rim - the lamp is a
  // hollow shell of wallThickness top to bottom, never a solid-filled disc, whether or not it
  // has a mounting base.
  for (let c = 0; c < gridWidth; c++) {
    const th0 = thetas[c];
    const th1 = thetas[c + 1];
    const pOut0 = getCylPoint(rOut, th0, 0);
    const pOut1 = getCylPoint(rOut, th1, 0);
    const pIn0 = getCylPoint(rIn, th0, 0);
    const pIn1 = getCylPoint(rIn, th1, 0);

    // Facing -Y
    addQuad(pOut1, pOut0, pIn0, pIn1, { x: 0, y: -1, z: 0 });
  }

  // 4. LED/tea-light cavity: a thin-walled cup (shelf + cavity wall + cavity floor) welded
  // inside the hollow tube at the base's height, not a solid-filled block. Its shelf's outer
  // (rIn) edge welds to the wall's own inner skin at row baseTopRow's bottom boundary (raw,
  // unwedged theta values - generateCylindricalMask forces every row up to and including
  // baseTopRow fully solid so that seam is always a plain row boundary to weld to).
  const baseH = lamp.hasBase ? Math.max(4, lamp.baseHeight) : 0;
  const cavityR = lamp.hasBase ? Math.min(lamp.ledCavityDiameter / 2, rIn * 0.85) : 0;
  const cavityD = lamp.hasBase ? Math.min(lamp.ledCavityDepth, baseH - 1.5) : 0;

  if (lamp.hasBase && baseH > 0) {
    // Snapped to an actual wall row boundary (see baseTopRow above) rather than the raw
    // baseHeight mm value, so the shelf welds to the wall's real vertices instead of floating
    // mid-face partway through whichever row happens to contain that Y coordinate.
    const baseTopY = yVals[baseTopRow];

    for (let c = 0; c < gridWidth; c++) {
      const th0 = thetas[c];
      const th1 = thetas[c + 1];

      // Shelf connecting to the inner lamp wall (y = baseTopY), facing +Y
      const ptCav0 = getCylPoint(cavityR, th0, baseTopY);
      const ptCav1 = getCylPoint(cavityR, th1, baseTopY);
      const ptIn0 = getCylPoint(rIn, th0, baseTopY);
      const ptIn1 = getCylPoint(rIn, th1, baseTopY);
      addQuad(ptIn0, ptIn1, ptCav1, ptCav0, { x: 0, y: 1, z: 0 });

      // Cavity vertical inner cylindrical wall
      if (cavityR > 0 && cavityD > 0) {
        const cavBottomY = baseTopY - cavityD;
        const cavBot0 = getCylPoint(cavityR, th0, cavBottomY);
        const cavBot1 = getCylPoint(cavityR, th1, cavBottomY);

        // Cavity wall facing inwards
        addQuad(ptCav0, ptCav1, cavBot1, cavBot0);

        // Cavity floor (facing +Y)
        const cavFloorCenter = { x: 0, y: cavBottomY, z: 0 };
        const cIdx = positionsArr.length / 3;
        positionsArr.push(cavFloorCenter.x, cavFloorCenter.y, cavFloorCenter.z);
        positionsArr.push(cavBot0.x, cavBot0.y, cavBot0.z);
        positionsArr.push(cavBot1.x, cavBot1.y, cavBot1.z);
        for (let i = 0; i < 3; i++) normalsArr.push(0, 1, 0);
        indicesArr.push(cIdx, cIdx + 1, cIdx + 2);
      }
    }
  }

  // 4. Inward-extending 3D Radial Struts (connecting inner cylinder wall toward the center)
  if (lamp.radialStruts && lamp.radialStruts > 0) {
    const numStruts = lamp.radialStruts;
    const strutSpacing = Math.max(2, Math.floor(gridWidth / numStruts));
    const strutWidth = Math.max(1, Math.min(strutSpacing - 1, lamp.strutWidthColumns ?? 2));
    const targetLength = lamp.strutLength ?? (lamp.diameter / 2);

    if (targetLength > 0.5) {
      // Entire vertical strut runs the full height of the lamp cylinder
      const strutH = height;
      const rEnd = Math.max(0, rIn - targetLength);

      for (let s = 0; s < numStruts; s++) {
        const c0 = s * strutSpacing;
        const c1 = Math.min(c0 + strutWidth, gridWidth);
        const th0 = thetas[c0];
        const th1 = thetas[c1];

        // Bottom vertices at y = 0
        const pOut0 = getCylPoint(rIn, th0, 0);
        const pOut1 = getCylPoint(rIn, th1, 0);
        const pIn0 = getCylPoint(rEnd, th0, 0);
        const pIn1 = getCylPoint(rEnd, th1, 0);

        // Top vertices at y = strutH
        const tOut0 = getCylPoint(rIn, th0, strutH);
        const tOut1 = getCylPoint(rIn, th1, strutH);
        const tIn0 = getCylPoint(rEnd, th0, strutH);
        const tIn1 = getCylPoint(rEnd, th1, strutH);

        if (rEnd > 0.1) {
          // Bottom face (facing -Y)
          addQuad(pOut1, pOut0, pIn0, pIn1, { x: 0, y: -1, z: 0 });
          // Top face (facing +Y)
          addQuad(tOut0, tOut1, tIn1, tIn0, { x: 0, y: 1, z: 0 });
          // West face (at theta = th0)
          addQuad(pIn0, pOut0, tOut0, tIn0);
          // East face (at theta = th1)
          addQuad(pOut1, pIn1, tIn1, tOut1);
          // Inward end face (at r = rEnd, facing towards center)
          addQuad(pIn1, pIn0, tIn0, tIn1);
          // Outward end face (at r = rIn, facing +R toward cylinder inner wall)
          addQuad(pOut0, pOut1, tOut1, tOut0);
        } else {
          // rEnd is 0: inner vertices meet at the central axis (0, 0, 0) and (0, strutH, 0)
          const cBot = { x: 0, y: 0, z: 0 };
          const cTop = { x: 0, y: strutH, z: 0 };

          // Bottom face (triangle, facing -Y)
          const bIdx = positionsArr.length / 3;
          positionsArr.push(pOut1.x, pOut1.y, pOut1.z, pOut0.x, pOut0.y, pOut0.z, cBot.x, cBot.y, cBot.z);
          for (let i = 0; i < 3; i++) normalsArr.push(0, -1, 0);
          indicesArr.push(bIdx, bIdx + 1, bIdx + 2);

          // Top face (triangle, facing +Y)
          const tIdx = positionsArr.length / 3;
          positionsArr.push(tOut0.x, tOut0.y, tOut0.z, tOut1.x, tOut1.y, tOut1.z, cTop.x, cTop.y, cTop.z);
          for (let i = 0; i < 3; i++) normalsArr.push(0, 1, 0);
          indicesArr.push(tIdx, tIdx + 1, tIdx + 2);

          // West side face (at theta = th0)
          addQuad(cBot, pOut0, tOut0, cTop);
          // East side face (at theta = th1)
          addQuad(pOut1, cBot, cTop, tOut1);
          // Outward end face (at r = rIn)
          addQuad(pOut0, pOut1, tOut1, tOut0);
        }
      }
    }
  }

  const positions = new Float32Array(positionsArr);
  const normals = new Float32Array(normalsArr);
  const indices = new Uint32Array(indicesArr);

  return {
    positions,
    normals,
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

/**
 * Validates mesh for 3D printing integrity.
 */
export function validateMesh(mesh: TriangleMesh): {
  isValid: boolean;
  errors: string[];
  degenerateCount: number;
  nanCount: number;
} {
  const errors: string[] = [];
  let nanCount = 0;
  let degenerateCount = 0;

  if (mesh.vertexCount === 0 || mesh.triangleCount === 0) {
    errors.push('Mesh has no vertices or triangles.');
    return { isValid: false, errors, degenerateCount: 0, nanCount: 0 };
  }

  // Check NaN in positions and normals
  for (let i = 0; i < mesh.positions.length; i++) {
    if (isNaN(mesh.positions[i]) || !isFinite(mesh.positions[i])) {
      nanCount++;
    }
  }

  // Check triangles
  const p = mesh.positions;
  const idx = mesh.indices;
  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = idx[t * 3] * 3;
    const i1 = idx[t * 3 + 1] * 3;
    const i2 = idx[t * 3 + 2] * 3;

    const v0: Vec3 = { x: p[i0], y: p[i0 + 1], z: p[i0 + 2] };
    const v1: Vec3 = { x: p[i1], y: p[i1 + 1], z: p[i1 + 2] };
    const v2: Vec3 = { x: p[i2], y: p[i2 + 1], z: p[i2 + 2] };

    const e1 = subtract(v1, v0);
    const e2 = subtract(v2, v0);
    const c = cross(e1, e2);
    const area = length(c) * 0.5;

    if (area < 1e-9) {
      degenerateCount++;
    }
  }

  if (nanCount > 0) {
    errors.push(`Found ${nanCount} invalid NaN/infinite coordinates.`);
  }

  if (degenerateCount > 0) {
    errors.push(`Found ${degenerateCount} degenerate (zero-area) triangles.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    degenerateCount,
    nanCount,
  };
}
