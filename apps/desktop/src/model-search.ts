/**
 * Model picker search: every query token must appear somewhere in the
 * combined provider/model fields. Separators like `-`, `_`, `:`, `/` normalize
 * to spaces so `glm 5.2` matches `GLM-5.2` and `fireworks glm` matches across fields.
 */
export function normalizeModelSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[/\\:_+\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeModelSearchQuery(query: string): readonly string[] {
  return normalizeModelSearchText(query).split(" ").filter(Boolean);
}

export function matchesModelSearch(
  query: string,
  fields: readonly (string | undefined | null)[],
): boolean {
  const tokens = tokenizeModelSearchQuery(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = normalizeModelSearchText(fields.filter((field): field is string => Boolean(field)).join(" "));
  return tokens.every((token) => haystack.includes(token));
}
