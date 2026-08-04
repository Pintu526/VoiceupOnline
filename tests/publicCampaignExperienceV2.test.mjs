import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const css = readFileSync(
  new URL("../src/publicSigningExperience.css", import.meta.url),
  "utf8"
);

const sectionMarkers = [
  "VoiceUpStoryCarousel",
  'className="public-section public-share-panel"',
  'aria-labelledby="authority-heading"',
  'aria-labelledby="story-heading"',
  'aria-labelledby="campaign-media-heading"',
  'aria-labelledby="faq-heading"',
  'aria-labelledby="movement-volunteer-heading"',
  'aria-labelledby="movement-trust-heading"',
  "campaign.campaignVideoUrl"
];

test("public campaign V2 hero compression classes are present", () => {
  assert.match(page, /className="public-layout public-campaign-modern public-campaign-v2"/);
  assert.match(page, /public-campaign-v2-hero/);
  assert.match(page, /public-campaign-v2-hero-surface/);
  assert.match(page, /public-campaign-v2-hero-main/);
  assert.match(css, /\.public-campaign-v2 \.public-campaign-v2-hero \{/);
  assert.match(css, /min-height: auto/);
});

test("signing handlers remain referenced", () => {
  assert.match(page, /id="public-sign-form"/);
  assert.match(page, /onSubmit=\{handlePublicSubmit\}/);
  assert.match(page, /href="#public-sign-form"/);
});

test("OTP flow remains referenced", () => {
  assert.match(page, /t\("public\.sendOtp"\)/);
  assert.match(page, /t\("public\.verifyOtp"\)/);
  assert.match(page, /publicForm\.otpVerified/);
  assert.match(page, /className="otp-box"/);
});

test("location hierarchy remains referenced", () => {
  assert.match(page, /<IndiaLocationFields/);
  assert.match(page, /fixedCountry="India"/);
  assert.match(page, /verifiedSuggestionsOnly/);
});

test("coordinator flow remains referenced", () => {
  assert.match(page, /onSubmitCoordinatorApplication/);
  assert.match(page, /coordinatorLevel/);
  assert.match(page, /InvolvementPanel/);
});

test("sharing remains referenced", () => {
  assert.match(page, /shareNatively/);
  assert.match(page, /shareLinks\.whatsapp/);
  assert.match(page, /ReferralQrPreview/);
  assert.match(page, /personalReferralUrl/);
});

test("campaign video and media remain referenced", () => {
  assert.match(page, /campaign\.campaignVideoUrl/);
  assert.match(page, /getYouTubeEmbedUrl/);
  assert.match(page, /movement-media/);
  assert.match(page, /backgroundImage: displayCampaign\.heroImage/);
});

test("no functional section is removed", () => {
  for (const marker of sectionMarkers) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("no new API call or backend dependency is introduced", () => {
  assert.doesNotMatch(page, /\bfetch\s*\(/);
  assert.doesNotMatch(page, /supabase/);
  assert.doesNotMatch(page, /functions\.invoke/);
  assert.doesNotMatch(css, /@import/);
});

test("no new campaign-specific condition is introduced for V2 hero", () => {
  const heroBlockStart = page.indexOf("public-campaign-v2-hero");
  const heroBlockEnd = page.indexOf("VoiceUpStoryCarousel", heroBlockStart);
  const heroBlock = page.slice(heroBlockStart, heroBlockEnd);

  assert.doesNotMatch(heroBlock, /goudhanCampaignBlueprint/);
  assert.doesNotMatch(heroBlock, /GOUDHAN_CAMPAIGN_SLUG/);
  assert.doesNotMatch(heroBlock, /GAUMATA_PUBLIC_HOSTNAMES/);
  assert.doesNotMatch(heroBlock, /slug\s*===/);
  assert.doesNotMatch(heroBlock, /hostname\s*===/);
});
