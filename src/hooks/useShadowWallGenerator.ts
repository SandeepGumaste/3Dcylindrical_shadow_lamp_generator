import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_SHADOW_WALL_PARAMS, ShadowWallParams, validateShadowWallParams } from '../geometry/shadowWall/shadowWall';
import { BUNDLED_IMAGES, DEFAULT_IMAGE_ID } from './useTealightGenerator';
import { loadImageToGray } from '../image/loadImage';
import { runShadowWall } from '../workers/shadowWallRunner';
import type { ShadowWallOutput } from '../workers/shadowWallCompute';
import { downloadSTL } from '../geometry/stl';

export const DEFAULT_WALL_IMAGE_ID = DEFAULT_IMAGE_ID;
const NEUTRAL = { invert: false, brightness: 0, contrast: 1, gamma: 1, threshold: 0.5, rotation: 0, flipHorizontal: false } as const;

/** True once the inputs have changed since the model on screen was generated. */
export const isStale = (currentKey: string, generatedKey: string | null, hasResult: boolean) => hasResult && generatedKey !== currentKey;

/** Generate on its own the first time an image is there and whenever the image changes, never for settings. */
export const shouldGenerate = (lastImageKey: string | null, imageKey: string) => lastImageKey === null || lastImageKey !== imageKey;

/** Identifies the inputs of a build: every setting plus which image (bundled id, or upload load id). */
export const inputKey = (params: ShadowWallParams, sampleId: string, uploadId: number) => JSON.stringify([params, sampleId, uploadId]);

export function useShadowWallGenerator(active = true) {
  const [params, setParamsState] = useState<ShadowWallParams>({ ...DEFAULT_SHADOW_WALL_PARAMS });
  const [sampleId, setSampleId] = useState<string>(DEFAULT_WALL_IMAGE_ID);
  const [uploaded, setUploaded] = useState<{ name: string; image: GrayImage; id: number } | null>(null);
  const [result, setResult] = useState<ShadowWallOutput | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const token = useRef(0);

  const [bundled, setBundled] = useState<Record<string, GrayImage>>({});
  useEffect(() => {
    for (const b of BUNDLED_IMAGES) {
      loadImageToGray(b.url, { targetResolution: 512, adjustments: { ...NEUTRAL } })
        .then(({ grayImage }) => setBundled((m) => ({ ...m, [b.id]: grayImage })))
        .catch((e: Error) => setRunError(`Could not load the ${b.name} image: ${e.message}`));
    }
  }, []);

  const image = useMemo<GrayImage | null>(() => {
    if (sampleId === 'upload' && uploaded) return uploaded.image;
    if (sampleId in bundled) return bundled[sampleId];
    return null; // bundled image still loading
  }, [sampleId, uploaded, bundled]);
  const imageName = sampleId === 'upload' && uploaded ? uploaded.name : sampleId;
  const uploadId = sampleId === 'upload' ? uploaded?.id ?? 0 : 0;

  const errors = useMemo(() => validateShadowWallParams(params), [params]);
  const key = useMemo(() => inputKey(params, sampleId, uploadId), [params, sampleId, uploadId]);
  const stale = isStale(key, generatedKey, result !== null);

  const generate = useCallback(() => {
    if (errors.length || !image) return;
    const my = ++token.current;
    const k = key;
    setBusy(true);
    setRunError(null);
    runShadowWall({ image, params })
      .then((r) => { if (token.current === my) { setResult(r); setGeneratedKey(k); setBusy(false); } })
      .catch((e: Error) => { if (token.current === my) { setRunError(e.message); setBusy(false); } });
  }, [errors, image, params, key]);

  // Generate on first load and when the image changes (bundled pick or upload); settings wait for the button.
  const generateRef = useRef(generate);
  generateRef.current = generate;
  const lastImageKey = useRef<string | null>(null);
  const imageKey = `${sampleId}:${uploadId}`;
  useEffect(() => {
    if (!active || !image || !shouldGenerate(lastImageKey.current, imageKey)) return;
    lastImageKey.current = imageKey;
    generateRef.current();
  }, [active, image, imageKey]);

  const upload = async (file: File) => {
    const { grayImage } = await loadImageToGray(file, { targetResolution: 512, adjustments: { ...NEUTRAL } });
    setUploaded((u) => ({ name: file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'image', image: grayImage, id: (u?.id ?? 0) + 1 }));
    setSampleId('upload');
  };

  const download = () => {
    if (!result) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadSTL(result.stl, `shadow-wall-${imageName}-${date}.stl`);
  };

  return {
    params, errors,
    setParams: (patch: Partial<ShadowWallParams>) => setParamsState((p) => ({ ...p, ...patch })),
    sampleId, selectSample: setSampleId, upload, imageName, image,
    result, busy, stale, runError, generate, download,
    reset: () => setParamsState({ ...DEFAULT_SHADOW_WALL_PARAMS }),
  };
}

export type ShadowWallController = ReturnType<typeof useShadowWallGenerator>;
