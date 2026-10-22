import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = new URL('../../', import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(f)) out.push(p);
  }
  return out;
}

describe('frontend boundary', () => {
  it('imports nothing from the backend or from algorithm folders', () => {
    const bad: string[] = [];
    for (const dir of ['src', 'site', 'vite-plugins']) {
      for (const file of walk(join(root, dir))) {
        if (file.endsWith('boundary.test.ts')) continue;
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
          if (/backend/.test(m[1]) || /(^|\/)(geometry|shadow|compute|workers)(\/|$)/.test(m[1])) bad.push(`${relative(root, file)} -> ${m[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('holds no algorithm folders, kit models or sampling code', () => {
    const present = ['src/geometry', 'src/workers', 'src/shadow', 'src/image/sampling.ts', 'src/image/tealightSamples.ts', 'public/box-kit', 'public/light-source']
      .filter((p) => existsSync(join(root, p)));
    expect(present).toEqual([]);
  });
});

describe('check-bundle script', () => {
  const script = join(root, 'scripts/check-bundle.mjs');
  const run = (files: Record<string, string>) => {
    const dist = mkdtempSync(join(tmpdir(), 'dist-'));
    mkdirSync(join(dist, 'assets'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dist, name), text);
    return spawnSync('node', [script, '--dist', dist], { encoding: 'utf8' });
  };
  it('passes on a clean bundle', () => {
    expect(run({ 'assets/app.js': 'console.log("hello")' }).status).toBe(0);
  });
  it('fails and names the sentinel found in the bundle', () => {
    const r = run({ 'assets/app.js': 'x("generateTealightShade")' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('generateTealightShade');
  });
  it('fails on a kit file name, an algorithm message, a source map or an STL', () => {
    expect(run({ 'assets/app.js': 'load("tray-2aa")' }).status).toBe(1);
    expect(run({ 'assets/app.js': '"No room for the foot and 5 mm of pattern"' }).status).toBe(1);
    expect(run({ 'assets/app.js': 'ok', 'assets/app.js.map': '{}' }).status).toBe(1);
    expect(run({ 'assets/app.js': 'ok', 'assets/part.stl': 'solid' }).status).toBe(1);
  });
});
