import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {transformPage} from '../../vite-plugins/sitePages';
import {PAGES} from '../lib/pages';
import {checkPage} from '../lib/seo';
import {findPlaceholders} from '../lib/placeholders';

const root = path.resolve(__dirname, '../..');
const siteUrl = 'https://example.com';
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const partials = {header: read('site/partials/header.html'), footer: read('site/partials/footer.html')};
const staticRoutes = Object.keys(PAGES).filter((r) => r !== '/app');
const built = (route: string) =>
  transformPage(read(PAGES[route as keyof typeof PAGES]), route, {siteUrl, partials});

describe('static pages', () => {
  it.each(staticRoutes)('%s passes checkPage', (route) => {
    expect(checkPage(built(route), {route, siteUrl})).toEqual([]);
  });

  it.each(staticRoutes)('%s has no script other than JSON-LD', (route) => {
    for (const m of read(PAGES[route as keyof typeof PAGES]).matchAll(/<script\b[^>]*>/gi)) {
      expect(m[0]).toMatch(/application\/ld\+json/);
    }
  });
});

describe('placeholders in drafts', () => {
  const names = (f: string) => new Set(findPlaceholders(read(f)));
  it('/legal has name, country and email', () => {
    expect(names('legal/index.html')).toEqual(
      new Set(['[[OWNER_NAME]]', '[[OWNER_COUNTRY]]', '[[OWNER_EMAIL]]']),
    );
  });
  it('/privacy and /terms have name and email', () => {
    for (const f of ['privacy/index.html', 'terms/index.html']) {
      const n = names(f);
      expect(n.has('[[OWNER_NAME]]'), f).toBe(true);
      expect(n.has('[[OWNER_EMAIL]]'), f).toBe(true);
    }
  });
  it('the landing and faq pages have none', () => {
    expect(findPlaceholders(read('index.html'))).toEqual([]);
    expect(findPlaceholders(read('faq/index.html'))).toEqual([]);
  });
});

describe('privacy policy content', () => {
  const text = read('privacy/index.html');
  it('mentions the file name and the session cookie', () => {
    expect(text).toMatch(/file name/i);
    expect(text).toMatch(/cookie/i);
  });
  it('says what happens when an image upload fails', () => {
    expect(text).toMatch(/image missing/i);
  });
  it('hedges account deletion', () => {
    expect(text).toMatch(/cannot remove/i);
  });
});

describe('faq structured data', () => {
  const html = read('faq/index.html');
  const visible = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map(
    (m) => ({q: m[1].replace(/\s+/g, ' ').trim(), a: m[2].replace(/\s+/g, ' ').trim()}),
  );
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);

  it('is a FAQPage', () => {
    expect(ld['@type']).toBe('FAQPage');
  });
  it('has at least the seven planned questions', () => {
    expect(visible.length).toBeGreaterThanOrEqual(7);
  });
  it('matches the visible questions and answers word for word', () => {
    const marked = ld.mainEntity.map((e: any) => ({q: e.name, a: e.acceptedAnswer.text}));
    expect(marked).toEqual(visible);
  });
});

describe('internal links', () => {
  const files = [...Object.values(PAGES).filter((f) => f !== 'app/index.html'), 'site/partials/header.html', 'site/partials/footer.html'];
  it('every <a href="/..."> points at a route in PAGES', () => {
    const routes = Object.keys(PAGES);
    for (const f of files) {
      for (const m of read(f).matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
        const href = m[1];
        if (/^(mailto:|https?:|#)/.test(href)) continue;
        expect(routes, `${f}: ${href}`).toContain(href.split('#')[0]);
      }
    }
  });
});
