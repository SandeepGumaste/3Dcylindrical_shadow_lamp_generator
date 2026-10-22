import { describe, expect, it } from 'vitest';
import { applyFit, previewRequest } from '../requests';
import { toBoxResult, toLightResult, toWallResult } from '../results';
import { encodeGray } from '../client';
import { DEFAULT_SHADOW_WALL_PARAMS } from '../../contracts/shadowWall';

const img = { width: 512, height: 512, pixels: new Float32Array(512 * 512).fill(0.5) };

describe('previewRequest', () => {
  it('builds a preview request with the gray image encoded', () => {
    const r = previewRequest('wall', DEFAULT_SHADOW_WALL_PARAMS, { image: img });
    expect(r.mode).toBe('wall');
    expect(r.output).toBe('preview');
    expect(r.image).toEqual({ kind: 'gray', width: 512, height: 512, pixels: encodeGray(img.pixels) });
    expect(r.fit).toBeUndefined();
  });
  it('asks for a fit only when told to', () => {
    expect(previewRequest('wall', {}, { image: img, fit: true }).fit).toBe(true);
  });
  it('carries the panel image for the box and sends no image for the light source', () => {
    const box = previewRequest('box', {}, { image: img, panel: img });
    expect(box.panel).toEqual(box.image);
    const light = previewRequest('light', { height: 120 });
    expect('image' in light && light.image !== undefined).toBe(false);
    expect(light.params).toEqual({ height: 120 });
  });
});

describe('applyFit', () => {
  it('changes only the shadow size, when it differs', () => {
    const out = applyFit(DEFAULT_SHADOW_WALL_PARAMS, { shadowSize: 250, ok: true });
    expect(out.params).toEqual({ ...DEFAULT_SHADOW_WALL_PARAMS, shadowSize: 250 });
    expect(out.ok).toBe(true);
  });
  it('returns the same object when the size already fits', () => {
    const out = applyFit(DEFAULT_SHADOW_WALL_PARAMS, { shadowSize: DEFAULT_SHADOW_WALL_PARAMS.shadowSize, ok: false });
    expect(out.params).toBe(DEFAULT_SHADOW_WALL_PARAMS);
    expect(out.ok).toBe(false);
  });
  it('leaves the settings alone when there is no fit', () => {
    expect(applyFit(DEFAULT_SHADOW_WALL_PARAMS, undefined)).toEqual({ params: DEFAULT_SHADOW_WALL_PARAMS, ok: true });
  });
});

describe('result converters', () => {
  const mesh = { positions: new Float32Array(9), indices: new Uint32Array(3) };
  it('keeps the wall numbers the viewport needs', () => {
    const r = toWallResult({ ...mesh, meta: { triangleCount: 1, check: { watertight: true, errors: [] } as any, warnings: [], ms: 5, lightZ: 90, topZ: 70, groundRadius: 200 } });
    expect([r.lightZ, r.topZ, r.groundRadius, r.triangleCount]).toEqual([90, 70, 200, 1]);
  });
  it('shapes the box result as the panel and viewport read it', () => {
    const r = toBoxResult({ ...mesh, meta: { parts: [{ id: 'tray-2aa', label: 'Tray', generated: false }], light: { x: 1, y: 2, z: 3 }, warnings: ['w'], clamped: true, ms: 9 } });
    expect(r.parts).toHaveLength(1);
    expect(r.preview).toEqual(mesh);
    expect(r.light.z).toBe(3);
    expect(r.clamped).toBe(true);
  });
  it('exposes the bracket mesh and its triangle count', () => {
    const r = toLightResult({ ...mesh, meta: { triangleCount: 1 } });
    expect(r.mesh).toEqual(mesh);
    expect(r.triangleCount).toBe(1);
  });
});
