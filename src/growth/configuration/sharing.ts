import type { Campaign, Organization, Signer } from "../../types";
import { getSupporterReferralCode } from "../../utils/referrals";
import { normalizeCampaignGrowthConfiguration } from "./defaults";

interface GrowthShareTemplateContext {
  campaign: Campaign;
  organization?: Organization;
  signer?: Signer | null;
  referralLink: string;
  walletCredits?: number;
  recognitionLevel?: string;
  campaignProgress?: number;
  supporterCount?: number;
  verifiedSupporters?: number;
}

function applyTemplate(template: string, context: GrowthShareTemplateContext) {
  const signer = context.signer;
  const values: Record<string, string> = {
    "{{campaign}}": context.campaign.title,
    "{{supporter}}": signer?.name || "a supporter",
    "{{referral_link}}": context.referralLink,
    "{{wallet}}": context.walletCredits !== undefined ? `${context.walletCredits.toLocaleString()} credits` : "",
    "{{recognition}}": context.recognitionLevel ?? "",
    "{{organization}}": context.organization?.name || "VoiceUp",
    "{{referral_code}}": signer ? getSupporterReferralCode(signer) : "",
    "{{campaign_progress}}": context.campaignProgress !== undefined ? `${context.campaignProgress}%` : "",
    "{{supporters}}": context.supporterCount !== undefined ? context.supporterCount.toLocaleString() : "",
    "{{verified_supporters}}": context.verifiedSupporters !== undefined ? context.verifiedSupporters.toLocaleString() : ""
  };

  return Object.entries(values).reduce(
    (message, [token, value]) => message.split(token).join(value),
    template
  );
}

export function getConfiguredGrowthShareMessages(context: GrowthShareTemplateContext) {
  const config = normalizeCampaignGrowthConfiguration(context.campaign).sharing;
  return {
    whatsapp: applyTemplate(config.whatsappMessage, context),
    sms: applyTemplate(config.smsTemplate, context),
    emailSubject: applyTemplate(config.emailSubject, context),
    emailBody: applyTemplate(config.emailTemplate, context),
    social: applyTemplate(config.nativeShareMessage, context),
    instagramCaption: applyTemplate(config.referralPosterHeadline, context)
  };
}
