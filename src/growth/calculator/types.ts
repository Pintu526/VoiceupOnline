import type { ContributionDistributionConfiguration } from "../promotion/types";
import type { RecognitionLevelConfiguration } from "../recognition/types";

export interface CampaignGrowthCalculatorInput {
  campaignDurationDays: number;
  participants: number;
  verificationRate: number;
  averageReferrals: number;
  promotionRules: RecognitionLevelConfiguration[];
  contributionRules: ContributionDistributionConfiguration;
}

export interface CampaignGrowthCalculatorOutput {
  projectedReach: number;
  projectedCredits: number;
  projectedPromotions: number;
  projectedContribution: number;
  projectedLeaderboardSize: number;
  projectedPrizeBudget: number;
  projectedViralMultiplier: number;
}

export interface SupporterGrowthCalculatorInput {
  invitedSupporters: number;
  expectedVerificationRate: number;
  targetRecognitionLevel?: RecognitionLevelConfiguration;
  averageCreditsPerVerifiedSupporter: number;
}

export interface SupporterGrowthCalculatorOutput {
  expectedWallet: number;
  expectedPromotion: number;
  expectedContribution: number;
  expectedRecognition?: string;
  expectedRankScore: number;
  expectedPrizeEligibility: boolean;
}
