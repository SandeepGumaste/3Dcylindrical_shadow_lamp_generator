import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {PAGES, pageInputs} from '../lib/pages';

const root = path.resolve(__dirname, '../..');

describe('site page map', () => {
  // privacy, legal, faq and terms are disabled for now; see site/lib/pages.ts.
  it('has exactly the two enabled routes', () => {
    expect(PAGES).toEqual({
      '/': 'index.html',
      '/app': 'app/index.html',
    });
  });

  it('every page file exists', () => {
    for (const file of Object.values(PAGES)) {
      expect(existsSync(path.join(root, file)), file).toBe(true);
    }
  });

  it('pageInputs resolves each PAGES file to an absolute path', () => {
    const inputs = pageInputs(root);
    expect(Object.values(inputs).sort()).toEqual(
      Object.values(PAGES).map((f) => path.resolve(root, f)).sort(),
    );
    expect(Object.keys(inputs).sort()).toEqual(['app', 'main']);
  });

  it('vite.config.ts uses pageInputs for the build input', () => {
    const src = readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
    expect(src).toContain('pageInputs');
    expect(src).toContain('rollupOptions');
  });

  it('static root page has no script other than JSON-LD', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const m of html.matchAll(/<script\b[^>]*>/gi)) expect(m[0]).toMatch(/application\/ld\+json/);
  });
});

describe('vercel.json', () => {
  const cfg = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  it('enables cleanUrls', () => {
    expect(cfg.cleanUrls).toBe(true);
  });
  it('proxies /api/* to the backend and rewrites /app/:path*', () => {
    expect(cfg.rewrites).toEqual([
      {source: '/api/:path*', destination: 'https://odd-shadows-api.onrender.com/api/:path*'},
      {source: '/app/:path*', destination: '/app/index.html'},
    ]);
  });
});
