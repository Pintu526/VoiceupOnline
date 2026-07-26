import type { blankSigner } from "./constants";

export const PUBLIC_SIGNING_JOURNEY_VERSION = "public-signing-v2";
const PUBLIC_SIGNING_STORAGE_PREFIX = "voiceup-public-signing-progress";

export interface PublicSigningCampaignScope {
  campaignId: string;
  slug: string;
}

export interface PublicSigningStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PublicSigningSubmissionAttempt {
  fingerprint: string;
  idempotencyKey: string;
  consentAcceptedAt: string;
}

interface StoredPublicSigningJourney {
  version: typeof PUBLIC_SIGNING_JOURNEY_VERSION;
  campaignId: string;
  campaignSlug: string;
  step: "phone";
  form: Partial<typeof blankSigner>;
}

function normalizedScope(scope: PublicSigningCampaignScope): PublicSigningCampaignScope {
  return {
    campaignId: scope.campaignId.trim(),
    slug: scope.slug.trim().toLowerCase()
  };
}

export function getPublicSigningJourneyStorageKey(scope: PublicSigningCampaignScope): string {
  const normalized = normalizedScope(scope);
  return [
    PUBLIC_SIGNING_STORAGE_PREFIX,
    PUBLIC_SIGNING_JOURNEY_VERSION,
    encodeURIComponent(normalized.campaignId),
    encodeURIComponent(normalized.slug)
  ].join(":");
}

function getLegacyPublicSigningJourneyStorageKey(campaignId: string): string {
  return `${PUBLIC_SIGNING_STORAGE_PREFIX}-${campaignId}`;
}

export function clearPublicSigningJourney(
  storage: PublicSigningStorage,
  scope: PublicSigningCampaignScope
): void {
  storage.removeItem(getPublicSigningJourneyStorageKey(scope));
  storage.removeItem(getLegacyPublicSigningJourneyStorageKey(scope.campaignId));
}

export function transitionPublicSigningCampaign(
  storage: PublicSigningStorage,
  previous: PublicSigningCampaignScope | null,
  next: PublicSigningCampaignScope
): boolean {
  const normalizedNext = normalizedScope(next);
  storage.removeItem(getLegacyPublicSigningJourneyStorageKey(normalizedNext.campaignId));
  if (!previous) return false;

  const normalizedPrevious = normalizedScope(previous);
  const changed =
    normalizedPrevious.campaignId !== normalizedNext.campaignId ||
    normalizedPrevious.slug !== normalizedNext.slug;
  if (!changed) return false;

  clearPublicSigningJourney(storage, normalizedPrevious);
  clearPublicSigningJourney(storage, normalizedNext);
  return true;
}

export function clearPublicSigningOtpState<T extends {
  otpVerified: boolean;
  otpChallengeId: string;
  otpVerificationToken: string;
}>(form: T): T {
  return {
    ...form,
    otpVerified: false,
    otpChallengeId: "",
    otpVerificationToken: ""
  };
}

export function readPublicSigningDraft(
  storage: PublicSigningStorage,
  scope: PublicSigningCampaignScope
): StoredPublicSigningJourney | null {
  const normalized = normalizedScope(scope);
  storage.removeItem(getLegacyPublicSigningJourneyStorageKey(normalized.campaignId));
  const storageKey = getPublicSigningJourneyStorageKey(normalized);
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) ?? "null") as Partial<StoredPublicSigningJourney> | null;
    if (
      !parsed ||
      parsed.version !== PUBLIC_SIGNING_JOURNEY_VERSION ||
      parsed.campaignId !== normalized.campaignId ||
      parsed.campaignSlug !== normalized.slug ||
      !parsed.form
    ) {
      if (parsed) storage.removeItem(storageKey);
      return null;
    }
    return {
      version: PUBLIC_SIGNING_JOURNEY_VERSION,
      campaignId: normalized.campaignId,
      campaignSlug: normalized.slug,
      step: "phone",
      form: clearPublicSigningOtpState({
        ...parsed.form,
        otpVerified: false,
        otpChallengeId: "",
        otpVerificationToken: ""
      })
    };
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function writePublicSigningDraft(
  storage: PublicSigningStorage,
  scope: PublicSigningCampaignScope,
  form: typeof blankSigner
): void {
  const normalized = normalizedScope(scope);
  const value: StoredPublicSigningJourney = {
    version: PUBLIC_SIGNING_JOURNEY_VERSION,
    campaignId: normalized.campaignId,
    campaignSlug: normalized.slug,
    step: "phone",
    form: clearPublicSigningOtpState(form)
  };
  storage.setItem(getPublicSigningJourneyStorageKey(normalized), JSON.stringify(value));
  storage.removeItem(getLegacyPublicSigningJourneyStorageKey(normalized.campaignId));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

export function createPublicSigningSubmissionAttempt(
  previous: PublicSigningSubmissionAttempt | null,
  submissionPayload: unknown,
  createIdempotencyKey: () => string,
  now: () => string = () => new Date().toISOString()
): PublicSigningSubmissionAttempt {
  const fingerprint = JSON.stringify(canonicalize(submissionPayload));
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    idempotencyKey: createIdempotencyKey(),
    consentAcceptedAt: now()
  };
}

export function formatPublicSigningBackendError(error: {
  message: string;
  code?: string;
}): string {
  return error.code ? `${error.message} (${error.code})` : error.message;
}

interface PublicSigningErrorResponse {
  clone?: () => PublicSigningErrorResponse;
  json?: () => Promise<unknown>;
}

export async function readPublicSigningBackendError(
  response?: PublicSigningErrorResponse
): Promise<{ message: string; code?: string } | null> {
  try {
    const readableResponse = response?.clone?.() ?? response;
    const payload = await readableResponse?.json?.();
    if (!payload || typeof payload !== "object") return null;
    const safePayload = payload as { error?: unknown; message?: unknown; code?: unknown };
    const message =
      typeof safePayload.error === "string"
        ? safePayload.error
        : typeof safePayload.message === "string"
          ? safePayload.message
          : "";
    if (!message) return null;
    return {
      message,
      code: typeof safePayload.code === "string" ? safePayload.code : undefined
    };
  } catch {
    return null;
  }
}
