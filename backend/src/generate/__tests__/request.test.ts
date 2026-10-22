import { describe, expect, it } from 'vitest';
import { decodeGray, encodeGray, parseRequest } from '../request';
import { syntheticImage } from '../../__golden__/syntheticImage';
import { DEFAULT_TEALIGHT_PARAMS, validateTealightParams } from '../../geometry/tealightShade';
import type { GenerateRequest } from '../../contracts/api';

const img = syntheticImage();
const gray = (pixels = encodeGray(img)) => ({ kind: 'gray' as const, width: 512 as const, height: 512 as const, pixels });
const body = (over: Partial<GenerateRequest> | Record<string, unknown> = {}) => ({
  mode: 'tealight', image: gray(), params: {}, output: 'preview', ...over,
});

describe('gray image encoding', () => {
  it('round-trips the exact Float32 pixels', () => {
    const back = decodeGray(encodeGray(img));
    expect(back.width).toBe(512);
    expect(back.height).toBe(512);
    expect(Buffer.from(back.pixels.buffer).equals(Buffer.from(img.pixels.buffer))).toBe(true);
  });
});

describe('parseRequest', () => {
  it('accepts a valid request and fills missing settings from the defaults', () => {
    const r = parseRequest(body({ params: { height: 60 } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.req.params).toEqual({ ...DEFAULT_TEALIGHT_PARAMS, height: 60 });
  });
  it('drops unknown settings', () => {
    const r = parseRequest(body({ params: { evil: 1, __proto__: { x: 1 } } }));
    expect(r.ok && 'evil' in r.req.params).toBe(false);
  });
  it('rejects pixels of the wrong byte length with 400', () => {
    const r = parseRequest(body({ image: gray(Buffer.alloc(100).toString('base64')) }));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it('rejects NaN and Infinity pixels with 400', () => {
    const bad = new Float32Array(512 * 512).fill(0.5);
    bad[10] = NaN;
    const r = parseRequest(body({ image: gray(Buffer.from(bad.buffer).toString('base64')) }));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it('rejects non-finite and wrong-typed settings with 400', () => {
    expect(parseRequest(body({ params: { height: 'tall' } }))).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest(body({ params: { height: 1e999 } }))).toMatchObject({ ok: false, status: 400 });
  });
  it('rejects a missing image, an unknown mode, an unknown output and a non-object body with 400', () => {
    expect(parseRequest(body({ image: undefined }))).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest(body({ mode: 'cylinder' }))).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest(body({ output: 'exe' }))).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest('nope')).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest(null)).toMatchObject({ ok: false, status: 400 });
  });
  it('does not need an image for the light source', () => {
    expect(parseRequest({ mode: 'light', params: { height: 120 }, output: 'preview' }).ok).toBe(true);
  });
  it('answers 422 with the validator messages for an invalid setting', () => {
    const r = parseRequest(body({ params: { height: -5 } }));
    expect(r).toEqual({ ok: false, status: 422, errors: validateTealightParams({ ...DEFAULT_TEALIGHT_PARAMS, height: -5 }) });
  });
});
