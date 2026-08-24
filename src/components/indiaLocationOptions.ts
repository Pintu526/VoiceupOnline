import {
  getBlockOptions,
  getDistrictOptions,
  getPanchayatOptions,
  getPinOptions,
  indianStatesAndUnionTerritories,
  type LocationDeletions,
  type LocationOverrides,
  type LocationWithPin
} from "../geography.ts";
import type { PublicCampaignCustomLocation } from "../backend";

export interface IndiaLocationOptions {
  stateOptions: string[];
  districtOptions: string[];
  blockOptions: string[];
  panchayatOptions: string[];
  villageOptions: string[];
  pinOptions: string[];
}

export type IndiaLocationCatalogStatus = "idle" | "loading" | "ready" | "error";

/** Static geography.ts / PIN directory may be used only when no VBOSS catalog fetch is in play. */
export function allowsStaticIndiaLocationFallback(
  catalogStatus: IndiaLocationCatalogStatus | undefined,
  catalogLength: number
): boolean {
  if (catalogStatus === "loading" || catalogStatus === "error" || catalogStatus === "ready") {
    return false;
  }
  return catalogLength === 0;
}

export function normalizeIndiaLocationOptionKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function cleanIndiaLocationOptionLabel(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function isIndiaCountryKey(value: string): boolean {
  const key = normalizeIndiaLocationOptionKey(value);
  return key === "" || key === "india" || key === "in" || key === "ind";
}

export function locationMatchesSelectedCountry(
  locationCountry: string | undefined,
  selectedCountry: string
): boolean {
  if (isIndiaCountryKey(selectedCountry) && isIndiaCountryKey(locationCountry ?? "")) {
    return true;
  }
  return normalizeIndiaLocationOptionKey(locationCountry ?? "") === normalizeIndiaLocationOptionKey(selectedCountry);
}

export function locationMatchesSelectedParent(
  locationValue: string | undefined,
  selectedValue: string
): boolean {
  return normalizeIndiaLocationOptionKey(locationValue ?? "") === normalizeIndiaLocationOptionKey(selectedValue);
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

function hasSelectedParent(value: string | undefined): boolean {
  return Boolean(normalizeIndiaLocationOptionKey(value ?? ""));
}

function catalogMatchesSelectedParents(
  location: PublicCampaignCustomLocation,
  selectedCountry: string,
  values: Pick<LocationWithPin, "state" | "district" | "block" | "panchayat">,
  levels: Array<"state" | "district" | "block" | "panchayat">
): boolean {
  if (!locationMatchesSelectedCountry(location.country, selectedCountry)) return false;
  for (const level of levels) {
    const selected = values[level] ?? "";
    if (!hasSelectedParent(selected)) return false;
    if (!locationMatchesSelectedParent(location[level], selected)) return false;
  }
  return true;
}

function indiaLocationHierarchyKey(location: PublicCampaignCustomLocation): string {
  const countryKey = isIndiaCountryKey(location.country ?? "")
    ? "india"
    : normalizeIndiaLocationOptionKey(location.country ?? "");
  return [
    countryKey,
    normalizeIndiaLocationOptionKey(location.state ?? ""),
    normalizeIndiaLocationOptionKey(location.district ?? ""),
    normalizeIndiaLocationOptionKey(location.block ?? ""),
    normalizeIndiaLocationOptionKey(location.panchayat ?? "")
  ].join("|");
}

export function compactIndiaLocationHierarchy(
  catalog: PublicCampaignCustomLocation[]
): PublicCampaignCustomLocation[] {
  const compacted: PublicCampaignCustomLocation[] = [];
  const seen = new Set<string>();

  for (const location of catalog) {
    const country = cleanIndiaLocationOptionLabel(location.country ?? "") || "India";
    const state = cleanIndiaLocationOptionLabel(location.state ?? "");
    const district = cleanIndiaLocationOptionLabel(location.district ?? "");
    const block = cleanIndiaLocationOptionLabel(location.block ?? "");
    const panchayat = cleanIndiaLocationOptionLabel(location.panchayat ?? "");
    const key = indiaLocationHierarchyKey({
      country,
      state: state || undefined,
      district: district || undefined,
      block: block || undefined,
      panchayat: panchayat || undefined
    });
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push({
      country,
      state: state || undefined,
      district: district || undefined,
      block: block || undefined,
      panchayat: panchayat || undefined
    });
  }

  return compacted;
}

export function mergeIndiaLocationOptions(
  master: string[],
  additions: string[],
  customAuthoritative = false
): string[] {
  if (customAuthoritative) {
    const customOptions = dedupeCustomLocationOptions(additions);
    if (customOptions.length > 0) {
      return customOptions;
    }
  }

  const merged: string[] = [];
  const seen = new Set<string>();

  const canonicalLabel = (key: string, fallback: string) => {
    const masterMatch = master.find((option) => normalizeIndiaLocationOptionKey(option) === key);
    return cleanIndiaLocationOptionLabel(masterMatch ?? fallback);
  };

  for (const option of master) {
    const cleaned = cleanIndiaLocationOptionLabel(option);
    if (!cleaned) continue;

    const key = normalizeIndiaLocationOptionKey(cleaned);
    if (seen.has(key)) continue;

    merged.push(canonicalLabel(key, cleaned));
    seen.add(key);
  }

  if (customAuthoritative) {
    return merged;
  }

  for (const addition of additions) {
    const cleaned = cleanIndiaLocationOptionLabel(addition);
    if (!cleaned) continue;

    const key = normalizeIndiaLocationOptionKey(cleaned);
    if (seen.has(key)) continue;

    merged.push(canonicalLabel(key, cleaned));
    seen.add(key);
  }

  return merged;
}

function dedupeCustomLocationOptions(values: string[]): string[] {
  const options: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = cleanIndiaLocationOptionLabel(value);
    if (!cleaned) continue;

    const key = normalizeIndiaLocationOptionKey(cleaned);
    if (seen.has(key)) continue;

    options.push(cleaned);
    seen.add(key);
  }

  return options;
}

/** Canonical India location dropdown contract: campaign catalog overrides, India master fallback. */
export function getIndiaLocationOptions({
  values,
  locationOverrides,
  locationDeletions,
  verifiedSuggestionsOnly,
  customLocations,
  allowedState,
  allowedDistrict,
  allowedBlock,
  allowedPanchayat,
  fixedCountry,
  catalogStatus
}: {
  values: LocationWithPin;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  verifiedSuggestionsOnly: boolean;
  customLocations: PublicCampaignCustomLocation[];
  allowedState: string;
  allowedDistrict: string;
  allowedBlock: string;
  allowedPanchayat: string;
  fixedCountry?: string;
  catalogStatus?: IndiaLocationCatalogStatus;
}): IndiaLocationOptions {
  const selectedCountry = (fixedCountry ?? values.country ?? "India").trim().toLowerCase();
  const catalog = resolveIndiaLocationCatalog(customLocations);
  const hierarchyCatalog = compactIndiaLocationHierarchy(catalog);
  const useCatalogOnly = !allowsStaticIndiaLocationFallback(catalogStatus, catalog.length);
  const customStates = hierarchyCatalog
    .filter((location) => locationMatchesSelectedCountry(location.country, selectedCountry))
    .map((location) => location.state ?? "")
    .filter(Boolean);
  const stateOptions = allowedState
    ? [allowedState]
    : mergeIndiaLocationOptions(
      useCatalogOnly ? [] : indianStatesAndUnionTerritories,
      customStates,
      useCatalogOnly
    );
  const districtOptions = !hasSelectedParent(values.state)
    ? []
    : mergeIndiaLocationOptions(
      useCatalogOnly
        ? []
        : getDistrictOptions(
          values.state,
          locationOverrides,
          locationDeletions,
          verifiedSuggestionsOnly
        ),
      hierarchyCatalog
        .filter((location) => catalogMatchesSelectedParents(location, selectedCountry, values, ["state"]))
        .map((location) => location.district ?? "")
        .filter(Boolean),
      useCatalogOnly
    ).filter((district) => !allowedDistrict || district === allowedDistrict);
  const blockOptions = !hasSelectedParent(values.state) || !hasSelectedParent(values.district)
    ? []
    : mergeIndiaLocationOptions(
      useCatalogOnly
        ? []
        : getBlockOptions(
          values.state,
          values.district,
          locationOverrides,
          locationDeletions,
          verifiedSuggestionsOnly
        ),
      hierarchyCatalog
        .filter((location) =>
          catalogMatchesSelectedParents(location, selectedCountry, values, ["state", "district"])
        )
        .map((location) => location.block ?? "")
        .filter(Boolean),
      useCatalogOnly
    ).filter((block) => !allowedBlock || block === allowedBlock);
  const panchayatOptions = !hasSelectedParent(values.state)
    || !hasSelectedParent(values.district)
    || !hasSelectedParent(values.block)
    ? []
    : mergeIndiaLocationOptions(
      useCatalogOnly
        ? []
        : getPanchayatOptions(
          values.state,
          values.district,
          values.block,
          locationOverrides,
          locationDeletions,
          verifiedSuggestionsOnly
        ),
      hierarchyCatalog
        .filter((location) =>
          catalogMatchesSelectedParents(location, selectedCountry, values, ["state", "district", "block"])
        )
        .map((location) => location.panchayat ?? "")
        .filter(Boolean),
      useCatalogOnly
    ).filter((panchayat) => !allowedPanchayat || panchayat === allowedPanchayat);
  const selectedCustomPath = (location: PublicCampaignCustomLocation) =>
    catalogMatchesSelectedParents(location, selectedCountry, values, ["state", "district", "block", "panchayat"]);

  return {
    stateOptions,
    districtOptions,
    blockOptions,
    panchayatOptions,
    villageOptions: mergeIndiaLocationOptions(
      [],
      catalog.filter(selectedCustomPath).map((location) => location.village ?? "").filter(Boolean),
      true
    ),
    pinOptions: mergeIndiaLocationOptions(
      useCatalogOnly ? [] : getPinOptions(values),
      catalog.filter(selectedCustomPath).map((location) => location.postalCode ?? "").filter(Boolean),
      true
    )
  };
}
