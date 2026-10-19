import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {PAGES, pageInputs} from '../lib/pages';

const root = path.resolve(__dirname, '../..');

describe('site page map', () => {
  it('has exactly the six routes', () => {
    expect(PAGES).toEqual({
      '/': 'index.html',
      '/app': 'app/index.html',
      '/privacy': 'privacy/index.html',
      '/legal': 'legal/index.html',
      '/faq': 'faq/index.html',
      '/terms': 'terms/index.html',
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
    expect(Object.keys(inputs).sort()).toEqual(['app', 'faq', 'legal', 'main', 'privacy', 'terms']);
  });

  it('vite.config.ts uses pageInputs for the build input', () => {
    const src = readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
    expect(src).toContain('pageInputs');
    expect(src).toContain('rollupOptions');
  });

  it('static root page loads no script', () => {
    expect(readFileSync(path.join(root, 'index.html'), 'utf8')).not.toMatch(/<script/i);
  });
});

describe('vercel.json', () => {
  const cfg = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  it('enables cleanUrls', () => {
    expect(cfg.cleanUrls).toBe(true);
  });
  it('rewrites only /app/:path*', () => {
    expect(cfg.rewrites).toEqual([{source: '/app/:path*', destination: '/app/index.html'}]);
  });
});
