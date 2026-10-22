import path from 'node:path';

export const PAGES = {
  '/': 'index.html',
  '/app': 'app/index.html',
  // Disabled for now (sources kept in privacy/, legal/, faq/, terms/): re-add to publish them.
  // '/privacy': 'privacy/index.html',
  // '/legal': 'legal/index.html',
  // '/faq': 'faq/index.html',
  // '/terms': 'terms/index.html',
} as const;

const INPUT_NAMES: Record<string, string> = {
  '/': 'main',
  '/app': 'app',
};

/** Rollup multi-page input: short name -> absolute html path. */
export function pageInputs(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [route, file] of Object.entries(PAGES)) {
    out[INPUT_NAMES[route]] = path.resolve(root, file);
  }
  return out;
}
