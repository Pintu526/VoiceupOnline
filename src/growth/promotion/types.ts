import type { GrowthRuleViolation } from "../credits/types";
import type { GrowthEventIntent } from "../events";

export type PromotionRoundStrategy = "level_number" | "fixed" | "custom";
export type ContributionDistributionFormula = "equal" | "percentage" | "progressive" | "custom";
export type ContributionDistributionStrategy = "direct_tree" | "recognition_tree" | "custom";

export interface PromotionRoundConfiguration {
  strategy: PromotionRoundStrategy;
  fixedRounds?: number;
  customRounds?: number[];
}

export interface ContributionDistributionConfiguration {
  enabled: boolean;
  depth: number;
  maximumLevels: number;
  contributionPercentage: number;
  strategy: ContributionDistributionStrategy;
  formula: ContributionDistributionFormula;
  customPercentages?: number[];
  maximumDailyContribution?: number;
  maximumMonthlyContribution?: number;
  roundFormula?: string;
  promotionFormula?: string;
  distributionFormula?: string;
}

export interface PromotionEngineConfiguration {
  enabled: boolean;
  roundConfiguration: PromotionRoundConfiguration;
  distributionConfiguration: ContributionDistributionConfiguration;
}

export interface PromotionCandidate {
  campaignId: string;
  supporterId: string;
  currentLevelId?: string;
  targetLevelId: string;
  targetLevelOrder: number;
  promotionCreditsAvailable: number;
  promotionCreditsRequired: number;
  promotionPercentage: number;
  occurredAt: string;
  duplicateKey?: string;
}

export interface PromotionRoundAllocation {
  round: number;
  percentage: number;
  credits: number;
}

export interface PromotionEvaluationResult {
  qualified: boolean;
  candidate: PromotionCandidate;
  promotionPool: number;
  walletRetainedCredits: number;
  rounds: number[];
  allocations: PromotionRoundAllocation[];
  events: GrowthEventIntent[];
  violations: GrowthRuleViolation[];
}
