import { normalizeCampaignGrowthConfiguration } from "../configuration";
import type { MerchantCategory, MerchantRecord } from "../merchant";
import type { PrizeConfig } from "../prizes";
import type { DigitalCouponRecord, RedemptionRecord, RewardWishlistEntry } from "../redemption";
import type { GrowthWallet } from "../wallet";
import { getWalletSpendableBalance } from "../wallet";
import type { RewardCatalogEntry, RewardCenterModel, RewardRedemptionAnalytics } from "./types";

function byNewest<T extends { createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.createdAt ?? 0).getTime();
    return rightTime - leftTime;
  });
}

function isActiveRedemption(redemption: RedemptionRecord) {
  return redemption.status !== "cancelled" && redemption.status !== "rejected" && redemption.status !== "expired";
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function buildCatalog(options: {
  rewards: PrizeConfig[];
  merchants: MerchantRecord[];
  redemptions: RedemptionRecord[];
  wishlists: RewardWishlistEntry[];
  wallet: GrowthWallet;
  supporterId: string;
}): RewardCatalogEntry[] {
  const merchantById = new Map(options.merchants.map((merchant) => [merchant.id, merchant]));
  const spendableBalance = getWalletSpendableBalance(options.wallet);
  return options.rewards
    .filter((reward) => reward.active)
    .map((reward) => {
      const redemptionCount = options.redemptions.filter((item) => item.rewardId === reward.id && isActiveRedemption(item)).length;
      const remainingQuantity = Math.max(0, (reward.quantityAvailable ?? Number.POSITIVE_INFINITY) - redemptionCount);
      const wishlisted = options.wishlists.some(
        (item) => item.rewardId === reward.id && item.supporterId === options.supporterId
      );
      const eligible =
        spendableBalance >= reward.pointsRequired &&
        remainingQuantity > 0 &&
        (!reward.expiresAt || new Date(reward.expiresAt).getTime() > Date.now());
      let reason = "";
      if (!eligible) {
        if (spendableBalance < reward.pointsRequired) reason = "Need more wallet balance";
        else if (remainingQuantity <= 0) reason = "Currently unavailable";
        else if (reward.expiresAt && new Date(reward.expiresAt).getTime() <= Date.now()) reason = "Reward expired";
      }
      return {
        ...reward,
        merchant: reward.merchantId ? merchantById.get(reward.merchantId) : undefined,
        remainingQuantity,
        redemptionCount,
        wishlisted,
        eligible,
        reason: reason || undefined
      };
    });
}

function buildAnalytics(options: {
  catalog: RewardCatalogEntry[];
  redemptions: RedemptionRecord[];
  wishlists: RewardWishlistEntry[];
  wallets: GrowthWallet[];
}): RewardRedemptionAnalytics {
  const activeRedemptions = options.redemptions.filter(isActiveRedemption);
  const completedRedemptions = options.redemptions.filter(
    (item) => item.status === "redeemed" || item.status === "completed"
  );
  const popularity = options.catalog
    .map((reward) => ({ rewardId: reward.id, label: reward.label, redemptionCount: reward.redemptionCount }))
    .sort((left, right) => right.redemptionCount - left.redemptionCount)
    .slice(0, 5);
  const desired = options.catalog
    .map((reward) => ({
      rewardId: reward.id,
      label: reward.label,
      wishlistCount: options.wishlists.filter((item) => item.rewardId === reward.id).length
    }))
    .sort((left, right) => right.wishlistCount - left.wishlistCount)
    .slice(0, 5);
  const walletBalanceTotal = options.wallets.reduce((sum, wallet) => sum + wallet.balance.currentBalance, 0);
  const walletBurnRate = completedRedemptions.reduce((sum, item) => sum + item.pointsCost, 0);
  const topRedeemers = Object.entries(
    completedRedemptions.reduce<Record<string, { count: number; pointsBurned: number }>>((items, redemption) => {
      const current = items[redemption.supporterId] ?? { count: 0, pointsBurned: 0 };
      return {
        ...items,
        [redemption.supporterId]: {
          count: current.count + 1,
          pointsBurned: current.pointsBurned + redemption.pointsCost
        }
      };
    }, {})
  )
    .map(([supporterId, value]) => ({ supporterId, count: value.count, pointsBurned: value.pointsBurned }))
    .sort((left, right) => right.pointsBurned - left.pointsBurned || right.count - left.count)
    .slice(0, 5);
  return {
    rewardPopularity: popularity,
    walletBurnRate,
    redemptionRate: toPercent(completedRedemptions.length, Math.max(1, activeRedemptions.length)),
    averageWalletBalance: options.wallets.length === 0 ? 0 : Math.round(walletBalanceTotal / options.wallets.length),
    topRedeemers,
    mostDesiredRewards: desired,
    projectedRedemptionVolume30d: Math.max(completedRedemptions.length, completedRedemptions.length * 4)
  };
}

export function buildRewardCenterModel(options: {
  campaign: { growthConfiguration?: unknown };
  merchants: MerchantRecord[];
  redemptions: RedemptionRecord[];
  coupons: DigitalCouponRecord[];
  wishlists: RewardWishlistEntry[];
  wallet: GrowthWallet;
  supporterId: string;
  wallets?: GrowthWallet[];
}): RewardCenterModel {
  const config = normalizeCampaignGrowthConfiguration(options.campaign as never);
  const catalog = buildCatalog({
    rewards: config.rewards,
    merchants: options.merchants,
    redemptions: options.redemptions,
    wishlists: options.wishlists,
    wallet: options.wallet,
    supporterId: options.supporterId
  });
  const trending = catalog.filter((reward) => reward.trending).slice(0, 8);
  const popular = [...catalog].sort((left, right) => right.redemptionCount - left.redemptionCount).slice(0, 8);
  const recommended = catalog.filter((reward) => reward.recommended || (reward.eligible && reward.pointsRequired <= options.wallet.balance.currentBalance)).slice(0, 8);
  const recentlyAdded = byNewest(catalog).slice(0, 8);
  const myRewards = catalog.filter((reward) => options.redemptions.some((redemption) => redemption.rewardId === reward.id && redemption.supporterId === options.supporterId));
  const categories = Array.from(new Set(catalog.flatMap((reward) => reward.categories))).sort() as MerchantCategory[];
  return {
    catalog,
    categories,
    trending,
    popular,
    recommended,
    recentlyAdded,
    myRewards,
    myCoupons: options.coupons.filter((coupon) => coupon.supporterId === options.supporterId),
    myRedemptions: options.redemptions.filter((redemption) => redemption.supporterId === options.supporterId),
    wishlist: options.wishlists.filter((wishlist) => wishlist.supporterId === options.supporterId),
    wallet: options.wallet,
    analytics: buildAnalytics({
      catalog,
      redemptions: options.redemptions,
      wishlists: options.wishlists,
      wallets: options.wallets ?? [options.wallet]
    })
  };
}