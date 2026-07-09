import type { GrowthRuleViolation } from "../credits/types";
import type { GrowthEventIntent } from "../events";
import type {
  ContributionDistributionConfiguration,
  PromotionRoundConfiguration
} from "../promotion/types";
import type { GrowthWallet } from "../wallet/types";

export type RecognitionEligibilityPeriod =
  | "all_time"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "campaign_duration"
  | "custom";

export interface RecognitionLevelConfiguration {
  id: string;
  order: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  badge?: string;
  certificate: boolean;
  privileges: string[];
  prizeEligibility: boolean;
  visible?: boolean;
  minimumWalletCredits?: number;
  promotionWalletCredits?: number;
  promotionThreshold?: number;
  creditsDeducted?: number;
  carryForwardPercentage?: number;
  resetPercentage?: number;
  contributionFormula?: string;
  roundFormula?: string;
  promotionCreditsRequired: number;
  promotionPercentage: number;
  roundStrategy: PromotionRoundConfiguration;
  distributionStrategy: ContributionDistributionConfiguration;
  eligibilityPeriod: RecognitionEligibilityPeriod;
  effectiveStartAt?: string;
  effectiveEndAt?: string;
}

export interface RecognitionEngineConfiguration {
  enabled: boolean;
  levels: RecognitionLevelConfiguration[];
}

export interface RecognitionEvaluationInput {
  wallet: GrowthWallet;
  configuration: RecognitionEngineConfiguration;
  currentLevelId?: string;
  asOf?: string;
}

export interface RecognitionEvaluationResult {
  supporterId: string;
  campaignId: string;
  currentLevel?: RecognitionLevelConfiguration;
  nextLevel?: RecognitionLevelConfiguration;
  promotionReady: boolean;
  progressPercentage: number;
  events: GrowthEventIntent[];
  violations: GrowthRuleViolation[];
}
