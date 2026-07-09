import type { GrowthEventIntent } from "../events";

export type GrowthCreditKind =
  | "growth"
  | "wallet"
  | "promotion"
  | "contribution"
  | "recognition";

export type GrowthActivityKind =
  | "referral_signup"
  | "verified_referral"
  | "campaign_signature"
  | "volunteer_activity"
  | "donation"
  | "attendance"
  | "share"
  | "survey"
  | "future_ai"
  | "future_business_os"
  | "custom";

export interface GrowthRuleViolation {
  code:
    | "invalid_configuration"
    | "disabled_engine"
    | "ineligible_activity"
    | "duplicate_calculation"
    | "negative_credits"
    | "negative_balance"
    | "circular_tree"
    | "self_distribution"
    | "missing_wallet";
  message: string;
  severity: "info" | "warning" | "error";
}

export interface GrowthCreditRule {
  id: string;
  activityKind: GrowthActivityKind;
  creditKind: GrowthCreditKind;
  enabled: boolean;
  credits: number;
  multiplier?: number;
  minimumCredits?: number;
  maximumCredits?: number;
  bonusMultiplier?: number;
  effectiveStartAt?: string;
  effectiveEndAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GrowthCreditActivity {
  id: string;
  kind: GrowthActivityKind;
  campaignId: string;
  supporterId: string;
  occurredAt: string;
  quantity?: number;
  sourceEventId?: string;
  duplicateKey?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GrowthCreditLedgerEntry {
  id: string;
  campaignId: string;
  supporterId: string;
  activityId: string;
  creditKind: GrowthCreditKind;
  credits: number;
  occurredAt: string;
  duplicateKey: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GrowthCreditEngineConfiguration {
  enabled: boolean;
  rules: GrowthCreditRule[];
}

export interface GrowthCreditCalculationInput {
  activity: GrowthCreditActivity;
  configuration: GrowthCreditEngineConfiguration;
  existingLedgerKeys?: string[];
}

export interface GrowthCreditCalculationResult {
  applied: boolean;
  activity: GrowthCreditActivity;
  ledger: GrowthCreditLedgerEntry[];
  totalCredits: number;
  events: GrowthEventIntent[];
  violations: GrowthRuleViolation[];
}
