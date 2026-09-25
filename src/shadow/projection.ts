import { Vec3, normalize, subtract } from '../geometry/vectors';
import { CylinderHit, intersectCylinder, thetaToU } from '../geometry/cylinder';
import { LampConfig, LightConfig } from '../types';

export interface ProjectionPlane {
  distance: number; // distance in Z from center
  width: number;
  height: number;
  yBottom: number;  // lowest Y coordinate on plane
}

/**
 * Maps a normalized UV coordinate on the vertical projection plane (0..1)
 * to a 3D coordinate in space.
 */
export function getProjectionPlanePoint(
  u: number,
  v: number,
  plane: ProjectionPlane
): Vec3 {
  return {
    x: (u - 0.5) * plane.width,
    y: plane.yBottom + v * plane.height,
    z: plane.distance,
  };
}

/**
 * Maps a normalized UV coordinate on the horizontal tabletop / floor (0..1)
 * to a 3D coordinate in space at Y = 0 centered at (0, 0, 0).
 */
export function getTabletopPoint(
  u: number,
  v: number,
  tableRadius: number
): Vec3 {
  return {
    x: (u - 0.5) * 2 * tableRadius,
    y: 0,
    z: (v - 0.5) * 2 * tableRadius,
  };
}

/**
 * Casts a ray from the light source through a projection plane target point,
 * finding the first intersection with the cylindrical lamp.
 */
export function castInverseRay(
  lightPos: Vec3,
  targetPoint: Vec3,
  lamp: LampConfig
): CylinderHit | null {
  const dir = normalize(subtract(targetPoint, lightPos));
  const radius = lamp.diameter / 2;

  // Cylinder extends from y = 0 to y = lamp.height
  return intersectCylinder(
    lightPos,
    dir,
    radius,
    lamp.height,
    0,
    lamp.height
  );
}

/**
 * Forward raycast: from light source through a point on the cylinder onto the vertical projection plane.
 */
export function castForwardRayToPlane(
  lightPos: Vec3,
  cylinderPoint: Vec3,
  plane: ProjectionPlane
): { u: number; v: number; hitPoint: Vec3 } | null {
  const dir = normalize(subtract(cylinderPoint, lightPos));

  // If ray is shooting away from or parallel to projection plane (+Z)
  if (dir.z <= 1e-6) {
    return null;
  }

  const t = (plane.distance - lightPos.z) / dir.z;
  if (t <= 0) return null;

  const hitX = lightPos.x + t * dir.x;
  const hitY = lightPos.y + t * dir.y;
  const hitZ = plane.distance;

  const u = hitX / plane.width + 0.5;
  const v = (hitY - plane.yBottom) / plane.height;

  return {
    u,
    v,
    hitPoint: { x: hitX, y: hitY, z: hitZ },
  };
}

/**
 * Forward raycast: from light source through a point on the cylinder down onto the horizontal table (Y = 0).
 */
export function castForwardRayToTable(
  lightPos: Vec3,
  cylinderPoint: Vec3,
  tableRadius: number
): { u: number; v: number; hitPoint: Vec3; radius: number } | null {
  const dy = cylinderPoint.y - lightPos.y;
  if (dy >= -1e-6) {
    // Ray points upwards or horizontal; will never hit table at Y = 0
    return null;
  }

  // Intersect Y = 0: lightPos.y + t * dy = 0 => t = -lightPos.y / dy
  const t = -lightPos.y / dy;
  if (t <= 0) return null;

  const hitX = lightPos.x + t * (cylinderPoint.x - lightPos.x);
  const hitZ = lightPos.z + t * (cylinderPoint.z - lightPos.z);
  const r = Math.sqrt(hitX * hitX + hitZ * hitZ);

  const u = hitX / (2 * tableRadius) + 0.5;
  const v = hitZ / (2 * tableRadius) + 0.5;

  return {
    u,
    v,
    hitPoint: { x: hitX, y: 0, z: hitZ },
    radius: r,
  };
}

