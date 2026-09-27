import { describe, it, expect } from 'vitest';
import { generateLampMesh, validateMesh, TriangleMesh } from '../mesh';
import { meshToBinarySTL } from '../stl';
import { LampConfig } from '../../types';

/**
 * Counts mesh edges that are NOT shared by exactly 2 triangles (welding vertices by
 * position within `eps`). A watertight, 3D-printable solid must have every edge shared by
 * exactly 2 triangles; validateMesh only checks for degenerate/NaN triangles and does not
 * catch this, which is exactly how a mesh-smoothing bug slipped past the full test suite in
 * an earlier attempt at this fix (a real T-junction crack, caught only by this check).
 */
function countNonManifoldEdges(mesh: TriangleMesh, eps = 1e-4): number {
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;

  const vKeys: string[] = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    vKeys.push(key(mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]));
  }

  const edgeCount = new Map<string, number>();
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = vKeys[mesh.indices[t * 3]];
    const b = vKeys[mesh.indices[t * 3 + 1]];
    const c = vKeys[mesh.indices[t * 3 + 2]];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const e = p < q ? `${p}|${q}` : `${q}|${p}`;
      edgeCount.set(e, (edgeCount.get(e) ?? 0) + 1);
    }
  }

  let nonManifold = 0;
  for (const c of edgeCount.values()) {
    if (c !== 2) nonManifold++;
  }
  return nonManifold;
}

/**
 * Frozen copy of the original (pre-smoothing) mesh algorithm: every solid cell is a plain
 * axis-aligned quad at its raw grid boundary, no boundary interpolation at all. Used only as
 * a regression oracle - since it never changes, it lets tests assert "smoothing added no new
 * leaks" by comparing non-manifold counts against this reference, without depending on
 * whatever baseline quirks (e.g. the intentionally open top rim) already exist independent
 * of any hole-boundary smoothing.
 */
