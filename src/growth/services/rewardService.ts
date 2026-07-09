import type {
  AmbassadorDomainModel,
  RewardMerchantSummary,
  RewardDomainModel,
  RewardLedgerEntry,
  RewardRule,
  RewardStatus
} from "../types";
import type { Campaign } from "../../types";
import { normalizeCampaignGrowthConfiguration } from "../configuration";

const rewardRules: RewardRule[] = [
  {
    id: "starter-badge",
    label: "Campaign Starter Badge",
    pointsRequired: 5,
    description: "Recognize a verified supporter who can start sharing the campaign."
  },
  {
    id: "community-promoter",
    label: "Community Promoter Badge",
    pointsRequired: 15,
    description: "Reward supporters who bring their first small referral cluster."
  },
  {
    id: "district-champion",
    label: "District Champion Badge",
    pointsRequired: 70,
    description: "Recognize local champions with meaningful referral momentum."
  },
  {
    id: "movement-ambassador",
    label: "Movement Ambassador Badge",
    pointsRequired: 100,
    description: "Top-tier recognition for high-impact campaign ambassadors."
  }
];

function getRewardStatus(points: number, pointsRequired: number): RewardStatus {
  if (points >= pointsRequired) return "earned";
  if (points >= Math.max(1, Math.round(pointsRequired * 0.6))) return "available";
  return "locked";
}

function merchantSummary(campaign: Campaign | undefined, merchantId?: string): RewardMerchantSummary | undefined {
  if (!campaign || !merchantId) return undefined;
  const merchant = normalizeCampaignGrowthConfiguration(campaign).merchants.find((item) => item.id === merchantId);
  if (!merchant) return undefined;
  return {
    merchantId: merchant.id,
    merchantName: merchant.name,
    status: merchant.status,
    role: merchant.role
  };
}

export function buildRewardDomain(ambassadors: AmbassadorDomainModel, campaign?: Campaign): RewardDomainModel {
  const config = campaign ? normalizeCampaignGrowthConfiguration(campaign) : undefined;
  const catalogRewards = config?.rewards ?? [];
  const ledger = ambassadors.profiles.slice(0, 10).flatMap<RewardLedgerEntry>((profile) =>
    (catalogRewards.length > 0
      ? catalogRewards.map((reward) => ({
          id: `${profile.id}-${reward.id}`,
          ambassadorCode: profile.code,
          ambassadorName: profile.name,
          rewardLabel: reward.label,
          rewardId: reward.id,
          merchant: merchantSummary(campaign, reward.merchantId),
          status: getRewardStatus(profile.totalPoints, reward.pointsRequired),
          points: profile.totalPoints
        }))
      : rewardRules.map((rule) => ({
          id: `${profile.id}-${rule.id}`,
          ambassadorCode: profile.code,
          ambassadorName: profile.name,
          rewardLabel: rule.label,
          status: getRewardStatus(profile.totalPoints, rule.pointsRequired),
          points: profile.totalPoints
        })))
  );

  return {
    rules:
      catalogRewards.length > 0
        ? catalogRewards.map((reward) => ({
            id: reward.id,
            label: reward.label,
            pointsRequired: reward.pointsRequired,
            description: reward.description
          }))
        : rewardRules,
    ledger,
    earnedRewards: ledger.filter((entry) => entry.status === "earned").length,
    availableRewards: ledger.filter((entry) => entry.status === "available").length,
    catalogCount: catalogRewards.length,
    merchantCount: config?.merchants.length ?? 0,
    featuredRewardCount: catalogRewards.filter((reward) => reward.featured).length
  };
}
