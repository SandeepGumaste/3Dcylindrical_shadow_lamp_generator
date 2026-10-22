import { useEffect, useMemo, useState } from 'react';
import { buildBracket, DEFAULT_HEIGHT, validateBracketParams, type BracketParams } from '../geometry/lightSource/bracket';
import { parseBinaryStl, type IndexedMesh } from '../geometry/box/stlParse';
import { downloadSTL, indexedMeshToBinarySTL } from '../geometry/stl';

export function useLightSourceGenerator(active: boolean) {
  const [params, setParamsState] = useState<BracketParams>({ height: DEFAULT_HEIGHT });
  const [sample, setSample] = useState<IndexedMesh | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || sample) return;
    fetch(`${import.meta.env.BASE_URL}light-source/wiring-bracket-100.stl`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((b) => setSample(parseBinaryStl(b)))
      .catch((e: Error) => setError(`Could not load the bracket model: ${e.message}`));
  }, [active, sample]);

  const errors = useMemo(() => validateBracketParams(params), [params]);
  const mesh = useMemo(() => (sample && !errors.length ? buildBracket(sample, params) : null), [sample, params, errors]);

  return {
    params, errors, error, mesh,
    triangleCount: mesh ? mesh.indices.length / 3 : 0,
    setParams: (patch: Partial<BracketParams>) => setParamsState((p) => ({ ...p, ...patch })),
    download: () => {
      if (mesh) downloadSTL(indexedMeshToBinarySTL(mesh.positions, mesh.indices, 'Odd Shadows wiring bracket'), `wiring-bracket-${params.height}mm.stl`);
    },
  };
}

export type LightSourceController = ReturnType<typeof useLightSourceGenerator>;
