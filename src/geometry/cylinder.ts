import { Vec3, normalize } from './vectors';
import { Ray, createRay } from './ray';

export interface CylinderHit {
  point: Vec3;
  t: number;
  theta: number;
  y: number;
  u: number;
  v: number;
  normal: Vec3;
}

export interface CylinderParams {
  radius: number;
  height: number;
  yMin?: number;
  yMax?: number;
}

/**
 * Normalizes theta to [0, 2*PI) or [-PI, PI]
 */
export function thetaToU(theta: number): number {
  let normalized = (theta + Math.PI) / (2 * Math.PI);
  // wrap around if needed
  normalized = ((normalized % 1) + 1) % 1;
  return normalized;
}

export function uToTheta(u: number): number {
  return u * 2 * Math.PI - Math.PI;
}

/**
 * Analytical ray/cylinder intersection.
 * Cylinder axis is aligned with Y axis at (0, y, 0).
 * Cylinder equation: x^2 + z^2 = R^2
 * Bounds: yMin <= y <= yMax (default 0 <= y <= height)
 */
export function intersectCylinder(
  rayOrOrigin: Ray | Vec3,
  directionOrTarget: Vec3,
  radius: number,
  height: number,
  yMin = 0,
  yMax?: number,
  isTargetPoint = false
): CylinderHit | null {
  const yUpper = yMax !== undefined ? yMax : height;

  let ray: Ray;
  if ('direction' in rayOrOrigin) {
    ray = rayOrOrigin;
  } else {
    const dir = isTargetPoint
      ? {
          x: directionOrTarget.x - rayOrOrigin.x,
          y: directionOrTarget.y - rayOrOrigin.y,
          z: directionOrTarget.z - rayOrOrigin.z,
        }
      : directionOrTarget;
    ray = createRay(rayOrOrigin, dir);
  }

  const ox = ray.origin.x;
  const oy = ray.origin.y;
  const oz = ray.origin.z;

  const dx = ray.direction.x;
  const dy = ray.direction.y;
  const dz = ray.direction.z;

  const A = dx * dx + dz * dz;

  // Ray is parallel to the Y-axis
  if (A < 1e-12) {
    return null;
  }

  const B = 2 * (ox * dx + oz * dz);
  const C = ox * ox + oz * oz - radius * radius;

  const discriminant = B * B - 4 * A * C;

  // Misses infinite cylinder
  if (discriminant < -1e-9) {
    return null;
  }

  // Handle numerical precision for tangent rays
  const safeDisc = Math.max(0, discriminant);
  const sqrtDisc = Math.sqrt(safeDisc);

  const t1 = (-B - sqrtDisc) / (2 * A);
  const t2 = (-B + sqrtDisc) / (2 * A);

  const EPSILON = 1e-6;
  const candidates: number[] = [];

  if (t1 > EPSILON) candidates.push(t1);
  if (t2 > EPSILON) candidates.push(t2);

  // Sort smallest positive t first
  candidates.sort((a, b) => a - b);

  for (const t of candidates) {
    const hitY = oy + t * dy;
    if (hitY >= yMin && hitY <= yUpper) {
      const hitX = ox + t * dx;
      const hitZ = oz + t * dz;
      const hitPoint: Vec3 = { x: hitX, y: hitY, z: hitZ };

      const theta = Math.atan2(hitZ, hitX);
      const u = thetaToU(theta);
      const span = yUpper - yMin;
      const v = span > 1e-9 ? (hitY - yMin) / span : 0;

      // Normal points outward radially
      const normal: Vec3 = normalize({ x: hitX, y: 0, z: hitZ });

      return {
        point: hitPoint,
        t,
        theta,
        y: hitY,
        u,
        v,
        normal,
      };
    }
  }

  return null;
}
