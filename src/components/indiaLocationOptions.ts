import {
  getBlockOptions,
  getDistrictOptions,
  getPanchayatOptions,
  getPinOptions,
  indianStatesAndUnionTerritories,
  type LocationDeletions,
  type LocationOverrides,
  type LocationWithPin
} from "../geography";
import type { PublicCampaignCustomLocation } from "../backend";

export interface IndiaLocationOptions {
  stateOptions: string[];
  districtOptions: string[];
  blockOptions: string[];
  panchayatOptions: string[];
  villageOptions: string[];
  pinOptions: string[];
}

export function mergeIndiaLocationOptions(master: string[], additions: string[]): string[] {
  return [
    ...master,
    ...additions.filter(
      (value) => !master.some(
        (option) => option.trim().toLowerCase() === value.trim().toLowerCase()
      )
    )
  ];
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
      .filter(Boolean)
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
      .filter(Boolean)
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
      .filter(Boolean)
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
      customLocations.filter(selectedCustomPath).map((location) => location.village ?? "").filter(Boolean)
    ),
    pinOptions: mergeIndiaLocationOptions(
      getPinOptions(values),
      customLocations.filter(selectedCustomPath).map((location) => location.postalCode ?? "").filter(Boolean)
    )
  };
}
