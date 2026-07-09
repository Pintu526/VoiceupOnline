import type { SupporterGrowthAccount } from "../contributions/types";
import type {
  ContributionLeaderboardEntry,
  ContributionLeaderboardInput,
  ContributionLeaderboardModel
} from "./types";

function daysAgo(dateValue: string | undefined) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / 86400_000);
}

function campaignInfluence(account: SupporterGrowthAccount) {
  return account.currentBalance + account.verifiedReferrals * 10 + account.conversions * 5 + account.campaignParticipations;
}

function scoreAccount(account: SupporterGrowthAccount, filter: ContributionLeaderboardInput["filter"]) {
  if (filter === "highest_verified_referrals") return account.verifiedReferrals;
  if (filter === "highest_contribution") return account.lifetimeContributedPoints;
  if (filter === "highest_campaign_influence") return campaignInfluence(account);
  if (filter === "highest_growth") return account.lifetimeEarnedPoints + account.receivedContributionPoints;
  return account.currentBalance;
}

function filterAccounts(input: ContributionLeaderboardInput) {
  return input.accounts
    .filter((account) => (input.filter === "current_campaign" && input.campaignId ? account.campaignId === input.campaignId : true))
    .filter((account) => (input.filter === "this_week" ? daysAgo(account.lastCalculatedAt) <= 7 : true))
    .filter((account) => (input.filter === "this_month" ? daysAgo(account.lastCalculatedAt) <= 31 : true))
    .filter((account) => (input.filter === "current_level" && input.levelId ? account.currentLevelId === input.levelId : true));
}

function toEntry(account: SupporterGrowthAccount, index: number, filter: ContributionLeaderboardInput["filter"]): ContributionLeaderboardEntry {
  return {
    rank: index + 1,
    supporterId: account.supporterId,
    campaignId: account.campaignId,
    referralCode: account.referralCode,
    levelId: account.currentLevelId,
    score: scoreAccount(account, filter),
    pointsBalance: account.currentBalance,
    verifiedReferrals: account.verifiedReferrals,
    contributionPoints: account.lifetimeContributedPoints,
    campaignInfluence: campaignInfluence(account)
  };
}

export function buildContributionLeaderboard(
  input: ContributionLeaderboardInput
): ContributionLeaderboardModel {
  const filter = input.filter;
  const entries = filterAccounts(input)
    .slice()
    .sort((left, right) => scoreAccount(right, filter) - scoreAccount(left, filter))
    .slice(0, input.limit ?? 25)
    .map((account, index) => toEntry(account, index, filter));

  return {
    filter,
    entries
  };
}
