import { describe, it, expect } from 'vitest';
import { renderSitemap } from '../lib/sitemap';
import { renderRobots } from '../lib/robots';

describe('renderSitemap', () => {
  const xml = renderSitemap('https://example.com/', ['/', '/faq', '/app', '/app/x', '/apple']);
  it('lists absolute URLs with namespace', () => {
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://example.com/</loc>');
    expect(xml).toContain('<loc>https://example.com/faq</loc>');
    expect(xml).toContain('<loc>https://example.com/apple</loc>');
  });
  it('excludes /app and below, and has no lastmod', () => {
    expect(xml).not.toContain('<loc>https://example.com/app</loc>');
    expect(xml).not.toContain('/app/x');
    expect(xml).not.toContain('lastmod');
  });
});

describe('renderRobots', () => {
  it('allows all, disallows api, points at sitemap', () => {
    const r = renderRobots('https://example.com/');
    expect(r).toContain('User-agent: *');
    expect(r).toContain('Allow: /');
    expect(r).toContain('Disallow: /api/');
    expect(r).toContain('Sitemap: https://example.com/sitemap.xml');
  });
});
