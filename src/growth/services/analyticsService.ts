import type { Signer } from "../../types";
import { getValidSignedAt } from "../../lib";
import type {
  GrowthAnalyticsDomainModel,
  GrowthChannel,
  GrowthChannelMetric,
  GrowthStage,
  GrowthTrendPoint,
  ReferralDomainModel
} from "../types";
import { getGrowthChannel } from "./referralService";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgo(dateValue: string) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return 9999;
  return Math.floor((Date.now() - time) / 86400_000);
}

function getGrowthStage(totalSupporters: number, referralRate: number): GrowthStage {
  if (totalSupporters >= 10000 || referralRate >= 35) return "Movement";
  if (totalSupporters >= 1000 || referralRate >= 20) return "Scale";
  if (totalSupporters >= 100 || referralRate >= 8) return "Traction";
  return "Launch";
}

function getTrendLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildTrends(signers: Signer[]): GrowthTrendPoint[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (13 - index));
    const dayKey = date.toISOString().slice(0, 10);
    const daySigners = signers.filter((signer) => getValidSignedAt(signer)?.slice(0, 10) === dayKey);
    return {
      label: getTrendLabel(date),
      signatures: daySigners.length,
      referrals: daySigners.filter((signer) => getGrowthChannel(signer) === "referral").length
    };
  });
}

function buildChannelMetrics(signers: Signer[]): GrowthChannelMetric[] {
  const labels: Record<GrowthChannel, string> = {
    direct: "Direct",
    referral: "Referral",
    field: "Field",
    scan: "Scan"
  };
  const counts = signers.reduce<Record<GrowthChannel, number>>(
    (items, signer) => ({
      ...items,
      [getGrowthChannel(signer)]: items[getGrowthChannel(signer)] + 1
    }),
    { direct: 0, referral: 0, field: 0, scan: 0 }
  );

  return (Object.keys(counts) as GrowthChannel[]).map((channel) => ({
    channel,
    label: labels[channel],
    count: counts[channel],
    percentage: signers.length ? Math.round((counts[channel] / signers.length) * 100) : 0
  }));
}

export function buildGrowthAnalytics(
  signers: Signer[],
  referralDomain: ReferralDomainModel
): GrowthAnalyticsDomainModel {
  const verifiedSupporters = signers.filter((signer) => signer.status === "verified" || signer.otpVerified).length;
  const conversionRate = signers.length ? Math.round((verifiedSupporters / signers.length) * 100) : 0;
  const newSupporters7d = signers.filter((signer) => {
    const signedAt = getValidSignedAt(signer);
    return signedAt ? daysAgo(signedAt) <= 7 : false;
  }).length;
  const growthScore = Math.min(
    100,
    Math.round(
      Math.min(30, signers.length / 10) +
        Math.min(25, referralDomain.referralRate) +
        Math.min(25, conversionRate / 2) +
        Math.min(20, newSupporters7d * 2)
    )
  );

  return {
    stage: getGrowthStage(signers.length, referralDomain.referralRate),
    growthScore,
    newSupporters7d,
    verifiedSupporters,
    conversionRate,
    trends: buildTrends(signers),
    channels: buildChannelMetrics(signers)
  };
}
