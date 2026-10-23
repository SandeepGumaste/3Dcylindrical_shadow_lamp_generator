import { describe, it, expect } from 'vitest';
import { runTealightRequest } from '../tealightCompute';
import { DEFAULT_TEALIGHT_PARAMS } from '../../geometry/tealightShade';
import { DEFAULT_FLAT_STRIP_PARAMS } from '../../geometry/flatStrip';
import { asymmetricTestImage } from '../../image/tealightSamples';

const image = asymmetricTestImage(64);

describe('runTealightRequest flat', () => {
  it('returns a watertight flat strip STL', () => {
    const out = runTealightRequest({ kind: 'flat', image, params: DEFAULT_TEALIGHT_PARAMS, flat: DEFAULT_FLAT_STRIP_PARAMS });
    expect(out.kind).toBe('flat');
    expect(out.check.watertight).toBe(true);
    expect(out.stl.byteLength).toBe(84 + 50 * out.triangleCount);
  });

  it('throws the validation message in LED mode', () => {
    expect(() => runTealightRequest({ kind: 'flat', image, params: { ...DEFAULT_TEALIGHT_PARAMS, useLed: true }, flat: DEFAULT_FLAT_STRIP_PARAMS })).toThrow('LED');
  });
});
