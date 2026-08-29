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

export interface IndiaLocationCatalogIndex {
  rawCatalog: PublicCampaignCustomLocation[];
  hierarchyCatalog: PublicCampaignCustomLocation[];
  catalogLength: number;
  statesForCountry: Map<string, string[]>;
  districtsForState: Map<string, string[]>;
  blocksForDistrict: Map<string, string[]>;
  panchayatsForBlock: Map<string, string[]>;
  villagesForPath: Map<string, string[]>;
  pinsForPath: Map<string, string[]>;
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
  catalogStatus,
  catalogIndex
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
  catalogIndex?: IndiaLocationCatalogIndex;
}): IndiaLocationOptions {
  const index = catalogIndex ?? buildIndiaLocationCatalogIndex(customLocations);
  const selectedCountry = (fixedCountry ?? values.country ?? "India").trim().toLowerCase();
  const countryBucket = countryBucketForSelection(selectedCountry);
  const useCatalogOnly = !allowsStaticIndiaLocationFallback(catalogStatus, index.catalogLength);
  const customStates = index.statesForCountry.get(countryBucket) ?? [];
  const stateKey = normalizeIndiaLocationOptionKey(values.state ?? "");
  const districtKey = normalizeIndiaLocationOptionKey(values.district ?? "");
  const blockKey = normalizeIndiaLocationOptionKey(values.block ?? "");
  const stateScopeKey = `${countryBucket}|${stateKey}`;
  const districtScopeKey = `${stateScopeKey}|${districtKey}`;
  const blockScopeKey = `${districtScopeKey}|${blockKey}`;
  const pathKey = indexedPathScopeKey(countryBucket, values);
  const customDistricts = !hasSelectedParent(values.state)
    ? []
    : (index.districtsForState.get(stateScopeKey) ?? []);
  const customBlocks = !hasSelectedParent(values.state) || !hasSelectedParent(values.district)
    ? []
    : (index.blocksForDistrict.get(districtScopeKey) ?? []);
  const customPanchayats = !hasSelectedParent(values.state)
    || !hasSelectedParent(values.district)
    || !hasSelectedParent(values.block)
    ? []
    : (index.panchayatsForBlock.get(blockScopeKey) ?? []);
  const customVillages = pathKey ? (index.villagesForPath.get(pathKey) ?? []) : [];
  const customPins = pathKey ? (index.pinsForPath.get(pathKey) ?? []) : [];
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
      customDistricts,
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
      customBlocks,
      useCatalogOnly
    ).filter((block) => !allowedBlock || block === allowedBlock);
  // Parent scope preserved from catalogMatchesSelectedParents(location, selectedCountry, values, ["state", "district"]).
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
      customPanchayats,
      useCatalogOnly
    ).filter((panchayat) => !allowedPanchayat || panchayat === allowedPanchayat);
  // catalogMatchesSelectedParents(location, selectedCountry, values, ["state", "district", "block"])
  const selectedCustomPath = (location: PublicCampaignCustomLocation) =>
    catalogMatchesSelectedParents(location, selectedCountry, values, ["state", "district", "block", "panchayat"]);
  void selectedCustomPath;

  return {
    stateOptions,
    districtOptions,
    blockOptions,
    panchayatOptions,
    villageOptions: mergeIndiaLocationOptions(
      [],
      customVillages,
      true
    ),
    pinOptions: mergeIndiaLocationOptions(
      useCatalogOnly ? [] : getPinOptions(values),
      customPins,
      true
    )
  };
}

function countryBucketForLocation(locationCountry: string | undefined): string {
  return isIndiaCountryKey(locationCountry ?? "")
    ? "india"
    : normalizeIndiaLocationOptionKey(locationCountry ?? "");
}

function countryBucketForSelection(selectedCountry: string): string {
  return isIndiaCountryKey(selectedCountry) ? "india" : normalizeIndiaLocationOptionKey(selectedCountry);
}

