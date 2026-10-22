import { describe, it, expect } from 'vitest';
import { cornerRadiusLimits } from '../limits';

describe('cornerRadiusLimits', () => {
  it('runs from twice the wall to half the shorter side', () => {
    expect(cornerRadiusLimits({ width: 80, length: 50, wallThickness: 1.2 })).toEqual({ min: 2.4, max: 25 });
  });
  it('never inverts when the sides are tiny', () => {
    const l = cornerRadiusLimits({ width: 4, length: 4, wallThickness: 1.2 });
    expect(l.max).toBeGreaterThanOrEqual(l.min);
  });
});
