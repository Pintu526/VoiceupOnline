export interface CampaignShareCardTemplate {
  id: string;
  title: string;
  channel: string;
  description: string;
  branding: string;
  includesQr: boolean;
  includesReferralLink: boolean;
}

export interface CampaignShareStudioModel {
  cards: CampaignShareCardTemplate[];
}
