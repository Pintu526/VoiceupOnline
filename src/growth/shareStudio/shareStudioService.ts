import type { CampaignShareStudioModel } from "./types";

export function buildCampaignShareStudioModel(): CampaignShareStudioModel {
  return {
    cards: [
      { id: "share-support", title: "Support", channel: "Support", description: "Branded support card for the campaign.", branding: "VoiceUp", includesQr: true, includesReferralLink: true },
      { id: "share-whatsapp", title: "WhatsApp", channel: "WhatsApp", description: "Quick mobile share card with referral context.", branding: "VoiceUp", includesQr: true, includesReferralLink: true },
      { id: "share-telegram", title: "Telegram", channel: "Telegram", description: "Community-ready share card.", branding: "VoiceUp", includesQr: true, includesReferralLink: true },
      { id: "share-copy", title: "Copy Link", channel: "Copy Link", description: "Simple link copy experience.", branding: "VoiceUp", includesQr: false, includesReferralLink: true }
    ]
  };
}
