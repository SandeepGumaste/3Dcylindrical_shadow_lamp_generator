import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildKit, placeWall, type PartLoader } from '../kit';
import { generateWall } from '../wallMesh';
import { buildRimProfile } from '../rimProfile';
import { WALL_IDS } from '../kitSpec';
import { indexedMeshToBinarySTL } from '../../stl';
import { moveToOrigin } from '../stlParse';
import { checkMesh } from '../../meshCheck';
import { DEFAULT_BOX_PARAMS, type BoxParams } from '../rimProfile';
import { KIT } from '../kitSpec';
import type { GrayImage } from '../../../types';

const load: PartLoader = async (file) => {
  const b = readFileSync(new URL(`../../../../public/box-kit/${file}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const disc: GrayImage = (() => {
  const n = 200, pixels = new Float32Array(n * n).fill(1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - 100, y - 100) < 60) pixels[y * n + x] = 0;
  return { width: n, height: n, pixels };
})();
const P = (o: Partial<BoxParams> = {}): BoxParams => ({ ...DEFAULT_BOX_PARAMS, ...o });
const triangles = (stl: ArrayBuffer) => new DataView(stl).getUint32(80, true);
const zipNames = (zip: Uint8Array) => {
  const dv = new DataView(zip.buffer, zip.byteOffset), names: string[] = [];
  let o = 0;
  while (dv.getUint32(o, true) === 0x04034b50) {
    const size = dv.getUint32(o + 18, true), nl = dv.getUint16(o + 26, true);
    names.push(new TextDecoder().decode(zip.slice(o + 30, o + 30 + nl)));
    o += 30 + nl + size;
  }
  return names;
};

describe('kit builder', () => {
  it('returns 4 walls, the panel and the 5 fixed parts for the chosen tray', async () => {
    const kit = await buildKit(disc, disc, P({ tray: '2AA' }), load);
    expect(kit.parts.map((p) => p.id)).toEqual(['wall-1', 'wall-2', 'wall-3', 'wall-4', 'panel', 'tray-2aa', 'cover-2aa', 'lamp-post', 'lamp-cap', 'wall-hook']);
    expect(kit.parts.filter((p) => p.generated).length).toBe(5);
  });

  it('exports the fixed parts with exactly the triangles of the original files', async () => {
    const kit = await buildKit(disc, disc, P(), load);
    for (const part of kit.parts.filter((q) => !q.generated)) {
      const file = part.id.replace(/^(.*)$/, '$1.stl');
      expect(triangles(part.stl)).toBe(triangles(await load(file)));
    }
  });

  it('changing the tray swaps only the tray and its cover', async () => {
    const a = (await buildKit(disc, disc, P({ tray: '2AA' }), load)).parts.map((p) => p.id);
    const b = (await buildKit(disc, disc, P({ tray: '2AAA' }), load)).parts.map((p) => p.id);
    expect(a.filter((id) => !b.includes(id))).toEqual(['tray-2aa', 'cover-2aa']);
    expect(b.filter((id) => !a.includes(id))).toEqual(['tray-2aaa', 'cover-2aaa']);
  });

  it('zips one STL per part', async () => {
    const kit = await buildKit(disc, disc, P(), load);
    expect(zipNames(kit.zip).sort()).toEqual(kit.parts.map((p) => `${p.id}.stl`).sort());
  });

  it('previews the assembled box at about 120 x 150 mm with the light above the panel', async () => {
    const kit = await buildKit(disc, disc, P({ lightHeight: 40 }), load);
    const p = kit.preview.positions;
    const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 2; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
    // wall 1 is 121 mm long in the original files, so the box can be up to 1 mm wider than its tray
    expect(Math.abs(mx[0] - mn[0] - 120)).toBeLessThanOrEqual(1.01);
    expect(Math.abs(mx[1] - mn[1] - 150)).toBeLessThanOrEqual(1.01);
    expect(kit.light.z).toBeCloseTo(KIT.T + 40, 6);
  });

  it('places every wall without mirroring it (outward faces stay outward)', () => {
    const prof = buildRimProfile(disc, P());
    for (const id of WALL_IDS) {
      const placed = placeWall(id, generateWall(id, prof));
      expect(checkMesh(placed.positions, placed.indices).signedVolume, id).toBeGreaterThan(0);
    }
  });
});

describe('inner details', () => {
  const raster = (dark: (x: number, y: number) => boolean, n = 450): GrayImage => {
    const pixels = new Float32Array(n * n).fill(1);
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) if (dark(px + 0.5 - n / 2, n / 2 - (py + 0.5))) pixels[py * n + px] = 0;
    return { width: n, height: n, pixels };
  };
  // a lit patch well inside the frame (radius 155 to 205 mm) with a dark dot floating in it
  const face = raster((x, y) => (Math.hypot(x, y) < 250 && Math.hypot(x, y - 180) >= 25) || Math.hypot(x, y - 180) < 5);
  const wallParts = (kit: Awaited<ReturnType<typeof buildKit>>) => kit.parts.filter((q) => q.id.startsWith('wall-') && q.id !== 'wall-hook');

  it('cuts openings in the walls, keeps them watertight, and reports bridged pieces', async () => {
    const on = await buildKit(face, disc, P({ innerDetails: true }), load);
    const off = await buildKit(face, disc, P({ innerDetails: false }), load);
    const tri = (k: typeof on) => wallParts(k).reduce((n, q) => n + q.mesh.indices.length / 3, 0);
    expect(tri(on)).toBeGreaterThan(tri(off));
    for (const q of wallParts(on)) expect(checkMesh(q.mesh.positions, q.mesh.indices).watertight, q.id).toBe(true);
    expect(on.warnings.join(' ')).toMatch(/opening/i);
    expect(on.warnings.join(' ')).toMatch(/bridge/i);
  });

  it('with the option off the walls are exactly the plain walls', async () => {
    const off = await buildKit(face, disc, P({ innerDetails: false }), load);
    const profile = buildRimProfile(face, P({ innerDetails: false }));
    const plain = moveToOrigin(generateWall('w1', profile));
    expect(new Uint8Array(wallParts(off)[0].stl)).toEqual(new Uint8Array(indexedMeshToBinarySTL(plain.positions, plain.indices, 'Odd Shadows box kit')));
  });

  it('keeps time and size bounded for an image of hundreds of small lit and dark dots', async () => {
    const dots = raster((x, y) => Math.hypot(x, y) < 260 && Math.hypot((x + 400) % 10 - 5, (y + 400) % 10 - 5) < 3.3);
    const t0 = Date.now();
    const kit = await buildKit(dots, disc, P({ innerDetails: true }), load);
    expect(Date.now() - t0).toBeLessThan(15000);
    for (const q of wallParts(kit)) expect(q.mesh.indices.length / 3, q.id).toBeLessThan(400000);
  }, 30000);
});
