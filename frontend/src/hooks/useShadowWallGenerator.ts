import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_SHADOW_WALL_PARAMS, type ShadowWallParams } from '../contracts/shadowWall';
import { BUNDLED_IMAGES, DEFAULT_IMAGE_ID } from './useTealightGenerator';
import { loadImageToGray } from '../image/loadImage';
import { applyFit, previewRequest } from '../api/requests';
import { toWallResult, type WallResult } from '../api/results';
import { saveLast } from '../api/downloads';
import { newGenerationSession } from '../api/unauthorized';

export const DEFAULT_WALL_IMAGE_ID = DEFAULT_IMAGE_ID;
const NEUTRAL = { invert: false, brightness: 0, contrast: 1, gamma: 1, threshold: 0.5, rotation: 0, flipHorizontal: false } as const;

/** True once the inputs have changed since the model on screen was generated. */
export const isStale = (currentKey: string, generatedKey: string | null, hasResult: boolean) => hasResult && generatedKey !== currentKey;

/** Generate on its own the first time an image is there and whenever the image changes, never for settings. */
export const shouldGenerate = (lastImageKey: string | null, imageKey: string) => lastImageKey === null || lastImageKey !== imageKey;

/** Identifies the inputs of a build: every setting plus which image (bundled id, or upload load id). */
export const inputKey = (params: ShadowWallParams, sampleId: string, uploadId: number) => JSON.stringify([params, sampleId, uploadId]);

export const FIT_NOTE = 'No size fits: the part of the image nearest the axis is hidden under the base and foot, or the shape is moved too far off the axis. The size was set to the smallest.';

export function useShadowWallGenerator(active = true) {
  const [params, setParamsState] = useState<ShadowWallParams>({ ...DEFAULT_SHADOW_WALL_PARAMS });
  const [sampleId, setSampleId] = useState<string>(DEFAULT_WALL_IMAGE_ID);
  const [uploaded, setUploaded] = useState<{ name: string; image: GrayImage; id: number } | null>(null);
  const [result, setResult] = useState<WallResult | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fitNote, setFitNote] = useState<string | null>(null);
  const session = useMemo(newGenerationSession, []);
  const lastName = useRef('image');
  const paramsRef = useRef(params);
  paramsRef.current = params;

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
  const key = useMemo(() => inputKey(params, sampleId, uploadId), [params, sampleId, uploadId]);
  const stale = isStale(key, generatedKey, result !== null);

  /** `fit` asks the server to shrink the shadow size first so none of the image is cut off. */
  const run = useCallback((fit: boolean) => {
    if (!image) return;
    const sent = paramsRef.current;
    const name = imageName;
    setBusy(true);
    setRunError(null);
    setErrors([]);
    session.run(previewRequest('wall', sent, { image, fit })).then((o) => {
      if (o.kind === 'stale') return;
      setBusy(false);
      if (o.kind === 'invalid') return setErrors(o.errors);
      if (o.kind === 'error') return setRunError(o.message);
      const applied = applyFit(sent, o.value.meta.fit);
      if (o.value.meta.fit) {
        if (applied.params !== sent) setParamsState((p) => ({ ...p, shadowSize: applied.params.shadowSize }));
        setFitNote(applied.ok ? null : FIT_NOTE);
      }
      setResult(toWallResult(o.value));
      setGeneratedKey(inputKey(applied.params, sampleId, uploadId));
      lastName.current = name;
    });
  }, [image, imageName, sampleId, uploadId, session]);

  // Generate on first load and when the image changes (bundled pick or upload), with the fit; settings wait for the button.
  const runRef = useRef(run);
  runRef.current = run;
  const lastImageKey = useRef<string | null>(null);
  const imageKey = `${sampleId}:${uploadId}`;
  useEffect(() => {
    if (!active || !image || !shouldGenerate(lastImageKey.current, imageKey)) return;
    lastImageKey.current = imageKey;
    runRef.current(true);
  }, [active, image, imageKey]);

  const upload = async (file: File) => {
    const { grayImage } = await loadImageToGray(file, { targetResolution: 512, adjustments: { ...NEUTRAL } });
    setUploaded((u) => ({ name: file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'image', image: grayImage, id: (u?.id ?? 0) + 1 }));
    setSampleId('upload');
  };

  const download = () => {
    if (!result) return;
    const date = new Date().toISOString().slice(0, 10);
    void saveLast(session, 'stl', `shadow-wall-${lastName.current}-${date}.stl`, setRunError);
  };

  return {
    params, errors,
    setParams: (patch: Partial<ShadowWallParams>) => { setErrors([]); setParamsState((p) => ({ ...p, ...patch })); },
    sampleId, selectSample: setSampleId, upload, imageName, image,
    result, busy, stale, runError, generate: () => run(false), download, fitShadow: () => run(true), fitNote,
    reset: () => { setErrors([]); setParamsState({ ...DEFAULT_SHADOW_WALL_PARAMS }); },
  };
}

export type ShadowWallController = ReturnType<typeof useShadowWallGenerator>;
