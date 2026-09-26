import { GrayImage, HalftoneOptions, LampConfig, LightConfig } from '../types';
import { solveInverseShadow, simulateShadowProjection } from '../shadow/solver';
import { generateCylindricalMask } from '../shadow/halftone';
import { generateLampMesh, validateMesh } from '../geometry/mesh';
import { meshToBinarySTL } from '../geometry/stl';

export interface WorkerInputMessage {
  type: 'generate';
  grayImage: GrayImage;
  lamp: LampConfig;
  light: LightConfig;
  halftoneOptions: HalftoneOptions;
  simResolution?: number;
}

export interface WorkerOutputMessage {
  type: 'progress' | 'done' | 'error';
  percent?: number;
  message?: string;
  step?: string;
  error?: string;
  result?: {
    cylindricalIntensity: Float32Array;
    mask: Uint8Array;
    gridWidth: number;
    gridHeight: number;
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    vertexCount: number;
    triangleCount: number;
    isValidMesh: boolean;
    validationErrors: string[];
    simulatedShadow: GrayImage;
    meanAbsoluteError: number;
    similarityPercentage: number;
    stlBuffer: ArrayBuffer;
  };
}

self.onmessage = (e: MessageEvent<WorkerInputMessage>) => {
  const data = e.data;
  if (data.type !== 'generate') return;

  try {
    const { grayImage, lamp, light, halftoneOptions, simResolution = 256 } = data;

    // 1. Inverse Ray Projection
    self.postMessage({
      type: 'progress',
      percent: 15,
      step: 'inverse_projection',
      message: 'Calculating inverse ray projections...',
    } as WorkerOutputMessage);

    const solverResult = solveInverseShadow(grayImage, lamp, light);

    // 2. Halftone / Perforation Mask
    self.postMessage({
      type: 'progress',
      percent: 40,
      step: 'halftone',
      message: 'Generating halftone perforation matrix & radial structural ribs...',
    } as WorkerOutputMessage);

    const mask = generateCylindricalMask(
      solverResult.cylindricalIntensity,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      {
        ...halftoneOptions,
        radialStruts: light.radialStruts,
        strutWidthColumns: light.strutWidthColumns ?? 2,
        strutLength: light.strutLength ?? lamp.strutLength ?? (lamp.diameter / 2),
      }
    );


    // 3. Forward Shadow Simulation
    self.postMessage({
      type: 'progress',
      percent: 60,
      step: 'simulation',
      message: 'Simulating optical shadow projection...',
    } as WorkerOutputMessage);

    const simResult = simulateShadowProjection(
      mask,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      light,
      grayImage,
      simResolution
    );

    // 4. Watertight 3D Mesh Generation
    self.postMessage({
      type: 'progress',
      percent: 80,
      step: 'mesh',
      message: 'Building 3D-printable watertight geometry...',
    } as WorkerOutputMessage);

    const effectiveLamp: LampConfig = {
      ...lamp,
      radialStruts: light.radialStruts ?? lamp.radialStruts,
      strutWidthColumns: light.strutWidthColumns ?? lamp.strutWidthColumns ?? 2,
      strutLength: light.strutLength ?? lamp.strutLength ?? (lamp.diameter / 2),
    };
    const mesh = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, effectiveLamp);
    const validation = validateMesh(mesh);

    // 5. Binary STL Generation
    self.postMessage({
      type: 'progress',
      percent: 95,
      step: 'stl',
      message: 'Encoding binary STL file...',
    } as WorkerOutputMessage);

    const stlBuffer = meshToBinarySTL(mesh);

    // Return complete payload with Transferables for zero-copy performance
    const response: WorkerOutputMessage = {
      type: 'done',
      percent: 100,
      message: 'Geometry generation complete!',
      result: {
        cylindricalIntensity: solverResult.cylindricalIntensity,
        mask,
        gridWidth: lamp.segmentsAround,
        gridHeight: lamp.segmentsVertical,
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
        vertexCount: mesh.vertexCount,
        triangleCount: mesh.triangleCount,
        isValidMesh: validation.isValid,
        validationErrors: validation.errors,
        simulatedShadow: simResult.simulatedShadow,
        meanAbsoluteError: simResult.meanAbsoluteError,
        similarityPercentage: simResult.similarityPercentage,
        stlBuffer,
      },
    };

    // Transfer buffers to avoid cloning overhead
    self.postMessage(response, [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.indices.buffer,
      stlBuffer,
    ] as any);
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      error: err?.message || 'Error generating lamp geometry',
    } as WorkerOutputMessage);
  }
};
