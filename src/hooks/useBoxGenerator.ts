import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_BOX_PARAMS, fitShadowSize, validateBoxParams, type BoxParams } from '../geometry/box/rimProfile';
import hanumanUrl from '../assets/hanuman.png';
import catUrl from '../assets/cat.png';
import { loadImageToGray } from '../image/loadImage';
import { runBox } from '../workers/boxRunner';
import type { BoxOutput } from '../workers/boxCompute';
import { downloadSTL } from '../geometry/stl';

const NEUTRAL = { invert: false, brightness: 0, contrast: 1, gamma: 1, threshold: 0.5, rotation: 0, flipHorizontal: false } as const;

/** True once the inputs have changed since the model on screen was generated. */
export const isStale = (currentKey: string, generatedKey: string | null, hasResult: boolean) => hasResult && generatedKey !== currentKey;

/** Generate on its own the first time both images are loaded and whenever either one changes, never for settings or for returning to the mode. */
export const shouldGenerate = (last: [number, number] | null, shadowId: number, panelId: number) =>
  last === null || last[0] !== shadowId || last[1] !== panelId;

/** Identifies the inputs of a build: every setting plus which shadow and panel image (by load id). */
export const inputKey = (params: BoxParams, shadowId: number, panelId: number) => JSON.stringify([params, shadowId, panelId]);

interface Loaded { name: string; image: GrayImage; id: number }

const fileName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'image';

export function useBoxGenerator(active: boolean) {
  const [params, setParamsState] = useState<BoxParams>({ ...DEFAULT_BOX_PARAMS });
  const [shadow, setShadow] = useState<Loaded | null>(null);
  const [panel, setPanel] = useState<Loaded | null>(null);
  const [result, setResult] = useState<BoxOutput | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitNote, setFitNote] = useState<string | null>(null);
  const token = useRef(0);
  const nextId = useRef(1);

  /** Size the shadow so every part of the shape is bigger than the smallest shadow the box casts. */
  const fitTo = useCallback((image: GrayImage, current: BoxParams) => {
    if (validateBoxParams(current).length) return;
    const fit = fitShadowSize(image, current);
    if (fit.shadowSize !== current.shadowSize) setParamsState((q) => ({ ...q, shadowSize: fit.shadowSize }));
    setFitNote(fit.ok ? null : 'No shadow size clears the box for the smallest part and stays within the tallest wall; the size was set to clear the box, so the tallest parts are shortened.');
  }, []);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const load = useCallback(async (source: File | string, name: string): Promise<Loaded> => {
    const { grayImage } = await loadImageToGray(source, { targetResolution: 512, adjustments: { ...NEUTRAL } });
    return { name, image: grayImage, id: nextId.current++ };
  }, []);

  // Default images: Hanuman casts the shadow, the cat is the panel picture.
  useEffect(() => {
    if (!active || shadow) return;
    load(hanumanUrl, 'hanuman').then((l) => { fitTo(l.image, paramsRef.current); setShadow(l); }).catch((e: Error) => setError(`Could not load the shadow image: ${e.message}`));
  }, [active, shadow, load, fitTo]);
  useEffect(() => {
    if (!active || panel) return;
    load(catUrl, 'cat').then(setPanel).catch((e: Error) => setError(`Could not load the panel picture: ${e.message}`));
  }, [active, panel, load]);

  const errors = useMemo(() => validateBoxParams(params), [params]);
  const key = useMemo(() => inputKey(params, shadow?.id ?? 0, panel?.id ?? 0), [params, shadow, panel]);
  const stale = isStale(key, generatedKey, result !== null);

  const generate = useCallback(() => {
    if (errors.length || !shadow || !panel) return;
    const my = ++token.current;
    const k = key;
    setBusy(true);
    setError(null);
    runBox({ shadow: shadow.image, panel: panel.image, params })
      .then((r) => { if (token.current === my) { setResult(r); setGeneratedKey(k); setBusy(false); } })
      .catch((e: Error) => { if (token.current === my) { setError(e.message); setBusy(false); } });
  }, [errors, shadow, panel, params, key]);

  // Generate when the mode is first shown and whenever an image changes; settings wait for the button.
  const generateRef = useRef(generate);
  generateRef.current = generate;
  const lastIds = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!active || !shadow || !panel || !shouldGenerate(lastIds.current, shadow.id, panel.id)) return;
    lastIds.current = [shadow.id, panel.id];
    generateRef.current();
  }, [active, shadow?.id, panel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const date = () => new Date().toISOString().slice(0, 10);
  const downloadKit = () => {
    if (!result) return;
    const blob = new Blob([result.zip], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `odd-shadows-box-kit-${fileName(shadow?.name ?? 'shadow')}-${date()}.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const downloadPart = (id: string) => {
    const part = result?.parts.find((p) => p.id === id);
    if (part) downloadSTL(part.stl, `${part.id}-${date()}.stl`);
  };

  return {
    params, errors,
    setParams: (patch: Partial<BoxParams>) => setParamsState((p) => ({ ...p, ...patch })),
    shadowName: shadow?.name ?? '', panelName: panel?.name ?? '',
    selectShadow: async (file: File) => { try { const l = await load(file, fileName(file.name)); fitTo(l.image, paramsRef.current); setShadow(l); } catch (e: any) { setError(e.message); } },
    fitShadow: () => { if (shadow) fitTo(shadow.image, params); },
    fitNote,
    selectPanel: async (file: File) => { try { setPanel(await load(file, fileName(file.name))); } catch (e: any) { setError(e.message); } },
    result, busy, stale, error, generate, downloadKit, downloadPart,
  };
}

export type BoxController = ReturnType<typeof useBoxGenerator>;
