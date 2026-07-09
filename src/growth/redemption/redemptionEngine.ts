import { GrowthEventPriority, GrowthEventType, type GrowthEventIntent } from "../events";
import type { PrizeConfig } from "../prizes";
import {
  createCouponRecord,
  getWalletSpendableBalance,
  recalculateGrowthWalletBalance,
  type GrowthWallet
} from "../wallet";
import type {
  DigitalCouponRecord,
  RedemptionAuditEvent,
  RedemptionRecord,
  RedemptionStatus,
  RewardWishlistEntry
} from "./types";

function now() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function isDigitalReward(reward: PrizeConfig) {
  return reward.fulfillmentMode === "digital" || reward.fulfillmentMode === "future_api" || reward.fulfillmentMode === "membership";
}

function buildIntent(
  type: GrowthEventType,
  record: RedemptionRecord,
  metadata: Record<string, unknown> = {}
): GrowthEventIntent {
  return {
    type,
    priority: GrowthEventPriority.High,
    context: {
      campaignId: record.campaignId,
      supporterId: record.supporterId
    },
    metadata: {
      rewardId: record.rewardId,
      merchantId: record.merchantId,
      redemptionId: record.id,
      duplicateKey: record.dedupeKey,
      ...metadata
    }
  };
}

function getReservationExpiry(reservationMinutes?: number) {
  if (!reservationMinutes || reservationMinutes <= 0) return undefined;
  return new Date(Date.now() + reservationMinutes * 60_000).toISOString();
}

function updateWalletForStatus(wallet: GrowthWallet, nextStatus: RedemptionStatus, previousStatus?: RedemptionStatus, pointsCost = 0) {
  const balance = { ...wallet.balance };
  const releaseReserved =
    previousStatus === "reserved" || previousStatus === "approved" || previousStatus === "pending";
  const addReserved = nextStatus === "reserved" || nextStatus === "approved" || nextStatus === "pending";
  if (releaseReserved) balance.reservedCredits = Math.max(0, balance.reservedCredits - pointsCost);
  if (addReserved) balance.reservedCredits += pointsCost;
  if (nextStatus === "redeemed" || nextStatus === "completed") balance.redeemedCredits += pointsCost;
  if (nextStatus === "refunded") {
    balance.redeemedCredits = Math.max(0, balance.redeemedCredits - pointsCost);
    balance.bonusCredits += pointsCost;
  }
  return {
    ...wallet,
    balance: recalculateGrowthWalletBalance(balance),
    updatedAt: now()
  };
}

export function createRedemptionRuntimeState() {
  return {
    redemptions: [] as RedemptionRecord[],
    coupons: [] as DigitalCouponRecord[],
    wishlists: [] as RewardWishlistEntry[],
    redemptionAudits: [] as RedemptionAuditEvent[]
  };
}

export function reserveReward(options: {
  wallet: GrowthWallet;
  reward: PrizeConfig;
  supporterId: string;
  campaignId: string;
  existingRedemptions: RedemptionRecord[];
  dedupeKey: string;
}): {
  wallet: GrowthWallet;
  redemption?: RedemptionRecord;
  events: GrowthEventIntent[];
  audits: RedemptionAuditEvent[];
  skippedReason?: string;
} {
  const existing = options.existingRedemptions.find((item) => item.dedupeKey === options.dedupeKey);
  if (existing) {
    return {
      wallet: options.wallet,
      redemption: existing,
      events: [],
      audits: [],
      skippedReason: "Duplicate redemption blocked."
    };
  }
  const currentBalance = getWalletSpendableBalance(options.wallet);
  const pointsCost = options.reward.pointsRequired;
  const availability = options.reward.quantityAvailable ?? Number.POSITIVE_INFINITY;
  const consumed = options.existingRedemptions.filter(
    (item) => item.rewardId === options.reward.id && item.status !== "cancelled" && item.status !== "rejected" && item.status !== "expired"
  ).length;
  if (!options.reward.active) {
    return { wallet: options.wallet, events: [], audits: [], skippedReason: "Reward is inactive." };
  }
  if (availability <= consumed) {
    return { wallet: options.wallet, events: [], audits: [], skippedReason: "Reward is unavailable." };
  }
  if (currentBalance < pointsCost) {
    return { wallet: options.wallet, events: [], audits: [], skippedReason: "Insufficient wallet balance." };
  }
  const redemption: RedemptionRecord = {
    id: createId("redeem"),
    campaignId: options.campaignId,
    supporterId: options.supporterId,
    rewardId: options.reward.id,
    merchantId: options.reward.merchantId,
    status: "reserved",
    pointsCost,
    quantity: 1,
    reservedAt: now(),
    expiresAt: getReservationExpiry(options.reward.reservationTimeoutMinutes),
    dedupeKey: options.dedupeKey
  };
  const wallet = updateWalletForStatus(options.wallet, "reserved", undefined, pointsCost);
  return {
    wallet,
    redemption,
    events: [buildIntent(GrowthEventType.RewardReserved, redemption)],
    audits: [
      {
        id: createId("redemption-audit"),
        campaignId: options.campaignId,
        supporterId: options.supporterId,
        rewardId: options.reward.id,
        action: "reserved",
        createdAt: now(),
        dedupeKey: options.dedupeKey
      }
    ]
  };
}

