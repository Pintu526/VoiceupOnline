import type { MerchantCategory, MerchantRecord } from "../merchant";
import type { PrizeConfig } from "../prizes";
import type { DigitalCouponRecord, RedemptionRecord, RewardWishlistEntry } from "../redemption";
import type { GrowthWallet } from "../wallet";

export interface RewardCatalogFilters {
  categories: MerchantCategory[];
  search: string;
  showTrending: boolean;
  showPopular: boolean;
  showRecommended: boolean;
  showRecentlyAdded: boolean;
}

export interface RewardCatalogEntry extends PrizeConfig {
  merchant?: MerchantRecord;
  remainingQuantity: number;
  redemptionCount: number;
  wishlisted: boolean;
  eligible: boolean;
  reason?: string;
}

export interface RewardRedemptionAnalytics {
  rewardPopularity: Array<{ rewardId: string; label: string; redemptionCount: number }>;
  walletBurnRate: number;
  redemptionRate: number;
  averageWalletBalance: number;
  topRedeemers: Array<{ supporterId: string; count: number; pointsBurned: number }>;
  mostDesiredRewards: Array<{ rewardId: string; label: string; wishlistCount: number }>;
  projectedRedemptionVolume30d: number;
}

export interface RewardCenterModel {
  catalog: RewardCatalogEntry[];
  categories: MerchantCategory[];
  trending: RewardCatalogEntry[];
  popular: RewardCatalogEntry[];
  recommended: RewardCatalogEntry[];
  recentlyAdded: RewardCatalogEntry[];
  myRewards: RewardCatalogEntry[];
  myCoupons: DigitalCouponRecord[];
  myRedemptions: RedemptionRecord[];
  wishlist: RewardWishlistEntry[];
  wallet: GrowthWallet;
  analytics: RewardRedemptionAnalytics;
}