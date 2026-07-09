import { GrowthEventPriority, GrowthEventType } from "../events";
import type { GrowthCreditKind } from "../credits/types";
import type { DigitalCouponRecord } from "../redemption";
import type {
  CouponCreationInput,
  GrowthWallet,
  GrowthWalletBalance,
  GrowthWalletHistoryEntry,
  GrowthWalletUpdateInput,
  GrowthWalletUpdateResult
} from "./types";

function now() {
  return new Date().toISOString();
}

function roundCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function emptyBalance(): GrowthWalletBalance {
  return {
    walletCredits: 0,
    promotionCredits: 0,
    contributionCredits: 0,
    recognitionCredits: 0,
    bonusCredits: 0,
    redeemedCredits: 0,
    reservedCredits: 0,
    expiredCredits: 0,
    totalEarned: 0,
    totalContributed: 0,
    pendingPromotion: 0,
    lifetimeGrowth: 0,
    forecastCredits: 0,
    currentBalance: 0
  };
}

export function recalculateGrowthWalletBalance(balance: GrowthWalletBalance): GrowthWalletBalance {
  const currentBalance = roundCredits(
    balance.walletCredits +
      balance.promotionCredits +
      balance.contributionCredits +
      balance.recognitionCredits +
      balance.bonusCredits -
      balance.reservedCredits -
      balance.redeemedCredits -
      balance.expiredCredits
  );
  return {
    ...balance,
    pendingPromotion: balance.promotionCredits,
    forecastCredits: currentBalance + balance.pendingPromotion,
    currentBalance
  };
}

export function getWalletSpendableBalance(wallet: GrowthWallet) {
  return Math.max(0, recalculateGrowthWalletBalance(wallet.balance).currentBalance);
}

function addToBalance(balance: GrowthWalletBalance, creditKind: GrowthCreditKind, credits: number): GrowthWalletBalance {
  const nextBalance = { ...balance };
  if (creditKind === "wallet") nextBalance.walletCredits = roundCredits(nextBalance.walletCredits + credits);
  if (creditKind === "promotion") nextBalance.promotionCredits = roundCredits(nextBalance.promotionCredits + credits);
  if (creditKind === "contribution") nextBalance.contributionCredits = roundCredits(nextBalance.contributionCredits + credits);
  if (creditKind === "recognition") nextBalance.recognitionCredits = roundCredits(nextBalance.recognitionCredits + credits);
  if (creditKind === "growth") nextBalance.walletCredits = roundCredits(nextBalance.walletCredits + credits);

  nextBalance.totalEarned = roundCredits(nextBalance.totalEarned + credits);
  nextBalance.lifetimeGrowth = roundCredits(nextBalance.lifetimeGrowth + credits);
  return recalculateGrowthWalletBalance(nextBalance);
}

export function createGrowthWallet(campaignId: string, supporterId: string): GrowthWallet {
  return {
    id: `growth-wallet-${campaignId}-${supporterId}`,
    campaignId,
    supporterId,
    balance: recalculateGrowthWalletBalance(emptyBalance()),
    history: [],
    updatedAt: now()
  };
}

export function createCouponRecord(input: CouponCreationInput): DigitalCouponRecord {
  const verificationId = `verify-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    id: `coupon-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    campaignId: input.campaignId,
    supporterId: input.supporterId,
    rewardId: input.rewardId,
    merchantId: input.merchantId,
    status: "active",
    qrPayload: `${input.redemptionId}:${verificationId}`,
    barcodePlaceholder: `BAR-${verificationId.slice(-8).toUpperCase()}`,
    verificationId,
    expiresAt: input.expiresAt,
    usageCount: 0,
    maxUsageCount: input.maxUsageCount ?? 1,
    redemptionId: input.redemptionId
  };
}

export function applyGrowthCreditsToWallet(input: GrowthWalletUpdateInput): GrowthWalletUpdateResult {
  const existingKeys = new Set(input.existingHistoryKeys ?? input.wallet.history.map((entry) => entry.duplicateKey));
  let nextBalance = { ...input.wallet.balance };

  const history = input.ledger.reduce<GrowthWalletHistoryEntry[]>((items, entry) => {
    if (existingKeys.has(entry.duplicateKey)) return items;
    const balanceAfter = addToBalance(nextBalance, entry.creditKind, entry.credits);
    nextBalance = balanceAfter;
    existingKeys.add(entry.duplicateKey);
    return [
      ...items,
      {
        id: `wallet-history-${entry.id}`,
        campaignId: entry.campaignId,
        supporterId: entry.supporterId,
        creditKind: entry.creditKind,
        delta: entry.credits,
        balanceAfter,
        sourceActivityId: entry.activityId,
        duplicateKey: entry.duplicateKey,
        timestamp: entry.occurredAt,
        metadata: entry.metadata
      }
    ];
  }, []);

  const wallet = {
    ...input.wallet,
    balance: nextBalance,
    history: [...input.wallet.history, ...history],
    updatedAt: history[history.length - 1]?.timestamp ?? input.wallet.updatedAt
  };

  return {
    wallet,
    history,
    events: history.map((entry) => ({
      type: GrowthEventType.GrowthWalletUpdated,
      priority: GrowthEventPriority.Normal,
      context: {
        campaignId: entry.campaignId,
        supporterId: entry.supporterId
      },
      metadata: {
        creditKind: entry.creditKind,
        delta: entry.delta,
        walletCredits: entry.balanceAfter.walletCredits,
        promotionCredits: entry.balanceAfter.promotionCredits,
        contributionCredits: entry.balanceAfter.contributionCredits,
        recognitionCredits: entry.balanceAfter.recognitionCredits,
        duplicateKey: entry.duplicateKey
      }
    })),
    violations: []
  };
}
