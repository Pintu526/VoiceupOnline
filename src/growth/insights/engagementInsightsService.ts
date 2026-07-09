import type { GrowthDashboardModel } from "../types";
import type { EngagementInsight } from "./types";

function peakDay(model: GrowthDashboardModel) {
  return model.analytics.trends.reduce(
    (best, point) => (point.signatures > best.signatures ? point : best),
    model.analytics.trends[0] ?? { label: "N/A", signatures: 0, referrals: 0 }
  );
}

function bestChannel(model: GrowthDashboardModel) {
  return model.analytics.channels.reduce(
    (best, channel) => (channel.count > best.count ? channel : best),
    model.analytics.channels[0] ?? { label: "Direct", count: 0, percentage: 0, channel: "direct" as const }
  );
}

export function buildEngagementInsights(model: GrowthDashboardModel): EngagementInsight[] {
  const bestDay = peakDay(model);
  const bestShareChannel = bestChannel(model);
  const trends = model.analytics.trends;
  const firstHalf = trends.slice(0, Math.floor(trends.length / 2));
  const secondHalf = trends.slice(Math.floor(trends.length / 2));
  const firstTotal = firstHalf.reduce((sum, point) => sum + point.signatures, 0);
  const secondTotal = secondHalf.reduce((sum, point) => sum + point.signatures, 0);
  const momentum = firstTotal === 0 ? 0 : Math.round(((secondTotal - firstTotal) / firstTotal) * 100);
  const avgInviteConversion = model.summary.referralSignatures === 0
    ? 0
    : Math.round((model.analytics.verifiedSupporters / model.summary.referralSignatures) * 100);

  return [
    {
      id: "insight-active-time",
      label: "Most Active Time",
      value: bestDay.label,
      detail: `${bestDay.signatures.toLocaleString()} supporters joined on this day.`
    },
    {
      id: "insight-best-channel",
      label: "Best Share Channel",
      value: bestShareChannel.label,
      detail: `${bestShareChannel.percentage}% of supporter acquisition came from this channel.`
    },
    {
      id: "insight-invite-conversion",
      label: "Average Invite Conversion",
      value: `${Math.max(0, avgInviteConversion)}%`,
      detail: "Derived from verified supporters and referral signatures."
    },
    {
      id: "insight-momentum",
      label: "Momentum Trend",
      value: `${momentum >= 0 ? "+" : ""}${momentum}%`,
      detail: "Comparison between the latest and previous trend window."
    }
  ];
}
