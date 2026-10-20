/** Returns every `[[NAME]]` placeholder found in the html (with repeats, in order). */
export function findPlaceholders(html: string): string[] {
  return [...html.matchAll(/\[\[[A-Z0-9_]+\]\]/g)].map((m) => m[0]);
}
