import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { DEFAULT_TEALIGHT_PARAMS } from '../tealight';
import { DEFAULT_SHADOW_WALL_PARAMS, cornerRadiusLimits } from '../shadowWall';
import { KIT_UI } from '../box';
import { DEFAULT_TEALIGHT_PARAMS as fromAlgorithm } from '../../geometry/tealightShade';
import { DEFAULT_SHADOW_WALL_PARAMS as wallFromAlgorithm } from '../../geometry/shadowWall/shadowWall';
import { KIT } from '../../geometry/box/kitSpec';

const dir = new URL('..', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

describe('contracts', () => {
  it('has the expected files', () => {
    expect(files.sort()).toEqual(['api.ts', 'bowl.ts', 'box.ts', 'flatStrip.ts', 'lightSource.ts', 'outputs.ts', 'shadowWall.ts', 'tealight.ts']);
  });
  it('imports nothing from outside the contracts folder', () => {
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const i of imports) expect(i, `${f} imports ${i}`).toMatch(/^\.\/[^/]+$/);
    }
  });
  it('is the single source of the defaults the algorithm uses', () => {
    expect(fromAlgorithm).toBe(DEFAULT_TEALIGHT_PARAMS);
    expect(wallFromAlgorithm).toBe(DEFAULT_SHADOW_WALL_PARAMS);
  });
  it('computes the corner radius limits from wall thickness and the shorter side', () => {
    expect(cornerRadiusLimits({ width: 100, length: 60, wallThickness: 2 })).toEqual({ min: 4, max: 30 });
  });
  it('mirrors the kit numbers the box panel shows', () => {
    expect(KIT_UI.boxW).toBe(KIT.boxW);
    expect(KIT_UI.boxD).toBe(KIT.boxD);
    expect(KIT_UI.lightHeightRange).toEqual(KIT.lightHeightRange);
  });
});
