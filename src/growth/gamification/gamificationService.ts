import type { GrowthDashboardModel } from "../types";
import type { CampaignGamificationModel } from "./types";

export function buildCampaignGamificationModel(model: GrowthDashboardModel): CampaignGamificationModel {
  const supporters = model.summary.totalSupporters || 1;
  const impactPercentage = Math.min(99, Math.round((model.summary.referralRate + model.summary.growthScore) / 2));
  const rankBand = model.summary.growthScore >= 80
    ? "Top 5%"
    : model.summary.growthScore >= 60
      ? "Top 15%"
      : "Top 35%";
  const tier = model.summary.growthScore >= 80
    ? "Champion"
    : model.summary.growthScore >= 60
      ? "Rising"
      : "Starter";

  return {
    profile: {
      currentRank: tier,
      regionalRank: rankBand,
      nationalRank: model.summary.growthScore >= 80 ? "Top 20%" : "Top 40%",
      impactPercentage,
      estimatedCampaignInfluence: Math.round(supporters * 1.4),
      recognitionLevel: model.ambassadors.topLevel,
      achievements: [
        `${model.summary.referralSignatures.toLocaleString()} referral signatures`,
        `${model.analytics.verifiedSupporters.toLocaleString()} verified supporters`,
        `${model.summary.earnedRewards.toLocaleString()} rewards earned`
      ]
    },
    scorecards: [
      { label: "People Joined", value: supporters.toLocaleString() },
      { label: "People Verified", value: Math.round(supporters * 0.8).toLocaleString() },
      { label: "Growth Credits", value: model.summary.earnedRewards.toLocaleString() },
      { label: "Campaign Reach", value: Math.round(supporters * 2.6).toLocaleString() }
    ]
  };
}
