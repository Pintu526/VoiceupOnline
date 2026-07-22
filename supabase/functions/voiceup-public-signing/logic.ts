export const CONSENT_REQUIRED_CODE = "consent_required" as const;

export type PublicSigningConsentSource = "public_web";

export interface ValidatedPublicSigningConsent {
  accepted: true;
  textSnapshot: string;
  version: string;
  acceptedAt: string;
  source: PublicSigningConsentSource;
}

function normalizeConsentText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePhone(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isIsoTimestamp(value: string): boolean {
  if (!value || Number.isNaN(Date.parse(value))) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value);
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

export function validatePublicSigningConsent(
  consentInput: unknown,
  campaignConsentText: string
):
  | { ok: true; evidence: ValidatedPublicSigningConsent }
  | { ok: false; code: typeof CONSENT_REQUIRED_CODE; message: string } {
  const configuredConsentText = normalizeConsentText(campaignConsentText);
  if (!configuredConsentText) {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  const payload = (consentInput ?? {}) as {
    consentAccepted?: boolean;
    consentText?: string;
    consentVersion?: string;
    consentAcceptedAt?: string;
    consentSource?: string;
  };

  if (payload.consentAccepted !== true) {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  const submittedConsentText = normalizeConsentText(payload.consentText ?? "");
  if (!submittedConsentText) {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  const consentVersion = String(payload.consentVersion ?? "").trim();
  if (!consentVersion) {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  const consentAcceptedAt = String(payload.consentAcceptedAt ?? "").trim();
  if (!isIsoTimestamp(consentAcceptedAt)) {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  if (payload.consentSource !== "public_web") {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  if (submittedConsentText !== configuredConsentText) {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  const expectedVersion = createConsentVersion(configuredConsentText);
  if (consentVersion !== expectedVersion) {
    return {
      ok: false,
      code: CONSENT_REQUIRED_CODE,
      message: "Consent is required before signing this campaign."
    };
  }

  return {
    ok: true,
    evidence: {
      accepted: true,
      textSnapshot: configuredConsentText,
      version: consentVersion,
      acceptedAt: consentAcceptedAt,
      source: "public_web"
    }
  };
}

export function findExistingDuplicateSigner(signers: any[], campaignId: string, signerInput: any): any | null {
  const candidateEmail = normalizeEmail(signerInput?.email);
  const candidatePhone = normalizePhone(signerInput?.phone);

  return (
    signers.find((signer) => {
      if (signer?.campaignId !== campaignId) return false;
      const signerEmail = normalizeEmail(signer?.email);
      const signerPhone = normalizePhone(signer?.phone);
      return Boolean(
        (candidateEmail && signerEmail && candidateEmail === signerEmail) ||
          (candidatePhone && signerPhone && candidatePhone === signerPhone)
      );
    }) ?? null
  );
}
