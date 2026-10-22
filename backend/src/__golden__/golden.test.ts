import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runTealightRequest } from '../compute/tealightCompute';
import { runShadowWallRequest } from '../compute/shadowWallCompute';
import { runBoxRequest } from '../compute/boxCompute';
import { DEFAULT_TEALIGHT_PARAMS } from '../geometry/tealightShade';
import { DEFAULT_BOWL_PARAMS } from '../geometry/shadowBowl';
import { DEFAULT_SHADOW_WALL_PARAMS } from '../geometry/shadowWall/shadowWall';
import { DEFAULT_BOX_PARAMS } from '../geometry/box/rimProfile';
import { buildBracket, DEFAULT_HEIGHT } from '../geometry/lightSource/bracket';
import { parseBinaryStl } from '../geometry/box/stlParse';
import { checkMesh } from '../geometry/meshCheck';
import type { PartLoader } from '../geometry/box/kit';
import { syntheticImage } from './syntheticImage';

const GOLDEN = new URL('./golden.json', import.meta.url);
const bytes = (path: string) => {
  const b = readFileSync(new URL(path, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const load: PartLoader = async (file) => bytes(`../../assets/box-kit/${file}`);
const stlTriangles = (stl: ArrayBuffer) => new DataView(stl).getUint32(80, true);

type Entry = { triangleCount: number; watertight: boolean; parts?: number };

async function compute(): Promise<Record<string, Entry>> {
  const image = syntheticImage();
  const out: Record<string, Entry> = {};
  const mesh = (r: { triangleCount: number; check: { watertight: boolean } }): Entry => ({ triangleCount: r.triangleCount, watertight: r.check.watertight });

  out['tealight-default'] = mesh(runTealightRequest({ kind: 'tealight', image, params: DEFAULT_TEALIGHT_PARAMS }));
  out['tealight-ribs'] = mesh(runTealightRequest({ kind: 'tealight', image, params: { ...DEFAULT_TEALIGHT_PARAMS, autoRibs: false, ribs: 3 } }));
  out['bowl-default'] = mesh(runTealightRequest({ kind: 'bowl', image, params: DEFAULT_BOWL_PARAMS }));
  out['wall-default'] = mesh(runShadowWallRequest({ image, params: DEFAULT_SHADOW_WALL_PARAMS }));
  out['wall-nondefault'] = mesh(runShadowWallRequest({ image, params: { ...DEFAULT_SHADOW_WALL_PARAMS, imageScale: 70 } }));

  const box = await runBoxRequest({ shadow: image, panel: image, params: DEFAULT_BOX_PARAMS }, load);
  out['box-default'] = {
    triangleCount: box.parts.reduce((n, p) => n + stlTriangles(p.stl), 0),
    watertight: checkMesh(box.preview.positions, box.preview.indices).watertight,
    parts: box.parts.length,
  };

  const sample = parseBinaryStl(bytes('../../assets/light-source/wiring-bracket-100.stl'));
  const bracket = buildBracket(sample, { height: DEFAULT_HEIGHT });
  out['light-default'] = { triangleCount: bracket.indices.length / 3, watertight: checkMesh(bracket.positions, bracket.indices).watertight };
  return out;
}

describe('golden characterization', () => {
  it('matches the recorded triangle counts and watertight flags for every generator', async () => {
    const actual = await compute();
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) {
      writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n');
    }
    expect(actual).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  }, 120_000);
});
