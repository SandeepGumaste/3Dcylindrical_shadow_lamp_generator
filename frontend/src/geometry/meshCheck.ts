import type { MeshCheck } from '../contracts/outputs';
export type { MeshCheck };

/**
 * Topological + geometric printability checks on an indexed triangle mesh. Topology is checked
 * on vertex indices (the shell builders share vertices), so a pass means the surface is a closed,
 * consistently oriented 2-manifold, not merely "looks closed".
 */
export function checkMesh(positions: Float32Array, indices: Uint32Array): MeshCheck {
  const T = indices.length / 3;
  const V = positions.length / 3;
  const errors: string[] = [];

  const fwd = new Float64Array(T * 3);
  const rev = new Float64Array(T * 3);
  let degenerate = 0;
  let vol6 = 0;
  for (let t = 0; t < T; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    fwd[t * 3] = a * V + b; fwd[t * 3 + 1] = b * V + c; fwd[t * 3 + 2] = c * V + a;
    rev[t * 3] = b * V + a; rev[t * 3 + 1] = c * V + b; rev[t * 3 + 2] = a * V + c;

    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (0.5 * Math.hypot(nx, ny, nz) < 1e-9 || a === b || b === c || c === a) degenerate++;
    vol6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }

  fwd.sort();
  rev.sort();
  let bad = 0;
  for (let i = 0; i < fwd.length; i++) {
    if (i > 0 && fwd[i] === fwd[i - 1]) bad++; // directed edge used twice -> non-manifold/flipped
    if (fwd[i] !== rev[i]) bad++;               // no opposite twin
  }

  const signedVolume = vol6 / 6;
  if (T === 0) errors.push('Mesh is empty.');
  if (bad > 0) errors.push(`${bad} edges are not shared by exactly two consistently oriented triangles.`);
  if (degenerate > 0) errors.push(`${degenerate} degenerate triangles.`);
  if (T > 0 && !(signedVolume > 0)) errors.push('Signed volume is not positive (inverted normals).');

  return {
    triangleCount: T,
    watertight: T > 0 && bad === 0,
    badEdges: bad,
    degenerateTriangles: degenerate,
    signedVolume,
    errors,
  };
}
