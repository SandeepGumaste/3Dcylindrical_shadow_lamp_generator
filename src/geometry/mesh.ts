import { LampConfig, MeshData } from '../types';
import { cross, length, normalize, subtract, Vec3 } from './vectors';

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

  // 1. Generate Wall Cells (Outer, Inner, and Opening Boundary Walls)
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

      // Cell is SOLID: generate outer and inner quad
      const th0 = thetas[col];
      const th1 = thetas[col + 1];

      // Outer quad (facing outward +R)
      const out00 = getCylPoint(rOut, th0, y0);
      const out10 = getCylPoint(rOut, th1, y0);
      const out11 = getCylPoint(rOut, th1, y1);
      const out01 = getCylPoint(rOut, th0, y1);
      addQuad(out00, out10, out11, out01);

      // Inner quad (facing inward -R)
      const in00 = getCylPoint(rIn, th0, y0);
      const in10 = getCylPoint(rIn, th1, y0);
      const in11 = getCylPoint(rIn, th1, y1);
      const in01 = getCylPoint(rIn, th0, y1);
      addQuad(in00, in01, in11, in10); // reverse winding to point inward

      // Check 4 adjacent neighbors to build opening boundary walls (tunnels)
      // North neighbor: row + 1
      const isNorthOpen = row + 1 < gridHeight && mask[(row + 1) * gridWidth + col] === 1;
      if (isNorthOpen) {
        // Wall capping between out01->out11 and in01->in11 at y = y1 (facing +Y)
        addQuad(out01, out11, in11, in01, { x: 0, y: 1, z: 0 });
      }

      // South neighbor: row - 1
      const isSouthOpen = row > 0 && mask[(row - 1) * gridWidth + col] === 1;
      if (isSouthOpen) {
        // Wall capping between out00->out10 and in00->in10 at y = y0 (facing -Y)
        addQuad(out10, out00, in00, in10, { x: 0, y: -1, z: 0 });
      }

      // East neighbor: (col + 1) % gridWidth
      const eastCol = (col + 1) % gridWidth;
      const isEastOpen = mask[row * gridWidth + eastCol] === 1;
      if (isEastOpen) {
        // Wall at theta = th1 (facing +theta)
        addQuad(out10, in10, in11, out11);
      }

      // West neighbor: (col - 1 + gridWidth) % gridWidth
      const westCol = (col - 1 + gridWidth) % gridWidth;
      const isWestOpen = mask[row * gridWidth + westCol] === 1;
      if (isWestOpen) {
        // Wall at theta = th0 (facing -theta)
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

  // 3. Base Generator
  const baseH = lamp.hasBase ? Math.max(4, lamp.baseHeight) : 0;
  const cavityR = lamp.hasBase ? Math.min(lamp.ledCavityDiameter / 2, rIn * 0.85) : 0;
  const cavityD = lamp.hasBase ? Math.min(lamp.ledCavityDepth, baseH - 1.5) : 0;

  if (lamp.hasBase && baseH > 0) {
    // Generate solid mounting base with LED cavity
    // Bottom floor disk at y = 0
    // Floor annulus between cavityR and rOut at y = baseH
    // Floor of cavity at y = baseH - cavityD
    const floorY = 0;
    const baseTopY = baseH;

    for (let c = 0; c < gridWidth; c++) {
      const th0 = thetas[c];
      const th1 = thetas[c + 1];

      // Flat bottom of the entire lamp (facing -Y)
      const b0 = getCylPoint(rOut, th0, floorY);
      const b1 = getCylPoint(rOut, th1, floorY);
      const bCenter0 = { x: 0, y: floorY, z: 0 };
      // Triangle fan piece
      const baseIdx = positionsArr.length / 3;
      positionsArr.push(bCenter0.x, bCenter0.y, bCenter0.z);
      positionsArr.push(b1.x, b1.y, b1.z);
      positionsArr.push(b0.x, b0.y, b0.z);
      for (let i = 0; i < 3; i++) normalsArr.push(0, -1, 0);
      indicesArr.push(baseIdx, baseIdx + 1, baseIdx + 2);

      // Base top annular plate connecting to inner lamp wall (y = baseTopY)
      const ptCav0 = getCylPoint(cavityR, th0, baseTopY);
      const ptCav1 = getCylPoint(cavityR, th1, baseTopY);
      const ptIn0 = getCylPoint(rIn, th0, baseTopY);
      const ptIn1 = getCylPoint(rIn, th1, baseTopY);

      // Facing +Y
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
  } else {
    // No base: simple bottom rim annulus at y = 0
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
