export interface CampaignAuthContext {
  campaignId: string;
  campaignSlug: string;
}

const campaignIdPattern = /^[A-Za-z0-9._:-]{1,160}$/;
const campaignSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

function normalizeCampaignSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function isCampaignAuthContext(value: unknown): value is CampaignAuthContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<CampaignAuthContext>;
  return typeof context.campaignId === "string"
    && campaignIdPattern.test(context.campaignId)
    && typeof context.campaignSlug === "string"
    && campaignSlugPattern.test(normalizeCampaignSlug(context.campaignSlug));
}

export function readCampaignAuthContext(rawSearch: string): CampaignAuthContext | null {
  const search = new URLSearchParams(rawSearch.replace(/^\?/, ""));
  const campaignIds = search.getAll("campaignId");
  const campaignSlugs = search.getAll("campaign");
  if (campaignIds.length !== 1 || campaignSlugs.length !== 1) return null;
  const context = {
    campaignId: campaignIds[0].trim(),
    campaignSlug: normalizeCampaignSlug(campaignSlugs[0])
  };
  return isCampaignAuthContext(context) ? context : null;
}

export function getCampaignLoginPath(context: CampaignAuthContext): string {
  if (!isCampaignAuthContext(context)) return "/login";
  const search = new URLSearchParams({
    campaign: normalizeCampaignSlug(context.campaignSlug),
    campaignId: context.campaignId
  });
  return `/login?${search.toString()}`;
}

export function getCampaignPublicPath(context: CampaignAuthContext): string {
  return isCampaignAuthContext(context)
    ? `/c/${encodeURIComponent(normalizeCampaignSlug(context.campaignSlug))}`
    : "/";
}

export function getCampaignWorkspacePath(context: CampaignAuthContext): string {
  if (!isCampaignAuthContext(context)) return "/app";
  const search = new URLSearchParams({
    campaign: normalizeCampaignSlug(context.campaignSlug),
    campaignId: context.campaignId
  });
  return `/app?${search.toString()}`;
}

export function sanitizeVoiceupLoginReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 512 || !value.startsWith("/login") || value.startsWith("//")) {
    return "/login";
  }
  try {
    const parsed = new URL(value, "https://voiceup.invalid");
    if (parsed.origin !== "https://voiceup.invalid" || parsed.pathname !== "/login") return "/login";
    const allowedKeys = new Set(["campaign", "campaignId"]);
    if ([...parsed.searchParams.keys()].some((key) => !allowedKeys.has(key))) return "/login";
    const context = readCampaignAuthContext(parsed.search);
    return context ? getCampaignLoginPath(context) : parsed.search ? "/login" : "/login";
  } catch {
    return "/login";
  }
}
