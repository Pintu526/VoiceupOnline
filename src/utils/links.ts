const PRODUCTION_BASE_URL = "https://voiceup.live";

export function getCanonicalBaseUrl(): string {
  if (typeof window === "undefined") return PRODUCTION_BASE_URL;

  const { hostname, origin } = window.location;
  const normalizedHost = hostname.toLowerCase();
  const isLocalDev =
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1" ||
    normalizedHost === "[::1]";

  if (isLocalDev) return origin;
  if (normalizedHost === "voiceup.live") return PRODUCTION_BASE_URL;

  return PRODUCTION_BASE_URL;
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
