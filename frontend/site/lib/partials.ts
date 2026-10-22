const MAX_DEPTH = 5;
const INCLUDE_RE = /<!--\s*@include\s+([\w./-]+)\s*-->/g;

function expand(html: string, partials: Record<string, string>, chain: string[]): string {
  return html.replace(INCLUDE_RE, (_m, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(partials, name)) {
      throw new Error(`Unknown include: ${name}`);
    }
    const next = [...chain, name];
    if (chain.includes(name)) throw new Error(`Include cycle: ${next.join(' -> ')}`);
    if (next.length > MAX_DEPTH) throw new Error(`Include depth limit exceeded: ${next.join(' -> ')}`);
    return expand(partials[name], partials, next);
  });
}

/** Expand `<!-- @include name -->` recursively, then replace `{{key}}` with vars once. Throws on unknowns, cycles, depth. */
export function applyPartials(
  html: string,
  partials: Record<string, string>,
  vars: Record<string, string>,
): string {
  return expand(html, partials, []).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new Error(`Unknown variable: {{${key}}}`);
    }
    return vars[key];
  });
}
