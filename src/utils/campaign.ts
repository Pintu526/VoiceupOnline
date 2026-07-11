import {
  initialAuthorities,
  initialCommercialPackages,
  initialIntegrationSettings
} from "../data";
import type { VoiceupRemoteState } from "../backend";
import type {
  Campaign,
  CampaignGeographyMode,
  CampaignScope,
  LocationGovernanceLevel,
  Organization
} from "../types";
import { getCampaignMetrics } from "../lib";
import {
  getCampaignAdminUrl as getCanonicalCampaignAdminUrl,
  getCanonicalBaseUrl,
  getPublicCampaignUrl,
  getSaasAdminUrl
} from "./links";

const locationLevelOrder: LocationGovernanceLevel[] = [
  "none",
  "state",
  "district",
  "block",
  "panchayat"
];

type LocationFields = Pick<Campaign, "state" | "district" | "block" | "panchayat">;
type CountryLocationFields = Partial<Pick<Campaign, "country">> & Partial<LocationFields>;

export interface CampaignLocationLabels {
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  postalCode: string;
}

const indiaLocationLabels: CampaignLocationLabels = {
  country: "Country",
  state: "State",
  district: "District",
  block: "Block / Tehsil / Taluk",
  panchayat: "Gram Panchayat / Ward",
  postalCode: "PIN code"
};

const globalLocationLabels: CampaignLocationLabels = {
  country: "Country",
  state: "State / Province / Region",
  district: "City / District",
  block: "Area / County",
  panchayat: "Locality / Ward",
  postalCode: "Postal / ZIP code"
};

export function getCampaignBaseUrl(_organization: Organization): string {
  return getCanonicalBaseUrl();
}

export function getCampaignPublicUrl(
  _organization: Organization | undefined,
  campaign: Pick<Campaign, "slug">
): string {
  return getPublicCampaignUrl(campaign.slug);
}

export function getCampaignAdminUrl(
  _organization: Organization | undefined,
  campaign: Pick<Campaign, "slug">
): string {
  return getCanonicalCampaignAdminUrl(campaign.slug);
}

export function getSaasAdminPageUrl(): string {
  return getSaasAdminUrl();
}

export function getCampaignGoalValue(campaign: Campaign): number {
  return campaign.maxSignersAllowed > 0 ? campaign.maxSignersAllowed : campaign.goal;
}

export function getCampaignGeographyMode(
  campaign: Pick<Campaign, "geographyMode" | "country"> | undefined
): CampaignGeographyMode {
  if (campaign?.geographyMode) return campaign.geographyMode;
  return campaign?.country && campaign.country.trim().toLowerCase() !== "india"
    ? "global"
    : "india_detailed";
}

export function isGlobalCampaign(
  campaign: Pick<Campaign, "geographyMode" | "country"> | undefined
): boolean {
  return getCampaignGeographyMode(campaign) === "global";
}

export function getCampaignScope(
  campaign: Pick<Campaign, "campaignScope"> | undefined
): CampaignScope {
  return campaign?.campaignScope ?? "local";
}

export function getCampaignScopeLabel(scope: CampaignScope): string {
  if (scope === "local") return "Local campaign";
  if (scope === "city") return "City campaign";
  if (scope === "state_province") return "State / Province campaign";
  if (scope === "national") return "National campaign";
  return "Global campaign";
}

export function getCampaignLocationLabels(
  campaign: Pick<Campaign, "geographyMode" | "country"> | undefined
): CampaignLocationLabels {
  return isGlobalCampaign(campaign) ? globalLocationLabels : indiaLocationLabels;
}

export function formatLocationForCampaign(
  campaign: Pick<Campaign, "geographyMode" | "country"> | undefined,
  values: CountryLocationFields
): string {
  const parts = isGlobalCampaign(campaign)
    ? [values.panchayat, values.block, values.district, values.state, values.country]
    : [values.panchayat, values.block, values.district, values.state];
  return parts.filter(Boolean).join(", ");
}

