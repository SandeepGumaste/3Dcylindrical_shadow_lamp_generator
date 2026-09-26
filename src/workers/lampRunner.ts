import { GrayImage, HalftoneOptions, LampConfig, LightConfig } from '../types';
import { WorkerInputMessage, WorkerOutputMessage } from './generateLamp.worker';
import { solveInverseShadow, simulateShadowProjection } from '../shadow/solver';
import { generateCylindricalMask } from '../shadow/halftone';
import { generateLampMesh, validateMesh } from '../geometry/mesh';
import { meshToBinarySTL } from '../geometry/stl';

export interface GenerationProgress {
  percent: number;
  message: string;
  step: string;
}

export interface GenerationResult {
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
}

let activeWorker: Worker | null = null;

export async function runGeneration(
  grayImage: GrayImage,
  lamp: LampConfig,
  light: LightConfig,
  halftoneOptions: HalftoneOptions,
  onProgress?: (p: GenerationProgress) => void
): Promise<GenerationResult> {
  // Terminate previous worker if running
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }

  // Attempt Web Worker first
  try {
    const worker = new Worker(
      new URL('./generateLamp.worker.ts', import.meta.url),
      { type: 'module' }
    );
    activeWorker = worker;

    return await new Promise<GenerationResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOutputMessage>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          if (onProgress && msg.percent !== undefined && msg.message) {
            onProgress({
              percent: msg.percent,
              message: msg.message,
              step: msg.step ?? '',
            });
          }
        } else if (msg.type === 'done' && msg.result) {
          worker.terminate();
          if (activeWorker === worker) activeWorker = null;
          resolve(msg.result);
        } else if (msg.type === 'error') {
          worker.terminate();
          if (activeWorker === worker) activeWorker = null;
          reject(new Error(msg.error || 'Worker generation error'));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        if (activeWorker === worker) activeWorker = null;
        reject(err);
      };

      const payload: WorkerInputMessage = {
        type: 'generate',
        grayImage,
        lamp,
        light,
        halftoneOptions,
        simResolution: 256,
      };

      worker.postMessage(payload);
    });
  } catch (workerErr) {
    console.warn('Web Worker initialization fallback to main thread:', workerErr);
    // Main thread execution fallback
    if (onProgress) onProgress({ percent: 10, message: 'Tracing inverse rays...', step: 'inverse' });
    await new Promise((r) => setTimeout(r, 10));

    const solverResult = solveInverseShadow(grayImage, lamp, light);

    if (onProgress) onProgress({ percent: 40, message: 'Creating halftone perforation mask...', step: 'halftone' });
    await new Promise((r) => setTimeout(r, 10));

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


    if (onProgress) onProgress({ percent: 65, message: 'Simulating shadow projection...', step: 'sim' });
    await new Promise((r) => setTimeout(r, 10));

    const simResult = simulateShadowProjection(
      mask,
      lamp.segmentsAround,
      lamp.segmentsVertical,
      lamp,
      light,
      grayImage,
      256
    );

    if (onProgress) onProgress({ percent: 85, message: 'Constructing 3D watertight mesh...', step: 'mesh' });
    await new Promise((r) => setTimeout(r, 10));

    const effectiveLamp: LampConfig = {
      ...lamp,
      radialStruts: light.radialStruts ?? lamp.radialStruts,
      strutWidthColumns: light.strutWidthColumns ?? lamp.strutWidthColumns ?? 2,
      strutLength: light.strutLength ?? lamp.strutLength ?? (lamp.diameter / 2),
    };
    const mesh = generateLampMesh(mask, lamp.segmentsAround, lamp.segmentsVertical, effectiveLamp);
    const validation = validateMesh(mesh);

    if (onProgress) onProgress({ percent: 95, message: 'Encoding binary STL...', step: 'stl' });
    await new Promise((r) => setTimeout(r, 10));

    const stlBuffer = meshToBinarySTL(mesh);

    return {
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
    };
  }
}
