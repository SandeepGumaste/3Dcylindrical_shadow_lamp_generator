import { describe, it, expect } from 'vitest';
import { checkPage } from '../lib/seo';

const ctx = { route: '/faq', siteUrl: 'https://example.com' };
const DESC = 'A description that is comfortably longer than fifty characters but short.';
function page(over: Record<string, string> = {}): string {
  const p = {
    lang: '<html lang="en">',
    title: '<title>FAQ - Lamp Generator</title>',
    desc: `<meta name="description" content="${DESC}">`,
    canonical: '<link rel="canonical" href="https://example.com/faq">',
    ogTitle: '<meta property="og:title" content="FAQ">',
    ogDesc: `<meta property="og:description" content="${DESC}">`,
    ogImage: '<meta property="og:image" content="https://example.com/og.png">',
    ogUrl: '<meta property="og:url" content="https://example.com/faq">',
    tw: '<meta name="twitter:card" content="summary_large_image">',
    body: '<h1>FAQ</h1><script type="application/ld+json">{"a":1}</script>',
    ...over,
  };
  return `<!doctype html>${p.lang}<head>${p.title}${p.desc}${p.canonical}${p.ogTitle}${p.ogDesc}${p.ogImage}${p.ogUrl}${p.tw}</head><body>${p.body}</body></html>`;
}

describe('checkPage', () => {
  it('passes a complete page', () => {
    expect(checkPage(page(), ctx)).toEqual([]);
  });
  it('accepts root canonical with trailing slash', () => {
    const html = page({ canonical: '<link rel="canonical" href="https://example.com/">' });
    expect(checkPage(html, { route: '/', siteUrl: 'https://example.com/' })).toEqual([]);
  });
  it('flags missing title', () => {
    expect(checkPage(page({ title: '' }), ctx)).toContain('missing <title>');
  });
  it('flags too-long title', () => {
    const p = checkPage(page({ title: `<title>${'x'.repeat(61)}</title>` }), ctx);
    expect(p).toContain('title longer than 60 characters');
  });
  it('flags short and long description', () => {
    expect(checkPage(page({ desc: '<meta name="description" content="short">' }), ctx)).toContain(
      'description must be 50 to 160 characters',
    );
    expect(
      checkPage(page({ desc: `<meta name="description" content="${'x'.repeat(161)}">` }), ctx),
    ).toContain('description must be 50 to 160 characters');
  });
  it('flags missing description', () => {
    expect(checkPage(page({ desc: '' }), ctx)).toContain('missing meta description');
  });
  it('flags two h1', () => {
    expect(checkPage(page({ body: '<h1>a</h1><h1>b</h1>' }), ctx)).toContain('expected exactly one <h1>, found 2');
  });
  it('flags missing html lang', () => {
    expect(checkPage(page({ lang: '<html>' }), ctx)).toContain('missing <html lang>');
  });
  it('flags wrong canonical', () => {
    const p = checkPage(page({ canonical: '<link rel="canonical" href="https://example.com/other">' }), ctx);
    expect(p).toContain('canonical must be https://example.com/faq');
  });
  it('flags relative og:image', () => {
    expect(checkPage(page({ ogImage: '<meta property="og:image" content="/og.png">' }), ctx)).toContain(
      'og:image must be an absolute http(s) URL',
    );
  });
  it('flags missing og/twitter tags', () => {
    const p = checkPage(page({ ogTitle: '', ogDesc: '', ogUrl: '', tw: '' }), ctx);
    expect(p).toContain('missing og:title');
    expect(p).toContain('missing og:description');
    expect(p).toContain('missing og:url');
    expect(p).toContain('missing twitter:card');
  });
  it('flags script tags', () => {
    expect(checkPage(page({ body: '<h1>a</h1><script>x()</script>' }), ctx)).toContain(
      'disallowed <script> (only application/ld+json is permitted)',
    );
    expect(checkPage(page({ body: '<h1>a</h1><script src="/a.js"></script>' }), ctx)).toContain(
      'disallowed <script> (only application/ld+json is permitted)',
    );
  });
  it('flags invalid JSON-LD', () => {
    const body = '<h1>a</h1><script type="application/ld+json">{bad</script>';
    expect(checkPage(page({ body }), ctx)).toContain('JSON-LD block is not valid JSON');
  });
});
