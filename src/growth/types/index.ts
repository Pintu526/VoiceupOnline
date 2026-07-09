import type { Campaign, Organization, Signer } from "../../types";
import type { SupporterGrowthAccount } from "../contributions/types";
import type { ContributionLeaderboardModel } from "../leaderboards/types";

export type GrowthStage = "Launch" | "Traction" | "Scale" | "Movement";
export type GrowthChannel = "direct" | "referral" | "field" | "scan";
export type AmbassadorLevel =
  | "Supporter"
  | "Community Promoter"
  | "Top Referrer"
  | "District Champion"
  | "Movement Ambassador";
export type RewardStatus = "available" | "earned" | "locked";

export interface GrowthEngineInput {
  campaigns: Campaign[];
  activeCampaign?: Campaign;
  organization: Organization;
  signers: Signer[];
  campaignSigners: Signer[];
}

export interface GrowthCampaignScope {
  campaign?: Campaign;
  campaignCount: number;
  signerCount: number;
  label: string;
}

export interface ReferralNode {
  code: string;
  label: string;
  signerId?: string;
  location: string;
  directSignatures: number;
  points: number;
}

export interface ReferralEdge {
  referrerCode: string;
  signerId: string;
  signerName: string;
  signedAt: string;
  channel: GrowthChannel;
}

export interface ReferralDomainModel {
  nodes: ReferralNode[];
  edges: ReferralEdge[];
  referredSignatures: number;
  referralRate: number;
  strongestCode: string;
}

export interface AmbassadorProfile {
  id: string;
  signerId?: string;
  name: string;
  code: string;
  level: AmbassadorLevel;
  location: string;
  directReferrals: number;
  verifiedSignatures: number;
  fieldSignatures: number;
  totalPoints: number;
  lastActivityAt: string;
}

export interface AmbassadorDomainModel {
  profiles: AmbassadorProfile[];
  activeAmbassadors: number;
  topLevel: AmbassadorLevel;
}

export interface GrowthTrendPoint {
  label: string;
  signatures: number;
  referrals: number;
}

export interface GrowthChannelMetric {
  channel: GrowthChannel;
  label: string;
  count: number;
  percentage: number;
}

export interface GrowthAnalyticsDomainModel {
  stage: GrowthStage;
  growthScore: number;
  newSupporters7d: number;
  verifiedSupporters: number;
  conversionRate: number;
  trends: GrowthTrendPoint[];
  channels: GrowthChannelMetric[];
}

export interface RewardRule {
  id: string;
  label: string;
  pointsRequired: number;
  description: string;
}

export interface RewardMerchantSummary {
  merchantId: string;
  merchantName: string;
  status: import("../merchant").MerchantStatus;
  role: import("../merchant").MerchantRole;
}

export interface RewardLedgerEntry {
  id: string;
  ambassadorCode: string;
  ambassadorName: string;
  rewardLabel: string;
  status: RewardStatus;
  points: number;
  rewardId?: string;
  merchant?: RewardMerchantSummary;
}

export interface RewardDomainModel {
  rules: RewardRule[];
  ledger: RewardLedgerEntry[];
  earnedRewards: number;
  availableRewards: number;
  catalogCount: number;
  merchantCount: number;
  featuredRewardCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  code: string;
  level: AmbassadorLevel;
  location: string;
  score: number;
  directReferrals: number;
}

export interface LeaderboardDomainModel {
  overall: LeaderboardEntry[];
  referral: LeaderboardEntry[];
  field: LeaderboardEntry[];
}

export interface ContributionAdvancementDomainModel {
  accounts: SupporterGrowthAccount[];
  contributionEnabled: boolean;
  advancementLevelsConfigured: number;
  leaderboardFilters: ContributionLeaderboardModel[];
}

export interface GrowthDashboardModel {
  scope: GrowthCampaignScope;
  summary: {
    stage: GrowthStage;
    growthScore: number;
    totalSupporters: number;
    referralSignatures: number;
    referralRate: number;
    ambassadorCount: number;
    earnedRewards: number;
  };
  referrals: ReferralDomainModel;
  ambassadors: AmbassadorDomainModel;
  analytics: GrowthAnalyticsDomainModel;
  rewards: RewardDomainModel;
  leaderboards: LeaderboardDomainModel;
  contributionAdvancement: ContributionAdvancementDomainModel;
}
