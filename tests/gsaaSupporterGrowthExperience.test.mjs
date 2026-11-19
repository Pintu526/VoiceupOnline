import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicPage = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const growthCenter = readFileSync(
  new URL("../src/components/SupporterGrowthCenter.tsx", import.meta.url),
  "utf8"
);
const headerCss = readFileSync(
  new URL("../src/gsaaV3AccountHeader.css", import.meta.url),
  "utf8"
);
const publicSigningCss = readFileSync(
  new URL("../src/publicSigningExperience.css", import.meta.url),
  "utf8"
);
const localeFiles = Object.fromEntries(
  ["en", "hi", "or"].map((language) => [
    language,
    JSON.parse(readFileSync(new URL(`../src/i18n/locales/${language}.json`, import.meta.url), "utf8"))
  ])
);
const inlineAuth = readFileSync(
  new URL("../src/components/CampaignInlineAuthPanel.tsx", import.meta.url),
  "utf8"
);

test("header sign in uses one anchored accessible auth popover", () => {
  assert.equal((publicPage.match(/<CampaignInlineAuthPanel\b/g) ?? []).length, 1);
  assert.match(publicPage, /className="gsaa-auth-popover"/);
  assert.match(publicPage, /aria-haspopup="dialog"/);
  assert.match(publicPage, /event\.key === "Escape"/);
  assert.match(publicPage, /event\.key !== "Tab"/);
  assert.match(publicPage, /document\.addEventListener\("pointerdown"/);
  assert.match(publicPage, /signInTriggerRef\.current\?\.focus\(\)/);
  assert.match(headerCss, /@media \(max-width: 480px\)[\s\S]*\.gsaa-auth-popover\s*\{[\s\S]*position: fixed/);
});

test("existing supporter mode requires server ownership and a verified owned dashboard", () => {
  assert.match(publicPage, /loadVoiceupAccessManifest\(\)/);
  assert.match(publicPage, /loadOwnedSupporterDashboard\(ownership\.accountId\)/);
  assert.match(publicPage, /candidate\.account\.campaignId === campaign\.id/);
  assert.match(publicPage, /candidate\.account\.supporterId === ownership\.supporterId/);
  assert.match(publicPage, /candidate\.supporter\.status === "verified"/);
  assert.match(publicPage, /const ownedCampaignSignature = supporterSession\?\.dashboard\?\.supporter\.status === "verified"/);
  assert.match(publicPage, /supporterSessionChecking \? \(/);
  assert.match(publicPage, /setSupporterSession\(null\);[\s\S]*setSupporterAccessError\(true\)/);
  assert.match(publicPage, /onAuthStateChange/);
});

test("authenticated unsigned supporters retain the existing six-step journey", () => {
  assert.match(publicPage, /ownedCampaignSignature \? null : \(\s*<>\s*<div className="wizard-header">/);
  assert.match(publicPage, /const signingSteps:[\s\S]*"phone"[\s\S]*"otp"[\s\S]*"profile"[\s\S]*"address"[\s\S]*"review"[\s\S]*"done"/);
  assert.match(publicPage, /t\("goudhanCampaign\.completeSixSteps"\)/);
});

test("the premium signing header renders the 60-second message exactly once", () => {
  assert.equal((publicPage.match(/presentationCopy\.participationTime/g) ?? []).length, 1);
  assert.equal((publicPage.match(/gsaa-authenticated-signing-heading/g) ?? []).length, 1);
  assert.doesNotMatch(headerCss, /wizard-header > strong:not/);
});

test("supporter account menu uses actual dashboard and certificate routes", () => {
  assert.match(publicPage, /href=\{supporterSession\.dashboardPath\}/);
  assert.match(publicPage, /supporterSession\.dashboardPath\}#certificates/);
  assert.match(publicPage, /href="https:\/\/voiceup\.live\/"/);
  assert.match(publicPage, /await logoutSupporter\(\)/);
});

test("growth center exposes reliable contribution, sharing, roles and bounded metrics", () => {
  assert.match(growthCenter, /dashboard\.supporter\.name/);
  assert.match(growthCenter, /dashboard\.campaign\.title/);
  assert.match(growthCenter, /dashboard\.participationRequests\.find/);
  assert.match(growthCenter, /approvedVolunteer/);
  assert.match(growthCenter, /authorizedCoordinator/);
  assert.match(growthCenter, /navigator\.clipboard\.writeText\(referralUrl\)/);
  assert.match(growthCenter, /ReferralQrPreview/);
  assert.match(growthCenter, /Verified referral totals are not available in this public view/);
  assert.doesNotMatch(growthCenter, /3 verified referrals|3 qualified volunteers/i);
});

test("anonymous and authenticated visitors share exactly three translated promotions", () => {
  const storyStart = publicPage.indexOf('<div className="public-story-column">');
  const signingStart = publicPage.indexOf('<div className="public-campaign-v2-signing-panel"');
  const storyMarkup = publicPage.slice(storyStart, signingStart);
  const growthCenterMarkup = growthCenter.slice(growthCenter.indexOf("export function SupporterGrowthCenter"));

  assert.ok(storyStart >= 0 && signingStart > storyStart);
  assert.equal((storyMarkup.match(/<VoiceUpPublicPromotions \/>/g) ?? []).length, 1);
  assert.doesNotMatch(growthCenterMarkup, /gsaa-growth-promotions|VoiceUpPublicPromotions/);
  for (const name of ["Goudhan Marketplace", "PanditOnline", "Organic Food Catering"]) {
    assert.equal((growthCenter.match(new RegExp(name, "g")) ?? []).length, 1);
  }
  assert.equal((growthCenter.match(/name: "/g) ?? []).length, 3);
  assert.match(growthCenter, /useTranslation\(\)/);
  assert.match(growthCenter, /goudhanCampaign\.voiceupExplore\.comingSoon/);
  assert.equal(localeFiles.en.goudhanCampaign.voiceupExplore.applications.goudhan.description,
    "Cow-based products, traditional dairy products, and rural producer marketplace.");
  for (const language of ["en", "hi", "or"]) {
    const explore = localeFiles[language].goudhanCampaign.voiceupExplore;
    assert.ok(explore.title && explore.comingSoon);
    assert.deepEqual(Object.keys(explore.applications), ["goudhan", "panditOnline", "organicCatering"]);
  }
});

test("desktop promotions occupy the story column beside the signing panel", () => {
  assert.match(publicSigningCss, /grid-template-areas:\s*"story signup"/);
  assert.match(publicSigningCss, /"header header" "cards art" "promos promos" "rest rest"/);
  assert.match(publicSigningCss, /> \.public-story-column > \.gsaa-growth-promotions \{ grid-area: promos/);
  assert.match(publicSigningCss, /> \.public-story-column > \.public-gau-closing \{ grid-area: rest/);
});

test("inline auth retains real email password and email OTP services without adding SMS", () => {
  assert.match(inlineAuth, /type SignInMethod = "password" \| "email_otp"/);
  assert.match(inlineAuth, /loginSupporterWithEmail/);
  assert.match(inlineAuth, /requestSupporterEmailOtp/);
  assert.match(inlineAuth, /verifySupporterEmailOtp/);
  assert.doesNotMatch(inlineAuth, /signInWithOtp\(\{\s*phone|requestSupporterSmsOtp/i);
});

