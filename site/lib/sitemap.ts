/** Absolute URL for a route: siteUrl without trailing slash + route ('/' -> siteUrl + '/'). */
export function absoluteUrl(siteUrl: string, route: string): string {
  return siteUrl.replace(/\/+$/, '') + (route.startsWith('/') ? route : `/${route}`);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderSitemap(siteUrl: string, routes: string[]): string {
  const urls = routes
    .filter((r) => r !== '/app' && !r.startsWith('/app/'))
    .map((r) => `  <url><loc>${escapeXml(absoluteUrl(siteUrl, r))}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
