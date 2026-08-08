import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);

test("generic public branding uses only a trimmed configured campaign hero", () => {
  assert.match(page, /const campaignHeroImage = campaign\.heroImage\.trim\(\)/);
  assert.match(page, /heroImage: campaignHeroImage/);
  assert.match(page, /displayCampaign\.heroImage\s*\?\s*`linear-gradient/);
  assert.match(page, /:\s*undefined/);
});

test("Goudhan presentation uses the supplied brand asset without a generic fallback", () => {
  assert.doesNotMatch(page, /goudhanCampaignBlueprint/);
  assert.doesNotMatch(page, /campaign\.heroImage\s*\|\|/);
  assert.match(page, /isGoudhanExperience && \(/);
  assert.match(page, /src="\/brands\/goudhan\/logo\.svg"/);
});

test("public branding uses organization metadata when available", () => {
  assert.match(page, /const publicOrganizationLabel = organization\?\.name\?\.trim\(\)/);
  assert.match(page, /publicOrganizationLabel && <span className="eyebrow">\{publicOrganizationLabel\}<\/span>/);
  assert.match(page, /organizationName: publicOrganizationLabel \|\| "VoiceUp"/);
});

test("hero presentation and public flows retain their existing sources", () => {
  assert.match(page, /backgroundPosition: campaign\.heroImagePosition/);
  assert.match(page, /backgroundSize: `\$\{campaign\.heroImageZoom\}%`/);
  assert.match(page, /campaign\.campaignVideoUrl\.trim\(\)/);
  assert.match(page, /<IndiaLocationFields/);
  assert.match(page, /onSubmit/);
});
