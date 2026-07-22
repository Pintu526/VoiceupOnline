import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CONSENT_REQUIRED_CODE,
  createConsentVersion,
  findExistingDuplicateSigner,
  validatePublicSigningConsent
} from "../supabase/functions/voiceup-public-signing/logic.ts";
import { getPaperSupporterConfirmationStatus } from "../src/confirmationQueue.ts";

const signingFunctionSource = readFileSync(
  new URL("../supabase/functions/voiceup-public-signing/index.ts", import.meta.url),
  "utf8"
);

const campaignConsentText = "I consent to this organization storing my details and using them only for this campaign.";

function validConsent(overrides = {}) {
  return {
    consentAccepted: true,
    consentText: campaignConsentText,
    consentVersion: createConsentVersion(campaignConsentText),
    consentAcceptedAt: "2026-07-22T06:00:00.000Z",
    consentSource: "public_web",
    ...overrides
  };
}

test("A. request without consent is rejected", () => {
  const result = validatePublicSigningConsent(undefined, campaignConsentText);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, CONSENT_REQUIRED_CODE);
});

test("B. consentAccepted false is rejected", () => {
  const result = validatePublicSigningConsent(validConsent({ consentAccepted: false }), campaignConsentText);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, CONSENT_REQUIRED_CODE);
});

test("C. missing consentText is rejected", () => {
  const result = validatePublicSigningConsent(validConsent({ consentText: "" }), campaignConsentText);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, CONSENT_REQUIRED_CODE);
});

test("D. missing consentVersion is rejected", () => {
  const result = validatePublicSigningConsent(validConsent({ consentVersion: "" }), campaignConsentText);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, CONSENT_REQUIRED_CODE);
});

test("E. invalid timestamp is rejected", () => {
  const result = validatePublicSigningConsent(
    validConsent({ consentAcceptedAt: "22-07-2026" }),
    campaignConsentText
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, CONSENT_REQUIRED_CODE);
});

test("F. unsupported consentSource is rejected", () => {
  const result = validatePublicSigningConsent(
    validConsent({ consentSource: "mobile_app" }),
    campaignConsentText
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, CONSENT_REQUIRED_CODE);
});

test("G. valid consent succeeds", () => {
  const result = validatePublicSigningConsent(validConsent(), campaignConsentText);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evidence.accepted, true);
  assert.equal(result.evidence.textSnapshot, campaignConsentText);
  assert.equal(result.evidence.version, createConsentVersion(campaignConsentText));
  assert.equal(result.evidence.acceptedAt, "2026-07-22T06:00:00.000Z");
  assert.equal(result.evidence.source, "public_web");
});

test("H. stored signer contains structured consent evidence", () => {
  assert.match(signingFunctionSource, /consentAccepted:\s*true/);
  assert.match(signingFunctionSource, /consentTextSnapshot:/);
  assert.match(signingFunctionSource, /consentVersion:/);
  assert.match(signingFunctionSource, /consentAcceptedAt:/);
  assert.match(signingFunctionSource, /consentSource:/);
  assert.match(signingFunctionSource, /consentEvidence/);
  assert.match(signingFunctionSource, /consentWorkspaceId:/);
});

test("I. duplicate signing does not create a duplicate signer", () => {
  const existingSigner = {
    id: "sig-1",
    campaignId: "cmp-1",
    name: "Asha",
    email: "asha@example.org",
    phone: "+91 98765 43210"
  };
  const duplicateByEmail = findExistingDuplicateSigner(
    [existingSigner],
    "cmp-1",
    { email: "asha@example.org", phone: "" }
  );
  const duplicateByPhone = findExistingDuplicateSigner(
    [existingSigner],
    "cmp-1",
    { email: "", phone: "9876543210" }
  );

  assert.equal(duplicateByEmail?.id, "sig-1");
  assert.equal(duplicateByPhone?.id, "sig-1");
  assert.match(signingFunctionSource, /if \(duplicateSigner\) \{/);
  assert.match(signingFunctionSource, /signer:\s*duplicateSigner/);
});

test("J. existing paper-signature consent behavior remains unchanged", () => {
  const scan = {
    parsedSigner: { phone: "+91 98765 43210" },
    paperConsentRecorded: true,
    smsConsent: true,
    whatsappConsent: false,
    noOngoingCommunications: false
  };
  assert.equal(getPaperSupporterConfirmationStatus(scan, false), "pending_confirmation");
  assert.equal(getPaperSupporterConfirmationStatus(scan, true), "suppressed");
});
