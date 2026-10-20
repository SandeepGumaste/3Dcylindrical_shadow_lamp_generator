import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {build} from 'vite';

const root = path.resolve(__dirname, '../..');
let out: string;
const saved = {site: process.env.VITE_SITE_URL, vercel: process.env.VERCEL_ENV};

beforeEach(() => {
  out = mkdtempSync(path.join(os.tmpdir(), 'odd-shadows-build-'));
  process.env.VITE_SITE_URL = 'https://example.com';
});
afterEach(() => {
  rmSync(out, {recursive: true, force: true});
  for (const [k, v] of [['VITE_SITE_URL', saved.site], ['VERCEL_ENV', saved.vercel]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const run = () =>
  build({root, mode: 'production', logLevel: 'silent', build: {outDir: out, emptyOutDir: true}});

describe('real vite build and placeholders', () => {
  // Skipped while the legal pages are disabled: no built page carries placeholders. Re-enable with them.
  it.skip('rejects in a production deploy while placeholders remain', async () => {
    process.env.VERCEL_ENV = 'production';
    await expect(run()).rejects.toThrow(/OWNER_EMAIL/);
  }, 120_000);

  it('builds when VERCEL_ENV is not production', async () => {
    delete process.env.VERCEL_ENV;
    await expect(run()).resolves.toBeDefined();
  }, 120_000);
});
