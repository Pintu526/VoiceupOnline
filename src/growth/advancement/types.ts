import type { GrowthEventIntent } from "../events";
import type { ContributionRuleViolation, SupporterGrowthAccount } from "../contributions/types";

export type AdvancementEligibilityPeriod =
  | "all_time"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "campaign_duration"
  | "custom";

export interface AdvancementLevelConfig {
  id: string;
  order: number;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  minimumPoints: number;
  minimumVerifiedReferrals: number;
  volunteerRequired?: boolean;
  minimumCampaignParticipations?: number;
  eligibilityPeriod: AdvancementEligibilityPeriod;
  effectiveStartAt?: string;
  effectiveEndAt?: string;
  certificateEligible: boolean;
  badge?: string;
  specialPrivileges: string[];
  prizeEligible: boolean;
  prizeIds?: string[];
}

export interface AdvancementConfiguration {
  enabled: boolean;
  levels: AdvancementLevelConfig[];
}

export interface AdvancementLevelChange {
  supporterId: string;
  fromLevelId?: string;
  toLevelId?: string;
  changed: boolean;
  reason: string;
}

export interface AdvancementEvaluationInput {
  account: SupporterGrowthAccount;
  configuration: AdvancementConfiguration;
  previousLevelId?: string;
  asOf?: string;
}

export interface AdvancementEvaluationResult {
  supporterId: string;
  currentLevel?: AdvancementLevelConfig;
  nextLevel?: AdvancementLevelConfig;
  levelChange?: AdvancementLevelChange;
  certificateEligible: boolean;
  badge?: string;
  specialPrivileges: string[];
  prizeEligible: boolean;
  prizeIds: string[];
  events: GrowthEventIntent[];
  violations: ContributionRuleViolation[];
}
