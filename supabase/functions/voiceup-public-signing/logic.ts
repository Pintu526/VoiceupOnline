export const CONSENT_REQUIRED_CODE = "consent_required" as const;

export type PublicSigningConsentSource = "public_web";

export const PUBLIC_PARTICIPATION_ACTIONS = [
  "save_draft",
  "submit_support",
  "resume_verified_supporter",
  "update_profile",
  "record_consents",
  "submit_participation_request",
  "read_participation_requests",
  "submit_coordinator_application",
  "sync_coordinator_application_state"
] as const;

export type PublicParticipationAction = (typeof PUBLIC_PARTICIPATION_ACTIONS)[number];

export const PUBLIC_PROFILE_FIELDS = new Set([
  "name", "email", "whatsappNumber", "telegramHandle",
  "selectedAuthorityId", "selectedAuthorityName",
  "countryId", "country", "stateId", "state", "districtId", "district",
  "blockId", "block", "panchayatId", "panchayat", "wardId", "ward",
  "address", "postalCode", "comment", "languagePreference",
  "communicationPreference", "volunteerInterest", "coordinatorInterest",
  "profilePhotoPath", "profilePhotoUpdatedAt", "profileCompletion",
  "referredBy", "referredByPhoneOrCode", "referralSource", "referralCode"
]);

export const PUBLIC_SIGNER_TRANSPORT_FIELDS = new Set([
  "phone", "otpVerified", "otpChallengeId", "otpVerificationToken"
]);

export function isPublicParticipationAction(value: string): value is PublicParticipationAction {
  return (PUBLIC_PARTICIPATION_ACTIONS as readonly string[]).includes(value);
}

export function hasBase64Image(value: unknown): boolean {
  try {
    return /data:[^;]+;base64,/i.test(JSON.stringify(value));
  } catch {
    return true;
  }
}

export function validateProfileFields(profile: unknown): boolean {
  if (profile === undefined) return true;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return false;
  return Object.keys(profile as Record<string, unknown>).every((key) => PUBLIC_PROFILE_FIELDS.has(key));
}

export function profileFromSigner(signer: Record<string, unknown>) {
  const profile: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(signer)) {
    if (!PUBLIC_SIGNER_TRANSPORT_FIELDS.has(key) && validateProfileFields({ [key]: value })) {
      profile[key] = value;
    }
  }
  return profile;
}

export function hasUnsupportedSignerFields(signer: Record<string, unknown>) {
  return Object.keys(signer).some((key) =>
    !PUBLIC_SIGNER_TRANSPORT_FIELDS.has(key) && !validateProfileFields({ [key]: signer[key] })
  );
}

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
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) {
    return digits.slice(1);
  }
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

export function buildCanonicalSubmitSupportConsents(
  consentInput: unknown,
  campaignConsentText: string,
  suppliedConsents: unknown,
  communicationConsent = false
):
  | { ok: true; consents: Record<string, unknown> }
  | { ok: false; code: typeof CONSENT_REQUIRED_CODE; message: string } {
  const validation = validatePublicSigningConsent(consentInput, campaignConsentText);
  if (!validation.ok) return validation;

  const clientPreferences =
    suppliedConsents
    && typeof suppliedConsents === "object"
    && !Array.isArray(suppliedConsents)
      ? suppliedConsents as Record<string, unknown>
      : {};
  const canonicalCampaignConsent = {
    granted: true,
    version: validation.evidence.version,
    policyId: validation.evidence.version
  };

  return {
    ok: true,
    consents: {
      ...clientPreferences,
      // A caller may submit other consent preferences, but campaign-support
      // evidence always comes from the campaign's validated consent contract.
      campaignSupport: canonicalCampaignConsent,
      ...(communicationConsent
        ? { campaignCommunication: canonicalCampaignConsent }
        : {})
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
