import type {
  AuthorityRule,
  AuthorityTargetLevel,
  Campaign
} from "../types";

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

  if (level === "country") {
    return {
      id: "authority-prime-minister-india",
      name: "Prime Minister of India",
      department: "Government of India",
      position: "Prime Minister",
      level: "country",
      state: "",
      district: "",
      address: "Prime Minister's Office, South Block, New Delhi",
      phone: "",
      category: "Any",
      locationKeyword: "india",
      postalPrefix: "",
      email: "pmopg@gov.in",
      submissionMethod: "Portal",
      confidence: 100
    };
  }

  if (level === "state") {
    return {
      id: `authority-chief-minister-${campaign.state || "state"}`,
      name: campaign.state
        ? `Chief Minister of ${campaign.state}`
        : "Chief Minister of the selected state",
      department: "State Government",
      position: "Chief Minister",
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
    id: `authority-district-collector-${campaign.district || "district"}`,
    name: campaign.district
      ? `District Collector, ${campaign.district}`
      : "District Collector of the selected district",
    department: "District Administration",
    position: "District Collector",
    level: "district",
    state: campaign.state,
    district: campaign.district,
    address: "District Collector Office",
    phone: "",
    category: "Any",
    locationKeyword: campaign.district,
    postalPrefix: campaign.postalCode.slice(0, 3),
    email: "Configure official district collector contact",
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
  const fallback = getAppealAuthority({ ...campaign, selectedAuthorityId: "" }, []);
  if (uploadedOptions.some((authority) => authority.id === fallback.id)) {
    return uploadedOptions;
  }
  return [...uploadedOptions, fallback];
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
