import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  GAU_SAMMAN_PREMIUM_SLUG,
  INDIAN_MOBILE_INPUT_MAX_LENGTH,
  canDisplayDevelopmentOtp,
  getPublicCampaignPresentation,
  getPublicCampaignPresentationCopy,
  getSafeOtpDisplayMessage,
  getVisiblePublicMetrics,
  normalizeIndianMobileInput
} from "../src/config/publicCampaignPresentation.ts";
import { resolvePublicCampaignSlug } from "../src/utils/routing.ts";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pageSource = readSource("../src/pages/PublicCampaignPage.tsx");
const appSource = readSource("../src/App.tsx");
const cssSource = readSource("../src/publicSigningExperience.css");

test("canonical Gau Samman slug selects the premium national presentation", () => {
  const presentation = getPublicCampaignPresentation(GAU_SAMMAN_PREMIUM_SLUG);
  assert.equal(presentation?.kind, "premium-national");
  assert.equal(presentation?.defaultLanguage, "hi");
  assert.equal(presentation?.logoAsset, "/brands/gau-samman/campaign-logo.png");
  assert.equal(presentation?.heroAsset, "/brands/gau-samman/gau-samman-hero-final.png");
  assert.equal(existsSync("public/brands/gau-samman/campaign-logo.png"), true);
  assert.equal(existsSync("public/brands/gau-samman/gau-samman-hero-final.png"), true);
});

test("unrelated and alias slugs retain the generic public presentation", () => {
  for (const slug of ["random-slug", "GSAA", "gau-samman-ahwan-abhiyan", ""]) {
    assert.equal(getPublicCampaignPresentation(slug), null);
  }
});

test("premium presentation copy is complete in Hindi, English and Odia", () => {
  const presentation = getPublicCampaignPresentation(GAU_SAMMAN_PREMIUM_SLUG);
  assert.ok(presentation);
  const englishKeys = Object.keys(getPublicCampaignPresentationCopy(presentation, "en")).sort();
  for (const language of ["hi", "en", "or"]) {
    const copy = getPublicCampaignPresentationCopy(presentation, language);
    assert.deepEqual(Object.keys(copy).sort(), englishKeys);
    assert.ok(copy.primaryAction);
    assert.ok(copy.secondaryAction);
    assert.equal(copy.pillars.length, 3);
  }
  assert.equal(getPublicCampaignPresentationCopy(presentation, "hi").identityLine, "सेवा | सुरक्षा | सम्मान");
});

test("missing metrics are hidden and supplied real metrics pass through unchanged", () => {
  const visible = getVisiblePublicMetrics([
    { key: "verified", label: "Verified", value: 1247 },
    { key: "offline", label: "Offline", value: undefined },
    { key: "districts", label: "Districts", value: Number.NaN }
  ]);
  assert.deepEqual(visible, [{ key: "verified", label: "Verified", value: 1247 }]);
});

test("Indian mobile normalization accepts common +91, spacing and dash formats", () => {
  for (const input of [
    "9876543210",
    "+919876543210",
    "91 9876543210",
    "+91 98765 43210",
    "98765-43210",
    "(98765) 43210"
  ]) {
    const mobile = normalizeIndianMobileInput(input);
    assert.equal(mobile.canonical, "9876543210");
    assert.equal(mobile.valid, true);
    assert.equal(mobile.display, "98765 43210");
  }
});

test("Indian mobile input limit preserves complete formatted values before normalization", () => {
  const supportedInputs = [
    "9876543210",
    "+919876543210",
    "91 9876543210",
    "+91 98765 43210",
    "98765-43210",
    "(98765) 43210"
  ];
  assert.ok(INDIAN_MOBILE_INPUT_MAX_LENGTH < 32);
  for (const input of supportedInputs) {
    assert.ok(input.length <= INDIAN_MOBILE_INPUT_MAX_LENGTH, `${input} must fit before normalization`);
    assert.equal(normalizeIndianMobileInput(input).canonical, "9876543210");
  }
  assert.match(
    pageSource,
    /maxLength=\{premiumPresentation \? INDIAN_MOBILE_INPUT_MAX_LENGTH : undefined\}/
  );
});

test("Indian mobile client validation rejects invalid prefixes and incomplete values", () => {
  assert.deepEqual(
    {
      complete: normalizeIndianMobileInput("1234567890").complete,
      valid: normalizeIndianMobileInput("1234567890").valid
    },
    { complete: true, valid: false }
  );
  assert.equal(normalizeIndianMobileInput("98765").complete, false);
  assert.equal(normalizeIndianMobileInput("98765").valid, false);
});

test("incomplete premium mobile cannot trigger the OTP network workflow", () => {
  assert.match(pageSource, /if \(sendingOtp \|\| !phoneReady\) return;/);
  assert.match(pageSource, /disabled=\{sendingOtp \|\| !phoneReady\}/);
  assert.match(pageSource, /premiumPresentation\s*\?\s*indianMobile\.valid/);
});

test("pre-OTP UI performs no supporter lookup or account enumeration", () => {
  const sendStart = pageSource.indexOf("async function handleSendOtpWizard()");
  const sendEnd = pageSource.indexOf("async function handleVerifyOtpWizard()", sendStart);
  const sendSource = pageSource.slice(sendStart, sendEnd);
  assert.match(sendSource, /await onSendOtp\(\)/);
  assert.doesNotMatch(sendSource, /resume_verified_supporter|campaignSigners|existing|duplicate|lookup/i);
});

