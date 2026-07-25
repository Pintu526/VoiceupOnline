const PUBLIC_CAMPAIGN_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/i;

export function normalizePublicCampaignSlug(value: unknown): string {
  const slug = String(value ?? "").trim();
  return PUBLIC_CAMPAIGN_SLUG_PATTERN.test(slug) ? slug.toLowerCase() : "";
}

export function publicCampaignSlugsMatch(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizePublicCampaignSlug(left);
  return Boolean(
    normalizedLeft &&
    normalizedLeft === normalizePublicCampaignSlug(right)
  );
}
