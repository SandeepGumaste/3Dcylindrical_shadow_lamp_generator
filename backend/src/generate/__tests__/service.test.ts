import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeGray, parseRequest, RequestError } from '../request';
import { generate } from '../service';
import { syntheticImage } from '../../__golden__/syntheticImage';
import type { GenerateRequest } from '../../contracts/api';

const golden = JSON.parse(readFileSync(new URL('../../__golden__/golden.json', import.meta.url), 'utf8'));
const img = syntheticImage();
const gray = { kind: 'gray' as const, width: 512 as const, height: 512 as const, pixels: encodeGray(img) };

async function run(over: Record<string, unknown>) {
  const parsed = parseRequest({ mode: 'tealight', image: gray, params: {}, output: 'preview', ...over } as GenerateRequest);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return generate(parsed.req);
}
const framed = (r: Awaited<ReturnType<typeof run>>) => {
  if (r.kind !== 'framed') throw new Error('expected a framed result');
  return r;
};
const file = (r: Awaited<ReturnType<typeof run>>) => {
  if (r.kind !== 'file') throw new Error('expected a file result');
  return r;
};
const stlTriangles = (b: ArrayBuffer | string) => new DataView(b as ArrayBuffer).getUint32(80, true);

describe('generate: parity with the golden values', () => {
  it.each([
    ['tealight-default', { mode: 'tealight', params: {} }],
    ['tealight-ribs', { mode: 'tealight', params: { autoRibs: false, ribs: 3 } }],
    ['bowl-default', { mode: 'bowl', params: {} }],
    ['wall-default', { mode: 'wall', params: {} }],
    ['wall-nondefault', { mode: 'wall', params: { imageScale: 70 } }],
  ])('%s keeps its triangle count and watertight flag', async (key, over) => {
    const r = framed(await run(over));
    const meta = r.meta as { triangleCount: number; check: { watertight: boolean } };
    expect(meta.triangleCount).toBe(golden[key].triangleCount);
    expect(meta.check.watertight).toBe(golden[key].watertight);
    expect(r.indices.length / 3).toBe(golden[key].triangleCount);
  }, 60_000);

  it('box-default keeps its part count and total part triangles', async () => {
    const r = framed(await run({ mode: 'box', params: {} }));
    const parts = (r.meta as { parts: { id: string }[] }).parts;
    expect(parts).toHaveLength(golden['box-default'].parts);
    let total = 0;
    for (const p of parts) total += stlTriangles(file(await run({ mode: 'box', params: {}, output: { part: p.id } })).body);
    expect(total).toBe(golden['box-default'].triangleCount);
  }, 120_000);

  it('light-default keeps its triangle count', async () => {
    const r = framed(await run({ mode: 'light', image: undefined, params: {} }));
    expect((r.meta as { triangleCount: number }).triangleCount).toBe(golden['light-default'].triangleCount);
  });
});

describe('generate: outputs', () => {
  it('returns a binary STL whose triangle count equals the golden', async () => {
    const r = file(await run({ output: 'stl' }));
    expect(r.contentType).toBe('model/stl');
    expect(r.filename).toMatch(/\.stl$/);
    expect(stlTriangles(r.body)).toBe(golden['tealight-default'].triangleCount);
  });
  it('returns the unwrapped map as SVG for the tealight shade', async () => {
    const r = file(await run({ output: 'svg' }));
    expect(r.contentType).toBe('image/svg+xml');
    expect(String(r.body).trimStart().startsWith('<?xml')).toBe(true);
    expect(String(r.body)).toContain('<svg');
  });
  it('returns the box kit as a zip', async () => {
    const r = file(await run({ mode: 'box', output: 'zip' }));
    expect(new TextDecoder().decode(new Uint8Array(r.body as ArrayBuffer).slice(0, 2))).toBe('PK');
  }, 60_000);
  it('keeps the compared shadow rasters small and JSON-safe (base64)', async () => {
    const meta = framed(await run({})).meta as { comparison: { projected: string; size: number } };
    expect(typeof meta.comparison.projected).toBe('string');
    expect(Buffer.from(meta.comparison.projected, 'base64').length).toBe(meta.comparison.size ** 2);
  });
  it('does not put the map or the STL in the preview meta', async () => {
    const meta = framed(await run({})).meta as Record<string, unknown>;
    expect(meta.mapSvg).toBeUndefined();
    expect(meta.stl).toBeUndefined();
  });
  it('refuses an output the mode cannot produce with a 422 RequestError', async () => {
    await expect(run({ mode: 'bowl', output: 'svg' })).rejects.toMatchObject({ status: 422 });
    await expect(run({ mode: 'wall', output: 'zip' })).rejects.toBeInstanceOf(RequestError);
    await expect(run({ mode: 'box', output: { part: 'nope' } })).rejects.toMatchObject({ status: 422 });
  }, 60_000);
});

describe('generate: flat strip', () => {
  const entries = (z: ArrayBuffer) => {
    const b = new Uint8Array(z), dv = new DataView(z);
    const names: string[] = [];
    for (let o = 0; o + 30 < b.length && dv.getUint32(o, true) === 0x04034b50; ) {
      const size = dv.getUint32(o + 18, true), n = dv.getUint16(o + 26, true);
      names.push(new TextDecoder().decode(b.subarray(o + 30, o + 30 + n)));
      o += 30 + n + size;
    }
    return names;
  };
  it('returns a zip of each part alone and all parts together', async () => {
    const r = file(await run({ mode: 'flat', output: 'zip', params: {} }));
    expect(r.contentType).toBe('application/zip');
    expect(entries(r.body as ArrayBuffer)).toEqual(['strip.stl', 'base-ring.stl', 'all-parts.stl']);
  });
  it('adds the socket ring in LED mode', async () => {
    const r = file(await run({ mode: 'flat', output: 'zip', params: { useLed: true } }));
    expect(entries(r.body as ArrayBuffer)).toEqual(['strip.stl', 'base-ring.stl', 'socket-ring.stl', 'all-parts.stl']);
  });
  it('refuses a preview and invalid settings', async () => {
    await expect(run({ mode: 'flat', output: 'preview', params: {} })).rejects.toBeInstanceOf(RequestError);
    const bad = parseRequest({ mode: 'flat', image: gray, params: { layers: 9 }, output: 'zip' } as GenerateRequest);
    expect(bad).toMatchObject({ ok: false, status: 422 });
  });
});

describe('generate: fit', () => {
  it('wall with fit returns the fitted size and generates with it', async () => {
    const r = framed(await run({ mode: 'wall', fit: true }));
    const meta = r.meta as { fit: { shadowSize: number; ok: boolean } };
    expect(typeof meta.fit.shadowSize).toBe('number');
    expect(typeof meta.fit.ok).toBe('boolean');
  }, 60_000);
});
