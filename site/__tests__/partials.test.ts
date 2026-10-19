import { describe, it, expect } from 'vitest';
import { applyPartials } from '../lib/partials';

describe('applyPartials', () => {
  it('replaces includes and vars', () => {
    const out = applyPartials(
      '<body><!-- @include header --><p>{{siteUrl}}</p></body>',
      { header: '<header>H</header>' },
      { siteUrl: 'https://example.com' },
    );
    expect(out).toBe('<body><header>H</header><p>https://example.com</p></body>');
  });
  it('tolerates whitespace in delimiters', () => {
    const out = applyPartials('<!--   @include header -->{{ siteUrl }}', { header: 'H' }, { siteUrl: 'u' });
    expect(out).toBe('Hu');
  });
  it('resolves vars inside partials', () => {
    expect(applyPartials('<!-- @include h -->', { h: '{{a}}' }, { a: 'x' })).toBe('x');
  });
  it('throws on unknown include, naming it', () => {
    expect(() => applyPartials('<!-- @include nope -->', {}, {})).toThrow(/nope/);
  });
  it('throws on unknown var, naming it', () => {
    expect(() => applyPartials('{{missing}}', {}, {})).toThrow(/missing/);
  });
});
