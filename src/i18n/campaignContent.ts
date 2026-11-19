import type {
  Campaign,
  CampaignContentLanguage,
  CampaignLocalizedContent
} from "../types.ts";

export type CampaignContentField = keyof CampaignLocalizedContent;

export function getLocalizedCampaignField(
  campaign: Campaign,
  language: CampaignContentLanguage,
  field: CampaignContentField
): string {
  const localized = campaign.localizedContent?.[language]?.[field];

  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }

  const original = campaign[field];
  return typeof original === "string" ? original : "";
}

export function getLocalizedCampaignContent(
  campaign: Campaign,
  language: CampaignContentLanguage
): CampaignLocalizedContent {
  return {
    title: getLocalizedCampaignField(campaign, language, "title"),
    description: getLocalizedCampaignField(campaign, language, "description"),
    appealContent: getLocalizedCampaignField(campaign, language, "appealContent"),
    consentText: getLocalizedCampaignField(campaign, language, "consentText"),
    donationCaption: getLocalizedCampaignField(campaign, language, "donationCaption"),
    socialShareText: getLocalizedCampaignField(campaign, language, "socialShareText"),
    thankYouMessage: getLocalizedCampaignField(campaign, language, "thankYouMessage"),
    participantUpdateMessage: getLocalizedCampaignField(campaign, language, "participantUpdateMessage"),
    qrLabel: getLocalizedCampaignField(campaign, language, "qrLabel")
  };
}