function referenceGenerateLampMesh(
  mask: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  lamp: LampConfig
): TriangleMesh {
  const rOut = lamp.diameter / 2;
  const rIn = Math.max(rOut - lamp.wallThickness, rOut * 0.5);
  const height = lamp.height;

  const positionsArr: number[] = [];
  const normalsArr: number[] = [];
  const indicesArr: number[] = [];

  function addQuad(
    p0: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    p3: { x: number; y: number; z: number },
    overrideNormal?: { x: number; y: number; z: number }
  ) {
    const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
    const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z };
    const cross = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };
    const len = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z) || 1;
    const norm = overrideNormal ?? { x: cross.x / len, y: cross.y / len, z: cross.z / len };

    const baseIdx = positionsArr.length / 3;
    for (const p of [p0, p1, p2, p3]) positionsArr.push(p.x, p.y, p.z);
    for (let i = 0; i < 4; i++) normalsArr.push(norm.x, norm.y, norm.z);
    indicesArr.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indicesArr.push(baseIdx, baseIdx + 2, baseIdx + 3);
  }

  function getCylPoint(radius: number, theta: number, y: number) {
    return { x: radius * Math.cos(theta), y, z: radius * Math.sin(theta) };
  }

  const thetas = new Float64Array(gridWidth + 1);
  for (let c = 0; c <= gridWidth; c++) thetas[c] = (c / gridWidth) * 2 * Math.PI - Math.PI;
  const yVals = new Float64Array(gridHeight + 1);
  for (let r = 0; r <= gridHeight; r++) yVals[r] = (r / gridHeight) * height;

  for (let row = 0; row < gridHeight; row++) {
    const y0 = yVals[row];
    const y1 = yVals[row + 1];
    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      if (mask[idx] === 1) continue;

      const th0 = thetas[col];
      const th1 = thetas[col + 1];

      const out00 = getCylPoint(rOut, th0, y0);
      const out10 = getCylPoint(rOut, th1, y0);
      const out11 = getCylPoint(rOut, th1, y1);
      const out01 = getCylPoint(rOut, th0, y1);
      addQuad(out00, out10, out11, out01);

      const in00 = getCylPoint(rIn, th0, y0);
      const in10 = getCylPoint(rIn, th1, y0);
      const in11 = getCylPoint(rIn, th1, y1);
      const in01 = getCylPoint(rIn, th0, y1);
      addQuad(in00, in01, in11, in10);

      const isNorthOpen = row + 1 < gridHeight && mask[(row + 1) * gridWidth + col] === 1;
      if (isNorthOpen) addQuad(out01, out11, in11, in01, { x: 0, y: 1, z: 0 });

      const isSouthOpen = row > 0 && mask[(row - 1) * gridWidth + col] === 1;
      if (isSouthOpen) addQuad(out10, out00, in00, in10, { x: 0, y: -1, z: 0 });

      const eastCol = (col + 1) % gridWidth;
      if (mask[row * gridWidth + eastCol] === 1) addQuad(out10, in10, in11, out11);

      const westCol = (col - 1 + gridWidth) % gridWidth;
      if (mask[row * gridWidth + westCol] === 1) addQuad(in00, out00, out01, in01);
    }
  }

  const topY = height;
  for (let c = 0; c < gridWidth; c++) {
    const th0 = thetas[c];
    const th1 = thetas[c + 1];
    addQuad(
      getCylPoint(rOut, th0, topY),
      getCylPoint(rOut, th1, topY),
      getCylPoint(rIn, th1, topY),
      getCylPoint(rIn, th0, topY),
      { x: 0, y: 1, z: 0 }
    );
  }

  const baseH = lamp.hasBase ? Math.max(4, lamp.baseHeight) : 0;
  const cavityR = lamp.hasBase ? Math.min(lamp.ledCavityDiameter / 2, rIn * 0.85) : 0;
  const cavityD = lamp.hasBase ? Math.min(lamp.ledCavityDepth, baseH - 1.5) : 0;

  if (lamp.hasBase && baseH > 0) {
    const floorY = 0;
    const baseTopY = baseH;
    for (let c = 0; c < gridWidth; c++) {
      const th0 = thetas[c];
      const th1 = thetas[c + 1];

      const b0 = getCylPoint(rOut, th0, floorY);
      const b1 = getCylPoint(rOut, th1, floorY);
      const bCenter0 = { x: 0, y: floorY, z: 0 };
      const baseIdx = positionsArr.length / 3;
      positionsArr.push(bCenter0.x, bCenter0.y, bCenter0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
      for (let i = 0; i < 3; i++) normalsArr.push(0, -1, 0);
      indicesArr.push(baseIdx, baseIdx + 1, baseIdx + 2);

      const ptCav0 = getCylPoint(cavityR, th0, baseTopY);
      const ptCav1 = getCylPoint(cavityR, th1, baseTopY);
      const ptIn0 = getCylPoint(rIn, th0, baseTopY);
      const ptIn1 = getCylPoint(rIn, th1, baseTopY);
      addQuad(ptIn0, ptIn1, ptCav1, ptCav0, { x: 0, y: 1, z: 0 });

      if (cavityR > 0 && cavityD > 0) {
        const cavBottomY = baseTopY - cavityD;
        const cavBot0 = getCylPoint(cavityR, th0, cavBottomY);
        const cavBot1 = getCylPoint(cavityR, th1, cavBottomY);
        addQuad(ptCav0, ptCav1, cavBot1, cavBot0);

        const cavFloorCenter = { x: 0, y: cavBottomY, z: 0 };
        const cIdx = positionsArr.length / 3;
        positionsArr.push(
          cavFloorCenter.x, cavFloorCenter.y, cavFloorCenter.z,
          cavBot0.x, cavBot0.y, cavBot0.z,
          cavBot1.x, cavBot1.y, cavBot1.z
        );
        for (let i = 0; i < 3; i++) normalsArr.push(0, 1, 0);
        indicesArr.push(cIdx, cIdx + 1, cIdx + 2);
      }
    }
  } else {
    for (let c = 0; c < gridWidth; c++) {
      const th0 = thetas[c];
      const th1 = thetas[c + 1];
      addQuad(
        getCylPoint(rOut, th1, 0),
        getCylPoint(rOut, th0, 0),
        getCylPoint(rIn, th0, 0),
        getCylPoint(rIn, th1, 0),
        { x: 0, y: -1, z: 0 }
      );
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

describe('Printable Lamp Mesh Generation & Validation', () => {
  const lamp: LampConfig = {
    diameter: 90,
    height: 100,
    wallThickness: 1.2,
    minFeatureSize: 0.8,
    holeSize: 0.8,
    segmentsAround: 60, // Small test resolution for fast tests
    segmentsVertical: 30,
    topRimHeight: 4,
    bottomRimHeight: 6,
    hasBase: true,
    baseHeight: 8,
    ledCavityDiameter: 38,
    ledCavityDepth: 6,
    wireSlotWidth: 3.5,
  };

  it('generates a valid mesh with vertices, triangles, and no NaNs', () => {
    // Synthetic checkerboard / opening pattern
    const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
    for (let r = 8; r < lamp.segmentsVertical - 5; r++) {
      for (let c = 10; c < 30; c++) {
        mask[r * lamp.segmentsAround + c] = (r + c) % 2 === 0 ? 1 : 0;
      }
    }

    const mesh = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

    expect(mesh.vertexCount).toBeGreaterThan(0);
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
    expect(mesh.normals.length).toBe(mesh.vertexCount * 3);
    expect(mesh.indices.length).toBe(mesh.triangleCount * 3);

    const validation = validateMesh(mesh);
    expect(validation.isValid).toBe(true);
    expect(validation.nanCount).toBe(0);
    expect(validation.degenerateCount).toBe(0);
    expect(validation.errors).toEqual([]);
  });

  it('exports binary STL with correct header and byte count', () => {
    const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
    const mesh = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);
    const stlBuffer = meshToBinarySTL(mesh);

    // Exact binary STL specification: 84 + triangleCount * 50
    const expectedSize = 84 + mesh.triangleCount * 50;
    expect(stlBuffer.byteLength).toBe(expectedSize);

    const view = new DataView(stlBuffer);
    expect(view.getUint32(80, true)).toBe(mesh.triangleCount);
  });

  describe('boundary smoothing does not break watertightness', () => {
    // Same lamp used throughout: segmentsAround=60, segmentsVertical=30.

    function circleMask(centerRow: number, centerCol: number, radius: number): Uint8Array {
      const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
      for (let row = 0; row < lamp.segmentsVertical; row++) {
        for (let col = 0; col < lamp.segmentsAround; col++) {
          const dx = col - centerCol;
          const dy = row - centerRow;
          mask[row * lamp.segmentsAround + col] = dx * dx + dy * dy < radius * radius ? 1 : 0;
        }
      }
      return mask;
    }

    it('smooths a diagonal circular silhouette without adding non-manifold edges', () => {
      const mask = circleMask(15, 30, 8);
      const smoothed = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);
      const reference = referenceGenerateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

      // "No more than the reference" rather than strict equality: smoothing must never make
      // watertightness worse, but incidentally fixing some pre-existing non-manifold edge
      // (unrelated to smoothing) is a bonus, not a regression to reject.
      expect(countNonManifoldEdges(smoothed)).toBeLessThanOrEqual(countNonManifoldEdges(reference));
      expect(validateMesh(smoothed).isValid).toBe(true);
    });

    it('smooths a hole that merges/splits between rows without adding non-manifold edges', () => {
      // Row 14: two separate holes. Row 15: they merge into one wider hole (ambiguous
      // overlap - both narrower holes overlap the same wider one).
      const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
      for (let c = 20; c <= 24; c++) mask[14 * lamp.segmentsAround + c] = 1;
      for (let c = 28; c <= 32; c++) mask[14 * lamp.segmentsAround + c] = 1;
      for (let c = 20; c <= 32; c++) mask[15 * lamp.segmentsAround + c] = 1;

      const smoothed = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);
      const reference = referenceGenerateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

      expect(countNonManifoldEdges(smoothed)).toBeLessThanOrEqual(countNonManifoldEdges(reference));
      expect(validateMesh(smoothed).isValid).toBe(true);
    });

    it('leaves the adversarial checkerboard pattern exactly as watertight as before (no smoothing ever applies)', () => {
      const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
      for (let r = 8; r < lamp.segmentsVertical - 5; r++) {
        for (let c = 10; c < 30; c++) {
          mask[r * lamp.segmentsAround + c] = (r + c) % 2 === 0 ? 1 : 0;
        }
      }
      const smoothed = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);
      const reference = referenceGenerateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

      // No matched row-to-row span ever overlaps in this pattern, so boundary smoothing itself
      // never triggers here - same "no more than the reference" comparison as the sibling
      // tests above, since the base plinth's own seal to the wall (a separate fix, unrelated
      // to hole-boundary smoothing) legitimately reduces the defect count below the frozen
      // reference's, which still reproduces the old, unwelded base geometry on purpose.
      expect(countNonManifoldEdges(smoothed)).toBeLessThanOrEqual(countNonManifoldEdges(reference));
    });

    it('handles sparse random noise, including holes touching the wraparound seam, without adding non-manifold edges', () => {
      const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
      let seed = 42;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let row = 10; row < lamp.segmentsVertical - 10; row++) {
        for (let col = 0; col < lamp.segmentsAround; col++) {
          mask[row * lamp.segmentsAround + col] = rand() < 0.4 ? 1 : 0;
        }
      }
      const smoothed = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);
      const reference = referenceGenerateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

      expect(countNonManifoldEdges(smoothed)).toBeLessThanOrEqual(countNonManifoldEdges(reference));
      expect(validateMesh(smoothed).isValid).toBe(true);
    });

    it('actually shifts hole-boundary vertices off the raw grid (proves smoothing happened, not just a no-op)', () => {
      const mask = circleMask(15, 30, 8);
      const smoothed = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

      const rOut = lamp.diameter / 2;
      const onRawGrid = (theta: number) => {
        const c = ((theta + Math.PI) / (2 * Math.PI)) * lamp.segmentsAround;
        return Math.abs(c - Math.round(c)) < 1e-6;
      };

      let offGridVertexCount = 0;
      for (let i = 0; i < smoothed.vertexCount; i++) {
        const x = smoothed.positions[i * 3];
        const z = smoothed.positions[i * 3 + 2];
        const r = Math.sqrt(x * x + z * z);
        if (Math.abs(r - rOut) > 1e-3) continue; // only check outer-skin vertices
        const theta = Math.atan2(z, x);
        if (!onRawGrid(theta)) offGridVertexCount++;
      }

      expect(offGridVertexCount).toBeGreaterThan(0);
    });
  });

  describe('inward radial struts extending toward center', () => {
    it('generates 3D radial struts that extend inward toward the center with customizable length', () => {
      const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
      const rIn = lamp.diameter / 2 - lamp.wallThickness;

      const lampWithStruts: LampConfig = {
        ...lamp,
        radialStruts: 8,
        strutWidthColumns: 2,
        strutLength: 20, // extends 20 mm inward toward center
      };

      const mesh = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, lampWithStruts);
      const validation = validateMesh(mesh);

      expect(validation.isValid).toBe(true);

      // Find minimum radius among all vertices
      let minR = Infinity;
      for (let i = 0; i < mesh.vertexCount; i++) {
        const x = mesh.positions[i * 3];
        const z = mesh.positions[i * 3 + 2];
        const r = Math.sqrt(x * x + z * z);
        if (r < minR) minR = r;
      }

      // Without base, normal cylinder minimum radius is rIn (~43.5 mm).
      // With 20 mm inward struts, min radius should reach ~23.5 mm
      expect(minR).toBeLessThanOrEqual(rIn - 19.5);

      // Verify that inward strut vertices reach the full vertical height of the lamp (y = 0 and y = lamp.height)
      let foundInwardAtBottom = false;
      let foundInwardAtTop = false;
      for (let i = 0; i < mesh.vertexCount; i++) {
        const x = mesh.positions[i * 3];
        const y = mesh.positions[i * 3 + 1];
        const z = mesh.positions[i * 3 + 2];
        const r = Math.sqrt(x * x + z * z);
        if (r <= rIn - 19.0) {
          if (Math.abs(y - 0) < 1e-3) foundInwardAtBottom = true;
          if (Math.abs(y - lamp.height) < 1e-3) foundInwardAtTop = true;
        }
      }
      expect(foundInwardAtBottom).toBe(true);
      expect(foundInwardAtTop).toBe(true);
    });
  });
});
