import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams, validateTealightParams, LED_CLEARANCE } from '../geometry/tealightShade';
import { DEFAULT_BOWL_PARAMS, BowlParams, validateBowlParams } from '../geometry/shadowBowl';
import batmanUrl from '../assets/batman.jpg';
import shivaUrl from '../assets/shiva.jpg';
import hanumanUrl from '../assets/hanuman.png';
import catUrl from '../assets/cat.png';
import { loadImageToGray } from '../image/loadImage';
import { runTealight } from '../workers/tealightRunner';
import type { TealightOutput } from '../workers/tealightCompute';
import { downloadSTL } from '../geometry/stl';
import { downloadSVG } from '../geometry/svg';
import { DEFAULT_FLAT_STRIP_PARAMS, FlatStripParams, validateFlatStrip } from '../geometry/flatStrip';

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
export type FlatExport = { ok: true; warnings: string[] } | { ok: false; error: string };

/** Validates, builds the flat strip in the worker and saves it; nothing is saved unless the mesh is watertight. */
export async function exportFlatStrip(a: {
  image: GrayImage; params: TealightParams; flat: FlatStripParams; name: string;
  run?: typeof runTealight; save?: typeof downloadSTL;
}): Promise<FlatExport> {
  const errors = validateFlatStrip(a.params, a.flat);
  if (errors.length) return { ok: false, error: errors.join(' ') };
  try {
    const r = await (a.run ?? runTealight)({ kind: 'flat', image: a.image, params: a.params, flat: a.flat });
    if (!r.check.watertight) return { ok: false, error: `Flat strip is not watertight: ${r.check.errors.join(' ')}` };
    const date = new Date().toISOString().slice(0, 10);
    (a.save ?? downloadSTL)(r.stl, `tealight-flat-strip-${a.name}-${date}.stl`);
    return { ok: true, warnings: r.warnings };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const NEUTRAL = { invert: false, brightness: 0, contrast: 1, gamma: 1, threshold: 0.5, rotation: 0, flipHorizontal: false } as const;

export function useTealightGenerator(mode: TableMode) {
  const [tParams, setTParams] = useState<TealightParams>({ ...DEFAULT_TEALIGHT_PARAMS, ...BUNDLED_IMAGES[0].params });
  const [bParams, setBParams] = useState<BowlParams>({ ...DEFAULT_BOWL_PARAMS });
  const [sampleId, setSampleId] = useState<string>(DEFAULT_IMAGE_ID);
  const [uploaded, setUploaded] = useState<{ name: string; image: GrayImage; id: number } | null>(null);
  const [result, setResult] = useState<TealightOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const token = useRef(0);
  const [flatParams, setFlatParams] = useState<FlatStripParams>({ ...DEFAULT_FLAT_STRIP_PARAMS });
  const [flatBusy, setFlatBusy] = useState(false);
  const [flatError, setFlatError] = useState<string | null>(null);
  const [flatWarnings, setFlatWarnings] = useState<string[]>([]);
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

  const errors = useMemo(() => (mode === 'tealight' ? validateTealightParams(tParams) : validateBowlParams(bParams)), [mode, tParams, bParams]);

  const inputKey = useMemo(
    () => JSON.stringify([mode, mode === 'tealight' ? tParams : bParams, sampleId, sampleId === 'upload' ? uploaded?.id : null]),
    [mode, tParams, bParams, sampleId, uploaded],
  );
  /** True once the inputs have changed since the model on screen was generated. */
  const stale = result !== null && generatedKey !== inputKey;

  const generate = useCallback(() => {
    if (errors.length || !image) return;
    const my = ++token.current;
    const key = inputKey;
    setBusy(true);
    setRunError(null);
    const req = mode === 'tealight' ? ({ kind: 'tealight', image, params: tParams } as const) : ({ kind: 'bowl', image, params: bParams } as const);
    runTealight(req)
      .then((r) => { if (token.current === my) { setResult(r); setGeneratedKey(key); setBusy(false); } })
      .catch((e: Error) => { if (token.current === my) { setRunError(e.message); setBusy(false); } });
  }, [errors, mode, image, tParams, bParams, inputKey]);

  // Generate on first load and whenever the image changes (bundled pick or upload), but never for
  // settings changes: those wait for the Generate button. The ref keeps the effect on the image only.
  const generateRef = useRef(generate);
  generateRef.current = generate;
  useEffect(() => {
    if (image) generateRef.current();
  }, [image]);

  const selectSample = (id: string) => {
    setSampleId(id);
    setTParams((p) => ({ ...p, ...presetParams(id) }));
  };

  const upload = async (file: File) => {
    const { grayImage } = await loadImageToGray(file, { targetResolution: 512, adjustments: { ...NEUTRAL } });
    setUploaded((u) => ({ name: file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'image', image: grayImage, id: (u?.id ?? 0) + 1 }));
    setSampleId('upload');
  };

  const setTealight = (patch: Partial<TealightParams>) =>
    setTParams((p) => {
      const next = { ...p, ...patch };
      if (patch.useLed) {
        // keep the top wide enough to carry the socket when LED mode is switched on
        const need = 2 * ((next.tealightDiameter + LED_CLEARANCE) / 2 - 1.5 + 0.5);
        if (next.topDiameter < need) next.topDiameter = Math.ceil(need);
      }
      return next;
    });

  const reset = () => {
    if (mode === 'tealight') setTParams({ ...DEFAULT_TEALIGHT_PARAMS, ...presetParams(sampleId) });
    else setBParams({ ...DEFAULT_BOWL_PARAMS });
  };

  const download = () => {
    if (!result) return;
    const date = new Date().toISOString().slice(0, 10);
    const prefix = result.kind === 'tealight' ? 'tealight-shade' : 'shadow-bowl';
    downloadSTL(result.stl, `${prefix}-${imageName}-${date}.stl`);
  };

  const downloadFlat = async () => {
    if (!image || flatBusy) return;
    setFlatBusy(true);
    setFlatError(null);
    setFlatWarnings([]);
    const r = await exportFlatStrip({ image, params: tParams, flat: flatParams, name: imageName });
    if (r.ok) setFlatWarnings(r.warnings); else setFlatError(r.error);
    setFlatBusy(false);
  };

  const downloadMap = () => {
    if (!result?.mapSvg) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadSVG(result.mapSvg, `tealight-shade-map-${imageName}-${date}.svg`);
  };

  return {
    mode, tParams, bParams, setTealight, setBowl: (patch: Partial<BowlParams>) => setBParams((p) => ({ ...p, ...patch })),
    sampleId, selectSample, upload, imageName, image, result, stale, busy, errors, runError, generate, reset, download, downloadMap,
    flatParams, setFlat: (patch: Partial<FlatStripParams>) => setFlatParams((p) => ({ ...p, ...patch })), flatBusy, flatError, flatWarnings, downloadFlat,
  };
}

export type TealightController = ReturnType<typeof useTealightGenerator>;
