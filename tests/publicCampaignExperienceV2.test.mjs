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

test("no literal GOUDHAN.COM remains in PublicCampaignPage", () => {
  assert.doesNotMatch(page, /GOUDHAN\.COM/i);
  assert.doesNotMatch(page, /goudhanCampaign\.brandName/);
  assert.match(page, /const publicOrganizationLabel = organization\?\.name\?\.trim\(\)/);
});

test("hero metrics are compressed into one horizontal strip", () => {
  assert.match(page, /className="public-campaign-v2-metrics"/);
  assert.match(page, /className="public-campaign-v2-metric"/);
  assert.match(page, /t\("public\.totalSupporters"\)/);
  assert.match(page, /t\("public\.verifiedSupporters"\)/);
  assert.match(page, /t\("public\.liveProgress"\)/);
  assert.match(page, /t\("public\.verifiedGoal"\)/);
  assert.doesNotMatch(page, /className="supporter-counter"/);
  assert.match(css, /\.public-campaign-v2-metrics \{/);
});

test("campaign guide is a collapsed accessible disclosure by default", () => {
  assert.match(page, /<details className="public-campaign-v2-guide">/);
  assert.match(page, /<summary className="public-campaign-v2-guide-summary">Campaign Guide<\/summary>/);
  assert.doesNotMatch(page, /<details className="public-campaign-v2-guide" open/);
  assert.match(css, /\.public-campaign-v2-guide-summary \{/);
});

test("existing campaign guide content remains present", () => {
  assert.match(page, /experience="publicCampaign"/);
  assert.match(page, /slideIds=\{\["objective", "evidence", "progress", "afterSigning", "share"\]\}/);
  assert.match(page, /className="voiceup-story-carousel--compact"/);
});

test("signing panel priority styling is present without handler changes", () => {
  assert.match(page, /className="public-campaign-v2-signing-panel"/);
  assert.match(css, /\.public-campaign-v2-signing-panel/);
  assert.match(page, /id="public-sign-form"/);
  assert.match(page, /onSubmit=\{handlePublicSubmit\}/);
});

test("signing handlers remain referenced", () => {
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

test("no new campaign-specific condition is introduced for V2 layout", () => {
  const layoutBlockStart = page.indexOf("public-campaign-v2-guide");
  const layoutBlock = page.slice(layoutBlockStart, layoutBlockStart + 1200);

  assert.doesNotMatch(layoutBlock, /goudhanCampaignBlueprint/);
  assert.doesNotMatch(layoutBlock, /GOUDHAN_CAMPAIGN_SLUG/);
  assert.doesNotMatch(layoutBlock, /GAUMATA_PUBLIC_HOSTNAMES/);
  assert.doesNotMatch(layoutBlock, /slug\s*===/);
  assert.doesNotMatch(layoutBlock, /hostname\s*===/);
});
