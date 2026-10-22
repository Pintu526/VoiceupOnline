/** Conservative deterministic normalization; never fuzzy matching. */
export function normalizeCanonicalLocationText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}
