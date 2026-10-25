import {readFileSync, readdirSync, statSync} from 'node:fs';
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
    expect(text).toMatch(/session cookie/i);
    expect(text).not.toMatch(/JWT/);
    expect(text).toMatch(/request logs/i);
    expect(text).toMatch(/IP address/i);
    expect(text).toMatch(/counter/i);
  });
  it('says what happens when an image upload fails', () => {
    expect(text).toMatch(/image missing/i);
  });
  it('hedges account deletion', () => {
    expect(text).toMatch(/cannot remove/i);
  });
});

describe('terms safety wording', () => {
  const text = read('terms/index.html');
  it('is LED only', () => {
    expect(text).toMatch(/LED light only/);
    expect(text).not.toMatch(/candle|real flame/i);
    expect(text).toMatch(/60 degrees/);
  });
});

describe('faq stored answer', () => {
  it('mentions the file name', () => {
    expect(read('faq/index.html')).toMatch(/file name of the picture you uploaded/);
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
        expect(routes, `${f}: ${href}`).toContain(href.split('#')[0].split('?')[0]);
      }
    }
  });
});

describe('landing page', () => {
  const src = read('index.html');
  const html = built('/');

  it('has one h1 and passes checkPage', () => {
    expect((src.match(/<h1\b/gi) ?? []).length).toBe(1);
    expect(checkPage(html, {route: '/', siteUrl})).toEqual([]);
  });
  it('has no script src and no JavaScript other than JSON-LD', () => {
    expect(src).not.toMatch(/<script\b[^>]*\bsrc\s*=/i);
    const scripts = [...src.matchAll(/<script\b[^>]*>/gi)];
    expect(scripts.length).toBe(1);
    expect(scripts[0][0]).toMatch(/application\/ld\+json/);
    expect(src).not.toMatch(/\son[a-z]+\s*=/i);
  });
  it('links to /app and asks for sign-in on the way', () => {
    expect(src).toMatch(/<a\b[^>]*href="\/app\?signin=1"/);
  });
  it('has WebApplication JSON-LD with name, description and the site URL', () => {
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(ld['@type']).toBe('WebApplication');
    expect(ld.name).toBe('Odd Shadows');
    expect(ld.description).toBeTruthy();
    expect(ld.url).toBe(siteUrl + '/');
  });
  it('gives every img alt, width and height', () => {
    for (const m of src.matchAll(/<img\b[^>]*>/gi)) {
      expect(m[0]).toMatch(/\balt="/);
      expect(m[0]).toMatch(/\bwidth="\d+"/);
      expect(m[0]).toMatch(/\bheight="\d+"/);
    }
  });
  it('keeps HTML plus CSS under 60 KB and each image under 150 KB', () => {
    const bytes = (f: string) => statSync(path.join(root, f)).size;
    expect(bytes('index.html') + bytes('site/site.css')).toBeLessThan(60 * 1024);
    for (const f of readdirSync(path.join(root, 'site/assets'))) {
      expect(bytes('site/assets/' + f), f).toBeLessThan(150 * 1024);
    }
  });
  it('does not tell people to burn a candle, and points to LED safety', () => {
    const text = src.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/light the candle|real flame|small candle|\bcandle\b/i);
    expect(text).toMatch(/\bLED\b/);
    expect(text).toMatch(/material that handles the heat/i);
  });
  it('mentions only the tealight shade, not box mode', () => {
    expect(src).not.toMatch(/box mode/i);
  });
});

describe('share image', () => {
  it('is 1200 by 630 and every static page points at it with an absolute URL', () => {
    const png = readFileSync(path.join(root, 'site/assets/og.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    for (const route of staticRoutes) {
      const h = built(route);
      expect(h, route).toContain(`<meta property="og:image" content="${siteUrl}/site/assets/og.png"`);
      expect(h, route).toContain(`<meta name="twitter:image" content="${siteUrl}/site/assets/og.png"`);
    }
  });
});
