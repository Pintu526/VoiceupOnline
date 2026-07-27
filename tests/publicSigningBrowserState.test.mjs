import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PUBLIC_SIGNING_JOURNEY_VERSION,
  clearPublicSigningJourney,
  clearPublicSigningOtpState,
  createPublicSigningSubmissionAttempt,
  formatPublicSigningBackendError,
  getPublicSigningJourneyStorageKey,
  readPublicSigningBackendError,
  readPublicSigningDraft,
  transitionPublicSigningCampaign,
  writePublicSigningDraft
} from "../src/publicSigningJourney.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const campaignA = { campaignId: "campaign-a", slug: "Save-The-River" };
const campaignB = { campaignId: "campaign-b", slug: "clean-air" };
const baseForm = {
  name: "Asha",
  email: "asha@example.org",
  phone: "+919876543210",
  whatsappNumber: "",
  telegramHandle: "",
  otpVerified: true,
  otpChallengeId: "stale-challenge",
  otpVerificationToken: "stale-token",
  selectedAuthorityId: "authority-1",
  selectedAuthorityName: "District Collector",
  country: "India",
  state: "Odisha",
  district: "Khordha",
  block: "",
  panchayat: "",
  address: "",
  postalCode: "",
  comment: "",
  referralCode: "",
  referredBy: "",
  referredByPhoneOrCode: "",
  referralSource: undefined
};

function submission(overrides = {}) {
  return {
    campaignId: "campaign-a",
    slug: "save-the-river",
    action: "submit_support",
    signer: {
      phone: "+919876543210",
      name: "Asha",
      otpVerificationToken: "verified-token"
    },
    consent: {
      consentAccepted: true,
      consentText: "I agree",
      consentVersion: "consent-v1",
      consentSource: "public_web"
    },
    communicationConsent: false,
    ...overrides
  };
}

test("stale OTP proof is never written to or restored from the scoped draft", () => {
  const storage = new MemoryStorage();
  writePublicSigningDraft(storage, campaignA, baseForm);

  const storageKey = getPublicSigningJourneyStorageKey(campaignA);
  assert.match(storageKey, new RegExp(PUBLIC_SIGNING_JOURNEY_VERSION));
  assert.match(storageKey, /campaign-a/);
  assert.match(storageKey, /save-the-river/);
  assert.doesNotMatch(storage.getItem(storageKey), /stale-(challenge|token)/);

  const restored = readPublicSigningDraft(storage, campaignA);
  assert.equal(restored?.form.otpVerified, false);
  assert.equal(restored?.form.otpChallengeId, "");
  assert.equal(restored?.form.otpVerificationToken, "");
});

test("campaign switch clears both old and destination journey state", () => {
  const storage = new MemoryStorage();
  writePublicSigningDraft(storage, campaignA, baseForm);
  writePublicSigningDraft(storage, campaignB, { ...baseForm, phone: "+919999999999" });

  assert.equal(transitionPublicSigningCampaign(storage, campaignA, campaignB), true);
  assert.equal(storage.getItem(getPublicSigningJourneyStorageKey(campaignA)), null);
  assert.equal(storage.getItem(getPublicSigningJourneyStorageKey(campaignB)), null);
});

test("a fresh signing journey creates a new idempotency key", () => {
  let sequence = 0;
  const createKey = () => `support:${++sequence}`;
  const first = createPublicSigningSubmissionAttempt(null, submission(), createKey);
  const fresh = createPublicSigningSubmissionAttempt(null, submission(), createKey);

  assert.notEqual(fresh.idempotencyKey, first.idempotencyKey);
});

test("an identical safe retry preserves its idempotency key and consent timestamp", () => {
  let sequence = 0;
  const createKey = () => `support:${++sequence}`;
  const first = createPublicSigningSubmissionAttempt(
    null,
    submission(),
    createKey,
    () => "2026-07-27T00:00:00.000Z"
  );
  const retry = createPublicSigningSubmissionAttempt(
    first,
    {
      ...submission(),
      signer: {
        name: "Asha",
        otpVerificationToken: "verified-token",
        phone: "+919876543210"
      }
    },
    createKey,
    () => "2026-07-27T00:01:00.000Z"
  );

  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.equal(retry.consentAcceptedAt, first.consentAcceptedAt);
});

