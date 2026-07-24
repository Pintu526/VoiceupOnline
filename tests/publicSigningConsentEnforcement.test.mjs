import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCanonicalSubmitSupportConsents,
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
const atomicMigrationSource = readFileSync(
  new URL("../supabase/migrations/20260724010000_atomic_public_participation.sql", import.meta.url),
  "utf8"
);
const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const publicPageSource = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const publicPhotoSource = readFileSync(
  new URL("../src/components/PublicSupporterPhoto.tsx", import.meta.url),
  "utf8"
);
const publicSigningCss = readFileSync(
  new URL("../src/publicSigningExperience.css", import.meta.url),
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

test("G2. supplied campaign-support consent cannot bypass canonical validation", () => {
  const result = buildCanonicalSubmitSupportConsents(
    undefined,
    campaignConsentText,
    {
      campaignSupport: {
        granted: true,
        version: "caller-controlled-version",
        policyId: "caller-controlled-policy"
      }
    }
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, CONSENT_REQUIRED_CODE);
});

test("G3. campaign-support evidence is replaced with the canonical campaign version", () => {
  const communicationPreference = {
    granted: false,
    version: "communication-preference-v1"
  };
  const result = buildCanonicalSubmitSupportConsents(
    validConsent(),
    campaignConsentText,
    {
      campaignSupport: {
        granted: false,
        version: "caller-controlled-version",
        policyId: "caller-controlled-policy"
      },
      campaignCommunication: communicationPreference
    }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const canonicalVersion = createConsentVersion(campaignConsentText);
  assert.deepEqual(result.consents.campaignSupport, {
    granted: true,
    version: canonicalVersion,
    policyId: canonicalVersion
  });
  assert.deepEqual(result.consents.campaignCommunication, communicationPreference);
});

test("G4. Edge submission never returns supplied consent wholesale", () => {
  assert.match(signingFunctionSource, /buildCanonicalSubmitSupportConsents\(/);
  assert.doesNotMatch(signingFunctionSource, /if \(supplied !== undefined\) return supplied/);
});

test("H. stored signer contains structured consent evidence", () => {
  assert.match(atomicMigrationSource, /'consentAccepted', true/);
  assert.match(atomicMigrationSource, /jsonb_set\(v_signer, '\{consents\}', v_current_consents/);
  assert.match(atomicMigrationSource, /'consentVersion'/);
  assert.match(atomicMigrationSource, /'consentAcceptedAt'/);
  assert.match(atomicMigrationSource, /'consentSource'/);
  assert.match(atomicMigrationSource, /consentHistory/);
  assert.match(atomicMigrationSource, /'consentWorkspaceId', p_workspace_id/);
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
  assert.match(atomicMigrationSource, /voiceup_normalize_public_phone\(signer_item ->> 'phone'\)/);
  assert.match(atomicMigrationSource, /v_support_already_complete/);
  assert.match(atomicMigrationSource, /for update/);
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

test("K. production public signing reuses server OTP and requires its proof", () => {
  assert.match(backendSource, /"voiceup-otp"/);
  assert.match(backendSource, /purpose:\s*"public-signing"/);
  assert.match(appSource, /otpVerificationToken:\s*result\.verificationToken/);
  assert.match(signingFunctionSource, /admin\.rpc\("mutate_voiceup_public_participation"/);
  assert.match(atomicMigrationSource, /challenge\.purpose = 'public-signing'/);
  assert.match(atomicMigrationSource, /verificationTokenHash/);
  assert.match(signingFunctionSource, /otp_verification_required/);
});

test("L. signing recovery stays in the tab and never restores OTP proof", () => {
  assert.match(publicPageSource, /window\.sessionStorage\.getItem\(draftStorageKey\)/);
  assert.match(publicPageSource, /window\.sessionStorage\.setItem/);
  assert.match(publicPageSource, /otpVerificationToken:\s*""/);
  assert.doesNotMatch(publicPageSource, /window\.localStorage\.(getItem|setItem)\(draftStorageKey/);
});

test("M. optional location captures accuracy only and never reads coordinates", () => {
  assert.match(publicPageSource, /BrowserGPSAdapter/);
  assert.match(publicPageSource, /gpsAdapter\.requestPosition/);
  assert.match(publicPageSource, /reading\.accuracyMeters/);
  assert.doesNotMatch(publicPageSource, /reading\.(latitude|longitude)/);
  assert.doesNotMatch(publicPageSource, /console\.(log|info|debug|warn)\(/);
});

test("N. post-sign photo processing uses private signed upload without base64", () => {
  assert.match(publicPhotoSource, /URL\.createObjectURL/);
  assert.match(publicPhotoSource, /canvas\.toBlob/);
  assert.doesNotMatch(publicPhotoSource, /readAsDataURL|base64/i);
  assert.match(backendSource, /\.from\("campaign-private"\)/);
  assert.match(backendSource, /\.uploadToSignedUrl/);
  assert.match(signingFunctionSource, /rawAction === "prepare_supporter_photo"/);
  assert.match(signingFunctionSource, /rawAction === "attach_supporter_photo"/);
  assert.match(signingFunctionSource, /invokeMutation\(admin, resolved, body, "update_profile"\)/);
});

test("O. responsive public signing keeps the existing route and provides independent desktop scroll", () => {
  assert.match(publicPageSource, /className="public-layout public-campaign-modern"/);
  assert.match(publicPageSource, /className="public-mobile-campaign-summary"/);
  assert.match(publicPageSource, /className="public-sign-share-tools"/);
  assert.match(publicSigningCss, /height:\s*calc\(100vh - 56px\)/);
  assert.match(publicSigningCss, /\.public-story-column[\s\S]*overflow-y:\s*auto/);
  assert.match(publicSigningCss, /> \.panel[\s\S]*overflow-y:\s*auto/);
  assert.match(publicSigningCss, /@media \(max-width: 1100px\)/);
});

test("P. optional coordinator action is a secure handoff to the existing managed lifecycle", () => {
  assert.match(publicPageSource, /campaign manager must create the invited coordinator inside Coordinator Network/);
  assert.match(publicPageSource, /href=\{`mailto:/);
  assert.doesNotMatch(publicPageSource, /saveCoordinator|upsert_voiceup_coordinator|createCoordinator/);
});

test("Q. Sprint 2E experience copy is type-enforced for English, Hindi, and Odia", () => {
  assert.match(publicPageSource, /const publicExperienceCopy:\s*Record<Language,\s*PublicExperienceCopy>/);
  assert.match(publicPageSource, /\ben:\s*publicExperienceCopyEn/);
  assert.match(publicPageSource, /\bhi:\s*\{/);
  assert.match(publicPageSource, /\bor:\s*\{/);
});
