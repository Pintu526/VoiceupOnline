import type { PublicCampaignCustomLocation } from "../backend";

/**
 * Pure catalog normalisation helpers. This module must stay free of any import
 * of ../geography so the lazy public campaign page can resolve its catalog
 * without loading the 20 MB Odisha LGD dataset. indiaLocationOptions.ts
 * re-exports everything here, so existing import paths are unchanged.
 */

export function normalizeIndiaLocationOptionKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function cleanIndiaLocationOptionLabel(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizePublicCampaignCustomLocations(
  input: unknown
): PublicCampaignCustomLocation[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const location = entry as Record<string, unknown>;
    const country = cleanIndiaLocationOptionLabel(String(location.country ?? ""));
    if (!country && !location.state) return [];
    return [{
      country: country || "India",
      state: cleanIndiaLocationOptionLabel(String(location.state ?? "")) || undefined,
      district: cleanIndiaLocationOptionLabel(String(location.district ?? "")) || undefined,
      block: cleanIndiaLocationOptionLabel(String(location.block ?? "")) || undefined,
      panchayat: cleanIndiaLocationOptionLabel(String(location.panchayat ?? "")) || undefined,
      village: cleanIndiaLocationOptionLabel(String(location.village ?? "")) || undefined,
      postalCode: cleanIndiaLocationOptionLabel(
        String(location.postalCode ?? location.postal_code ?? "")
      ) || undefined
    }];
  });
}

export function resolveIndiaLocationCatalog(
  customLocations: PublicCampaignCustomLocation[] | undefined,
  nestedCatalog?: unknown
): PublicCampaignCustomLocation[] {
  const fromProp = normalizePublicCampaignCustomLocations(customLocations);
  if (fromProp.length > 0) return fromProp;
  return normalizePublicCampaignCustomLocations(nestedCatalog);
}
