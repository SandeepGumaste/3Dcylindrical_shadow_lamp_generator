import { GrayImage, LampConfig, LightConfig, ShadowAccumulator } from '../types';
import { getProjectionPlanePoint, castInverseRay, ProjectionPlane, castForwardRayToPlane } from './projection';
import { thetaToU } from '../geometry/cylinder';
import { sampleBilinear } from '../image/sampling';
import { Vec3 } from '../geometry/vectors';

export interface SolverResult {
  cylindricalIntensity: Float32Array; // grid: segmentsAround x segmentsVertical
  gridWidth: number;   // segmentsAround
  gridHeight: number;  // segmentsVertical
  accumulator: ShadowAccumulator;
  illuminatedUvBounds: {
    minU: number;
    maxU: number;
    minV: number;
    maxV: number;
  };
}

export interface ShadowSimulationResult {
  simulatedShadow: GrayImage;
  meanAbsoluteError: number;
  similarityPercentage: number;
}


/**
 * Solves the inverse shadow projection:
 * For every pixel in the desired shadow image (either on a tabletop or vertical screen),
 * cast an inverse ray back to the light source and find the cylinder intersection.
 * Accumulate desired intensity onto the cylindrical shadow mask.
 */
export function solveInverseShadow(
  shadowImage: GrayImage,
  lamp: LampConfig,
  light: LightConfig
): SolverResult {
  const gridWidth = lamp.segmentsAround;
  const gridHeight = lamp.segmentsVertical;
  const cellCount = gridWidth * gridHeight;

  const sum = new Float32Array(cellCount);
  const weight = new Float32Array(cellCount);
  const imgW = shadowImage.width;
  const imgH = shadowImage.height;

  let minU = 1;
  let maxU = 0;
  let minV = 1;
  let maxV = 0;

  const isTabletop = light.target === 'tabletop';

  if (isTabletop) {
    // TABLETOP RADIAL PROJECTION (360° around lamp onto table plane Y = 0)
    const tableRadius = light.tableRadius || 220;
    const lampRadius = lamp.diameter / 2;
    const lightY = Math.max(light.position.y, 10);

    for (let py = 0; py < imgH; py++) {
      const v = (py + 0.5) / imgH;
      const z = (v - 0.5) * 2 * tableRadius;

      for (let px = 0; px < imgW; px++) {
        const u = (px + 0.5) / imgW;
        const x = (u - 0.5) * 2 * tableRadius;
        const r = Math.sqrt(x * x + z * z);

        // Outside lamp base and within tabletop radius
        if (r <= lampRadius || r > tableRadius) continue;

        // Intersection with cylinder at radius lampRadius
        const t = lampRadius / r;
        const hitY = lightY * (1 - t);

        if (hitY < 0 || hitY > lamp.height) continue;

        const theta = Math.atan2(z, x);
        const hitU = thetaToU(theta);
        const hitV = hitY / lamp.height;

        if (hitU < minU) minU = hitU;
        if (hitU > maxU) maxU = hitU;
        if (hitV < minV) minV = hitV;
        if (hitV > maxV) maxV = hitV;

        const col = Math.min(Math.floor(hitU * gridWidth), gridWidth - 1);
        const row = Math.min(Math.floor(hitV * gridHeight), gridHeight - 1);
        const idx = row * gridWidth + col;

        const intensity = shadowImage.pixels[py * imgW + px];
        sum[idx] += intensity;
        weight[idx] += 1;
      }
    }

    // Resolve intensities
    const cylindricalIntensity = new Float32Array(cellCount);
    for (let row = 0; row < gridHeight; row++) {
      const v = (row + 0.5) / gridHeight;
      const y = v * lamp.height;

      for (let col = 0; col < gridWidth; col++) {
        const idx = row * gridWidth + col;
        if (weight[idx] > 0) {
          cylindricalIntensity[idx] = sum[idx] / weight[idx];
        } else {
          // Forward fallback to table
          if (y < lightY) {
            const dy = y - lightY;
            const tTable = -lightY / dy;
            const u = (col + 0.5) / gridWidth;
            const theta = u * 2 * Math.PI - Math.PI;
            const xCyl = lampRadius * Math.cos(theta);
            const zCyl = lampRadius * Math.sin(theta);

            const hitX = light.position.x + tTable * (xCyl - light.position.x);
            const hitZ = light.position.z + tTable * (zCyl - light.position.z);

            const imgU = hitX / (2 * tableRadius) + 0.5;
            const imgV = hitZ / (2 * tableRadius) + 0.5;

            if (imgU >= 0 && imgU <= 1 && imgV >= 0 && imgV <= 1) {
              cylindricalIntensity[idx] = sampleBilinear(shadowImage, imgU, imgV);
            } else {
              cylindricalIntensity[idx] = 1; // background outside table
            }
          } else {
            cylindricalIntensity[idx] = 0; // solid above light height
          }
        }
      }
    }

    return {
      cylindricalIntensity,
      gridWidth,
      gridHeight,
      accumulator: { width: gridWidth, height: gridHeight, sum, weight },
      illuminatedUvBounds: {
        minU: minU > maxU ? 0 : minU,
        maxU: minU > maxU ? 1 : maxU,
        minV: minV > maxV ? 0 : minV,
        maxV: minV > maxV ? 1 : maxV,
      },
    };
  }

  // VERTICAL WALL PROJECTION
  const plane: ProjectionPlane = {
    distance: light.projectionDistance,
    width: light.projectionWidth,
    height: light.projectionHeight,
    yBottom: 0,
  };

  // Step 1: Trace every pixel of the shadow image back to the cylinder
  for (let py = 0; py < imgH; py++) {
    const v = (py + 0.5) / imgH;
    for (let px = 0; px < imgW; px++) {
      const u = (px + 0.5) / imgW;
      const targetPoint = getProjectionPlanePoint(u, v, plane);

      const hit = castInverseRay(light.position, targetPoint, lamp);
      if (!hit) continue;

      const hitU = hit.u;
      const hitV = hit.v;

      if (hitU < minU) minU = hitU;
      if (hitU > maxU) maxU = hitU;
      if (hitV < minV) minV = hitV;
      if (hitV > maxV) maxV = hitV;

      const col = Math.min(Math.floor(hitU * gridWidth), gridWidth - 1);
      const row = Math.min(Math.floor(hitV * gridHeight), gridHeight - 1);
      const idx = row * gridWidth + col;

      const intensity = shadowImage.pixels[py * imgW + px];
      sum[idx] += intensity;
      weight[idx] += 1;
    }
  }

  // Step 2: Resolve intensities from accumulation buffer
  const cylindricalIntensity = new Float32Array(cellCount);
  const radius = lamp.diameter / 2;

  for (let row = 0; row < gridHeight; row++) {
    const v = (row + 0.5) / gridHeight;
    const y = v * lamp.height;

    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      if (weight[idx] > 0) {
        cylindricalIntensity[idx] = sum[idx] / weight[idx];
      } else {
        const u = (col + 0.5) / gridWidth;
        const theta = u * 2 * Math.PI - Math.PI;
        const cylPoint: Vec3 = {
          x: radius * Math.cos(theta),
          y,
          z: radius * Math.sin(theta),
        };

        const projHit = castForwardRayToPlane(light.position, cylPoint, plane);
        if (projHit && projHit.u >= 0 && projHit.u <= 1 && projHit.v >= 0 && projHit.v <= 1) {
          const sampled = sampleBilinear(shadowImage, projHit.u, projHit.v);
          cylindricalIntensity[idx] = sampled;
        } else {
          cylindricalIntensity[idx] = 0;
        }
      }
    }
  }

  return {
    cylindricalIntensity,
    gridWidth,
    gridHeight,
    accumulator: { width: gridWidth, height: gridHeight, sum, weight },
    illuminatedUvBounds: {
      minU: minU > maxU ? 0 : minU,
      maxU: minU > maxU ? 1 : maxU,
      minV: minV > maxV ? 0 : minV,
      maxV: minV > maxV ? 1 : maxV,
    },
  };
}

