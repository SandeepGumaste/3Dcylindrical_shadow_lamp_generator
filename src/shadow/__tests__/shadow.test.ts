import { describe, it, expect } from 'vitest';
import { createSyntheticTestImage } from '../../image/loadImage';
import { solveInverseShadow, simulateShadowProjection } from '../solver';
import { generateCylindricalMask } from '../halftone';
import { LampConfig, LightConfig } from '../../types';

describe('Shadow Inverse Projection Solver', () => {
  const lamp: LampConfig = {
    diameter: 90,
    height: 100,
    wallThickness: 1.2,
    minFeatureSize: 0.8,
    holeSize: 0.8,
    segmentsAround: 120, // Fast test resolution
    segmentsVertical: 60,
    topRimHeight: 4,
    bottomRimHeight: 6,
    hasBase: true,
    baseHeight: 8,
    ledCavityDiameter: 38,
    ledCavityDepth: 6,
    wireSlotWidth: 3.5,
  };

  const light: LightConfig = {
    position: { x: 0, y: 50, z: 0 },
    ledDiameter: 5,
    target: 'vertical_wall',
    tableRadius: 220,
    projectionDistance: 250,
    projectionWidth: 250,
    projectionHeight: 250,
    radialStruts: 0,
    strutThicknessRatio: 0.15,
  };

  it('solves inverse projection for synthetic circle image', () => {
    // 128x128 synthetic circle image
    const circleImg = createSyntheticTestImage(128, 'circle');

    const result = solveInverseShadow(circleImg, lamp, light);

    expect(result.cylindricalIntensity.length).toBe(lamp.segmentsAround * lamp.segmentsVertical);

    // Verify non-zero intensity exists in the illuminated sector
    let maxVal = 0;
    let sumVal = 0;
    for (let i = 0; i < result.cylindricalIntensity.length; i++) {
      const v = result.cylindricalIntensity[i];
      if (v > maxVal) maxVal = v;
      sumVal += v;
    }

    expect(maxVal).toBeGreaterThan(0.8);
    expect(sumVal).toBeGreaterThan(10);
  });

  it('generates halftone mask and preserves top & bottom solid rims', () => {
    const circleImg = createSyntheticTestImage(128, 'circle');
    const result = solveInverseShadow(circleImg, lamp, light);

    const mask = generateCylindricalMask(
      result.cylindricalIntensity,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      { mode: 'halftone', threshold: 0.5 }
    );

    expect(mask.length).toBe(lamp.segmentsAround * lamp.segmentsVertical);

    // Check bottom rim is 100% solid (0)
    for (let col = 0; col < lamp.segmentsAround; col++) {
      expect(mask[col]).toBe(0); // Row 0
    }

    // Check top rim is 100% solid (0)
    const topRowStart = (lamp.segmentsVertical - 1) * lamp.segmentsAround;
    for (let col = 0; col < lamp.segmentsAround; col++) {
      expect(mask[topRowStart + col]).toBe(0);
    }

    // Verify open holes exist in the middle
    let openCount = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) openCount++;
    }
    expect(openCount).toBeGreaterThan(0);
  });

  it('forward simulates projected shadow and calculates similarity', () => {
    const circleImg = createSyntheticTestImage(128, 'circle');
    const result = solveInverseShadow(circleImg, lamp, light);
    const mask = generateCylindricalMask(
      result.cylindricalIntensity,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      { mode: 'halftone', threshold: 0.5 }
    );

    const sim = simulateShadowProjection(
      mask,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      light,
      circleImg,
      64
    );

    expect(sim.simulatedShadow.pixels.length).toBe(64 * 64);
    expect(sim.meanAbsoluteError).toBeLessThan(0.6);
    expect(sim.similarityPercentage).toBeGreaterThan(40);
  });

  it('anti-aliases simulated shadow edges instead of producing hard 0/1 steps', () => {
    // A binary perforation mask projected through a point sample per pixel can only ever
    // produce exactly 0 or 1 - every silhouette edge becomes a hard staircase at grid
    // resolution. Supersampling each output pixel should produce intermediate gray values
    // along those edges, proving the jagged boundary has been smoothed.
    const circleImg = createSyntheticTestImage(128, 'circle');
    const result = solveInverseShadow(circleImg, lamp, light);
    const mask = generateCylindricalMask(
      result.cylindricalIntensity,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      { mode: 'binary', threshold: 0.5 }
    );

    const sim = simulateShadowProjection(
      mask,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      light,
      circleImg,
      128
    );

    let intermediateCount = 0;
    for (let i = 0; i < sim.simulatedShadow.pixels.length; i++) {
      const v = sim.simulatedShadow.pixels[i];
      if (v > 0.15 && v < 0.85) intermediateCount++;
    }

    expect(intermediateCount).toBeGreaterThan(0);
  });

  it('solves 360 tabletop radial projection and embeds radial struts matching photo', () => {
    const dragonImg = createSyntheticTestImage(128, 'dragon');
    const tabletopLight: LightConfig = {
      position: { x: 0, y: 32, z: 0 },
      ledDiameter: 5,
      target: 'tabletop',
      tableRadius: 220,
      projectionDistance: 250,
      projectionWidth: 250,
      projectionHeight: 250,
      radialStruts: 36,
      strutThicknessRatio: 0.15,
      strutWidthColumns: 2,
    };

    const result = solveInverseShadow(dragonImg, lamp, tabletopLight);
    expect(result.cylindricalIntensity.length).toBe(lamp.segmentsAround * lamp.segmentsVertical);

    const mask = generateCylindricalMask(
      result.cylindricalIntensity,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      {
        mode: 'halftone',
        threshold: 0.5,
        radialStruts: 36,
        strutWidthColumns: 2,
      }
    );

    // Strut spacing = 120 / 36 = 3 columns
    // Check that every 3rd column is solid (0) in middle rows
    const midRow = Math.floor(lamp.segmentsVertical / 2);
    let solidStrutColCount = 0;
    for (let c = 0; c < lamp.segmentsAround; c += 3) {
      if (mask[midRow * lamp.segmentsAround + c] === 0) {
        solidStrutColCount++;
      }
    }
    expect(solidStrutColCount).toBeGreaterThan(30);

    const sim = simulateShadowProjection(
      mask,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      tabletopLight,
      dragonImg,
      64
    );

    expect(sim.simulatedShadow.pixels.length).toBe(64 * 64);
    expect(sim.similarityPercentage).toBeGreaterThan(30);
  });
});
