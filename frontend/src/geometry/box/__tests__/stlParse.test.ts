import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBinaryStl, moveToOrigin } from '../stlParse';
import { bundledPartsFor } from '../kitParts';

const load = (file: string) => {
  const b = readFileSync(new URL(`../../../../public/box-kit/${file}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const bbox = (p: Float32Array) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  return { mn, size: mx.map((v, k) => v - mn[k]) };
};

describe('binary STL parsing', () => {
  it('reads the lamp post as 9.9 x 9.9 x 60 mm', () => {
    const { size } = bbox(parseBinaryStl(load('lamp-post.stl')).positions);
    expect(size[0]).toBeCloseTo(9.9, 1); expect(size[1]).toBeCloseTo(9.9, 1); expect(size[2]).toBeCloseTo(60, 1);
  });
  it('moves the minimum corner to the origin', () => {
    const m = moveToOrigin(parseBinaryStl(load('lamp-cap.stl')));
    const { mn } = bbox(m.positions);
    expect(mn.map((v) => Math.abs(v) < 1e-4)).toEqual([true, true, true]);
  });
  it('shares vertices between triangles', () => {
    const m = parseBinaryStl(load('lamp-post.stl'));
    expect(m.indices.length).toBe(6930 * 3);
    expect(m.positions.length / 3).toBeLessThan(m.indices.length / 2);
  });
  it('rejects a buffer that is not a binary STL', () => {
    expect(() => parseBinaryStl(new ArrayBuffer(10))).toThrow('Not a binary STL');
  });
});

describe('bundled parts per tray', () => {
  it('pairs each tray with its own battery cover and shares the rest', () => {
    const files = (t: '2AA' | '2AAA') => bundledPartsFor(t).map((p) => p.file).sort();
    expect(files('2AA')).toEqual(['cover-2aa.stl', 'lamp-cap.stl', 'lamp-post.stl', 'tray-2aa.stl', 'wall-hook.stl']);
    expect(files('2AAA')).toEqual(['cover-2aaa.stl', 'lamp-cap.stl', 'lamp-post.stl', 'tray-2aaa.stl', 'wall-hook.stl']);
  });
});
