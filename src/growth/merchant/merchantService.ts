import type { RedemptionRecord } from "../redemption";
import type { MerchantDashboardModel, MerchantRecord } from "./types";

function toPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function buildMerchantDashboardModel(options: {
  merchants: MerchantRecord[];
  redemptions: RedemptionRecord[];
  campaignLabels?: Record<string, string>;
  supporterLabels?: Record<string, string>;
}): MerchantDashboardModel {
  const { merchants, redemptions, campaignLabels = {}, supporterLabels = {} } = options;
  const merchantIds = new Set(merchants.map((merchant) => merchant.id));
  const relevantRedemptions = redemptions.filter(
    (redemption) => !redemption.merchantId || merchantIds.has(redemption.merchantId)
  );
  const issued = relevantRedemptions.filter((redemption) => redemption.status !== "cancelled").length;
  const redeemed = relevantRedemptions.filter(
    (redemption) => redemption.status === "redeemed" || redemption.status === "completed"
  ).length;
  const pending = relevantRedemptions.filter(
    (redemption) =>
      redemption.status === "pending" || redemption.status === "reserved" || redemption.status === "approved"
  ).length;
  const cancelled = relevantRedemptions.filter(
    (redemption) =>
      redemption.status === "cancelled" || redemption.status === "rejected" || redemption.status === "expired"
  ).length;

  const topCampaigns = Object.entries(
    relevantRedemptions.reduce<Record<string, { issued: number; redeemed: number }>>((items, redemption) => {
      const current = items[redemption.campaignId] ?? { issued: 0, redeemed: 0 };
      return {
        ...items,
        [redemption.campaignId]: {
          issued: current.issued + 1,
          redeemed:
            current.redeemed +
            (redemption.status === "redeemed" || redemption.status === "completed" ? 1 : 0)
        }
      };
    }, {})
  )
    .map(([campaignId, value]) => ({
      campaignId,
      campaignLabel: campaignLabels[campaignId] ?? campaignId,
      issued: value.issued,
      redeemed: value.redeemed
    }))
    .sort((left, right) => right.redeemed - left.redeemed || right.issued - left.issued)
    .slice(0, 5);

  const topSupporters = Object.entries(
    relevantRedemptions.reduce<Record<string, { redeemedCount: number; pointsBurned: number }>>((items, redemption) => {
      const current = items[redemption.supporterId] ?? { redeemedCount: 0, pointsBurned: 0 };
      return {
        ...items,
        [redemption.supporterId]: {
          redeemedCount:
            current.redeemedCount +
            (redemption.status === "redeemed" || redemption.status === "completed" ? 1 : 0),
          pointsBurned:
            current.pointsBurned +
            (redemption.status === "redeemed" || redemption.status === "completed"
              ? redemption.pointsCost
              : 0)
        }
      };
    }, {})
  )
    .map(([supporterId, value]) => ({
      supporterId,
      supporterLabel: supporterLabels[supporterId] ?? supporterId,
      redeemedCount: value.redeemedCount,
      pointsBurned: value.pointsBurned
    }))
    .sort((left, right) => right.pointsBurned - left.pointsBurned || right.redeemedCount - left.redeemedCount)
    .slice(0, 5);

  return {
    merchants,
    issued,
    redeemed,
    pending,
    cancelled,
    topCampaigns,
    topSupporters,
    redemptionRate: toPercent(redeemed, Math.max(1, issued))
  };
}