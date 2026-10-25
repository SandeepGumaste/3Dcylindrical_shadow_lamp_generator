import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_TEALIGHT_PARAMS, LED_CLEARANCE, type TealightParams } from '../contracts/tealight';
import { DEFAULT_BOWL_PARAMS, type BowlParams } from '../contracts/bowl';
import type { GenerateRequest, Output } from '../contracts/api';
import batmanUrl from '../assets/batman.jpg';
import shivaUrl from '../assets/shiva.jpg';
import hanumanUrl from '../assets/hanuman.png';
import catUrl from '../assets/cat.png';
import { loadImageToGray } from '../image/loadImage';
import { encodeGray, saveBlob, download as downloadFile, type Downloaded } from '../api/client';
import { ApiError } from '../api/errors';
import { newGenerationSession } from '../api/unauthorized';
import { notifyUnauthorized } from '../api/unauthorized';
import { toTealightResult, type TealightResult } from '../api/results';
import { DEFAULT_FLAT_STRIP_PARAMS, type FlatStripParams } from '../contracts/flatStrip';

export type TableMode = 'tealight' | 'bowl';

export const DEFAULT_IMAGE_ID = 'batman';
/** Bundled raster images, loaded once at start-up. */
export const BUNDLED_IMAGES = [
  { id: 'batman', name: 'Batman', url: batmanUrl, params: { imageScale: 85 } as Partial<TealightParams> },
  { id: 'shiva', name: 'Shiva', url: shivaUrl, params: { imageScale: 85, invert: true } as Partial<TealightParams> },
  { id: 'hanuman', name: 'Hanuman', url: hanumanUrl, params: { imageScale: 85 } as Partial<TealightParams> },
  { id: 'cat', name: 'Cat', url: catUrl, params: { imageScale: 80 } as Partial<TealightParams> },
];
/** Settings a bundled image applies when selected; invert is always set so one preset's invert never carries over to the next. */
export function presetParams(id: string): Partial<TealightParams> {
  const s = BUNDLED_IMAGES.find((x) => x.id === id);
  return s ? { invert: DEFAULT_TEALIGHT_PARAMS.invert, ...s.params } : {};
}
export type FlatExport = { ok: true; warnings: string[] } | { ok: false; error: string; errors: string[] };

/** Asks the server for the flat strip zip (each part alone plus all together) and saves it; the server refuses invalid settings and meshes that are not watertight. */
export async function exportFlatStrip(a: {
  image: GrayImage; params: TealightParams; flat: FlatStripParams; name: string;
  request?: typeof downloadFile; save?: (blob: Blob, filename: string) => void;
}): Promise<FlatExport> {
  const req: GenerateRequest = {
    mode: 'flat',
    image: { kind: 'gray', width: 512, height: 512, pixels: encodeGray(a.image.pixels) },
    params: { ...a.params, ...a.flat } as unknown as Record<string, unknown>,
    output: 'zip',
  };
  try {
    const out = await (a.request ?? downloadFile)(req);
    const date = new Date().toISOString().slice(0, 10);
    (a.save ?? saveBlob)(out.blob, `tealight-flat-strip-${a.name}-${date}.zip`);
    return { ok: true, warnings: out.warnings };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) notifyUnauthorized();
    if (e instanceof ApiError) return { ok: false, error: e.message, errors: e.errors?.length ? e.errors : [e.message] };
    const error = 'Download failed. Check your connection and try again.';
    return { ok: false, error, errors: [error] };
  }
}

const NEUTRAL = { invert: false, brightness: 0, contrast: 1, gamma: 1, threshold: 0.5, rotation: 0, flipHorizontal: false } as const;

