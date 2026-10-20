import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';
import {findPlaceholders} from '../site/lib/placeholders';
import {PAGES} from '../site/lib/pages';
import {applyPartials} from '../site/lib/partials';
import {renderRobots} from '../site/lib/robots';
import {renderSitemap} from '../site/lib/sitemap';

const DEV_URL = 'http://localhost:3000';
const assetsDir = path.resolve(__dirname, '../site/assets');
const partialsDir = path.resolve(__dirname, '../site/partials');

export interface SitePagesOptions {
  siteUrl?: string;
  partials?: Record<string, string>;
}

function loadPartials(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(partialsDir)) {
    if (f.endsWith('.html')) out[f.slice(0, -5)] = readFileSync(path.join(partialsDir, f), 'utf8');
  }
  return out;
}

/** Pure transform: static pages get partials and vars; the app page is returned unchanged. */
export function transformPage(
  html: string,
  route: string,
  options: {siteUrl: string; partials: Record<string, string>},
): string {
  if (route === '/app') return html;
  return applyPartials(html, options.partials, {
    siteUrl: options.siteUrl.replace(/\/+$/, ''),
    route,
  });
}

function routeFor(requestPath: string): string | undefined {
  const clean = requestPath.split('?')[0].replace(/^\/+/, '');
  for (const [route, file] of Object.entries(PAGES)) {
    if (clean === file || (clean === '' && route === '/') || clean + 'index.html' === file) {
      return route;
    }
  }
  return undefined;
}

/** On Vercel the deployment's own host stands in when VITE_SITE_URL is not set. */
export function vercelSiteUrl(env: Record<string, string | undefined>): string {
  if (!env.VERCEL) return '';
  const host = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL : env.VERCEL_URL;
  return host ? `https://${host}` : '';
}

const staticRoutes = () => Object.keys(PAGES).filter((r) => r !== '/app');

function normalizeSiteUrl(raw: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`VITE_SITE_URL is not a valid URL: "${raw}" (expected e.g. https://example.com)`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`VITE_SITE_URL must be an http(s) URL, got "${raw}"`);
  }
  if (production && url.protocol !== 'https:') {
    throw new Error(`VITE_SITE_URL must use https in a production build, got "${raw}"`);
  }
  return url.origin;
}

/** Mirrors vercel.json (cleanUrls + /app rewrite) for the local dev and preview servers. */
export function rewriteCleanUrl(url: string): string {
  const q = url.indexOf('?');
  const pathname = q === -1 ? url : url.slice(0, q);
  const query = q === -1 ? '' : url.slice(q);
  if (pathname === '/app' || pathname === '/app/') return '/app/index.html' + query;
  const clean = pathname.replace(/\/$/, '');
  const file = (PAGES as Record<string, string>)[clean];
  if (file && clean !== '/' && clean !== '/app') return '/' + file + query;
  return url;
}

function cleanUrlMiddleware(req: {url?: string}, _res: unknown, next: () => void) {
  if (req.url) req.url = rewriteCleanUrl(req.url);
  next();
}

export function sitePages(options: SitePagesOptions = {}): Plugin {
  let siteUrl = options.siteUrl ?? '';
  let guardPlaceholders = false;
  return {
    name: 'site-pages',
    configureServer(server) {
      server.middlewares.use(cleanUrlMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrlMiddleware);
    },
    configResolved(config) {
      guardPlaceholders =
        config.command === 'build' && config.mode === 'production' && process.env.VERCEL_ENV === 'production';
      const production = config.command === 'build' && config.mode === 'production';
      if (!siteUrl) siteUrl = vercelSiteUrl(process.env);
      if (siteUrl) {
        siteUrl = normalizeSiteUrl(siteUrl, production);
        return;
      }
      if (production) {
        throw new Error(
          'VITE_SITE_URL is required for a production build (e.g. VITE_SITE_URL=https://example.com). ' +
            'It is used for canonical URLs, the sitemap and robots.txt. On Vercel it falls back to the deployment host ' +
            'when "Automatically expose System Environment Variables" is on.',
        );
      }
      siteUrl = DEV_URL;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const route = routeFor(ctx.path);
        if (!route || route === '/app') return html;
        return transformPage(html, route, {
          siteUrl,
          partials: options.partials ?? loadPartials(),
        });
      },
    },
    generateBundle: {
     order: 'post',
     handler(_outputOptions, bundle) {
      if (guardPlaceholders) {
        const found = new Set<string>();
        for (const item of Object.values(bundle ?? {}) as any[]) {
          if (item.type === 'asset' && String(item.fileName).endsWith('.html')) {
            for (const p of findPlaceholders(typeof item.source === 'string' ? item.source : Buffer.from(item.source).toString())) found.add(p);
          }
        }
        if (found.size > 0) {
          throw new Error(
            `Placeholders must be replaced before a production deploy: ${[...found].join(', ')}`,
          );
        }
      }
      // Share images are referenced only from meta tags, so Vite would not bundle them.
      if (existsSync(assetsDir)) {
        for (const d of readdirSync(assetsDir, {withFileTypes: true})) {
          if (!d.isFile()) continue;
          const f = d.name;
          this.emitFile({type: 'asset', fileName: `site/assets/${f}`, source: readFileSync(path.join(assetsDir, f))});
        }
      }
      this.emitFile({type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(siteUrl, staticRoutes())});
      this.emitFile({type: 'asset', fileName: 'robots.txt', source: renderRobots(siteUrl)});
     },
    },
  };
}
