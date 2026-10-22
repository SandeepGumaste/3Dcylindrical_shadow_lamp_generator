import { describe, expect, it } from 'vitest';
import { download, encodeGray, generate } from '../client';
import { unframeResponse } from '../frame';
import { ApiError } from '../errors';
import { decodeComparison } from '../results';
import type { GenerateRequest } from '../../contracts/api';

const req: GenerateRequest = { mode: 'light', params: {}, output: 'preview' };
const fakeFetch = (res: Response) => (async () => res) as unknown as typeof fetch;

/** Builds a buffer in the documented layout by hand, independent of the backend's writer. */
function framed(meta: object, positions: number[], indices: number[]) {
  const full = { ...meta, positionsBytes: positions.length * 4, indicesBytes: indices.length * 4 };
  let json = JSON.stringify(full);
  while (json.length % 4) json += ' ';
  const bytes = new TextEncoder().encode(json);
  const buf = new ArrayBuffer(4 + bytes.length + positions.length * 4 + indices.length * 4);
  new DataView(buf).setUint32(0, bytes.length, true);
  new Uint8Array(buf, 4, bytes.length).set(bytes);
  new Float32Array(buf, 4 + bytes.length, positions.length).set(positions);
  new Uint32Array(buf, 4 + bytes.length + positions.length * 4, indices.length).set(indices);
  return buf;
}

describe('unframeResponse', () => {
  it('reads meta, positions and indices from the documented layout', () => {
    const out = unframeResponse(framed({ triangleCount: 1 }, [0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2]));
    expect(out.meta.triangleCount).toBe(1);
    expect(Array.from(out.positions)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(out.indices)).toEqual([0, 1, 2]);
  });
  it('rejects a truncated buffer', () => {
    const buf = framed({}, [0, 0, 0], [0, 0, 0]);
    expect(() => unframeResponse(buf.slice(0, buf.byteLength - 4))).toThrow();
  });
});

describe('generate', () => {
  it('returns the unframed preview on 200', async () => {
    const res = new Response(framed({ triangleCount: 7 }, [0, 0, 0], [0, 0, 0]), { status: 200 });
    expect((await generate(req, undefined, fakeFetch(res))).meta.triangleCount).toBe(7);
  });
  it('rejects with ApiError status 401 on an unauthorized response', async () => {
    const res = new Response('{"error":"unauthorized"}', { status: 401 });
    await expect(generate(req, undefined, fakeFetch(res))).rejects.toMatchObject({ name: 'ApiError', status: 401 });
  });
  it("surfaces the server's validation messages on 422", async () => {
    const res = new Response('{"error":"a","errors":["a","b"]}', { status: 422 });
    const e = await generate(req, undefined, fakeFetch(res)).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.errors).toEqual(['a', 'b']);
  });
  it('turns a body that is not JSON into a generic ApiError', async () => {
    const res = new Response('<html>bad gateway</html>', { status: 502 });
    await expect(generate(req, undefined, fakeFetch(res))).rejects.toMatchObject({ status: 502 });
  });
  it('sends credentials and a JSON body', async () => {
    let seen: RequestInit | undefined;
    const f = (async (_u: string, init: RequestInit) => { seen = init; return new Response(framed({}, [0, 0, 0], [0, 0, 0])); }) as unknown as typeof fetch;
    await generate(req, undefined, f);
    expect(seen?.credentials).toBe('include');
    expect(seen?.method).toBe('POST');
    expect(JSON.parse(seen?.body as string)).toEqual(req);
  });
});

describe('download', () => {
  it('returns the blob and the filename from Content-Disposition', async () => {
    const res = new Response('abc', { status: 200, headers: { 'content-disposition': 'attachment; filename="odd-shadows-tealight.stl"' } });
    const out = await download(req, fakeFetch(res));
    expect(out.filename).toBe('odd-shadows-tealight.stl');
    expect(await out.blob.text()).toBe('abc');
  });
});

describe('encodeGray', () => {
  it('encodes Float32 values as base64 of their little-endian bytes', () => {
    expect(encodeGray(new Float32Array([0.25, 0.5]))).toBe('AACAPgAAAD8=');
  });
});

describe('decodeComparison', () => {
  it('turns the base64 rasters back into byte arrays', () => {
    const wire = { size: 2, iou: 0.5, projected: btoa('\u0001\u0000\u0001\u0000'), target: btoa('\u0000\u0001\u0000\u0001'), valid: btoa('\u0001\u0001\u0001\u0001') };
    const c = decodeComparison(wire);
    expect(Array.from(c.projected)).toEqual([1, 0, 1, 0]);
    expect(Array.from(c.target)).toEqual([0, 1, 0, 1]);
    expect(c.iou).toBe(0.5);
  });
});
