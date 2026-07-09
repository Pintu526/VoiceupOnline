import type { Campaign } from "../../types";
import { normalizeCampaignGrowthConfiguration } from "../configuration";
import type { GrowthRuntimeState } from "../lifecycle";
import { createGrowthWallet, type GrowthWallet } from "../wallet";
import { createTimelineRecordFromEvent } from "../timeline";
import {
  reserveReward,
  toggleRewardWishlist,
  transitionRedemption,
  type RedemptionRecord,
  type RedemptionStatus
} from "../redemption";

export type RewardRuntimeAction =
  | { type: "reserve"; rewardId: string; campaignId: string; supporterId: string; dedupeKey: string }
  | { type: "wishlist"; rewardId: string; campaignId: string; supporterId: string }
  | { type: "approve"; redemptionId: string; campaignId: string; supporterId: string }
  | { type: "reject"; redemptionId: string; campaignId: string; supporterId: string }
  | { type: "redeem"; redemptionId: string; campaignId: string; supporterId: string }
  | { type: "complete"; redemptionId: string; campaignId: string; supporterId: string }
  | { type: "expire"; redemptionId: string; campaignId: string; supporterId: string }
  | { type: "cancel"; redemptionId: string; campaignId: string; supporterId: string }
  | { type: "refund"; redemptionId: string; campaignId: string; supporterId: string };

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getWallet(runtime: GrowthRuntimeState, campaignId: string, supporterId: string): GrowthWallet {
  return (
    runtime.wallets.find((wallet) => wallet.campaignId === campaignId && wallet.supporterId === supporterId) ??
    createGrowthWallet(campaignId, supporterId)
  );
}

function upsertWallet(wallets: GrowthWallet[], nextWallet: GrowthWallet) {
  const exists = wallets.some((wallet) => wallet.id === nextWallet.id);
  return exists ? wallets.map((wallet) => (wallet.id === nextWallet.id ? nextWallet : wallet)) : [...wallets, nextWallet];
}

function upsertRedemption(redemptions: RedemptionRecord[], nextRedemption: RedemptionRecord) {
  const exists = redemptions.some((redemption) => redemption.id === nextRedemption.id);
  return exists
    ? redemptions.map((redemption) => (redemption.id === nextRedemption.id ? nextRedemption : redemption))
    : [nextRedemption, ...redemptions];
}

function resolveTransitionStatus(action: RewardRuntimeAction): RedemptionStatus | null {
  if (action.type === "approve") return "approved";
  if (action.type === "reject") return "rejected";
  if (action.type === "redeem") return "redeemed";
  if (action.type === "complete") return "completed";
  if (action.type === "expire") return "expired";
  if (action.type === "cancel") return "cancelled";
  if (action.type === "refund") return "refunded";
  return null;
}

function appendTimeline(runtime: GrowthRuntimeState, eventIntents: GrowthRuntimeState["eventIntents"]) {
  return eventIntents.reduce(
    (records, intent) =>
      createTimelineRecordFromEvent({
        records,
        intent
      }).records,
    runtime.timeline
  );
}

export function expireTimedOutReservations(runtime: GrowthRuntimeState, campaign: Campaign): GrowthRuntimeState {
  const config = normalizeCampaignGrowthConfiguration(campaign);
  let nextRuntime = runtime;
  const expired = runtime.redemptions.filter(
    (redemption) =>
      (redemption.status === "reserved" || redemption.status === "approved" || redemption.status === "pending") &&
      redemption.expiresAt &&
      new Date(redemption.expiresAt).getTime() <= Date.now()
  );
  for (const redemption of expired) {
    const reward = config.rewards.find((item) => item.id === redemption.rewardId);
    if (!reward) continue;
    const wallet = getWallet(nextRuntime, redemption.campaignId, redemption.supporterId);
    const result = transitionRedemption({
      wallet,
      reward,
      redemption,
      nextStatus: "expired"
    });
    nextRuntime = {
      ...nextRuntime,
      wallets: upsertWallet(nextRuntime.wallets, result.wallet),
      redemptions: upsertRedemption(nextRuntime.redemptions, result.redemption),
      coupons: result.coupon ? [result.coupon, ...nextRuntime.coupons] : nextRuntime.coupons,
      redemptionAudits: [result.audits[0], ...nextRuntime.redemptionAudits],
      eventIntents: [...nextRuntime.eventIntents, ...result.events],
      timeline: appendTimeline({ ...nextRuntime, eventIntents: result.events }, result.events),
      updatedAt: new Date().toISOString()
    };
  }
  return nextRuntime;
}

