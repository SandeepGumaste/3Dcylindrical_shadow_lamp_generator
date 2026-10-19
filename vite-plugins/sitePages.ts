import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';
import {findPlaceholders} from '../site/lib/placeholders';
import {PAGES} from '../site/lib/pages';
import {applyPartials} from '../site/lib/partials';
import {renderRobots} from '../site/lib/robots';
import {renderSitemap} from '../site/lib/sitemap';

const DEV_URL = 'http://localhost:5173';
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

const staticRoutes = () => Object.keys(PAGES).filter((r) => r !== '/app');

export function sitePages(options: SitePagesOptions = {}): Plugin {
  let siteUrl = options.siteUrl ?? '';
  let guardPlaceholders = false;
  return {
    name: 'site-pages',
    configResolved(config) {
      guardPlaceholders =
        config.command === 'build' && config.mode === 'production' && process.env.VERCEL_ENV === 'production';
      if (siteUrl) return;
      if (config.command === 'build' && config.mode === 'production') {
        throw new Error(
          'VITE_SITE_URL is required for a production build (e.g. VITE_SITE_URL=https://example.com). ' +
            'It is used for canonical URLs, the sitemap and robots.txt.',
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
    generateBundle(_outputOptions, bundle) {
      if (guardPlaceholders) {
        const found = new Set<string>();
        for (const item of Object.values(bundle ?? {}) as any[]) {
          if (item.type === 'asset' && String(item.fileName).endsWith('.html')) {
            for (const p of findPlaceholders(String(item.source))) found.add(p);
          }
        }
        if (found.size > 0) {
          throw new Error(
            `Placeholders must be replaced before a production deploy: ${[...found].join(', ')}`,
          );
        }
      }
      this.emitFile({type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(siteUrl, staticRoutes())});
      this.emitFile({type: 'asset', fileName: 'robots.txt', source: renderRobots(siteUrl)});
    },
  };
}