test("returning supporter recognition occurs only after successful OTP verification", () => {
  const verifyStart = appSource.indexOf("async function verifyOtp()");
  const verifyEnd = appSource.indexOf("\n  async function", verifyStart + 1);
  const verifySource = appSource.slice(verifyStart, verifyEnd);
  assert.match(verifySource, /await verifyPublicOtp/);
  assert.match(verifySource, /action:\s*"resume_verified_supporter"/);
  assert.ok(
    verifySource.indexOf("await verifyPublicOtp") <
      verifySource.indexOf('action: "resume_verified_supporter"')
  );
});

test("already-signed continuation does not submit a second signature", () => {
  assert.match(pageSource, /const hasSignedCampaign = lastSignedSigner\?\.campaignId === campaign\.id/);
  assert.match(pageSource, /if \(hasSignedCampaign && wizardStep !== "done"\)/);
  assert.match(pageSource, /wizardStep === "done" && hasSignedCampaign/);
  assert.match(pageSource, /public-post-sign-sharing/);
});

test("email remains optional unless the campaign explicitly requires it", () => {
  assert.match(pageSource, /\{isRequired\("email"\) && \(/);
  assert.match(pageSource, /\{!isRequired\("email"\) && \(/);
});

test("production hosts can never display an OTP value", () => {
  for (const hostname of [
    "gaumata.cloud",
    "www.gaumata.cloud",
    "voiceup.live",
    "www.voiceup.live"
  ]) {
    assert.equal(
      canDisplayDevelopmentOtp({
        hostname,
        isDevelopment: true,
        explicitTestDisplayEnabled: true
      }),
      false
    );
    assert.equal(
      getSafeOtpDisplayMessage("OTP: 123456", {
        hostname,
        isDevelopment: true,
        explicitTestDisplayEnabled: true,
        neutralMessage: "Verification code sent."
      }),
      "Verification code sent."
    );
  }
});

test("development OTP display requires development mode and an explicit flag", () => {
  assert.equal(
    canDisplayDevelopmentOtp({
      hostname: "localhost",
      isDevelopment: true,
      explicitTestDisplayEnabled: true
    }),
    true
  );
  for (const input of [
    { hostname: "localhost", isDevelopment: false, explicitTestDisplayEnabled: true },
    { hostname: "localhost", isDevelopment: true, explicitTestDisplayEnabled: false }
  ]) {
    assert.equal(canDisplayDevelopmentOtp(input), false);
  }
});

test("gaumata host resolution continues to use the existing routing utility", () => {
  const routingSource = readSource("../src/utils/routing.ts");
  assert.match(routingSource, /isGaumataPublicHostname/);
  assert.match(routingSource, /GAUMATA_ROOT_CAMPAIGN_SLUG/);
  assert.doesNotMatch(pageSource, /window\.location\.pathname\s*=/);
  assert.equal(
    resolvePublicCampaignSlug({ hostname: "gaumata.cloud", pathname: "/" }),
    GAU_SAMMAN_PREMIUM_SLUG
  );
});

test("premium public location integration retains hierarchy, custom locations and manual entry", () => {
  assert.match(pageSource, /<IndiaLocationFields/);
  assert.match(pageSource, /verifiedSuggestionsOnly/);
  assert.match(pageSource, /customLocations=\{customLocations\}/);
  assert.match(pageSource, /experienceCopy\.enterManually/);
  assert.doesNotMatch(pageSource, /ResourceLocationManager/);
});

test("premium presentation reuses existing WhatsApp, referral and QR engines", () => {
  assert.match(pageSource, /shareLinks\.whatsapp/);
  assert.match(pageSource, /getCampaignReferralUrl/);
  assert.match(pageSource, /ReferralQrPreview/);
  assert.match(pageSource, /downloadQrPosterSvg/);
  assert.match(pageSource, /onGrowthShare/);
});

test("generic campaign fallback has no premium selector or premium CSS leakage", () => {
  assert.match(pageSource, /data-premium-presentation=\{premiumPresentation\?\.kind\}/);
  assert.match(cssSource, /\[data-premium-presentation="premium-national"\]/);
  assert.equal(getPublicCampaignPresentation("random-slug"), null);
});

test("premium first screen contains required name and India mobile controls", () => {
  const phoneStart = pageSource.indexOf('{wizardStep === "phone" && (');
  const otpStart = pageSource.indexOf('{wizardStep === "otp" && (', phoneStart);
  const phoneSource = pageSource.slice(phoneStart, otpStart);
  assert.match(phoneSource, /premiumPresentation && \(/);
  assert.match(phoneSource, /publicForm\.name/);
  assert.match(phoneSource, /public-india-phone-input/);
  assert.match(phoneSource, /\+91/);
  assert.match(phoneSource, /inputMode="tel"/);
});

test("approved campaign artwork drives the responsive hero without replacing generic media", () => {
  assert.match(pageSource, /campaignHeroImage === premiumPresentation\.placeholderHeroAsset/);
  assert.match(pageSource, /premiumPresentation\?\.heroAsset\.trim\(\) \|\| campaignSupportingArtwork/);
  assert.match(pageSource, /src=\{premiumPresentation\?\.logoAsset\}/);
  assert.match(pageSource, /className=\{`public-national-hero-art/);
  assert.match(pageSource, /public-national-hero-fallback/);
  assert.match(cssSource, /\.public-national-hero-art/);
});
