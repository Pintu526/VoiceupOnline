import type { Campaign } from "../types";

const appAdminEmail = (import.meta.env.VITE_VOICEUP_APP_ADMIN_EMAIL as string | undefined)?.trim() ?? "";
const appAdminPasscode = (import.meta.env.VITE_VOICEUP_APP_ADMIN_PASSCODE as string | undefined)?.trim() ?? "";

export function areAppAdminCredentialsConfigured(): boolean {
  return Boolean(appAdminEmail && appAdminPasscode);
}

// Set VITE_VOICEUP_APP_ADMIN_EMAIL and VITE_VOICEUP_APP_ADMIN_PASSCODE in Vercel / .env.local.
// When Supabase auth is configured, Supabase handles login instead of this MVP passcode gate.
export function getAppAdminEmail(): string {
  return appAdminEmail;
}

export function getAppAdminPasscode(): string {
  return appAdminPasscode;
}

export function getCurrentActorEmail(): string {
  if (
    typeof window !== "undefined" &&
    window.sessionStorage.getItem("voiceup-saas-admin-auth") === "true"
  ) {
    return getAppAdminEmail();
  }
  return "system";
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

export function readAppAuth(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem("voiceup-saas-admin-auth") === "true";
}

export function writeAppAuth(value: boolean): void {
  if (typeof window === "undefined") return;
  if (value) {
    window.sessionStorage.setItem("voiceup-saas-admin-auth", "true");
  } else {
    window.sessionStorage.removeItem("voiceup-saas-admin-auth");
  }
}
