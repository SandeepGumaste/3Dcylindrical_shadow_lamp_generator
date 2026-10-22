import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { PartLoader } from '../geometry/box/kit';
import { parseBinaryStl, type IndexedMesh } from '../geometry/box/stlParse';

/** Where the kit and bracket STL files live; the container sets ASSETS_DIR. */
const assetsDir = () => process.env.ASSETS_DIR || fileURLToPath(new URL('../../assets', import.meta.url));

const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export const loadKitPart: PartLoader = async (file) => {
  if (file.includes('/') || file.includes('\\') || file.includes('..')) throw new Error(`Bad part name ${file}`);
  return toArrayBuffer(await readFile(join(assetsDir(), 'box-kit', file)));
};

let bracketSample: Promise<IndexedMesh> | undefined;
export function loadBracketSample(): Promise<IndexedMesh> {
  bracketSample ??= readFile(join(assetsDir(), 'light-source', 'wiring-bracket-100.stl')).then((b) => parseBinaryStl(toArrayBuffer(b)));
  return bracketSample;
}