export function useTealightGenerator(mode: TableMode) {
  const [tParams, setTParams] = useState<TealightParams>({ ...DEFAULT_TEALIGHT_PARAMS, ...BUNDLED_IMAGES[0].params });
  const [bParams, setBParams] = useState<BowlParams>({ ...DEFAULT_BOWL_PARAMS });
  const [sampleId, setSampleId] = useState<string>(DEFAULT_IMAGE_ID);
  const [uploaded, setUploaded] = useState<{ name: string; image: GrayImage; id: number } | null>(null);
  const [result, setResult] = useState<TealightResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const session = useMemo(newGenerationSession, []);
  const lastName = useRef('image');
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [flatParams, setFlatParams] = useState<FlatStripParams>({ ...DEFAULT_FLAT_STRIP_PARAMS });
  const [flatBusy, setFlatBusy] = useState(false);
  const [flatError, setFlatError] = useState<string | null>(null);
  const [flatWarnings, setFlatWarnings] = useState<string[]>([]);
  // The server checks the flat settings, so the reasons come back with a failed download and clear when a setting changes.
  const [flatErrors, setFlatErrors] = useState<string[]>([]);
  useEffect(() => { setFlatError(null); setFlatWarnings([]); setFlatErrors([]); }, [tParams, flatParams]);
  /** Snapshot of the inputs the current `result` was generated from. */
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

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

  const inputKey = useMemo(
    () => JSON.stringify([mode, mode === 'tealight' ? tParams : bParams, sampleId, sampleId === 'upload' ? uploaded?.id : null]),
    [mode, tParams, bParams, sampleId, uploaded],
  );
  /** True once the inputs have changed since the model on screen was generated. */
  const stale = result !== null && generatedKey !== inputKey;

  const generate = useCallback(() => {
    if (!image) return;
    const key = inputKey;
    const name = imageName;
    setBusy(true);
    setRunError(null);
    setErrors([]);
    const req: GenerateRequest = {
      mode,
      image: { kind: 'gray', width: 512, height: 512, pixels: encodeGray(image.pixels) },
      params: (mode === 'tealight' ? tParams : bParams) as unknown as Record<string, unknown>,
      output: 'preview',
    };
    session.run(req).then((o) => {
      if (o.kind === 'stale') return;
      setBusy(false);
      if (o.kind === 'ok') { setResult(toTealightResult(o.value)); setGeneratedKey(key); lastName.current = name; }
      else if (o.kind === 'invalid') setErrors(o.errors);
      else setRunError(o.message);
    });
  }, [mode, image, imageName, tParams, bParams, inputKey, session]);

  // Generate on first load and whenever the image changes (bundled pick or upload), but never for
  // settings changes: those wait for the Generate button. The ref keeps the effect on the image only.
  const generateRef = useRef(generate);
  generateRef.current = generate;
  useEffect(() => {
    if (image) generateRef.current();
  }, [image]);

  const selectSample = (id: string) => {
    setSampleId(id);
    setErrors([]);
    setTParams((p) => ({ ...p, ...presetParams(id) }));
  };

  const upload = async (file: File) => {
    const { grayImage } = await loadImageToGray(file, { targetResolution: 512, adjustments: { ...NEUTRAL } });
    setUploaded((u) => ({ name: file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'image', image: grayImage, id: (u?.id ?? 0) + 1 }));
    setSampleId('upload');
  };

  const setTealight = (patch: Partial<TealightParams>) => {
    setErrors([]);
    setTParams((p) => {
      const next = { ...p, ...patch };
      if (patch.useLed) {
        // keep the top wide enough to carry the socket when LED mode is switched on
        const need = 2 * ((next.tealightDiameter + LED_CLEARANCE) / 2 - 1.5 + 0.5);
        if (next.topDiameter < need) next.topDiameter = Math.ceil(need);
      }
      return next;
    });
  };

  const reset = () => {
    setErrors([]);
    if (mode === 'tealight') setTParams({ ...DEFAULT_TEALIGHT_PARAMS, ...presetParams(sampleId) });
    else setBParams({ ...DEFAULT_BOWL_PARAMS });
  };

  const downloadAs = async (output: Output, filename: string) => {
    setRunError(null);
    try {
      const out = await session.downloadLast(output);
      if (out) saveBlob(out.blob, filename);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) notifyUnauthorized();
      setRunError(e instanceof ApiError ? e.message : 'Download failed. Check your connection and try again.');
    }
  };

  const download = () => {
    if (!result) return;
    const date = new Date().toISOString().slice(0, 10);
    const prefix = result.kind === 'tealight' ? 'tealight-shade' : 'shadow-bowl';
    void downloadAs('stl', `${prefix}-${lastName.current}-${date}.stl`);
  };

  const downloadFlat = async () => {
    if (!image || flatBusy) return;
    setFlatBusy(true);
    setFlatError(null);
    setFlatWarnings([]);
    const r = await exportFlatStrip({ image, params: tParams, flat: flatParams, name: imageName });
    if (r.ok) setFlatWarnings(r.warnings); else { setFlatError(r.error); setFlatErrors(r.errors); }
    setFlatBusy(false);
  };

  const downloadMap = () => {
    if (!result?.hasMap) return;
    const date = new Date().toISOString().slice(0, 10);
    void downloadAs('svg', `tealight-shade-map-${lastName.current}-${date}.svg`);
  };

  return {
    mode, tParams, bParams, setTealight, setBowl: (patch: Partial<BowlParams>) => { setErrors([]); setBParams((p) => ({ ...p, ...patch })); },
    sampleId, selectSample, upload, imageName, image, result, stale, busy, errors, runError, generate, reset, download, downloadMap,
    flatParams, flatErrors, setFlat: (patch: Partial<FlatStripParams>) => setFlatParams((p) => ({ ...p, ...patch })), flatBusy, flatError, flatWarnings, downloadFlat,
  };
}

export type TealightController = ReturnType<typeof useTealightGenerator>;
