import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBinaryStl } from '../../box/stlParse';
import { checkMesh } from '../../meshCheck';
import { buildBracket, validateBracketParams, SAMPLE_HEIGHT } from '../bracket';

const buf = readFileSync(new URL('../../../../public/light-source/wiring-bracket-100.stl', import.meta.url));
const sample = parseBinaryStl(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const zRange = (p: Float32Array) => { let a = Infinity, b = -Infinity; for (let i = 2; i < p.length; i += 3) { a = Math.min(a, p[i]); b = Math.max(b, p[i]); } return [a, b]; };

describe('wiring bracket', () => {
  it('at the sample height it is the sample, standing on z = 0', () => {
    const m = buildBracket(sample, { height: SAMPLE_HEIGHT });
    const [a, b] = zRange(m.positions);
    expect(a).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(45, 3);
    expect(m.indices).toEqual(sample.indices);
  });
  it.each([76, 90, 130, 180])('grows or shrinks by exactly the height change (%d mm)', (h) => {
    const [a, b] = zRange(buildBracket(sample, { height: h }).positions);
    expect(b - a).toBeCloseTo(45 + h - SAMPLE_HEIGHT, 3);
  });
  it('keeps the width, the mesh closed and the volume positive', () => {
    for (const h of [76, 140]) {
      const m = buildBracket(sample, { height: h });
      const c = checkMesh(m.positions, m.indices);
      expect(c.watertight).toBe(true);
      expect(c.signedVolume).toBeGreaterThan(0);
      let r = 0; for (let i = 0; i < m.positions.length; i += 3) r = Math.max(r, Math.hypot(m.positions[i], m.positions[i + 1]));
      expect(r).toBeCloseTo(6, 3);
    }
  });
  it('rejects heights of 75 mm or less', () => {
    expect(validateBracketParams({ height: 75 }).length).toBe(1);
    expect(() => buildBracket(sample, { height: 70 })).toThrow();
    expect(validateBracketParams({ height: 76 })).toEqual([]);
  });
});