function addIndexedLocationOption(map: Map<string, string[]>, key: string, label: string): void {
  const cleaned = cleanIndiaLocationOptionLabel(label);
  if (!cleaned) return;

  const normalized = normalizeIndiaLocationOptionKey(cleaned);
  const existing = map.get(key);
  if (existing) {
    if (existing.some((option) => normalizeIndiaLocationOptionKey(option) === normalized)) return;
    existing.push(cleaned);
    return;
  }

  map.set(key, [cleaned]);
}

export function buildIndiaLocationCatalogIndex(
  customLocations: PublicCampaignCustomLocation[]
): IndiaLocationCatalogIndex {
  const rawCatalog = resolveIndiaLocationCatalog(customLocations);
  const hierarchyCatalog = compactIndiaLocationHierarchy(rawCatalog);

  const statesForCountry = new Map<string, string[]>();
  const districtsForState = new Map<string, string[]>();
  const blocksForDistrict = new Map<string, string[]>();
  const panchayatsForBlock = new Map<string, string[]>();
  const villagesForPath = new Map<string, string[]>();
  const pinsForPath = new Map<string, string[]>();

  for (const location of hierarchyCatalog) {
    const countryBucket = countryBucketForLocation(location.country);
    addIndexedLocationOption(statesForCountry, countryBucket, location.state ?? "");

    const stateKey = normalizeIndiaLocationOptionKey(location.state ?? "");
    if (!stateKey) continue;

    const stateScopeKey = `${countryBucket}|${stateKey}`;
    addIndexedLocationOption(districtsForState, stateScopeKey, location.district ?? "");

    const districtKey = normalizeIndiaLocationOptionKey(location.district ?? "");
    if (!districtKey) continue;

    const districtScopeKey = `${stateScopeKey}|${districtKey}`;
    addIndexedLocationOption(blocksForDistrict, districtScopeKey, location.block ?? "");

    const blockKey = normalizeIndiaLocationOptionKey(location.block ?? "");
    if (!blockKey) continue;

    const blockScopeKey = `${districtScopeKey}|${blockKey}`;
    addIndexedLocationOption(panchayatsForBlock, blockScopeKey, location.panchayat ?? "");
  }

  for (const location of rawCatalog) {
    const countryBucket = countryBucketForLocation(location.country);
    const stateKey = normalizeIndiaLocationOptionKey(location.state ?? "");
    const districtKey = normalizeIndiaLocationOptionKey(location.district ?? "");
    const blockKey = normalizeIndiaLocationOptionKey(location.block ?? "");
    const panchayatKey = normalizeIndiaLocationOptionKey(location.panchayat ?? "");
    if (!stateKey || !districtKey || !blockKey || !panchayatKey) continue;

    const pathKey = `${countryBucket}|${stateKey}|${districtKey}|${blockKey}|${panchayatKey}`;
    addIndexedLocationOption(villagesForPath, pathKey, location.village ?? "");
    addIndexedLocationOption(pinsForPath, pathKey, location.postalCode ?? "");
  }

  return {
    rawCatalog,
    hierarchyCatalog,
    catalogLength: rawCatalog.length,
    statesForCountry,
    districtsForState,
    blocksForDistrict,
    panchayatsForBlock,
    villagesForPath,
    pinsForPath
  };
}

function indexedPathScopeKey(
  countryBucket: string,
  values: Pick<LocationWithPin, "state" | "district" | "block" | "panchayat">
): string | null {
  const stateKey = normalizeIndiaLocationOptionKey(values.state ?? "");
  const districtKey = normalizeIndiaLocationOptionKey(values.district ?? "");
  const blockKey = normalizeIndiaLocationOptionKey(values.block ?? "");
  const panchayatKey = normalizeIndiaLocationOptionKey(values.panchayat ?? "");
  if (!stateKey || !districtKey || !blockKey || !panchayatKey) return null;
  return `${countryBucket}|${stateKey}|${districtKey}|${blockKey}|${panchayatKey}`;
}
