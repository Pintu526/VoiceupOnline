import type { Campaign, Organization } from "../types";
import { goudhanCampaignBlueprint } from "./goudhanCampaignBlueprint.ts";

export const GOUDHAN_CAMPAIGN_SLUG = goudhanCampaignBlueprint.campaign.slug;

export const GAUMATA_PUBLIC_HOSTNAMES = [
  "gaumata.cloud",
  "www.gaumata.cloud"
] as const;

const GAUMATA_PUBLIC_HOSTNAME_SET = new Set<string>(GAUMATA_PUBLIC_HOSTNAMES);

const GOUDHAN_CAMPAIGN_SLUGS = new Set([
  GOUDHAN_CAMPAIGN_SLUG,
  "gsaa",
  "gau-samman-ahwan-abhiyan",
  "gau-samman-aahvaan-abhiyan"
]);

function normalized(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isGaumataPublicHostname(hostname: string | undefined) {
  return GAUMATA_PUBLIC_HOSTNAME_SET.has(normalized(hostname).replace(/\.$/, ""));
}

export function isGoudhanProductionCampaign(
  campaign: Pick<Campaign, "slug" | "title"> | null | undefined,
  _organization?: Pick<Organization, "customDomain"> | null
) {
  if (!campaign) return false;

  const slug = normalized(campaign.slug);
  const title = normalized(campaign.title);

  return (
    GOUDHAN_CAMPAIGN_SLUGS.has(slug) ||
    title.includes("gau samman") ||
    title.includes("गौ सम्मान") ||
    title.includes("ଗୌ ସମ୍ମାନ")
  );
}