export function transitionRedemption(options: {
  wallet: GrowthWallet;
  reward: PrizeConfig;
  redemption: RedemptionRecord;
  nextStatus: RedemptionStatus;
}): {
  wallet: GrowthWallet;
  redemption: RedemptionRecord;
  coupon?: DigitalCouponRecord;
  events: GrowthEventIntent[];
  audits: RedemptionAuditEvent[];
} {
  const timestamp = now();
  const previousStatus = options.redemption.status;
  const redemption: RedemptionRecord = {
    ...options.redemption,
    status: options.nextStatus,
    approvedAt: options.nextStatus === "approved" ? timestamp : options.redemption.approvedAt,
    redeemedAt: options.nextStatus === "redeemed" ? timestamp : options.redemption.redeemedAt,
    completedAt: options.nextStatus === "completed" ? timestamp : options.redemption.completedAt,
    cancelledAt: options.nextStatus === "cancelled" ? timestamp : options.redemption.cancelledAt,
    refundedAt: options.nextStatus === "refunded" ? timestamp : options.redemption.refundedAt
  };
  const wallet = updateWalletForStatus(options.wallet, options.nextStatus, previousStatus, redemption.pointsCost);
  const coupon =
    (options.nextStatus === "approved" || options.nextStatus === "redeemed" || options.nextStatus === "completed") &&
    isDigitalReward(options.reward)
      ? createCouponRecord({
          campaignId: redemption.campaignId,
          supporterId: redemption.supporterId,
          rewardId: redemption.rewardId,
          merchantId: redemption.merchantId,
          expiresAt: options.reward.expiresAt,
          redemptionId: redemption.id,
          maxUsageCount: options.reward.maxUsageCount ?? 1
        })
      : undefined;
  const eventTypeMap: Partial<Record<RedemptionStatus, GrowthEventType>> = {
    approved: GrowthEventType.RewardApproved,
    rejected: GrowthEventType.RewardRejected,
    redeemed: GrowthEventType.RewardRedeemed,
    completed: GrowthEventType.RewardRedeemed,
    expired: GrowthEventType.RewardExpired,
    refunded: GrowthEventType.RewardRefunded,
    cancelled: GrowthEventType.RewardExpired
  };
  const eventType = eventTypeMap[options.nextStatus];
  return {
    wallet,
    redemption,
    coupon,
    events: eventType ? [buildIntent(eventType, redemption, coupon ? { couponId: coupon.id } : {})] : [],
    audits: [
      {
        id: createId("redemption-audit"),
        campaignId: redemption.campaignId,
        supporterId: redemption.supporterId,
        rewardId: redemption.rewardId,
        action: options.nextStatus,
        createdAt: timestamp,
        dedupeKey: `${redemption.dedupeKey}:${options.nextStatus}`
      }
    ]
  };
}

export function toggleRewardWishlist(options: {
  wishlists: RewardWishlistEntry[];
  campaignId: string;
  supporterId: string;
  rewardId: string;
}) {
  const existing = options.wishlists.find(
    (item) =>
      item.campaignId === options.campaignId && item.supporterId === options.supporterId && item.rewardId === options.rewardId
  );
  if (existing) {
    return {
      wishlists: options.wishlists.filter((item) => item.id !== existing.id),
      audit: {
        id: createId("redemption-audit"),
        campaignId: options.campaignId,
        supporterId: options.supporterId,
        rewardId: options.rewardId,
        action: "wishlist_removed" as const,
        createdAt: now(),
        dedupeKey: `${options.campaignId}:${options.supporterId}:${options.rewardId}:wishlist-removed`
      }
    };
  }
  const next: RewardWishlistEntry = {
    id: createId("wishlist"),
    campaignId: options.campaignId,
    supporterId: options.supporterId,
    rewardId: options.rewardId,
    createdAt: now()
  };
  return {
    wishlists: [next, ...options.wishlists],
    audit: {
      id: createId("redemption-audit"),
      campaignId: options.campaignId,
      supporterId: options.supporterId,
      rewardId: options.rewardId,
      action: "wishlist_added" as const,
      createdAt: next.createdAt,
      dedupeKey: `${options.campaignId}:${options.supporterId}:${options.rewardId}:wishlist-added`
    }
  };
}