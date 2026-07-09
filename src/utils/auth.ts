import type { Campaign } from "../types";

export function getCurrentActorEmail(): string {
  return "authenticated-user";
}

export function createAdminPasscode(): string {
  return `voiceup-${Math.random().toString(36).slice(2, 8)}`;
}

export function getCampaignAdminEmail(campaign: Campaign): string {
  return campaign.adminEmail?.trim() ?? "";
}

export function getCampaignAdminPasscode(campaign: Campaign): string {
  return campaign.adminPasscode?.trim() ?? "";
}

export function readAuthenticatedAdminSlugs(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      window.sessionStorage.getItem("voiceup-campaign-admin-auth") ?? "{}"
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function writeAuthenticatedAdminSlugs(values: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("voiceup-campaign-admin-auth", JSON.stringify(values));
}
