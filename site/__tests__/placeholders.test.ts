import {describe, expect, it} from 'vitest';
import {findPlaceholders} from '../lib/placeholders';
import {sitePages} from '../../vite-plugins/sitePages';

describe('findPlaceholders', () => {
  it('finds every placeholder', () => {
    expect(findPlaceholders('a [[OWNER_NAME]] b [[OWNER_EMAIL]] c [[OWNER_NAME]]')).toEqual([
      '[[OWNER_NAME]]',
      '[[OWNER_EMAIL]]',
      '[[OWNER_NAME]]',
    ]);
  });
  it('returns nothing when there are none', () => {
    expect(findPlaceholders('<p>[x] [[ no ]] {{siteUrl}}</p>')).toEqual([]);
  });
});

describe('production placeholder guard', () => {
  const run = (html: string | Uint8Array, vercelEnv: string | undefined, mode = 'production') => {
    const old = process.env.VERCEL_ENV;
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = vercelEnv;
    try {
      const p = sitePages({siteUrl: 'https://example.com'});
      (p.configResolved as any)({command: 'build', mode});
      const ctx = {emitFile: () => {}};
      (p.generateBundle as any).call(ctx, {}, {
        'legal/index.html': {type: 'asset', fileName: 'legal/index.html', source: html},
        'assets/x.js': {type: 'chunk', fileName: 'assets/x.js', code: '[[OWNER_NAME]]'},
      });
    } finally {
      if (old === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = old;
    }
  };

  it('throws listing placeholders in a production deploy', () => {
    expect(() => run('<p>[[OWNER_NAME]] [[OWNER_EMAIL]]</p>', 'production')).toThrow(
      /\[\[OWNER_NAME\]\].*\[\[OWNER_EMAIL\]\]/,
    );
  });
  it('scans a non-string asset source', () => {
    expect(() => run(new TextEncoder().encode('<p>[[OWNER_NAME]]</p>'), 'production')).toThrow(/OWNER_NAME/);
  });
  it('passes when none remain', () => {
    expect(() => run('<p>Jane Doe</p>', 'production')).not.toThrow();
  });
  it('does not throw outside a production deploy', () => {
    expect(() => run('<p>[[OWNER_NAME]]</p>', undefined)).not.toThrow();
    expect(() => run('<p>[[OWNER_NAME]]</p>', 'preview')).not.toThrow();
    expect(() => run('<p>[[OWNER_NAME]]</p>', 'production', 'development')).not.toThrow();
  });
});
