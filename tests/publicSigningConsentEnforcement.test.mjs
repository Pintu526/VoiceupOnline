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
const otpFunctionSource = readFileSync(
  new URL("../supabase/functions/voiceup-otp/index.ts", import.meta.url),
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
const publicSigningJourneySource = readFileSync(
  new URL("../src/publicSigningJourney.ts", import.meta.url),
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
const i18nProviderSource = readFileSync(
  new URL("../src/i18n/provider.tsx", import.meta.url),
  "utf8"
);
const storyCarouselSource = readFileSync(
  new URL("../src/components/VoiceUpStoryCarousel.tsx", import.meta.url),
  "utf8"
);
const referralUtilsSource = readFileSync(
  new URL("../src/utils/referrals.ts", import.meta.url),
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

test("K1. invalid public phones are rejected before browser invocation and every Edge side effect", () => {
  const requestOtpSource = backendSource.slice(
    backendSource.indexOf("export async function requestOtp("),
    backendSource.indexOf("export async function verifyOtp(")
  );
  const browserGuard = requestOtpSource.indexOf("if (!isValidPublicPhone(normalizedPhone))");
  const browserInvoke = requestOtpSource.indexOf('supabase.functions.invoke<');
  assert.ok(browserGuard >= 0);
  assert.ok(browserGuard < browserInvoke);
  assert.match(backendSource, /function isValidPublicPhone[\s\S]*\^\[0-9\]\{8,15\}\$/);

  const edgeGuard = otpFunctionSource.indexOf("if (!isValidPublicPhone(phone))");
  assert.ok(edgeGuard >= 0);
  for (const sideEffect of [
    "const admin = createAdminClient()",
    "const phoneHash = await sha256Hex",
    "const code = createOtpCode()",
    "await sendWithProvider"
  ]) {
    assert.ok(edgeGuard < otpFunctionSource.indexOf(sideEffect), `${sideEffect} must follow phone validation`);
  }
  assert.ok(edgeGuard < otpFunctionSource.indexOf(".insert({"), "OTP challenge insert must follow phone validation");
  assert.match(otpFunctionSource, /code:\s*"invalid_phone"/);
  assert.match(atomicMigrationSource, /\^\[0-9\]\{8,15\}\$/);
});

test("K2. Preview and Production cannot receive a development OTP", () => {
  const requestOtpSource = backendSource.slice(
    backendSource.indexOf("export async function requestOtp("),
    backendSource.indexOf("export async function verifyOtp(")
  );
  assert.doesNotMatch(otpFunctionSource, /\botp:\s*code\b/);
  assert.doesNotMatch(requestOtpSource, /developmentOtp:\s*data\.otp/);
  assert.match(backendSource, /if \(!import\.meta\.env\.DEV\)[\s\S]*Verification service is temporarily unavailable/);
  assert.match(appSource, /const developmentOtp = import\.meta\.env\.DEV \? result\.developmentOtp : undefined/);
});

test("L. signing recovery stays in the tab and never restores OTP proof", () => {
  assert.match(publicPageSource, /readPublicSigningDraft\(window\.sessionStorage/);
  assert.match(publicPageSource, /writePublicSigningDraft\(window\.sessionStorage/);
  assert.match(publicSigningJourneySource, /otpVerificationToken:\s*""/);
  assert.doesNotMatch(publicPageSource, /window\.localStorage/);
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

test("O. responsive public signing keeps the route and puts the mobile phone action first", () => {
  assert.match(publicPageSource, /className="public-layout public-campaign-modern"/);
  assert.match(publicPageSource, /className="public-mobile-campaign-summary"/);
  assert.match(publicPageSource, /className="public-sign-share-tools"/);
  assert.match(publicPageSource, /const sent = await onSendOtp\(\);[\s\S]*if \(sent === false\) return;[\s\S]*setWizardStep\("otp"\)/);
  assert.match(appSource, /async function sendOtp\(\)[\s\S]*return true;[\s\S]*catch \(error\)[\s\S]*return false;/);

  const summaryPosition = publicPageSource.indexOf('className="public-mobile-campaign-summary"');
  const languagePosition = publicPageSource.indexOf('className="public-language-selector"');
  const phonePosition = publicPageSource.indexOf('{wizardStep === "phone" && (', languagePosition);
  const shareToolsPosition = publicPageSource.indexOf('className="public-sign-share-tools"');
  assert.ok(summaryPosition < languagePosition);
  assert.ok(languagePosition < phonePosition);
  assert.ok(phonePosition < shareToolsPosition);

  assert.match(publicSigningCss, /height:\s*calc\(100vh - 56px\)/);
  assert.match(publicSigningCss, /\.public-story-column[\s\S]*overflow-y:\s*auto/);
  assert.match(publicSigningCss, /> \.panel[\s\S]*overflow-y:\s*auto/);
  assert.match(publicSigningCss, /@media \(max-width: 1100px\)/);
  assert.match(publicSigningCss, /\[data-wizard-step="phone"\][\s\S]*\.wizard-header/);
  assert.match(publicSigningCss, /> \.panel > header[\s\S]*display:\s*none/);
});

test("O1. post-sign UI is factual, compact, and accessible", () => {
  assert.doesNotMatch(publicPageSource, /ViralPostSignExperience/);
  assert.match(publicPageSource, /href=\{shareLinks\.whatsapp\}/);
  assert.match(publicPageSource, /onClick=\{shareNatively\}[\s\S]*t\("referrals\.dashboard\.nativeShare"\)/);
  assert.match(publicPageSource, /t\("public\.copyLink"\)/);
  assert.match(publicPageSource, /onClick=\{downloadActQr\}/);
  assert.match(publicPageSource, /setPostSignPanel\(\(current\)/);
  assert.match(publicPageSource, /className=\{publicMessageIsError \? "error-message" : "success-message"\}/);
  assert.match(publicPageSource, /className=\{otpMessageIsError \? "error-message" : "info-message"\}/);
  assert.match(publicPageSource, /role=\{publicMessageIsError \? "alert" : "status"\}/);
  assert.doesNotMatch(publicPageSource, /Business OS|बिज़नेस OS/);
});

test("O1a. native and clipboard shares are recorded only after successful browser completion", () => {
  const nativeShareStart = publicPageSource.indexOf("async function shareNatively()");
  const nativeShareEnd = publicPageSource.indexOf("\n  return (", nativeShareStart);
  const nativeShareSource = publicPageSource.slice(nativeShareStart, nativeShareEnd);
  const nativeAwait = nativeShareSource.indexOf("await navigator.share({");
  const nativeTrack = nativeShareSource.indexOf('trackShareClick("native")');
  const nativeCatch = nativeShareSource.indexOf("} catch {");
  assert.ok(nativeShareStart >= 0);
  assert.ok(nativeAwait >= 0);
  assert.ok(nativeTrack > nativeAwait);
  assert.ok(nativeCatch > nativeTrack);
  assert.doesNotMatch(nativeShareSource.slice(nativeCatch), /trackShareClick|copyReferralText/);

  const copyStart = publicPageSource.indexOf("async function copyReferralText(");
  const copyEnd = publicPageSource.indexOf("\n  function trackShareClick", copyStart);
  const copySource = publicPageSource.slice(copyStart, copyEnd);
  const clipboardWrite = copySource.indexOf("await navigator.clipboard.writeText(value)");
  const clipboardTrack = copySource.indexOf("onGrowthShare?.({ channel, url: value })");
  const clipboardCatch = copySource.indexOf("} catch {");
  assert.ok(clipboardWrite >= 0);
  assert.ok(clipboardTrack > clipboardWrite);
  assert.ok(clipboardCatch > clipboardTrack);
  assert.doesNotMatch(copySource.slice(clipboardCatch), /onGrowthShare/);
});

test("O1b. successful support has exactly one personal-referral sharing surface", () => {
  const doneStart = publicPageSource.indexOf('{wizardStep === "done" && hasSignedCampaign');
  const doneEnd = publicPageSource.indexOf("{displayPublicMessage && (", doneStart);
  const doneSource = publicPageSource.slice(doneStart, doneEnd);
  assert.equal(
    (publicPageSource.match(/className="public-post-sign-sharing"/g) ?? []).length,
    1
  );
  assert.match(doneSource, /href=\{shareLinks\.whatsapp\}/);
  assert.match(doneSource, /value=\{personalReferralUrl\}/);
  assert.match(doneSource, /copyReferralText\(t\("public\.referralLink"\), personalReferralUrl/);
  assert.match(doneSource, /onClick=\{downloadActQr\}/);
  assert.match(doneSource, /nativeShareSupported &&/);
  assert.match(doneSource, /public-post-sign-sharing[\s\S]*public-coordinator-action/);
  assert.match(referralUtilsSource, /`\$\{publicUrl\}\?ref=\$\{encodeURIComponent\(normalizedReferral\)\}`/);
  assert.match(publicPageSource, /const whatsappText = shareMessages\.whatsapp\.includes\(personalReferralUrl\)[\s\S]*personalReferralUrl/);
  assert.match(publicPageSource, /!hasSignedCampaign && \([\s\S]*className="public-section public-share-panel"/);
});

test("O1c. public facts do not synthesize related campaigns, updates, testimonials, or growth claims", () => {
  const doneStart = publicPageSource.indexOf('{wizardStep === "done" && hasSignedCampaign');
  const doneEnd = publicPageSource.indexOf("{displayPublicMessage && (", doneStart);
  const beforeDoneSource = publicPageSource.slice(0, doneStart);
  const doneSource = publicPageSource.slice(doneStart, doneEnd);
  assert.doesNotMatch(publicPageSource, /related-campaigns-grid|const updateCards|const testimonialCards/);
  assert.doesNotMatch(publicPageSource, /t\("public\.(?:updatesTitle|supporterTrust|relatedCampaigns)"/);
  assert.doesNotMatch(beforeDoneSource, /<DonationCard/);
  assert.match(doneSource, /campaign\.donationEnabled && <DonationCard/);
  assert.doesNotMatch(doneSource, /wallet|rank|influence|projected|reward|earnings|recognition/i);
  assert.doesNotMatch(publicPageSource, /walletCredits:|recognitionLevel:/);
});

test("O1d. consent rows and language controls preserve 44px mobile tap targets", () => {
  assert.match(publicPageSource, /<fieldset className="public-consent-group">/);
  assert.equal((publicPageSource.match(/<input required type="checkbox"/g) ?? []).length, 2);
  assert.match(publicPageSource, /name="campaignCommunicationConsent"/);
  assert.match(publicPageSource, /t\("public\.communicationConsentHelp"\)/);
  assert.match(publicSigningCss, /\.public-consent-group \.check-row[\s\S]*min-height:\s*44px/);
  assert.match(publicSigningCss, /\.public-consent-group \.check-row > span[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(publicSigningCss, /\.public-language-selector select[\s\S]*min-height:\s*44px/);
});

test("O1e. lazy image loading is opt-in only for the below-fold public carousel", () => {
  assert.match(storyCarouselSource, /lazyLoadImages\?: boolean/);
  assert.match(storyCarouselSource, /lazyLoadImages = false/);
  assert.match(storyCarouselSource, /loading=\{lazyLoadImages \? "lazy" : undefined\}/);
  assert.match(publicPageSource, /<VoiceUpStoryCarousel[\s\S]*lazyLoadImages[\s\S]*\/>/);
  assert.equal((publicPageSource.match(/\blazyLoadImages\b/g) ?? []).length, 1);
  assert.match(publicPageSource, /slideIds=\{\["objective", "evidence", "progress", "afterSigning", "share"\]\}/);
  assert.doesNotMatch(publicPageSource, /slideIds=\{[^}]*volunteerUpdates/);
});

test("O2. language selection synchronizes the document language", () => {
  assert.match(i18nProviderSource, /document\.documentElement\.lang = language/);
  assert.match(i18nProviderSource, /\[language\]/);
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
