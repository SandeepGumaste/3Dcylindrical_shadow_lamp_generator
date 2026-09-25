import { Vec3, add, multiply, normalize } from './vectors';

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export function createRay(origin: Vec3, direction: Vec3): Ray {
  return {
    origin,
    direction: normalize(direction),
  };
}

export function pointAt(ray: Ray, t: number): Vec3 {
  return add(ray.origin, multiply(ray.direction, t));
}
