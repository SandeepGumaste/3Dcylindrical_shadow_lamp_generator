import { absoluteUrl } from './sitemap';

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
}

function findMeta(html: string, key: 'name' | 'property', value: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attr(m[0], key)?.toLowerCase() === value) return attr(m[0], 'content') ?? '';
  }
  return undefined;
}

/** Returns a list of SEO/structure problems for a built page; empty when fine. */
export function checkPage(html: string, ctx: { route: string; siteUrl: string }): string[] {
  const problems: string[] = [];

  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!title || title[1].trim() === '') problems.push('missing <title>');
  else if ([...title[1].trim()].length > 60) problems.push('title longer than 60 characters');

  const desc = findMeta(html, 'name', 'description');
  if (desc === undefined) problems.push('missing meta description');
  else if ([...desc].length < 50 || [...desc].length > 160) problems.push('description must be 50 to 160 characters');

  const h1s = (html.match(/<h1\b/gi) ?? []).length;
  if (h1s !== 1) problems.push(`expected exactly one <h1>, found ${h1s}`);

  const htmlTag = /<html\b[^>]*>/i.exec(html);
  if (!htmlTag || !attr(htmlTag[0], 'lang')) problems.push('missing <html lang>');

  const expected = absoluteUrl(ctx.siteUrl, ctx.route);
  let canonical: string | undefined;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (attr(m[0], 'rel')?.toLowerCase() === 'canonical') canonical = attr(m[0], 'href');
  }
  if (canonical !== expected) problems.push(`canonical must be ${expected}`);

  for (const p of ['og:title', 'og:description', 'og:url']) {
    if (findMeta(html, 'property', p) === undefined) problems.push(`missing ${p}`);
  }
  const ogImage = findMeta(html, 'property', 'og:image');
  if (ogImage === undefined) problems.push('missing og:image');
  else if (!/^https?:\/\/[^\s/]+/i.test(ogImage)) problems.push('og:image must be an absolute http(s) URL');
  if (findMeta(html, 'name', 'twitter:card') === undefined) problems.push('missing twitter:card');

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const type = attr(m[1], 'type')?.trim().toLowerCase();
    if (type !== 'application/ld+json' || /\bsrc\s*=/i.test(m[1])) {
      problems.push('disallowed <script> (only application/ld+json is permitted)');
    } else {
      try {
        JSON.parse(m[2]);
      } catch {
        problems.push('JSON-LD block is not valid JSON');
      }
    }
  }
  return problems;
}
