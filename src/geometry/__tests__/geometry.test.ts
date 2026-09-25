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
import { createRay, pointAt } from '../ray';
import {
  intersectCylinder,
  thetaToU,
  uToTheta,
} from '../cylinder';

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

describe('Ray operations', () => {
  it('creates ray and calculates points along it', () => {
    const origin = { x: 0, y: 10, z: 0 };
    const dir = { x: 0, y: 0, z: 5 };
    const ray = createRay(origin, dir);
    expect(ray.direction).toEqual({ x: 0, y: 0, z: 1 });

    const p = pointAt(ray, 15);
    expect(p).toEqual({ x: 0, y: 10, z: 15 });
  });
});

describe('Ray / Cylinder Analytical Intersection', () => {
  const radius = 45; // 90mm diameter
  const height = 100;

  it('detects ray originating from inside cylinder heading outward', () => {
    // Light at center of lamp (0, 50, 0) shooting along +Z
    const origin = { x: 0, y: 50, z: 0 };
    const dir = { x: 0, y: 0, z: 1 };
    const hit = intersectCylinder(origin, dir, radius, height);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(45);
    expect(hit!.point.x).toBeCloseTo(0);
    expect(hit!.point.y).toBeCloseTo(50);
    expect(hit!.point.z).toBeCloseTo(45);
    expect(hit!.v).toBeCloseTo(0.5);
  });

  it('detects ray originating outside cylinder hitting front surface', () => {
    // Ray from (0, 50, 100) shooting towards origin (0, 50, -1)
    const origin = { x: 0, y: 50, z: 100 };
    const dir = { x: 0, y: 0, z: -1 };
    const hit = intersectCylinder(origin, dir, radius, height);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(55); // 100 - 45 = 55
    expect(hit!.point.z).toBeCloseTo(45);
    expect(hit!.point.x).toBeCloseTo(0);
    expect(hit!.point.y).toBeCloseTo(50);
  });

  it('returns null when ray misses the cylinder completely', () => {
    const origin = { x: 100, y: 50, z: 100 };
    const dir = { x: 0, y: 0, z: -1 }; // x = 100 > radius 45
    const hit = intersectCylinder(origin, dir, radius, height);
    expect(hit).toBeNull();
  });

  it('handles tangent ray grazing the cylinder', () => {
    // Tangent at x = 45, parallel to Z
    const origin = { x: 45, y: 50, z: -100 };
    const dir = { x: 0, y: 0, z: 1 };
    const hit = intersectCylinder(origin, dir, radius, height);
    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeCloseTo(45);
    expect(hit!.point.z).toBeCloseTo(0);
  });

  it('ignores intersections outside vertical cylinder bounds', () => {
    // Shooting up above the top of the lamp
    const origin = { x: 0, y: 150, z: 0 };
    const dir = { x: 1, y: 0, z: 0 };
    const hit = intersectCylinder(origin, dir, radius, height, 0, 100);
    expect(hit).toBeNull();
  });

  it('correctly maps theta to UV coordinates and back', () => {
    // Front point: z = radius, x = 0 -> theta = PI/2 -> u = (PI/2 + PI)/(2PI) = 0.75
    const thetaFront = Math.PI / 2;
    const uFront = thetaToU(thetaFront);
    expect(uFront).toBeCloseTo(0.75);
    expect(uToTheta(uFront)).toBeCloseTo(thetaFront);

    // Negative X: theta = PI or -PI -> u = 0 or 1
    const thetaZero = 0;
    const uZero = thetaToU(thetaZero);
    expect(uZero).toBeCloseTo(0.5);
  });
});
