import type { GrowthEventIntent } from "../events";
import type { AdvancementLevelConfig } from "../advancement/types";
import type { ContributionRuleViolation, SupporterGrowthAccount } from "../contributions/types";

export type AchievementPeriodKind =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "campaign_duration"
  | "festival_campaign"
  | "election_campaign"
  | "awareness_drive"
  | "custom";

export type AchievementSelectionCriteria =
  | "top_points"
  | "top_verified_referrals"
  | "top_conversions"
  | "fastest_to_level"
  | "most_active_volunteer"
  | "highest_campaign_influence"
  | "highest_contribution";

export interface AchievementPeriodConfig {
  id: string;
  label: string;
  kind: AchievementPeriodKind;
  startAt: string;
  endAt: string;
  targetLevelId?: string;
  minimumPoints: number;
  minimumVerifiedReferrals: number;
  minimumConversions: number;
  prizeDescription: string;
  numberOfWinners: number;
  selectionCriteria: AchievementSelectionCriteria;
  active: boolean;
}

export interface AchievementQualification {
  id: string;
  periodId: string;
  supporterId: string;
  campaignId: string;
  rank: number;
  selectionCriteria: AchievementSelectionCriteria;
  prizeDescription: string;
  qualifiedAt: string;
  duplicateKey: string;
}

export interface AchievementEvaluationInput {
  period: AchievementPeriodConfig;
  accounts: SupporterGrowthAccount[];
  levels: AdvancementLevelConfig[];
  asOf?: string;
  existingQualificationKeys?: string[];
}

export interface AchievementEvaluationResult {
  periodId: string;
  qualifications: AchievementQualification[];
  events: GrowthEventIntent[];
  violations: ContributionRuleViolation[];
}
