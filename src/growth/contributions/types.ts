import type { GrowthEventIntent } from "../events";

export const CONTRIBUTION_ENGINE_LIMITS = {
  minLevels: 1,
  maxLevels: 7
} as const;

export type ContributionPointActivityType =
  | "verified_referral"
  | "campaign_sign_completion"
  | "volunteer_participation"
  | "event_attendance"
  | "daily_engagement"
  | "campaign_milestone"
  | "donation"
  | "future_activity";

export interface ContributionLevelConfig {
  level: number;
  percentage: number;
  enabled?: boolean;
}

export interface PointContributionSettings {
  enabled: boolean;
  levels: ContributionLevelConfig[];
  maxContributionCap?: number;
  eligibleActivities: ContributionPointActivityType[];
  effectiveStartAt?: string;
  effectiveEndAt?: string;
}

export interface ContributionActivity {
  id: string;
  type: ContributionPointActivityType;
  campaignId: string;
  supporterId: string;
  points: number;
  occurredAt: string;
  sourceEventId?: string;
  duplicateKey?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SupporterGrowthAccount {
  supporterId: string;
  campaignId: string;
  referralCode?: string;
  parentReferralCode?: string;
  currentBalance: number;
  lifetimeEarnedPoints: number;
  lifetimeContributedPoints: number;
  receivedContributionPoints: number;
  verifiedReferrals: number;
  conversions: number;
  volunteerParticipations: number;
  campaignParticipations: number;
  currentLevelId?: string;
  lastCalculatedAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ContributionDistribution {
  id: string;
  activityId: string;
  campaignId: string;
  fromSupporterId: string;
  toSupporterId: string;
  fromReferralCode?: string;
  toReferralCode?: string;
  level: number;
  percentage: number;
  points: number;
  capped: boolean;
}

export interface ContributionBalanceChange {
  supporterId: string;
  previousBalance: number;
  earnedPoints: number;
  contributedPoints: number;
  receivedContributionPoints: number;
  currentBalance: number;
}

export interface ContributionRuleViolation {
  code:
    | "invalid_configuration"
    | "inactive_window"
    | "ineligible_activity"
    | "duplicate_calculation"
    | "negative_points"
    | "negative_balance"
    | "self_contribution"
    | "circular_referral_chain"
    | "missing_account";
  message: string;
  severity: "info" | "warning" | "error";
}

export interface ContributionCalculationAudit {
  id: string;
  sourceActivity: ContributionActivity;
  earnedPoints: number;
  contributionDistribution: ContributionDistribution[];
  currentBalance: number;
  levelChange?: {
    fromLevelId?: string;
    toLevelId?: string;
  };
  prizeQualification?: string[];
  timestamp: string;
  campaignId: string;
  supporterId: string;
  duplicateKey: string;
  violations: ContributionRuleViolation[];
}

export interface ContributionEngineState {
  accounts: SupporterGrowthAccount[];
  existingAuditKeys?: string[];
}

export interface ContributionCalculationResult {
  applied: boolean;
  skippedReason?: string;
  activity: ContributionActivity;
  distribution: ContributionDistribution[];
  balanceChanges: ContributionBalanceChange[];
  audit: ContributionCalculationAudit;
  events: GrowthEventIntent[];
  violations: ContributionRuleViolation[];
}
