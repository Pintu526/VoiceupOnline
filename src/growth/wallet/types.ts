import type { GrowthCreditLedgerEntry, GrowthRuleViolation } from "../credits/types";
import type { GrowthEventIntent } from "../events";

export interface GrowthWalletBalance {
  walletCredits: number;
  promotionCredits: number;
  contributionCredits: number;
  recognitionCredits: number;
  bonusCredits: number;
  redeemedCredits: number;
  reservedCredits: number;
  expiredCredits: number;
  totalEarned: number;
  totalContributed: number;
  pendingPromotion: number;
  lifetimeGrowth: number;
  forecastCredits: number;
  currentBalance: number;
}

export interface GrowthWalletHistoryEntry {
  id: string;
  campaignId: string;
  supporterId: string;
  creditKind: string;
  delta: number;
  balanceAfter: GrowthWalletBalance;
  sourceActivityId?: string;
  duplicateKey: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GrowthWallet {
  id: string;
  campaignId: string;
  supporterId: string;
  balance: GrowthWalletBalance;
  history: GrowthWalletHistoryEntry[];
  updatedAt: string;
}

export interface GrowthWalletUpdateInput {
  wallet: GrowthWallet;
  ledger: GrowthCreditLedgerEntry[];
  existingHistoryKeys?: string[];
}

export interface GrowthWalletUpdateResult {
  wallet: GrowthWallet;
  history: GrowthWalletHistoryEntry[];
  events: GrowthEventIntent[];
  violations: GrowthRuleViolation[];
}

export interface CouponCreationInput {
  campaignId: string;
  supporterId: string;
  rewardId: string;
  merchantId?: string;
  expiresAt?: string;
  redemptionId: string;
  maxUsageCount?: number;
}
