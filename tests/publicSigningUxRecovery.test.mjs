import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clearPublicSigningOtpState, transitionPublicSigningStep } from "../src/publicSigningJourney.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/App.tsx");
const page = read("../src/pages/PublicCampaignPage.tsx");
const publicLocationCatalog = read("../src/components/usePublicCampaignLocationCatalog.ts");
const en = JSON.parse(read("../src/i18n/locales/en.json"));
const hi = JSON.parse(read("../src/i18n/locales/hi.json"));
const or = JSON.parse(read("../src/i18n/locales/or.json"));

test("challenge expiry preserves profile data and verification state never moves the active step", () => {
  const form = {
    name: "Synthetic signer",
    email: "signer@example.invalid",
    phone: "+919876543210",
    state: "Odisha",
    district: "Khordha",
    otpVerified: true,
    otpChallengeId: "challenge",
    otpVerificationToken: "secret-proof"
  };
  const cleared = clearPublicSigningOtpState(form);

  assert.equal(cleared.name, form.name);
  assert.equal(cleared.email, form.email);
  assert.equal(cleared.state, form.state);
  assert.equal(cleared.district, form.district);
  assert.equal(cleared.otpVerified, false);
  assert.equal(cleared.otpChallengeId, "");
  assert.equal(cleared.otpVerificationToken, "");
  assert.deepEqual(transitionPublicSigningStep("review", false, "profile"), {
    step: "review",
    resumeStep: "profile"
  });
  assert.deepEqual(transitionPublicSigningStep("phone", true, "review"), {
    step: "phone",
    resumeStep: "review"
  });

  const expiryIndex = app.indexOf("if (!publicOtpExpiresAt) return;");
  const expiryEffect = app.slice(
    app.lastIndexOf("useEffect(() => {", expiryIndex),
    app.indexOf("[publicOtpExpiresAt]", expiryIndex)
  );
  assert.match(expiryEffect, /clearPublicSigningOtpState\(current\)/);
  assert.doesNotMatch(expiryEffect, /setPublicForm\(blankSigner\)/);
  const verifyStart = app.indexOf("async function verifyOtp()");
  const verifyEnd = app.indexOf("\n  async function saveVerifiedPublicDraft", verifyStart);
  assert.match(app.slice(verifyStart, verifyEnd), /setPublicOtpExpiresAt\(0\)/);
  assert.doesNotMatch(page, /transitionPublicSigningStep/);
});

test("public signing uses manual administrative location fields without GPS controls or messages", () => {
  assert.doesNotMatch(page, /BrowserGPSAdapter|GPSAdapter|gpsAdapter|requestSmartLocation|GPS|Use My Location|Enter Manually|locationUnavailable|locationAccuracy|locationRequestInProgress/);
  assert.match(page, /<IndiaLocationFields/);
  assert.match(page, /fixedCountry="India"/);
  assert.match(page, /<GlobalLocationFields/);
  assert.match(page, /createObservedLocationReference\(\s*values,\s*"public_signer_pin"/);
  assert.match(page, /onPinObservation=/);
  assert.doesNotMatch(page, /campaign\.(state|district|block|panchayat|postalCode)/);
  for (const locale of [en, hi, or]) {
    assert.doesNotMatch(locale.goudhanCampaign.locationHelp, /GPS/i);
  }
});

test("location catalog refresh preserves the active input and debounces hierarchy reads", () => {
  assert.match(publicLocationCatalog, /current\.locations\.length > 0\s*\? current/);
  assert.match(publicLocationCatalog, /window\.setTimeout\(\(\) => void loadCatalog\(\), 250\)/);
  assert.match(publicLocationCatalog, /window\.clearTimeout\(timer\)/);
});

test("review copy does not claim storage or delivery before successful submission", () => {
  assert.match(page, /Stored securely only after successful submission/);
  assert.match(page, /Prepared for the selected authority; delivery is not yet claimed/);
  assert.doesNotMatch(page, /Signature stored securely|Petition routed to selected authority/);
  for (const locale of [en, hi, or]) {
    assert.ok(locale.public.verificationRecoveryTitle.trim());
    assert.ok(locale.public.verificationRecoveryHelp.trim());
    assert.ok(locale.public.verifyAgain.trim());
  }
});

test("server duplicate decision gets friendly localized feedback without exposing supporter data", () => {
  const submitStart = app.indexOf("async function submitPublicSignature(");
  const submitEnd = app.indexOf("\n  async function", submitStart + 1);
  const submitSource = app.slice(submitStart, submitEnd);
  const duplicateSource = submitSource.slice(
    submitSource.indexOf('error.code === "screen_verification_existing_supporter"'),
    submitSource.indexOf("\n        if (", submitSource.indexOf('error.code === "screen_verification_existing_supporter"'))
  );

  assert.match(duplicateSource, /setPublicMessage\("existing_supporter_duplicate"\)/);
  assert.doesNotMatch(duplicateSource, /error\.(details|hint)|signer\.(name|email|phone)/);
  assert.match(page, /publicMessage === "existing_supporter_duplicate"\s*\?\s*t\("public\.existingSupporterDuplicate"\)/);
  assert.match(read("../supabase/migrations/20261019010000_screen_otp_public_signing.sql"), /screen_verification_existing_supporter/);
  for (const locale of [en, hi, or]) {
    assert.ok(locale.public.existingSupporterDuplicate.trim());
  }
});