test("phone, campaign, action, profile, and consent changes each create a new key", () => {
  let sequence = 0;
  const createKey = () => `support:${++sequence}`;
  const originalPayload = submission();
  const first = createPublicSigningSubmissionAttempt(null, originalPayload, createKey);
  const changedPayloads = [
    submission({ signer: { ...originalPayload.signer, phone: "+919999999999" } }),
    submission({ campaignId: "campaign-b", slug: "clean-air" }),
    submission({ action: "save_draft" }),
    submission({ signer: { ...originalPayload.signer, name: "Asha Devi" } }),
    submission({
      consent: {
        ...originalPayload.consent,
        consentVersion: "consent-v2"
      }
    })
  ];

  for (const changedPayload of changedPayloads) {
    const changed = createPublicSigningSubmissionAttempt(first, changedPayload, createKey);
    assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
  }
});

test("successful submission cleanup removes scoped state and sensitive OTP proof", () => {
  const storage = new MemoryStorage();
  writePublicSigningDraft(storage, campaignA, baseForm);

  clearPublicSigningJourney(storage, campaignA);
  const clearedForm = clearPublicSigningOtpState(baseForm);

  assert.equal(storage.getItem(getPublicSigningJourneyStorageKey(campaignA)), null);
  assert.equal(clearedForm.otpVerified, false);
  assert.equal(clearedForm.otpChallengeId, "");
  assert.equal(clearedForm.otpVerificationToken, "");
});

test("safe backend validation response is unwrapped and displayed with its code", async () => {
  const safeError = await readPublicSigningBackendError({
    async json() {
      return {
        error: "Verify your phone again before submitting.",
        code: "otp_verification_required",
        details: "must-not-be-rendered"
      };
    }
  });

  assert.deepEqual(safeError, {
    message: "Verify your phone again before submitting.",
    code: "otp_verification_required"
  });
  assert.equal(
    formatPublicSigningBackendError(safeError),
    "Verify your phone again before submitting. (otp_verification_required)"
  );
});

test("App integrates required reset codes and backend unwrap without exposing response details", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");

  assert.match(appSource, /error\.code === "otp_verification_required"/);
  assert.match(appSource, /error\.code === "invalid_idempotency_key"/);
  assert.match(appSource, /formatPublicSigningBackendError\(error\)/);
  assert.match(backendSource, /readPublicSigningBackendError\(contextualResponse\)/);
  assert.doesNotMatch(appSource, /error\.(details|hint)/);
});

test("unknown backend, Postgres, Supabase, and Storage errors use supporter-safe fallbacks", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
  const otpSource = readFileSync(
    new URL("../supabase/functions/voiceup-otp/index.ts", import.meta.url),
    "utf8"
  );
  const photoSource = readFileSync(
    new URL("../src/components/PublicSupporterPhoto.tsx", import.meta.url),
    "utf8"
  );

  const requestOtpSource = backendSource.slice(
    backendSource.indexOf("export async function requestOtp("),
    backendSource.indexOf("export async function createTrialWorkspace(")
  );
  const photoUploadSource = backendSource.slice(
    backendSource.indexOf("export async function uploadPublicSupporterPhoto("),
    backendSource.indexOf("export class PublicSignatureSubmissionError")
  );
  const publicHandlersSource = appSource.slice(
    appSource.indexOf("async function submitPublicSignature("),
    appSource.indexOf("async function uploadScan(")
  );

  assert.match(backendSource, /function trustedPublicError/);
  assert.match(backendSource, /\^\[a-z\]\[a-z0-9_\]\{1,63\}\$/);
  assert.doesNotMatch(requestOtpSource, /error\?\.message/);
  assert.doesNotMatch(photoUploadSource, /(prepareError|uploadError|attachError)\??\.message/);
  assert.doesNotMatch(backendSource, /invokeError\.message/);
  assert.doesNotMatch(publicHandlersSource, /error instanceof Error\s*\?\s*error\.message/);
  assert.match(appSource, /isPublicCampaignRoute\s*\?\s*"Campaign could not be loaded\. Please retry\."/);
  assert.doesNotMatch(otpSource, /error instanceof Error\s*\?\s*error\.message/);
  assert.match(otpSource, /console\.error\("voiceup-otp unexpected failure", error\)/);
  assert.match(otpSource, /code:\s*"server_error"/);
  assert.doesNotMatch(photoSource, /setMessage\(error instanceof Error \? error\.message/);
  assert.match(photoSource, /catch \{[\s\S]*setMessage\(copy\.uploadFailed\)/);
});
