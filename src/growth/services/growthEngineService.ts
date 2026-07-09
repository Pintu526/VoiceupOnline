import type { Signer } from "../../types";
import type { GrowthCampaignScope, GrowthDashboardModel, GrowthEngineInput } from "../types";
import { buildSupporterGrowthAccounts } from "../contributions/accountBuilder";
import { buildContributionLeaderboard } from "../leaderboards/contributionLeaderboardService";
import type { ContributionLeaderboardFilter } from "../leaderboards/types";
import { buildAmbassadorDomain } from "./ambassadorService";
import { buildGrowthAnalytics } from "./analyticsService";
import { buildLeaderboardDomain } from "./leaderboardService";
import { buildReferralDomain } from "./referralService";
import { buildRewardDomain } from "./rewardService";

function getScope(input: GrowthEngineInput, scopedSigners: Signer[]): GrowthCampaignScope {
  return {
    campaign: input.activeCampaign,
    campaignCount: input.activeCampaign ? 1 : input.campaigns.length,
    signerCount: scopedSigners.length,
    label: input.activeCampaign?.title ?? "All campaigns"
  };
}

export function buildGrowthDashboardModel(input: GrowthEngineInput): GrowthDashboardModel {
  const scopedSigners = input.activeCampaign ? input.campaignSigners : input.signers;
  const referrals = buildReferralDomain(scopedSigners);
  const accounts = buildSupporterGrowthAccounts(scopedSigners, referrals);
  const ambassadors = buildAmbassadorDomain(scopedSigners, referrals);
  const analytics = buildGrowthAnalytics(scopedSigners, referrals);
  const rewards = buildRewardDomain(ambassadors, input.activeCampaign);
  const leaderboards = buildLeaderboardDomain(ambassadors);
  const contributionLeaderboardFilters: ContributionLeaderboardFilter[] = [
    "current_campaign",
    "this_week",
    "this_month",
    "overall",
    "current_level",
    "highest_growth",
    "highest_contribution",
    "highest_verified_referrals",
    "highest_campaign_influence"
  ];

  return {
    scope: getScope(input, scopedSigners),
    summary: {
      stage: analytics.stage,
      growthScore: analytics.growthScore,
      totalSupporters: scopedSigners.length,
      referralSignatures: referrals.referredSignatures,
      referralRate: referrals.referralRate,
      ambassadorCount: ambassadors.activeAmbassadors,
      earnedRewards: rewards.earnedRewards
    },
    referrals,
    ambassadors,
    analytics,
    rewards,
    leaderboards,
    contributionAdvancement: {
      accounts,
      contributionEnabled: false,
      advancementLevelsConfigured: 0,
      leaderboardFilters: contributionLeaderboardFilters.map((filter) =>
        buildContributionLeaderboard({
          accounts,
          filter,
          campaignId: input.activeCampaign?.id,
          limit: 8
        })
      )
    }
  };
}
