#!/usr/bin/env node
// Fails the build when the built frontend carries any of the algorithm: a sentinel name or message, a kit file name,
// a source map or an STL. Usage: node scripts/check-bundle.mjs [--dist <dir>]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const arg = process.argv.indexOf('--dist');
const dist = arg > -1 ? process.argv[arg + 1] : 'dist';

// Exported names (they only survive an unminified build) and string literals (they survive minification).
const SENTINELS = [
  'generateTealightShade', 'generateTealightMapSvg', 'suggestRibs', 'compareShadow', 'buildTealightField',
  'generateShadowBowl', 'generateShadowWall', 'fitShadowSize', 'buildKit', 'buildRimProfile', 'generatePerforatedWall',
  'buildBracket', 'extractSmoothLoops', 'bridgeFloatingPieces', 'indexedMeshToBinarySTL', 'checkMesh',
  'tray-2aa', 'tray-2aaa', 'wall-hook', 'lamp-post', 'lamp-cap', 'wiring-bracket-100',
  'Odd Shadows box kit', 'No room for the foot and 5 mm of pattern', 'Light source height must be',
];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(dist)) {
  if (/\.(map|stl)$/i.test(file)) problems.push(`${file}: a ${file.split('.').pop()} file must not be published`);
  else if (/\.(js|mjs|html|css)$/.test(file)) {
    const text = readFileSync(file, 'utf8');
    for (const s of SENTINELS) if (text.includes(s)) problems.push(`${file}: contains "${s}"`);
  }
}
if (problems.length) {
  console.error(`Algorithm leaked into the frontend build:\n${problems.join('\n')}`);
  process.exit(1);
}
