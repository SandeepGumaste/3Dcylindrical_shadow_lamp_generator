import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GrayImage } from '../types';
import { DEFAULT_BOX_PARAMS, type BoxParams } from '../contracts/box';
import hanumanUrl from '../assets/hanuman.png';
import catUrl from '../assets/cat.png';
import { loadImageToGray } from '../image/loadImage';
import { applyFit, previewRequest } from '../api/requests';
import { toBoxResult, type BoxResult } from '../api/results';
import { saveLast } from '../api/downloads';
import { newGenerationSession } from '../api/unauthorized';

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
  const [result, setResult] = useState<BoxResult | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fitNote, setFitNote] = useState<string | null>(null);
  const session = useMemo(newGenerationSession, []);
  const lastName = useRef('shadow');
  const nextId = useRef(1);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const load = useCallback(async (source: File | string, name: string): Promise<Loaded> => {
    const { grayImage } = await loadImageToGray(source, { targetResolution: 512, adjustments: { ...NEUTRAL } });
    return { name, image: grayImage, id: nextId.current++ };
  }, []);

  // Default images: Hanuman casts the shadow, the cat is the panel picture.
  useEffect(() => {
    if (!active || shadow) return;
    load(hanumanUrl, 'hanuman').then(setShadow).catch((e: Error) => setError(`Could not load the shadow image: ${e.message}`));
  }, [active, shadow, load]);
  useEffect(() => {
    if (!active || panel) return;
    load(catUrl, 'cat').then(setPanel).catch((e: Error) => setError(`Could not load the panel picture: ${e.message}`));
  }, [active, panel, load]);

  const key = useMemo(() => inputKey(params, shadow?.id ?? 0, panel?.id ?? 0), [params, shadow, panel]);
  const stale = isStale(key, generatedKey, result !== null);

  /** `fit` asks the server to size the shadow so every part of the shape is bigger than the smallest shadow the box casts. */
  const run = useCallback((fit: boolean) => {
    if (!shadow || !panel) return;
    const sent = paramsRef.current;
    setBusy(true);
    setError(null);
    setErrors([]);
    session.run(previewRequest('box', sent, { image: shadow.image, panel: panel.image, fit })).then((o) => {
      if (o.kind === 'stale') return;
      setBusy(false);
      if (o.kind === 'invalid') return setErrors(o.errors);
      if (o.kind === 'error') return setError(o.message);
      const applied = applyFit(sent, o.value.meta.fit);
      if (o.value.meta.fit) {
        if (applied.params !== sent) setParamsState((p) => ({ ...p, shadowSize: applied.params.shadowSize }));
        setFitNote(applied.ok ? null : 'No shadow size clears the box for the smallest part and stays within the tallest wall; the size was set to clear the box, so the tallest parts are shortened.');
      }
      setResult(toBoxResult(o.value));
      setGeneratedKey(inputKey(applied.params, shadow.id, panel.id));
      lastName.current = shadow.name;
    });
  }, [shadow, panel, session]);

  // Generate (with the fit) when the mode is first shown and whenever an image changes; settings wait for the button.
  const runRef = useRef(run);
  runRef.current = run;
  const lastIds = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!active || !shadow || !panel || !shouldGenerate(lastIds.current, shadow.id, panel.id)) return;
    lastIds.current = [shadow.id, panel.id];
    runRef.current(true);
  }, [active, shadow?.id, panel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const date = () => new Date().toISOString().slice(0, 10);
  const downloadKit = () => {
    if (result) void saveLast(session, 'zip', `odd-shadows-box-kit-${fileName(lastName.current)}-${date()}.zip`, setError);
  };
  const downloadPart = (id: string) => {
    if (result?.parts.some((p) => p.id === id)) void saveLast(session, { part: id }, `${id}-${date()}.stl`, setError);
  };

  return {
    params, errors,
    setParams: (patch: Partial<BoxParams>) => { setErrors([]); setParamsState((p) => ({ ...p, ...patch })); },
    shadowName: shadow?.name ?? '', panelName: panel?.name ?? '',
    selectShadow: async (file: File) => { try { setShadow(await load(file, fileName(file.name))); } catch (e: any) { setError(e.message); } },
    fitShadow: () => run(true),
    fitNote,
    selectPanel: async (file: File) => { try { setPanel(await load(file, fileName(file.name))); } catch (e: any) { setError(e.message); } },
    result, busy, stale, error, generate: () => run(false), downloadKit, downloadPart,
  };
}

export type BoxController = ReturnType<typeof useBoxGenerator>;