/**
 * Forward simulation:
 * Simulates the shadow cast onto the projection plane/table by casting rays from the virtual LED
 * through the cylinder mask and evaluating the projected pattern.
 */
export function simulateShadowProjection(
  cylindricalMask: Uint8Array | boolean[] | Float32Array,
  gridWidth: number,
  gridHeight: number,
  lamp: LampConfig,
  light: LightConfig,
  originalImage: GrayImage,
  simResolution = 256
): ShadowSimulationResult {
  const simPixels = new Float32Array(simResolution * simResolution);
  const isTabletop = light.target === 'tabletop';

  let totalDiff = 0;
  let count = 0;

  if (isTabletop) {
    const tableRadius = light.tableRadius || 220;
    const lampRadius = lamp.diameter / 2;
    const lightY = Math.max(light.position.y, 10);

    for (let py = 0; py < simResolution; py++) {
      const v = (py + 0.5) / simResolution;
      const z = (v - 0.5) * 2 * tableRadius;

      for (let px = 0; px < simResolution; px++) {
        const u = (px + 0.5) / simResolution;
        const x = (u - 0.5) * 2 * tableRadius;
        const r = Math.sqrt(x * x + z * z);

        let simulatedVal = 0.0; // default dark background outside table

        if (r <= lampRadius) {
          simulatedVal = 0.0; // solid shadow directly beneath lamp base
        } else if (r <= tableRadius) {
          const t = lampRadius / r;
          const hitY = lightY * (1 - t);

          if (hitY >= 0 && hitY <= lamp.height) {
            const theta = Math.atan2(z, x);
            const hitU = thetaToU(theta);
            const hitV = hitY / lamp.height;

            const col = Math.min(Math.floor(hitU * gridWidth), gridWidth - 1);
            const row = Math.min(Math.floor(hitV * gridHeight), gridHeight - 1);
            const cellIdx = row * gridWidth + col;

            const cellVal = cylindricalMask[cellIdx];
            simulatedVal = typeof cellVal === 'boolean' ? (cellVal ? 1.0 : 0.0) : Number(cellVal);
          }
        }

        const simIdx = py * simResolution + px;
        simPixels[simIdx] = simulatedVal;

        const origVal = sampleBilinear(originalImage, u, v);
        totalDiff += Math.abs(simulatedVal - origVal);
        count++;
      }
    }
  } else {
    // Vertical Wall simulation
    const plane: ProjectionPlane = {
      distance: light.projectionDistance,
      width: light.projectionWidth,
      height: light.projectionHeight,
      yBottom: 0,
    };

    for (let py = 0; py < simResolution; py++) {
      const v = (py + 0.5) / simResolution;
      for (let px = 0; px < simResolution; px++) {
        const u = (px + 0.5) / simResolution;
        const targetPoint = getProjectionPlanePoint(u, v, plane);

        const hit = castInverseRay(light.position, targetPoint, lamp);
        let simulatedVal = 0; // default solid shadow

        if (hit) {
          const col = Math.min(Math.floor(hit.u * gridWidth), gridWidth - 1);
          const row = Math.min(Math.floor(hit.v * gridHeight), gridHeight - 1);
          const cellIdx = row * gridWidth + col;

          const cellVal = cylindricalMask[cellIdx];
          simulatedVal = typeof cellVal === 'boolean' ? (cellVal ? 1.0 : 0.0) : Number(cellVal);
        }

        const simIdx = py * simResolution + px;
        simPixels[simIdx] = simulatedVal;

        const origVal = sampleBilinear(originalImage, u, v);
        totalDiff += Math.abs(simulatedVal - origVal);
        count++;
      }
    }
  }

  const meanAbsoluteError = count > 0 ? totalDiff / count : 0;
  const similarityPercentage = Math.max(0, Math.min(100, (1 - meanAbsoluteError) * 100));

  return {
    simulatedShadow: {
      width: simResolution,
      height: simResolution,
      pixels: simPixels,
    },
    meanAbsoluteError,
    similarityPercentage: Math.round(similarityPercentage * 10) / 10,
  };
}

