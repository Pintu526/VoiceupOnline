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

// Parent scope filters still compare with option.trim().toLowerCase() === value.trim().toLowerCase().

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
  fixedCountry
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
}): IndiaLocationOptions {
  const selectedCountry = (fixedCountry ?? values.country ?? "India").trim().toLowerCase();
  const stateOptions = allowedState
    ? [allowedState]
    : mergeIndiaLocationOptions(
      indianStatesAndUnionTerritories,
      customLocations.map((location) => location.state ?? "").filter(Boolean)
    );
  const districtOptions = mergeIndiaLocationOptions(
    getDistrictOptions(
      values.state,
      locationOverrides,
      locationDeletions,
      verifiedSuggestionsOnly
    ),
    customLocations
      .filter(
        (location) => location.state?.trim().toLowerCase() === values.state.trim().toLowerCase()
      )
      .map((location) => location.district ?? "")
      .filter(Boolean),
    true
  ).filter((district) => !allowedDistrict || district === allowedDistrict);
  const blockOptions = mergeIndiaLocationOptions(
    getBlockOptions(
      values.state,
      values.district,
      locationOverrides,
      locationDeletions,
      verifiedSuggestionsOnly
    ),
    customLocations
      .filter(
        (location) =>
          location.country?.trim().toLowerCase() === selectedCountry
          && location.state?.trim().toLowerCase() === values.state.trim().toLowerCase()
          && location.district?.trim().toLowerCase() === values.district.trim().toLowerCase()
      )
      .map((location) => location.block ?? "")
      .filter(Boolean),
    true
  ).filter((block) => !allowedBlock || block === allowedBlock);
  const panchayatOptions = mergeIndiaLocationOptions(
    getPanchayatOptions(
      values.state,
      values.district,
      values.block,
      locationOverrides,
      locationDeletions,
      verifiedSuggestionsOnly
    ),
    customLocations
      .filter(
        (location) =>
          location.state?.trim().toLowerCase() === values.state.trim().toLowerCase()
          && location.district?.trim().toLowerCase() === values.district.trim().toLowerCase()
          && location.block?.trim().toLowerCase() === values.block.trim().toLowerCase()
      )
      .map((location) => location.panchayat ?? "")
      .filter(Boolean),
    true
  ).filter((panchayat) => !allowedPanchayat || panchayat === allowedPanchayat);
  const selectedCustomPath = (location: PublicCampaignCustomLocation) =>
    location.country?.trim().toLowerCase() === selectedCountry
    && location.state?.trim().toLowerCase() === values.state.trim().toLowerCase()
    && location.district?.trim().toLowerCase() === values.district.trim().toLowerCase()
    && location.block?.trim().toLowerCase() === values.block.trim().toLowerCase()
    && location.panchayat?.trim().toLowerCase() === values.panchayat.trim().toLowerCase();

  return {
    stateOptions,
    districtOptions,
    blockOptions,
    panchayatOptions,
    villageOptions: mergeIndiaLocationOptions(
      [],
      customLocations.filter(selectedCustomPath).map((location) => location.village ?? "").filter(Boolean),
      true
    ),
    pinOptions: mergeIndiaLocationOptions(
      getPinOptions(values),
      customLocations.filter(selectedCustomPath).map((location) => location.postalCode ?? "").filter(Boolean)
    )
  };
}
