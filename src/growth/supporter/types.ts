import type { Campaign, Organization, Signer } from "../../types";
import type { AchievementQualification } from "../achievements";
import type { ContributionCalculationAudit } from "../contributions";
import type { ContributionLeaderboardFilter, ContributionLeaderboardModel } from "../leaderboards";
import type { PrizeQualificationResult } from "../prizes";
import type { RewardCenterModel } from "../rewards";
import type { RecognitionEvaluationResult, RecognitionLevelConfiguration } from "../recognition";
import type { GrowthTimelineRecord } from "../timeline";
import type { RecognitionTreeModel, SupporterGrowthPortalModel } from "../tree";
import type { GrowthWallet } from "../wallet";
import type { GrowthRuntimeState, GrowthSupporterSnapshot } from "../lifecycle";

export interface SupporterLeaderboardSummary {
  filter: ContributionLeaderboardFilter;
  label: string;
  rank?: number;
  score: number;
  nearby: ContributionLeaderboardModel["entries"];
}

export interface SupporterGrowthProjection {
  invitedSupporters: number;
  verificationRate: number;
  volunteerRate: number;
  treeLevels: number;
  expectedWallet: number;
  expectedPromotion: number;
  expectedContribution: number;
  expectedRecognition?: string;
  expectedRankScore: number;
  expectedPrizeEligibility: boolean;
  projectedTreeSize: number;
  projectedCampaignInfluence: number;
}

export interface SupporterImpactSummary {
  verifiedReferrals: number;
  signaturesInfluenced: number;
  volunteerInfluence: number;
  eventsAttended: number;
  campaignReach: number;
  estimatedSocialReach: number;
  campaignGoalContribution: number;
}

export interface SupporterGrowthPortalViewModel {
  supporterCode: string;
  supporter: Signer;
  campaign: Campaign;
  organization?: Organization;
  portal: SupporterGrowthPortalModel;
  wallet: GrowthWallet;
  snapshot?: GrowthSupporterSnapshot;
  recognition?: RecognitionEvaluationResult;
  currentLevel?: RecognitionLevelConfiguration;
  nextLevel?: RecognitionLevelConfiguration;
  progressPercentage: number;
  creditsRequired: number;
  remainingCreditsNeeded: number;
  remainingReferralsNeeded: number;
  estimatedPromotionDate?: string;
  tree: RecognitionTreeModel;
  timeline: GrowthTimelineRecord[];
  achievements: AchievementQualification[];
  prizes: PrizeQualificationResult[];
  contributionAudits: ContributionCalculationAudit[];
  rewardCenter: RewardCenterModel;
  leaderboards: SupporterLeaderboardSummary[];
  projection: SupporterGrowthProjection;
  impact: SupporterImpactSummary;
}

export interface SupporterGrowthPortalResolveInput {
  supporterCode: string;
  campaigns: Campaign[];
  signers: Signer[];
  organization?: Organization;
  runtime: GrowthRuntimeState;
  baseUrl: string;
}

export interface SupporterGrowthPortalResolveResult {
  status: "ready" | "not_found";
  portal?: SupporterGrowthPortalViewModel;
  message?: string;
}
