import { normalizeCampaignGrowthConfiguration } from "../configuration";
import type { GrowthRuntimeState } from "../lifecycle";
import type { GrowthDashboardModel } from "../types";
import { buildDeterministicRecommendations } from "./recommendationEngine";
import type {
  AutomationTimelineItem,
  CampaignIntelligenceModel,
  GroupedNotifications,
  NotificationItem,
  SocialImpactSummary
} from "./types";

interface BuildCampaignIntelligenceModelOptions {
  model: GrowthDashboardModel;
  runtime?: GrowthRuntimeState;
  activeCampaignId?: string;
}

const DAY_MS = 86_400_000;

function toPercent(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function uniqueCount(values: string[]): number {
  return new Set(values.filter(Boolean)).size;
}

function daysAgo(timestamp: string): number {
  const at = new Date(timestamp).getTime();
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - at) / DAY_MS);
}

function trendDirection(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function mapKindToNotificationCategory(kind: string): NotificationItem["category"] {
  if (kind === "achievement") return "achievements";
  if (kind === "promotion") return "promotion";
  if (kind === "wallet") return "wallet";
  if (kind === "prize") return "rewards";
  if (kind === "recognition") return "recognition";
  if (kind === "contribution") return "leaderboard";
  if (kind === "credits") return "campaign_updates";
  return "announcements";
}

function mapKindToAutomationKind(kind: string): AutomationTimelineItem["kind"] {
  if (kind === "achievement") return "mission_completed";
  if (kind === "promotion") return "promotion";
  if (kind === "prize") return "reward";
  if (kind === "recognition") return "recognition";
  if (kind === "wallet") return "wallet_activity";
  if (kind === "contribution") return "contribution_distribution";
  return "milestone";
}

function buildGroupedNotifications(items: NotificationItem[]): GroupedNotifications {
  return items.reduce<GroupedNotifications>(
    (acc, item) => {
      const age = daysAgo(item.timestamp);
      if (item.unread) acc.unread.push(item);
      if (age <= 1) acc.today.push(item);
      else if (age <= 7) acc.thisWeek.push(item);
      else acc.older.push(item);
      return acc;
    },
    { unread: [], today: [], thisWeek: [], older: [] }
  );
}

function buildSocialImpact(model: GrowthDashboardModel, runtime?: GrowthRuntimeState): SocialImpactSummary {
  const supporterCount = model.summary.totalSupporters;
  const referralCount = model.summary.referralSignatures;
  const shareEvents = runtime?.timeline.filter((item) => item.kind === "source_activity" && item.title.toLowerCase().includes("share")) ?? [];
  const volunteerEvents = runtime?.timeline.filter((item) => item.title.toLowerCase().includes("volunteer")) ?? [];
  const countryCoverage = uniqueCount(model.ambassadors.profiles.map((item) => item.location.split(",").slice(-1)[0]?.trim() ?? ""));
  const stateCoverage = uniqueCount(model.ambassadors.profiles.map((item) => item.location.split(",")[0]?.trim() ?? ""));
  const districtCoverage = uniqueCount(model.ambassadors.profiles.map((item) => item.location));
  const reachMultiplier = 12;
  return {
    totalPeopleReached: supporterCount,
    totalShares: shareEvents.length,
    estimatedReach: supporterCount + shareEvents.length * reachMultiplier,
    volunteerHours: volunteerEvents.length * 2,
    districtCoverage,
    stateCoverage,
    countryCoverage,
    supportGrowth: model.analytics.newSupporters7d,
    referralTreeSize: model.referrals.nodes.length,
    communityInfluenceScore: Math.round((model.summary.growthScore + model.analytics.conversionRate + model.summary.referralRate) / 3)
  };
}

export function buildCampaignIntelligenceModel(options: BuildCampaignIntelligenceModelOptions): CampaignIntelligenceModel {
  const { model, runtime, activeCampaignId } = options;
  const campaign = model.scope.campaign;
  const config = normalizeCampaignGrowthConfiguration(campaign);
  const campaignTimeline = runtime?.timeline.filter((item) => !activeCampaignId || item.campaignId === activeCampaignId) ?? [];
  const recentTimeline = campaignTimeline.filter((item) => daysAgo(item.timestamp) <= 7);
  const previousTimeline = campaignTimeline.filter((item) => daysAgo(item.timestamp) > 7 && daysAgo(item.timestamp) <= 14);

  const activeSupporters7d = uniqueCount(recentTimeline.map((item) => item.supporterId ?? ""));
  const activeSupporters14d = uniqueCount(previousTimeline.map((item) => item.supporterId ?? ""));
  const weeklyGrowthDelta = activeSupporters7d - activeSupporters14d;

  const verificationRate = toPercent(
    model.summary.totalSupporters > 0
      ? (model.analytics.verifiedSupporters / model.summary.totalSupporters) * 100
      : 0
  );
  const shareEvents = campaignTimeline.filter((item) => item.kind === "source_activity" && item.title.toLowerCase().includes("share")).length;
  const shareConversion = toPercent(shareEvents > 0 ? (model.summary.referralSignatures / shareEvents) * 100 : model.summary.referralRate);
  const inactiveSupporters =
    runtime?.supporterSnapshots.filter((item) => (!activeCampaignId || item.campaignId === activeCampaignId) && daysAgo(item.updatedAt) > 14).length ?? 0;

  const recommendations = buildDeterministicRecommendations({
    weeklyGrowthDelta,
    inactiveSupporters,
    referralVelocity: model.summary.referralSignatures,
    shareConversion,
    verificationRate,
    volunteerHours: campaignTimeline.filter((item) => item.title.toLowerCase().includes("volunteer")).length * 2,
    weekendPerformanceGain: Math.max(0, Math.round(model.analytics.newSupporters7d * 0.15)),
    recognitionCoverage: toPercent(
      model.summary.totalSupporters > 0
        ? ((runtime?.recognition.length ?? 0) / model.summary.totalSupporters) * 100
        : 0
    )
  });

  const projectedSupporters30d = Math.max(
    model.summary.totalSupporters,
    Math.round(model.summary.totalSupporters + model.analytics.newSupporters7d * (30 / 7))
  );
  const targetGap = Math.max(0, (campaign?.goal ?? model.summary.totalSupporters) - model.summary.totalSupporters);
  const dailyGrowth = Math.max(1, model.analytics.newSupporters7d / 7);
  const daysToGoal = targetGap > 0 ? Math.ceil(targetGap / dailyGrowth) : 0;
  const projectedCompletionDate = daysToGoal > 0 ? new Date(Date.now() + daysToGoal * DAY_MS).toISOString() : undefined;

  const topChannel = [...model.analytics.channels].sort((a, b) => b.count - a.count)[0];
  const locationCounts = model.ambassadors.profiles.reduce<Record<string, number>>((acc, item) => {
    acc[item.location] = (acc[item.location] ?? 0) + item.directReferrals;
    return acc;
  }, {});
  const fastestGrowingLocation =
    Object.entries(locationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? model.scope.label;

  const notificationItems = config.notifications.enabled
    ? campaignTimeline
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 24)
    .map<NotificationItem>((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      timestamp: item.timestamp,
      category: mapKindToNotificationCategory(item.kind),
      unread: daysAgo(item.timestamp) <= 1
    }))
    .filter((item) => config.notifications.categories.includes(item.category))
    : [];

  const automationTimeline = campaignTimeline
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12)
    .map<AutomationTimelineItem>((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      timestamp: item.timestamp,
      kind: mapKindToAutomationKind(item.kind)
    }));

  const certificateTemplate = config.certificates.templates[0];

  return {
    metrics: [
      {
        id: "active-supporters-7d",
        label: "Active Supporters (7d)",
        value: activeSupporters7d,
        formattedValue: activeSupporters7d.toLocaleString(),
        trendDelta: weeklyGrowthDelta,
        trendDirection: trendDirection(weeklyGrowthDelta),
        detail: "Supporters with at least one timeline activity in the last 7 days."
      },
      {
        id: "verification-rate",
        label: "Verification Rate",
        value: verificationRate,
        formattedValue: `${verificationRate.toFixed(1)}%`,
        trendDelta: Math.round(verificationRate - model.analytics.conversionRate),
        trendDirection: trendDirection(verificationRate - model.analytics.conversionRate),
        detail: "Verified supporters relative to current campaign supporters."
      },
      {
        id: "share-conversion",
        label: "Share Conversion",
        value: shareConversion,
        formattedValue: `${shareConversion.toFixed(1)}%`,
        trendDelta: Math.round(shareConversion - model.summary.referralRate),
        trendDirection: trendDirection(shareConversion - model.summary.referralRate),
        detail: "Referrals generated for each recorded sharing activity."
      },
      {
        id: "inactive-supporters",
        label: "Inactive Supporters",
        value: inactiveSupporters,
        formattedValue: inactiveSupporters.toLocaleString(),
        trendDelta: -inactiveSupporters,
        trendDirection: trendDirection(-inactiveSupporters),
        detail: "Supporters with no runtime updates in the last 14 days."
      }
    ],
    recommendations,
    forecast: {
      projectedSupporters30d,
      projectedCompletionDate,
      targetCompletionForecast:
        daysToGoal > 0
          ? `${daysToGoal.toLocaleString()} day(s) to reach goal at current pace`
          : "Goal reached or pace unavailable"
    },
    socialImpact: buildSocialImpact(model, runtime),
    notifications: buildGroupedNotifications(notificationItems),
    automationTimeline,
    topGrowthChannel: topChannel?.label ?? "Direct",
    fastestGrowingLocation,
    certificatePreview: {
      enabled: config.certificates.enabled,
      name: certificateTemplate?.name ?? "Campaign Recognition",
      title: certificateTemplate?.title ?? `${campaign?.title ?? "Campaign"} Recognition`,
      signatory: certificateTemplate?.signatory ?? "Campaign Admin",
      badge: certificateTemplate?.badge ?? "Campaign Supporter",
      qrEnabled: certificateTemplate?.qrEnabled ?? true,
      verificationLink: certificateTemplate?.verificationLinkTemplate ?? "{{referral_link}}",
      issueRule: certificateTemplate?.issueRule ?? "achievement_qualified"
    }
  };
}
