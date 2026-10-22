import { describe, it, expect } from 'vitest';
import {
  add,
  subtract,
  multiply,
  dot,
  cross,
  length,
  normalize,
  distance,
} from '../vectors';

describe('Vector Math', () => {
  it('adds vectors correctly', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: -1, z: 2 };
    expect(add(a, b)).toEqual({ x: 5, y: 1, z: 5 });
  });

  it('subtracts vectors correctly', () => {
    const a = { x: 5, y: 1, z: 5 };
    const b = { x: 4, y: -1, z: 2 };
    expect(subtract(a, b)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('multiplies vector by scalar', () => {
    const a = { x: 2, y: -3, z: 4 };
    expect(multiply(a, 2.5)).toEqual({ x: 5, y: -7.5, z: 10 });
  });

  it('computes dot product', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: -5, z: 6 };
    expect(dot(a, b)).toBe(1 * 4 + 2 * -5 + 3 * 6); // 4 - 10 + 18 = 12
  });

  it('computes cross product', () => {
    const x = { x: 1, y: 0, z: 0 };
    const y = { x: 0, y: 1, z: 0 };
    const z = cross(x, y);
    expect(z).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('computes length and normalizes', () => {
    const v = { x: 3, y: 4, z: 0 };
    expect(length(v)).toBe(5);
    const n = normalize(v);
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
    expect(n.z).toBeCloseTo(0);
    expect(length(n)).toBeCloseTo(1.0);
  });

  it('calculates distance between points', () => {
    const a = { x: 1, y: 1, z: 1 };
    const b = { x: 4, y: 5, z: 1 };
    expect(distance(a, b)).toBe(5);
  });
});
