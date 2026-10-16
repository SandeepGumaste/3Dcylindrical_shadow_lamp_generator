import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams, validateTealightParams, LED_CLEARANCE } from '../geometry/tealightShade';
import { DEFAULT_BOWL_PARAMS, BowlParams, validateBowlParams } from '../geometry/shadowBowl';
import { TEALIGHT_SAMPLES } from '../image/tealightSamples';
import hanumanUrl from '../assets/hanuman.png';
import { loadImageToGray } from '../image/loadImage';
import { runTealight } from '../workers/tealightRunner';
import type { TealightOutput } from '../workers/tealightCompute';
import { downloadSTL } from '../geometry/stl';
import { downloadSVG } from '../geometry/svg';

export type TableMode = 'tealight' | 'bowl';

export const DEFAULT_IMAGE_ID = 'hanuman';
const NEUTRAL = { invert: false, brightness: 0, contrast: 1, gamma: 1, threshold: 0.5, rotation: 0, flipHorizontal: false } as const;

export function useTealightGenerator(active: boolean, mode: TableMode) {
  const [tParams, setTParams] = useState<TealightParams>({ ...DEFAULT_TEALIGHT_PARAMS, ...TEALIGHT_SAMPLES[0].params });
  const [bParams, setBParams] = useState<BowlParams>({ ...DEFAULT_BOWL_PARAMS });
  const [sampleId, setSampleId] = useState<string>(DEFAULT_IMAGE_ID);
  const [uploaded, setUploaded] = useState<{ name: string; image: GrayImage } | null>(null);
  const [result, setResult] = useState<TealightOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const token = useRef(0);

  const [hanuman, setHanuman] = useState<GrayImage | null>(null);
  useEffect(() => {
    loadImageToGray(hanumanUrl, { targetResolution: 512, adjustments: { ...NEUTRAL } })
      .then(({ grayImage }) => setHanuman(grayImage))
      .catch((e: Error) => setRunError(`Could not load the default image: ${e.message}`));
  }, []);

  const image = useMemo<GrayImage | null>(() => {
    if (sampleId === 'upload' && uploaded) return uploaded.image;
    if (sampleId === DEFAULT_IMAGE_ID) return hanuman;
    return (TEALIGHT_SAMPLES.find((s) => s.id === sampleId) ?? TEALIGHT_SAMPLES[0]).make(512);
  }, [sampleId, uploaded, hanuman]);
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
    const s = TEALIGHT_SAMPLES.find((x) => x.id === id);
    if (s) {
      setTParams((p) => ({ ...p, ...s.params }));
      setBParams((p) => ({ ...p, threshold: s.params.threshold ?? p.threshold, invert: s.params.invert ?? p.invert }));
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
    const s = TEALIGHT_SAMPLES.find((x) => x.id === sampleId);
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
