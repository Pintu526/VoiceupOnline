import type { PublicSigningConsentSource } from "../types";

export interface PublicSigningConsentPayload {
  consentAccepted: boolean;
  consentText: string;
  consentVersion: string;
  consentAcceptedAt: string;
  consentSource: PublicSigningConsentSource;
}

function normalizeConsentText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createConsentVersion(consentText: string): string {
  const normalized = normalizeConsentText(consentText);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return `consent-v1-${unsigned.toString(16).padStart(8, "0")}`;
}

export function buildPublicWebConsentPayload(consentText: string): PublicSigningConsentPayload {
  const normalizedConsentText = normalizeConsentText(consentText);
  return {
    consentAccepted: true,
    consentText: normalizedConsentText,
    consentVersion: createConsentVersion(normalizedConsentText),
    consentAcceptedAt: new Date().toISOString(),
    consentSource: "public_web"
  };
}
