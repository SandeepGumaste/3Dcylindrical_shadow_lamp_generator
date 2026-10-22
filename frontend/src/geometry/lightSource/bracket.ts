import type { IndexedMesh } from '../box/stlParse';
import { MIN_HEIGHT, DEFAULT_HEIGHT, MAX_HEIGHT, type BracketParams } from '../../contracts/lightSource';
export { MIN_HEIGHT, DEFAULT_HEIGHT, MAX_HEIGHT };
export type { BracketParams };

/** The bundled sample was made for a light source 100 mm tall. */
export const SAMPLE_HEIGHT = 100;
/** The straight tube of the sample (z in the sample's own coordinates); the thread below and the slotted head above stay as they are. */
const TUBE_FROM = 46.4;
const TUBE_TO = 76.4;

export function validateBracketParams(p: BracketParams): string[] {
  if (!Number.isFinite(p.height) || p.height <= MIN_HEIGHT) return [`Light source height must be more than ${MIN_HEIGHT} mm.`];
  if (p.height > MAX_HEIGHT) return [`Light source height must be at most ${MAX_HEIGHT} mm.`];
  return [];
}

/**
 * Makes the bracket for another light source height from the 100 mm sample. Only the straight tube is
 * stretched or shortened, in step with the height; the thread and the head are moved, not changed.
 * The result stands on z = 0; x and y are as in the sample (centred on the tube axis).
 */
export function buildBracket(sample: IndexedMesh, params: BracketParams): IndexedMesh {
  const errors = validateBracketParams(params);
  if (errors.length) throw new Error(errors[0]);
  const delta = params.height - SAMPLE_HEIGHT;
  const k = (TUBE_TO - TUBE_FROM + delta) / (TUBE_TO - TUBE_FROM);
  const out = new Float32Array(sample.positions);
  for (let i = 2; i < out.length; i += 3) {
    const z = out[i];
    out[i] = z <= TUBE_FROM ? z : z >= TUBE_TO ? z + delta : TUBE_FROM + (z - TUBE_FROM) * k;
  }
  let zMin = Infinity;
  for (let i = 2; i < out.length; i += 3) zMin = Math.min(zMin, out[i]);
  for (let i = 2; i < out.length; i += 3) out[i] -= zMin;
  return { positions: out, indices: sample.indices };
}
