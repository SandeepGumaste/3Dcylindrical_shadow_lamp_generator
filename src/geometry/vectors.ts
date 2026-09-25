/**
 * 3D Vector interface and pure mathematical utility functions
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function createVec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

export function multiply(v: Vec3, scalar: number): Vec3 {
  return {
    x: v.x * scalar,
    y: v.y * scalar,
    z: v.z * scalar,
  };
}

export function divide(v: Vec3, scalar: number): Vec3 {
  if (Math.abs(scalar) < 1e-12) {
    return { x: 0, y: 0, z: 0 };
  }
  const inv = 1 / scalar;
  return {
    x: v.x * inv,
    y: v.y * inv,
    z: v.z * inv,
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < 1e-12) {
    return { x: 0, y: 0, z: 0 };
  }
  const inv = 1 / len;
  return {
    x: v.x * inv,
    y: v.y * inv,
    z: v.z * inv,
  };
}

export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
