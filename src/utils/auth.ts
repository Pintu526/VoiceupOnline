import type { Campaign } from "../types";

const platformAdminSessionKey = "voiceup-platform-admin-session-v1";
const configuredPlatformAdminEmail = import.meta.env.VITE_VOICEUP_APP_ADMIN_EMAIL as string | undefined;
const configuredPlatformAdminPasscode = import.meta.env.VITE_VOICEUP_APP_ADMIN_PASSCODE as string | undefined;

function normalizeLoginValue(value: string): string {
  return value.trim().toLowerCase();
}

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

export function hasConfiguredPlatformAdminFallback(): boolean {
  return Boolean(configuredPlatformAdminEmail?.trim() && configuredPlatformAdminPasscode?.trim());
}

export function matchesConfiguredPlatformAdminCredentials(email: string, passcode: string): boolean {
  if (!hasConfiguredPlatformAdminFallback()) return false;
  return (
    normalizeLoginValue(email) === normalizeLoginValue(configuredPlatformAdminEmail ?? "") &&
    passcode.trim() === (configuredPlatformAdminPasscode ?? "").trim()
  );
}

export function readPlatformAdminSessionEmail(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(platformAdminSessionKey) ?? "";
}

export function writePlatformAdminSession(email: string): void {
  if (typeof window === "undefined" || !email.trim()) return;
  window.sessionStorage.setItem(platformAdminSessionKey, normalizeLoginValue(email));
}

export function clearPlatformAdminSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(platformAdminSessionKey);
}

export function hasRestoredPlatformAdminSession(): boolean {
  if (!hasConfiguredPlatformAdminFallback()) return false;
  return readPlatformAdminSessionEmail() === normalizeLoginValue(configuredPlatformAdminEmail ?? "");
}