export function applyRewardRuntimeAction(options: {
  runtime: GrowthRuntimeState;
  campaign: Campaign;
  action: RewardRuntimeAction;
}): { runtime: GrowthRuntimeState; message: string } {
  const runtime = expireTimedOutReservations(options.runtime, options.campaign);
  const config = normalizeCampaignGrowthConfiguration(options.campaign);
  if (options.action.type === "wishlist") {
    const result = toggleRewardWishlist({
      wishlists: runtime.wishlists,
      campaignId: options.action.campaignId,
      supporterId: options.action.supporterId,
      rewardId: options.action.rewardId
    });
    return {
      runtime: {
        ...runtime,
        wishlists: result.wishlists,
        redemptionAudits: [result.audit, ...runtime.redemptionAudits],
        updatedAt: new Date().toISOString()
      },
      message: "Wishlist updated."
    };
  }

  if (options.action.type === "reserve") {
    const reserveAction = options.action;
    const reward = config.rewards.find((item) => item.id === reserveAction.rewardId);
    if (!reward) return { runtime, message: "Reward not found." };
    const wallet = getWallet(runtime, reserveAction.campaignId, reserveAction.supporterId);
    const result = reserveReward({
      wallet,
      reward,
      supporterId: reserveAction.supporterId,
      campaignId: reserveAction.campaignId,
      existingRedemptions: runtime.redemptions,
      dedupeKey: reserveAction.dedupeKey
    });
    if (!result.redemption) return { runtime, message: result.skippedReason ?? "Reservation unavailable." };
    return {
      runtime: {
        ...runtime,
        wallets: upsertWallet(runtime.wallets, result.wallet),
        redemptions: upsertRedemption(runtime.redemptions, result.redemption),
        redemptionAudits: [...result.audits, ...runtime.redemptionAudits],
        eventIntents: [...runtime.eventIntents, ...result.events],
        timeline: appendTimeline({ ...runtime, eventIntents: result.events }, result.events),
        updatedAt: new Date().toISOString()
      },
      message: "Reward reserved."
    };
  }

  const transitionAction = options.action;
  const transitionStatus = resolveTransitionStatus(transitionAction);
  if (!transitionStatus) return { runtime, message: "Unsupported reward action." };
  if (!("redemptionId" in transitionAction)) return { runtime, message: "Unsupported reward action." };
  const redemption = runtime.redemptions.find((item) => item.id === transitionAction.redemptionId);
  if (!redemption) return { runtime, message: "Redemption not found." };
  const reward = config.rewards.find((item) => item.id === redemption.rewardId);
  if (!reward) return { runtime, message: "Reward not found." };
  const wallet = getWallet(runtime, redemption.campaignId, redemption.supporterId);
  const result = transitionRedemption({
    wallet,
    reward,
    redemption,
    nextStatus: transitionStatus
  });
  const nextRedemption = result.coupon ? { ...result.redemption, couponId: result.coupon.id } : result.redemption;
  return {
    runtime: {
      ...runtime,
      wallets: upsertWallet(runtime.wallets, result.wallet),
      redemptions: upsertRedemption(runtime.redemptions, nextRedemption),
      coupons: result.coupon ? [result.coupon, ...runtime.coupons.filter((coupon) => coupon.id !== result.coupon?.id)] : runtime.coupons,
      redemptionAudits: [...result.audits, ...runtime.redemptionAudits],
      eventIntents: [...runtime.eventIntents, ...result.events],
      timeline: appendTimeline({ ...runtime, eventIntents: result.events }, result.events),
      updatedAt: new Date().toISOString()
    },
    message: `${transitionStatus[0].toUpperCase()}${transitionStatus.slice(1)} completed.`
  };
}