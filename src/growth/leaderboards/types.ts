import type { SupporterGrowthAccount } from "../contributions/types";

export type ContributionLeaderboardFilter =
  | "current_campaign"
  | "this_week"
  | "this_month"
  | "overall"
  | "current_level"
  | "highest_growth"
  | "highest_contribution"
  | "highest_verified_referrals"
  | "highest_campaign_influence";

export interface ContributionLeaderboardEntry {
  rank: number;
  supporterId: string;
  campaignId: string;
  referralCode?: string;
  levelId?: string;
  score: number;
  pointsBalance: number;
  verifiedReferrals: number;
  contributionPoints: number;
  campaignInfluence: number;
}

export interface ContributionLeaderboardModel {
  filter: ContributionLeaderboardFilter;
  entries: ContributionLeaderboardEntry[];
}

export interface ContributionLeaderboardInput {
  accounts: SupporterGrowthAccount[];
  filter: ContributionLeaderboardFilter;
  campaignId?: string;
  levelId?: string;
  asOf?: string;
  limit?: number;
}
