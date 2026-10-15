import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createGrayImage } from '../../image/grayscale';
import { solveInverseShadow } from '../../shadow/solver';
import { generateCylindricalMask } from '../../shadow/halftone';
import { generateLampMesh } from '../mesh';
import { meshToBinarySTL } from '../stl';
import { LampConfig, LightConfig } from '../../types';

// Guards the cylinder-lamp pipeline (solve -> mask -> mesh -> STL) against byte-level drift
// while the tealight/bowl modes are added alongside it.
const lamp: LampConfig = {
  diameter: 80, height: 55, wallThickness: 1.2, minFeatureSize: 0.8, holeSize: 0.8,
  segmentsAround: 120, segmentsVertical: 48, topRimHeight: 4, bottomRimHeight: 6,
  hasBase: true, baseHeight: 8, ledCavityDiameter: 38, ledCavityDepth: 6,
  wireSlotWidth: 3.5, strutLength: 4,
};
const light: LightConfig = {
  position: { x: 0, y: 32, z: 0 }, ledDiameter: 5, target: 'tabletop', tableRadius: 220,
  projectionDistance: 250, projectionWidth: 250, projectionHeight: 250,
  radialStruts: 12, strutThicknessRatio: 0.15, strutWidthColumns: 2, strutLength: 4,
};

function testImage() {
  const n = 128;
  const img = createGrayImage(n, n, 1);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - 50, dy = y - 70;
      const inDisc = dx * dx + dy * dy < 30 * 30;
      const inBar = x > 80 && x < 110 && y > 20 && y < 50;
      if (inDisc || inBar) img.pixels[y * n + x] = 0;
    }
  }
  return img;
}

describe('cylinder mode snapshot', () => {
  it('produces a byte-identical STL for fixed inputs', () => {
    const solved = solveInverseShadow(testImage(), lamp, light);
    const mask = generateCylindricalMask(
      solved.cylindricalIntensity, lamp.segmentsAround, lamp.segmentsVertical, lamp,
      { mode: 'halftone', threshold: 0.5, bayerSize: 4, preserveBridges: true,
        radialStruts: light.radialStruts, strutWidthColumns: 2, strutLength: 4 }
    );
    const mesh = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical,
      { ...lamp, radialStruts: light.radialStruts, strutWidthColumns: 2, strutLength: 4 });
    const stl = Buffer.from(meshToBinarySTL(mesh));
    const hash = createHash('sha256').update(stl).digest('hex');
    expect({ bytes: stl.length, triangles: mesh.triangleCount, hash }).toMatchInlineSnapshot(`
      {
        "bytes": 678484,
        "hash": "882784140dc0bc5381473f0a28eebec16928ff24054d8b1852b1b82626c955e0",
        "triangles": 13568,
      }
    `);
  });
});
