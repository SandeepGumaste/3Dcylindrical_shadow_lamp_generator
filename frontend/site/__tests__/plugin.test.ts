import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {rewriteCleanUrl, sitePages, transformPage, vercelSiteUrl} from '../../vite-plugins/sitePages';

const root = path.resolve(__dirname, '../..');
const partials = {header: '<header>HEAD</header>', footer: '<footer>FOOT</footer>'};
const opts = {siteUrl: 'https://example.com', partials};

describe('transformPage', () => {
  it('leaves the app page untouched', () => {
    const html = readFileSync(path.join(root, 'app/index.html'), 'utf8');
    expect(transformPage(html, '/app', opts)).toBe(html);
  });

  it('adds header, footer and vars to a static page', () => {
    const out = transformPage(
      '<body><!-- @include header --><a href="{{siteUrl}}{{route}}">x</a><!-- @include footer --></body>',
      '/faq',
      opts,
    );
    expect(out).toContain('<header>HEAD</header>');
    expect(out).toContain('<footer>FOOT</footer>');
    expect(out).toContain('href="https://example.com/faq"');
  });

  it('every real static page includes header and footer', () => {
    for (const f of ['index', 'privacy/index', 'legal/index', 'faq/index', 'terms/index']) {
      const html = readFileSync(path.join(root, f + '.html'), 'utf8');
      expect(html, f).toContain('@include header');
      expect(html, f).toContain('@include footer');
      const withoutLd = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      expect(withoutLd, f).not.toContain('<script');
    }
  });
});

describe('sitePages plugin', () => {
  const resolve = (p: any, command: string, mode: string) =>
    (p.configResolved as any)({command, mode});

  it('throws in a production build without a site URL', () => {
    const p = sitePages({siteUrl: ''});
    expect(() => resolve(p, 'build', 'production')).toThrow(/VITE_SITE_URL/);
  });

  it('rejects an invalid site URL', () => {
    expect(() => resolve(sitePages({siteUrl: 'not a url'}), 'build', 'production')).toThrow(/VITE_SITE_URL/);
  });

  it('requires https in production', () => {
    expect(() => resolve(sitePages({siteUrl: 'http://example.com'}), 'build', 'production')).toThrow(/https/);
  });

  it('uses only the origin of the site URL', () => {
    const p = sitePages({siteUrl: 'https://example.com/some/path/'});
    resolve(p, 'build', 'production');
    const files: Record<string, string> = {};
    (p.generateBundle as any).handler.call({emitFile: (f: any) => (files[f.fileName] = f.source)}, {}, {});
    expect(files['robots.txt']).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('falls back to localhost:3000 in dev', () => {
    const p = sitePages({siteUrl: ''});
    expect(() => resolve(p, 'serve', 'development')).not.toThrow();
  });

  it('emits sitemap and robots with the enabled static routes and no /app', () => {
    const p = sitePages({siteUrl: 'https://example.com'});
    resolve(p, 'build', 'production');
    const files: Record<string, string> = {};
    (p.generateBundle as any).handler.call({
      emitFile: (f: any) => (files[f.fileName] = f.source),
    });
    const locs = [...files['sitemap.xml'].matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(
      ['/'].map((r) => 'https://example.com' + r).sort(),
    );
    expect(files['sitemap.xml']).not.toContain('/app');
    expect(files['robots.txt']).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('emits the share image into the build', () => {
    const p = sitePages({siteUrl: 'https://example.com'});
    resolve(p, 'build', 'production');
    const files: Record<string, any> = {};
    (p.generateBundle as any).handler.call({emitFile: (f: any) => (files[f.fileName] = f.source)});
    expect(Buffer.from(files['site/assets/og.png']).subarray(1, 4).toString()).toBe('PNG');
  });

  it('transformIndexHtml uses order pre', () => {
    const p = sitePages({siteUrl: 'https://example.com'});
    expect((p.transformIndexHtml as any).order).toBe('pre');
  });
});

describe('rewriteCleanUrl (dev and preview)', () => {
  it('maps clean routes to their page files', () => {
    expect(rewriteCleanUrl('/app')).toBe('/app/index.html');
    expect(rewriteCleanUrl('/app/')).toBe('/app/index.html');
    expect(rewriteCleanUrl('/app?x=1')).toBe('/app/index.html?x=1');
    // /faq, /privacy, /legal and /terms are disabled, so they are not rewritten.
    expect(rewriteCleanUrl('/faq')).toBe('/faq');
    expect(rewriteCleanUrl('/privacy/')).toBe('/privacy/');
  });
  it('leaves the root, assets and source files alone', () => {
    expect(rewriteCleanUrl('/')).toBe('/');
    expect(rewriteCleanUrl('/src/main.tsx')).toBe('/src/main.tsx');
    expect(rewriteCleanUrl('/site/site.css')).toBe('/site/site.css');
    expect(rewriteCleanUrl('/app/index.html')).toBe('/app/index.html');
  });
});

describe('vercelSiteUrl', () => {
  it('is empty off Vercel', () => {
    expect(vercelSiteUrl({VERCEL_URL: 'x.vercel.app'})).toBe('');
  });
  it('uses the production host in production and the deployment host otherwise', () => {
    const env = {VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'odd.vercel.app', VERCEL_URL: 'odd-abc.vercel.app'};
    expect(vercelSiteUrl({...env, VERCEL_ENV: 'production'})).toBe('https://odd.vercel.app');
    expect(vercelSiteUrl({...env, VERCEL_ENV: 'preview'})).toBe('https://odd-abc.vercel.app');
  });
  it('is empty when Vercel exposes no host', () => {
    expect(vercelSiteUrl({VERCEL: '1', VERCEL_ENV: 'production'})).toBe('');
  });
});