export function hasSaasLocks(campaign: Campaign): boolean {
  return Boolean(
    campaign.publishingLockedBySaas ||
      campaign.goalLockedBySaas ||
      campaign.datesLockedBySaas ||
      campaign.authorityLockedBySaas ||
      campaign.donationLockedBySaas ||
      campaign.requiredFieldsLockedBySaas ||
      campaign.maxSignersAllowed > 0 ||
      campaign.maxScansAllowed > 0
  );
}

export function getLocationGovernance(organization: Organization) {
  return {
    state: organization.locationGovernance?.state ?? "",
    district: organization.locationGovernance?.district ?? "",
    block: organization.locationGovernance?.block ?? "",
    panchayat: organization.locationGovernance?.panchayat ?? "",
    lockLevel: organization.locationGovernance?.lockLevel ?? "none" as LocationGovernanceLevel
  };
}

export function getSignerLocationRestrictionLevel(campaign: Campaign): LocationGovernanceLevel {
  return campaign.signerLocationRestrictionLevel ?? "none";
}

export function getEffectiveSignerLocationRestrictionLevel(
  campaign: Campaign,
  organization?: Organization
): LocationGovernanceLevel {
  const campaignLevel = getConfiguredLocationLockLevel(campaign, getSignerLocationRestrictionLevel(campaign));
  if (isGlobalCampaign(campaign)) return campaignLevel;
  const governance = organization ? getLocationGovernance(organization) : undefined;
  const governanceLevel = governance
    ? getConfiguredLocationLockLevel(governance, governance.lockLevel)
    : "none";
  return locationLevelOrder.indexOf(governanceLevel) > locationLevelOrder.indexOf(campaignLevel)
    ? governanceLevel
    : campaignLevel;
}

export function isLocationLevelAtLeast(
  level: LocationGovernanceLevel,
  minimum: LocationGovernanceLevel
): boolean {
  return locationLevelOrder.indexOf(level) >= locationLevelOrder.indexOf(minimum);
}

export function getConfiguredLocationLockLevel(
  values: Partial<LocationFields>,
  requestedLevel: LocationGovernanceLevel
): LocationGovernanceLevel {
  if (requestedLevel === "none" || !values.state?.trim()) return "none";
  if (requestedLevel === "state" || !values.district?.trim()) return "state";
  if (requestedLevel === "district" || !values.block?.trim()) return "district";
  if (requestedLevel === "block" || !values.panchayat?.trim()) return "block";
  return "panchayat";
}

export function getLockedLocationValues(
  values: Partial<LocationFields>,
  level: LocationGovernanceLevel
): Partial<LocationFields> {
  const configuredLevel = getConfiguredLocationLockLevel(values, level);
  if (configuredLevel === "none") return {};
  return {
    ...(isLocationLevelAtLeast(configuredLevel, "state") ? { state: values.state ?? "" } : {}),
    ...(isLocationLevelAtLeast(configuredLevel, "district") ? { district: values.district ?? "" } : {}),
    ...(isLocationLevelAtLeast(configuredLevel, "block") ? { block: values.block ?? "" } : {}),
    ...(isLocationLevelAtLeast(configuredLevel, "panchayat") ? { panchayat: values.panchayat ?? "" } : {})
  };
}

export function applyLocationGovernanceToCampaign(
  campaign: Campaign,
  organization: Organization
): Campaign {
  if (isGlobalCampaign(campaign)) return campaign;
  const governance = getLocationGovernance(organization);
  const lockedValues = getLockedLocationValues(governance, governance.lockLevel);
  return { ...campaign, ...lockedValues };
}

