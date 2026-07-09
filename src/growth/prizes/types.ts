import type { GrowthEventIntent } from "../events";
import type { AchievementQualification } from "../achievements/types";
import type { ContributionRuleViolation } from "../contributions/types";

export type PrizeType =
  | "voucher"
  | "coupon"
  | "gift"
  | "gift_voucher"
  | "certificate"
  | "discount"
  | "cashback"
  | "membership"
  | "experience"
  | "donation"
  | "digital_reward"
  | "physical_reward"
  | "medal"
  | "trophy"
  | "partner_coupon"
  | "gift_hamper"
  | "free_membership"
  | "special_recognition"
  | "premium_badge"
  | "future_merchant_reward"
  | "custom";

export interface PrizeConfig {
  id: string;
  type: PrizeType;
  label: string;
  description: string;
  pointsRequired: number;
  active: boolean;
  merchantRedemptionReady: boolean;
  merchantId?: string;
  categories: import("../merchant").MerchantCategory[];
  quantityAvailable?: number;
  expiresAt?: string;
  visibility: "public" | "supporter" | "admin";
  eligibilityRules: string[];
  imageUrls: string[];
  terms: string;
  featured?: boolean;
  trending?: boolean;
  popular?: boolean;
  recommended?: boolean;
  fulfillmentMode: "digital" | "physical" | "membership" | "experience" | "donation" | "future_api";
  reservationTimeoutMinutes?: number;
  maxUsageCount?: number;
  createdAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PrizeQualificationResult {
  id: string;
  prizeId: string;
  qualificationId: string;
  supporterId: string;
  campaignId: string;
  qualifiedAt: string;
  duplicateKey: string;
}

export interface PrizeEvaluationInput {
  qualifications: AchievementQualification[];
  prizes: PrizeConfig[];
  prizeIds?: string[];
  existingPrizeQualificationKeys?: string[];
}

export interface PrizeEvaluationResult {
  qualifications: PrizeQualificationResult[];
  events: GrowthEventIntent[];
  violations: ContributionRuleViolation[];
}
