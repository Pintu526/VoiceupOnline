import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getLocalizedCampaignField, getLocalizedCampaignContent } from "../src/i18n/campaignContent.ts";

const campaign = {
  title: "Original English title",
  description: "Original description",
  appealContent: "Original appeal",
  consentText: "Original consent",
  donationCaption: "",
  socialShareText: "",
  thankYouMessage: "",
  participantUpdateMessage: "",
  qrLabel: "",
  localizedContent: {
    or: { title: "ଓଡ଼ିଆ ଶୀର୍ଷକ", description: "ଓଡ଼ିଆ ବିବରଣୀ" },
    hi: { title: "हिन्दी शीर्षक" }
  }
};

test("language selection returns the matching translation", () => {
  assert.equal(getLocalizedCampaignField(campaign, "or", "title"), "ଓଡ଼ିଆ ଶୀର୍ଷକ");
  assert.equal(getLocalizedCampaignField(campaign, "hi", "title"), "हिन्दी शीर्षक");
});

test("missing translations fall back to original campaign content", () => {
  assert.equal(getLocalizedCampaignField(campaign, "hi", "description"), "Original description");
  assert.equal(getLocalizedCampaignField(campaign, "en", "title"), "Original English title");
});

test("language switching never mutates the stored campaign", () => {
  const before = JSON.stringify(campaign);
  getLocalizedCampaignContent(campaign, "or");
  getLocalizedCampaignContent(campaign, "hi");
  getLocalizedCampaignContent(campaign, "en");
  assert.equal(JSON.stringify(campaign), before);
});

test("legacy GSAA-style campaigns remain compatible", () => {
  const legacy = { ...campaign, localizedContent: undefined };
  assert.equal(getLocalizedCampaignField(legacy, "or", "title"), "Original English title");
});

test("empty translations cannot erase original content", () => {
  const example = {
    ...campaign,
    localizedContent: { or: { title: "   " } }
  };
  assert.equal(getLocalizedCampaignField(example, "or", "title"), "Original English title");
});

test("language provider retains all three supported languages", () => {
  const provider = readFileSync("src/i18n/provider.tsx", "utf8");
  assert.match(provider, /"en",\s*"hi",\s*"or"/);
});