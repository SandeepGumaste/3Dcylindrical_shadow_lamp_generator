/** Replace `<!-- @include name -->` with partials, then `{{key}}` with vars. Throws on unknowns. */
export function applyPartials(
  html: string,
  partials: Record<string, string>,
  vars: Record<string, string>,
): string {
  const withIncludes = html.replace(/<!--\s*@include\s+([\w./-]+)\s*-->/g, (_m, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(partials, name)) {
      throw new Error(`Unknown include: ${name}`);
    }
    return partials[name];
  });
  return withIncludes.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new Error(`Unknown variable: {{${key}}}`);
    }
    return vars[key];
  });
}
