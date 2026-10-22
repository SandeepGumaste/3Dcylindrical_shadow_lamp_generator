import { describe, expect, it } from 'vitest';
import { frameResponse, unframeResponse } from '../frame';

describe('response framing', () => {
  it('round-trips meta, positions and indices', () => {
    const positions = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const indices = new Uint32Array([0, 1, 2]);
    const out = unframeResponse(frameResponse({ a: 1, note: 'é' }, positions, indices));
    expect(out.meta).toMatchObject({ a: 1, note: 'é' });
    expect(Array.from(out.positions)).toEqual(Array.from(positions));
    expect(Array.from(out.indices)).toEqual(Array.from(indices));
  });
  it('rejects a truncated buffer', () => {
    const buf = frameResponse({}, new Float32Array(3), new Uint32Array(3));
    expect(() => unframeResponse(buf.slice(0, buf.byteLength - 4))).toThrow();
  });
});
