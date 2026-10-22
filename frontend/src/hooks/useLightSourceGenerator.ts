import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_HEIGHT, type BracketParams } from '../contracts/lightSource';
import { previewRequest } from '../api/requests';
import { toLightResult, type LightResult } from '../api/results';
import { saveLast } from '../api/downloads';
import { newGenerationSession } from '../api/unauthorized';

export function useLightSourceGenerator(active: boolean) {
  const [params, setParamsState] = useState<BracketParams>({ height: DEFAULT_HEIGHT });
  const [result, setResult] = useState<LightResult | null>(null);
  const [generatedHeight, setGeneratedHeight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const session = useMemo(newGenerationSession, []);
  const started = useRef(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const generate = useCallback(() => {
    const sent = paramsRef.current;
    setBusy(true);
    setError(null);
    setErrors([]);
    session.run(previewRequest('light', sent)).then((o) => {
      if (o.kind === 'stale') return;
      setBusy(false);
      if (o.kind === 'invalid') return setErrors(o.errors);
      if (o.kind === 'error') return setError(o.message);
      setResult(toLightResult(o.value));
      setGeneratedHeight(sent.height);
    });
  }, [session]);

  // Generate when the mode is first shown; later height changes wait for the Generate button.
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    generate();
  }, [active, generate]);

  return {
    params, errors, error, busy,
    mesh: result?.mesh ?? null,
    triangleCount: result?.triangleCount ?? 0,
    stale: result !== null && generatedHeight !== params.height,
    generate,
    setParams: (patch: Partial<BracketParams>) => { setErrors([]); setParamsState((p) => ({ ...p, ...patch })); },
    download: () => { if (result) void saveLast(session, 'stl', undefined, setError); },
  };
}

export type LightSourceController = ReturnType<typeof useLightSourceGenerator>;
