import { describe, it, expect, vi } from 'vitest';
import { exportFlatStrip } from '../useTealightGenerator';
import { DEFAULT_TEALIGHT_PARAMS } from '../../geometry/tealightShade';
import { DEFAULT_FLAT_STRIP_PARAMS } from '../../geometry/flatStrip';
import { asymmetricTestImage } from '../../image/tealightSamples';
import type { TealightOutput } from '../../workers/tealightCompute';

const image = asymmetricTestImage(64);
const out = (watertight: boolean): TealightOutput => ({
  kind: 'flat', positions: new Float32Array(), indices: new Uint32Array(), triangleCount: 0, stl: new ArrayBuffer(84), zip: new Uint8Array(4),
  check: { triangleCount: 0, watertight, badEdges: watertight ? 0 : 3, degenerateTriangles: 0, signedVolume: 1, errors: watertight ? [] : ['bad edges'] },
  warnings: ['careful'], ms: 1, lightZ: 0, topZ: 0, groundRadius: 150,
});

describe('exportFlatStrip', () => {
  it('reports validation errors and never runs or saves', async () => {
    const run = vi.fn(), save = vi.fn();
    const r = await exportFlatStrip({ image, params: { ...DEFAULT_TEALIGHT_PARAMS, useLed: true, topDiameter: 38 }, flat: DEFAULT_FLAT_STRIP_PARAMS, name: 'cat', run, save });
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('socket');
    expect(run).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves a watertight strip as a zip with a flat-strip filename and keeps its warnings', async () => {
    const run = vi.fn().mockResolvedValue(out(true)), save = vi.fn();
    const r = await exportFlatStrip({ image, params: DEFAULT_TEALIGHT_PARAMS, flat: DEFAULT_FLAT_STRIP_PARAMS, name: 'cat', run, save });
    expect(r).toEqual({ ok: true, warnings: ['careful'] });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'flat' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toMatch(/^tealight-flat-strip-cat-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('does not save a mesh that is not watertight', async () => {
    const run = vi.fn().mockResolvedValue(out(false)), save = vi.fn();
    const r = await exportFlatStrip({ image, params: DEFAULT_TEALIGHT_PARAMS, flat: DEFAULT_FLAT_STRIP_PARAMS, name: 'cat', run, save });
    expect(r).toMatchObject({ ok: false });
    expect(save).not.toHaveBeenCalled();
  });
});
