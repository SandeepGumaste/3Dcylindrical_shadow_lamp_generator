import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams, validateTealightParams, LED_CLEARANCE } from '../geometry/tealightShade';
import { DEFAULT_BOWL_PARAMS, BowlParams, validateBowlParams } from '../geometry/shadowBowl';
import hanumanUrl from '../assets/hanuman.png';
import catUrl from '../assets/cat.png';
import { loadImageToGray } from '../image/loadImage';
import { runTealight } from '../workers/tealightRunner';
import type { TealightOutput } from '../workers/tealightCompute';
import { downloadSTL } from '../geometry/stl';
import { downloadSVG } from '../geometry/svg';

export type TableMode = 'tealight' | 'bowl';

export const DEFAULT_IMAGE_ID = 'hanuman';
/** Bundled raster images, loaded once at start-up. */
export const BUNDLED_IMAGES = [
  { id: 'hanuman', name: 'Hanuman', url: hanumanUrl, params: { imageScale: 85 } as Partial<TealightParams> },
  { id: 'cat', name: 'Cat', url: catUrl, params: { imageScale: 80 } as Partial<TealightParams> },
];
const NEUTRAL = { invert: false, brightness: 0, contrast: 1, gamma: 1, threshold: 0.5, rotation: 0, flipHorizontal: false } as const;

export function useTealightGenerator(active: boolean, mode: TableMode) {
  const [tParams, setTParams] = useState<TealightParams>({ ...DEFAULT_TEALIGHT_PARAMS, ...BUNDLED_IMAGES[0].params });
  const [bParams, setBParams] = useState<BowlParams>({ ...DEFAULT_BOWL_PARAMS });
  const [sampleId, setSampleId] = useState<string>(DEFAULT_IMAGE_ID);
  const [uploaded, setUploaded] = useState<{ name: string; image: GrayImage } | null>(null);
  const [result, setResult] = useState<TealightOutput | null>(null);
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

  const errors = useMemo(() => (mode === 'tealight' ? validateTealightParams(tParams) : validateBowlParams(bParams)), [mode, tParams, bParams]);

  const generate = useCallback(() => {
    if (errors.length || !image) return;
    const my = ++token.current;
    setBusy(true);
    setRunError(null);
    const req = mode === 'tealight' ? ({ kind: 'tealight', image, params: tParams } as const) : ({ kind: 'bowl', image, params: bParams } as const);
    runTealight(req)
      .then((r) => { if (token.current === my) { setResult(r); setBusy(false); } })
      .catch((e: Error) => { if (token.current === my) { setRunError(e.message); setBusy(false); } });
  }, [errors, mode, image, tParams, bParams]);

  // Debounced auto-regenerate while the mode is visible.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(generate, 350);
    return () => clearTimeout(id);
  }, [active, generate]);

  const selectSample = (id: string) => {
    setSampleId(id);
    const s = BUNDLED_IMAGES.find((x) => x.id === id);
    if (s) {
      setTParams((p) => ({ ...p, ...s.params }));
    }
  };

  const upload = async (file: File) => {
    const { grayImage } = await loadImageToGray(file, { targetResolution: 512, adjustments: { ...NEUTRAL } });
    setUploaded({ name: file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'image', image: grayImage });
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
    const s = BUNDLED_IMAGES.find((x) => x.id === sampleId);
    if (mode === 'tealight') setTParams({ ...DEFAULT_TEALIGHT_PARAMS, ...(s?.params ?? {}) });
    else setBParams({ ...DEFAULT_BOWL_PARAMS });
  };

  const download = () => {
    if (!result) return;
    const date = new Date().toISOString().slice(0, 10);
    const prefix = result.kind === 'tealight' ? 'tealight-shade' : 'shadow-bowl';
    downloadSTL(result.stl, `${prefix}-${imageName}-${date}.stl`);
  };

  const downloadMap = () => {
    if (!result?.mapSvg) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadSVG(result.mapSvg, `tealight-shade-map-${imageName}-${date}.svg`);
  };

  return {
    mode, tParams, bParams, setTealight, setBowl: (patch: Partial<BowlParams>) => setBParams((p) => ({ ...p, ...patch })),
    sampleId, selectSample, upload, imageName, image, result, busy, errors, runError, generate, reset, download, downloadMap,
  };
}

export type TealightController = ReturnType<typeof useTealightGenerator>;
