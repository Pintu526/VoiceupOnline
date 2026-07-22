export const PRODUCTION_PUBLIC_ORIGIN = "https://voiceup.live";

export interface PublicOriginContext {
  explicitOrigin?: string;
  runtimeOrigin?: string;
  runtimeHostname?: string;
  production?: boolean;
}

function normalizeHttpOrigin(value: string | undefined): string {
  if (!value?.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export function resolvePublicOrigin(context: PublicOriginContext = {}): string {
  const runtimeOrigin = normalizeHttpOrigin(context.runtimeOrigin);
  const runtimeHostname = (context.runtimeHostname || (runtimeOrigin ? new URL(runtimeOrigin).hostname : "")).toLowerCase();

  // In browsers, always prefer the live runtime origin for local and preview environments.
  if (runtimeOrigin && runtimeHostname && runtimeHostname !== "voiceup.live" && runtimeHostname !== "www.voiceup.live") {
    return runtimeOrigin;
  }

  const explicitOrigin = normalizeHttpOrigin(context.explicitOrigin);
  if (explicitOrigin && !(context.production && isLocalHostname(new URL(explicitOrigin).hostname))) {
    return explicitOrigin;
  }

  if (runtimeHostname === "voiceup.live" || runtimeHostname === "www.voiceup.live") {
    return PRODUCTION_PUBLIC_ORIGIN;
  }
  if (context.production && isLocalHostname(runtimeHostname)) {
    return PRODUCTION_PUBLIC_ORIGIN;
  }
  if (runtimeOrigin) return runtimeOrigin;
  return PRODUCTION_PUBLIC_ORIGIN;
}

export function getCanonicalBaseUrl(): string {
  const environment = (import.meta as ImportMeta & {
    env?: { VITE_PUBLIC_ORIGIN?: string; VITE_SITE_URL?: string; PROD?: boolean };
  }).env;
  return resolvePublicOrigin({
    explicitOrigin: environment?.VITE_PUBLIC_ORIGIN || environment?.VITE_SITE_URL,
    runtimeOrigin: typeof window === "undefined" ? undefined : window.location.origin,
    runtimeHostname: typeof window === "undefined" ? undefined : window.location.hostname,
    production: environment?.PROD
  });
}

function appendPath(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function getSaasAdminUrl(): string {
  return appendPath(getCanonicalBaseUrl(), "admin");
}

export function getCampaignAdminUrl(slug: string): string {
  const normalizedSlug = slug.trim();
  return normalizedSlug ? appendPath(getCanonicalBaseUrl(), `admin/${encodeURIComponent(normalizedSlug)}`) : "";
}

export function getPublicCampaignUrl(slug: string): string {
  return getPublicCampaignUrlForOrigin(slug);
}

export function getPublicCampaignUrlForOrigin(slug: string, context?: PublicOriginContext): string {
  const normalizedSlug = slug.trim();
  const origin = context ? resolvePublicOrigin(context) : getCanonicalBaseUrl();
  return normalizedSlug ? appendPath(origin, `c/${encodeURIComponent(normalizedSlug)}`) : "";
}

export function whatsAppLink(phone: string, message: string): string {
  const normalizedPhone = phone.replace(/\D/g, "");
  const baseUrl = normalizedPhone ? `https://wa.me/${normalizedPhone}` : "https://wa.me/";
  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

export function smsLink(phone: string, message: string): string {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  return `sms:${normalizedPhone}?&body=${encodeURIComponent(message)}`;
}
