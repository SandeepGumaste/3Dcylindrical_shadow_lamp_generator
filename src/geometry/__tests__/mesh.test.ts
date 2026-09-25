import { describe, it, expect } from 'vitest';
import { generateLampMesh, validateMesh } from '../mesh';
import { meshToBinarySTL } from '../stl';
import { LampConfig } from '../../types';

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
});
