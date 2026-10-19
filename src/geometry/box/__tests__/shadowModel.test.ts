import { describe, it, expect } from 'vitest';
import { rimPoint, wallSpan, reachForHeight, heightForReach } from '../shadowModel';
import { KIT } from '../kitSpec';

describe('shadow reach and wall height', () => {
  it('heightForReach inverts reachForHeight', () => {
    for (const [h, d, L, T] of [[5, 40, 40, 20], [30, 60, 43, 20], [0, 33, 25, 20]] as const) {
      expect(heightForReach(reachForHeight(h, d, L, T), d, L, T)).toBeCloseTo(h, 9);
    }
  });
  it('a rim at the panel plane lands at d (L + T) / L', () => {
    expect(reachForHeight(0, 40, 40, 20)).toBeCloseTo(60, 9);
  });
  it('is infinite when the rim reaches the light', () => {
    expect(reachForHeight(40, 40, 40, 20)).toBe(Infinity);
  });
});

describe('rim positions', () => {
  it('measures from the light axis, not the box centre', () => {
    const top = rimPoint('w1', 60);
    expect(top.d).toBeCloseTo(150 - KIT.lightAxis.y, 9);
    expect(top.angle).toBeCloseTo(Math.PI / 2, 9);
    const bottom = rimPoint('w4', 60);
    expect(bottom.d).toBeCloseTo(KIT.lightAxis.y, 9);
    expect(bottom.angle).toBeCloseTo(-Math.PI / 2, 9);
  });
  it('spans the box: 120 mm for the short walls and 150 mm for the long ones', () => {
    expect(wallSpan('w1')).toBe(120); expect(wallSpan('w4')).toBe(120);
    expect(wallSpan('w2')).toBe(150); expect(wallSpan('w3')).toBe(150);
  });
  it('gives adjacent walls the same position at every shared corner', () => {
    const same = (a: ReturnType<typeof rimPoint>, b: ReturnType<typeof rimPoint>) => {
      expect(a.d).toBeCloseTo(b.d, 9);
      expect(Math.cos(a.angle)).toBeCloseTo(Math.cos(b.angle), 9);
      expect(Math.sin(a.angle)).toBeCloseTo(Math.sin(b.angle), 9);
    };
    same(rimPoint('w4', 0), rimPoint('w3', 0));
    same(rimPoint('w4', 120), rimPoint('w2', 0));
    same(rimPoint('w1', 0), rimPoint('w3', 150));
    same(rimPoint('w1', 120), rimPoint('w2', 150));
  });
});
