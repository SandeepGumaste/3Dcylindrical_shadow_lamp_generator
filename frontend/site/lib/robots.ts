export function renderRobots(siteUrl: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    `Sitemap: ${siteUrl.replace(/\/+$/, '')}/sitemap.xml`,
    '',
  ].join('\n');
}
