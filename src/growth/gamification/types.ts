export interface CampaignGamificationProfile {
  currentRank: string;
  regionalRank: string;
  nationalRank: string;
  impactPercentage: number;
  estimatedCampaignInfluence: number;
  recognitionLevel: string;
  achievements: string[];
}

export interface CampaignGamificationModel {
  profile: CampaignGamificationProfile;
  scorecards: Array<{ label: string; value: string }>;
}
