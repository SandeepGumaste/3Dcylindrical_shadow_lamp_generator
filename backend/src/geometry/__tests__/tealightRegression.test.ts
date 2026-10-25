import { describe, it, expect } from 'vitest';
import { DEFAULT_TEALIGHT_PARAMS, generateTealightShade } from '../tealightShade';
import { TEALIGHT_SAMPLES } from '../../image/tealightSamples';

/** FNV-1a over the position bytes: pins Tealight shade output while other modes are added. */
function fnv1a(buf: Float32Array): string {
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

describe('tealight shade output is pinned', () => {
  it('the original 60 x 70 mm parameters on the first sample pattern give the recorded mesh', () => {
    const original = { ...DEFAULT_TEALIGHT_PARAMS, invert: false, innerDiameter: 60, height: 70, patternGapTop: 0 };
    const res = generateTealightShade(TEALIGHT_SAMPLES[0].make(256), original);
    expect(res.report.check.watertight).toBe(true);
    expect(res.triangleCount).toBe(413504);
    expect(fnv1a(res.positions)).toBe('9c7a5288');
  });
});
