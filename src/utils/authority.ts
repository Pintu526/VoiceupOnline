import type {
  AuthorityRule,
  AuthorityTargetLevel,
  Campaign
} from "../types";
import { getCampaignGeographyMode, getCampaignLocationLabels } from "./campaign";

export function getAppealAuthority(
  campaign: Campaign,
  authorities: AuthorityRule[] = []
): AuthorityRule {
  const selectedAuthority = authorities.find(
    (authority) => authority.id === campaign.selectedAuthorityId
  );
  if (selectedAuthority) return selectedAuthority;

  const matchingUploadedAuthority = getAuthorityOptionsForCampaign(campaign, authorities)[0];
  if (matchingUploadedAuthority) return matchingUploadedAuthority;

  const level = campaign.authorityTargetLevel ?? "district";
  const isIndiaDetailed = getCampaignGeographyMode(campaign) === "india_detailed";
  const locationLabels = getCampaignLocationLabels(campaign);

  if (level === "country") {
    const country = campaign.country?.trim() || (isIndiaDetailed ? "India" : "selected country");
    return {
      id: isIndiaDetailed ? "authority-prime-minister-india" : `authority-national-${country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: isIndiaDetailed ? "Prime Minister of India" : `National authority for ${country}`,
      department: isIndiaDetailed ? "Government of India" : "National Government",
      position: isIndiaDetailed ? "Prime Minister" : "National Authority",
      level: "country",
      state: "",
      district: "",
      address: isIndiaDetailed ? "Prime Minister's Office, South Block, New Delhi" : "National authority office",
      phone: "",
      category: "Any",
      locationKeyword: country,
      postalPrefix: "",
      email: isIndiaDetailed ? "pmopg@gov.in" : "Configure national authority contact",
      submissionMethod: "Portal",
      confidence: 100
    };
  }

  if (level === "state") {
    return {
      id: `authority-region-${campaign.state || "state"}`,
      name: isIndiaDetailed
        ? campaign.state
          ? `Chief Minister of ${campaign.state}`
          : "Chief Minister of the selected state"
        : campaign.state
          ? `${locationLabels.state} authority for ${campaign.state}`
          : `${locationLabels.state} authority`,
      department: isIndiaDetailed ? "State Government" : "Regional Government",
      position: isIndiaDetailed ? "Chief Minister" : "Regional Authority",
      level: "state",
      state: campaign.state,
      district: "",
      address: "Chief Minister's Office",
      phone: "",
      category: "Any",
      locationKeyword: campaign.state,
      postalPrefix: "",
      email: "Configure official CMO contact",
      submissionMethod: "Portal",
      confidence: 100
    };
  }

  return {
    id: `authority-location-${campaign.district || "district"}`,
    name: isIndiaDetailed
      ? campaign.district
        ? `District Collector, ${campaign.district}`
        : "District Collector of the selected district"
      : campaign.district
        ? `${locationLabels.district} authority for ${campaign.district}`
        : `${locationLabels.district} authority`,
    department: isIndiaDetailed ? "District Administration" : "Local Administration",
    position: isIndiaDetailed ? "District Collector" : "Local Authority",
    level: "district",
    state: campaign.state,
    district: campaign.district,
    address: isIndiaDetailed ? "District Collector Office" : "Local authority office",
    phone: "",
    category: "Any",
    locationKeyword: campaign.district,
    postalPrefix: campaign.postalCode.slice(0, 3),
    email: isIndiaDetailed ? "Configure official district collector contact" : "Configure local authority contact",
    submissionMethod: "Email",
    confidence: 100
  };
}

export function getSignerSelectedAuthority(
  campaign: Campaign,
  selectedAuthorityId: string,
  authorities: AuthorityRule[]
): AuthorityRule {
  if (campaign.authoritySelectionMode === "public_choice" && selectedAuthorityId) {
    return (
      authorities.find((authority) => authority.id === selectedAuthorityId) ??
      getAppealAuthority(campaign, authorities)
    );
  }
  return getAppealAuthority(campaign, authorities);
}

export function getPublicAuthorityOptions(
  campaign: Campaign,
  authorities: AuthorityRule[]
): AuthorityRule[] {
  const uploadedOptions = getAuthorityOptionsForCampaign(campaign, authorities);
  if (uploadedOptions.length > 0) {
    return uploadedOptions;
  }
  return [getAppealAuthority({ ...campaign, selectedAuthorityId: "" }, [])];
}

export function getAuthorityOptionsForCampaign(
  campaign: Campaign,
  authorities: AuthorityRule[]
): AuthorityRule[] {
  const level = campaign.authorityTargetLevel ?? "district";
  return authorities.filter((authority) => {
    if (authority.level !== "any" && authority.level !== level) return false;
    if (authority.category !== "Any" && authority.category !== campaign.category) return false;
    if (authority.panchayat && authority.panchayat !== campaign.panchayat) return false;
    if (authority.block && authority.block !== campaign.block) return false;
    if (
      level === "district" &&
      authority.district &&
      authority.district !== campaign.district
    )
      return false;
    if (
      (level === "district" || level === "state") &&
      authority.state &&
      authority.state !== campaign.state
    )
      return false;
    return true;
  }).sort((first, second) => getAuthorityLocalityScore(second, campaign) - getAuthorityLocalityScore(first, campaign));
}

function getAuthorityLocalityScore(authority: AuthorityRule, campaign: Campaign): number {
  let score = 0;
  if (authority.panchayat && authority.panchayat === campaign.panchayat) score += 500;
  if (authority.block && authority.block === campaign.block) score += 400;
  if (authority.district && authority.district === campaign.district) score += 300;
  if (authority.state && authority.state === campaign.state) score += 200;
  if (authority.category === campaign.category) score += 100;
  if (authority.category === "Any") score += 10;
  return score + authority.confidence;
}

export function formatAuthorityDisplay(authority: AuthorityRule): string {
  return [authority.position, authority.name, authority.address]
    .filter(Boolean)
    .join(" - ");
}

export function getAuthorityPositionLabel(
  level: AuthorityTargetLevel | "any"
): string {
  if (level === "country") return "Prime Minister";
  if (level === "state") return "Chief Minister";
  if (level === "district") return "District Collector";
  return "Authority";
}

export function getAuthorityDepartmentLabel(
  level: AuthorityTargetLevel | "any"
): string {
  if (level === "country") return "Government of India";
  if (level === "state") return "State Government";
  if (level === "district") return "District Administration";
  return "Authority Office";
}

export function normalizeAuthorityLevel(value: string): AuthorityTargetLevel | "any" {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("country") || normalized.includes("prime")) return "country";
  if (normalized.includes("state") || normalized.includes("chief")) return "state";
  if (normalized.includes("district") || normalized.includes("collector"))
    return "district";
  return "any";
}