export function applySignerLocationRestriction<T extends CountryLocationFields>(
  campaign: Campaign,
  signerValues: T,
  organization?: Organization
): T {
  const restrictionLevel = getEffectiveSignerLocationRestrictionLevel(campaign, organization);
  const lockedValues = getLockedLocationValues(campaign, restrictionLevel);
  const lockedCountry =
    isGlobalCampaign(campaign) && getCampaignScope(campaign) !== "global" && campaign.country?.trim()
      ? { country: campaign.country }
      : {};
  return { ...signerValues, ...lockedCountry, ...lockedValues };
}

export function isWithinLocationRestriction(
  campaign: Campaign,
  values: CountryLocationFields,
  organization?: Organization
): boolean {
  const restrictionLevel = getEffectiveSignerLocationRestrictionLevel(campaign, organization);
  const lockedCountry =
    isGlobalCampaign(campaign) && getCampaignScope(campaign) !== "global" && campaign.country?.trim()
      ? campaign.country
      : "";
  if (lockedCountry) {
    const country = values.country ?? "";
    if (country.trim().toLowerCase() !== lockedCountry.trim().toLowerCase()) return false;
  }
  if (restrictionLevel === "none") return true;
  const restrictedValues = getLockedLocationValues(campaign, restrictionLevel);
  return Object.entries(restrictedValues).every(
    ([key, value]) =>
      !value ||
      ((values[key as keyof LocationFields] ?? "").trim().toLowerCase() === value.trim().toLowerCase())
  );
}

export function getLocationRestrictionMessage(campaign: Campaign, organization?: Organization): string {
  const restrictionLevel = getEffectiveSignerLocationRestrictionLevel(campaign, organization);
  const values = getLockedLocationValues(campaign, restrictionLevel);
  const location = formatLocationForCampaign(campaign, {
    ...values,
    country:
      isGlobalCampaign(campaign) && getCampaignScope(campaign) !== "global"
        ? campaign.country
        : ""
  });
  return location ? `This campaign is restricted to ${location}.` : "";
}

export function getLocationLevelLabel(
  level: LocationGovernanceLevel,
  campaign?: Pick<Campaign, "geographyMode" | "country">
): string {
  const labels = getCampaignLocationLabels(campaign);
  if (level === "state") return labels.state;
  if (level === "district") return labels.district;
  if (level === "block") return labels.block;
  if (level === "panchayat") return labels.panchayat;
  return "None";
}

export function getTomorrowDate(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

export function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function renderCampaignMessage(
  template: string,
  campaign: Campaign,
  metrics: ReturnType<typeof getCampaignMetrics>
): string {
  return template
    .split("{{campaign}}").join(campaign.title)
    .split("{{url}}").join(campaign.shareUrl)
    .split("{{verified}}").join(metrics.verified.toLocaleString())
    .split("{{total}}").join(metrics.total.toLocaleString())
    .split("{{goal}}").join(campaign.goal.toLocaleString())
    .split("{{progress}}").join(`${metrics.progress}%`);
}

export function createRemoteState(state: VoiceupRemoteState): VoiceupRemoteState {
  return {
    campaigns: state.campaigns,
    activeCampaignId: state.activeCampaignId,
    signers: state.signers,
    authorities: state.authorities,
    organization: state.organization,
    scanItems: state.scanItems,
    locationOverrides: state.locationOverrides,
    locationDeletions: state.locationDeletions,
    auditLogs: state.auditLogs ?? [],
    integrations: state.integrations ?? initialIntegrationSettings,
    commercialPackages: state.commercialPackages ?? initialCommercialPackages
  };
}

export function signerFieldLabel(
  field: string,
  campaign?: Pick<Campaign, "geographyMode" | "country">
): string {
  const locationLabels = getCampaignLocationLabels(campaign);
  const labels: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    country: locationLabels.country,
    state: locationLabels.state,
    district: locationLabels.district,
    block: locationLabels.block,
    panchayat: locationLabels.panchayat,
    address: "Street address / house details",
    postalCode: locationLabels.postalCode,
    comment: "Comment"
  };
  return labels[field] ?? field;
}
