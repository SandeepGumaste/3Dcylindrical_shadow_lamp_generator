import { describe, it, expect, vi } from 'vitest';
import { exportFlatStrip } from '../useTealightGenerator';
import { DEFAULT_TEALIGHT_PARAMS } from '../../contracts/tealight';
import { DEFAULT_FLAT_STRIP_PARAMS } from '../../contracts/flatStrip';
import { ApiError } from '../../api/errors';
import type { GrayImage } from '../../types';

const image: GrayImage = { width: 512, height: 512, pixels: new Float32Array(512 * 512).fill(1) };
const file = { blob: new Blob(['zip']), filename: 'odd-shadows-flat-strip.zip', warnings: ['careful'] };

describe('exportFlatStrip', () => {
  it('asks the server for a flat zip and saves it under a flat-strip filename, keeping the warnings', async () => {
    const request = vi.fn().mockResolvedValue(file), save = vi.fn();
    const r = await exportFlatStrip({ image, params: DEFAULT_TEALIGHT_PARAMS, flat: DEFAULT_FLAT_STRIP_PARAMS, name: 'cat', request, save });
    expect(r).toEqual({ ok: true, warnings: ['careful'] });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ mode: 'flat', output: 'zip', params: expect.objectContaining({ layerHeight: 0.2, layers: 2 }) }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toMatch(/^tealight-flat-strip-cat-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('reports the server validation errors and saves nothing', async () => {
    const request = vi.fn().mockRejectedValue(new ApiError(422, 'Flat strip uses the Support Ribs number.', ['Flat strip uses the Support Ribs number.'])), save = vi.fn();
    const r = await exportFlatStrip({ image, params: DEFAULT_TEALIGHT_PARAMS, flat: DEFAULT_FLAT_STRIP_PARAMS, name: 'cat', request, save });
    expect(r).toEqual({ ok: false, error: 'Flat strip uses the Support Ribs number.', errors: ['Flat strip uses the Support Ribs number.'] });
    expect(save).not.toHaveBeenCalled();
  });

  it('reports a network failure with a plain message', async () => {
    const request = vi.fn().mockRejectedValue(new TypeError('fetch failed')), save = vi.fn();
    const r = await exportFlatStrip({ image, params: DEFAULT_TEALIGHT_PARAMS, flat: DEFAULT_FLAT_STRIP_PARAMS, name: 'cat', request, save });
    expect(r).toMatchObject({ ok: false });
    expect(save).not.toHaveBeenCalled();
  });
});
