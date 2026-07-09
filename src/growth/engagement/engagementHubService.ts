import type { GrowthRuntimeState } from "../lifecycle";
import type { GrowthDashboardModel } from "../types";
import type {
  CampaignEngagementFeedItem,
  CampaignEngagementHubModel,
  CampaignEngagementMetricCard
} from "./types";

interface BuildCampaignEngagementInput {
  model: GrowthDashboardModel;
  runtime?: GrowthRuntimeState;
  activeCampaignId?: string;
}

function toCompactNumber(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString();
}

function classifyHealth(value: number, thresholds: [number, number, number]) {
  if (value >= thresholds[0]) return "great" as const;
  if (value >= thresholds[1]) return "good" as const;
  if (value >= thresholds[2]) return "watch" as const;
  return "risk" as const;
}

function metric(options: {
  id: string;
  label: string;
  value: number;
  detail: string;
  trendDelta: number;
  comparisonLabel: string;
  accent: CampaignEngagementMetricCard["accent"];
  thresholds: [number, number, number];
  series: number[];
}) {
  const trendDirection = options.trendDelta > 0 ? "up" : options.trendDelta < 0 ? "down" : "flat";
  return {
    id: options.id,
    label: options.label,
    value: options.value,
    formattedValue: toCompactNumber(options.value),
    detail: options.detail,
    trendDirection,
    trendDelta: options.trendDelta,
    comparisonLabel: options.comparisonLabel,
    health: classifyHealth(options.value, options.thresholds),
    accent: options.accent,
    series: options.series
  } satisfies CampaignEngagementMetricCard;
}

function mapTimelineKind(kind: string, title: string): CampaignEngagementFeedItem["kind"] {
  const value = `${kind} ${title}`.toLowerCase();
  if (value.includes("otp")) return "otp";
  if (value.includes("verify")) return "verification";
  if (value.includes("challenge")) return "challenge";
  if (value.includes("milestone")) return "milestone";
  if (value.includes("contribution") || value.includes("points")) return "contribution";
  if (value.includes("volunteer")) return "volunteer";
  if (value.includes("announcement") || value.includes("notification")) return "announcement";
  if (value.includes("share")) return "share";
  if (value.includes("achievement") || value.includes("recognition") || value.includes("badge")) return "achievement";
  return "streak";
}

function buildCampaignStreak(activityDates: string[]) {
  if (activityDates.length === 0) {
    return {
      current: 0,
      longest: 0,
      upcomingReward: "Daily activity unlock",
      broken: true,
      recoveryOption: "Publish a share announcement today"
    };
  }

  const sorted = Array.from(new Set(activityDates)).sort();
  let longest = 1;
  let currentRun = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(`${sorted[index - 1]}T00:00:00.000Z`).getTime();
    const current = new Date(`${sorted[index]}T00:00:00.000Z`).getTime();
    if ((current - previous) / 86_400_000 <= 1) {
      currentRun += 1;
      longest = Math.max(longest, currentRun);
    } else {
      currentRun = 1;
    }
  }

  let current = 1;
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    const latest = new Date(`${sorted[index]}T00:00:00.000Z`).getTime();
    const previous = new Date(`${sorted[index - 1]}T00:00:00.000Z`).getTime();
    if ((latest - previous) / 86_400_000 <= 1) {
      current += 1;
    } else {
      break;
    }
  }

  return {
    current,
    longest,
    upcomingReward: current >= 7 ? "Weekly momentum badge" : "Reach a 7-day run",
    broken: false,
    recoveryOption: "Keep campaign activity running daily"
  };
}

export function buildCampaignEngagementHubModel(input: BuildCampaignEngagementInput): CampaignEngagementHubModel {
  const { model, runtime, activeCampaignId } = input;
  const totalSupporters = model.summary.totalSupporters;
  const trends = model.analytics.trends;
  const signaturesSeries = trends.map((point) => point.signatures);
  const referralSeries = trends.map((point) => point.referrals);
  const todaySignatures = signaturesSeries[signaturesSeries.length - 1] ?? 0;
  const weeklySupporters = signaturesSeries.slice(-7).reduce((sum, item) => sum + item, 0);
  const previousWeekly = signaturesSeries.slice(-14, -7).reduce((sum, item) => sum + item, 0);
  const monthlySupporters = totalSupporters;
  const previousMonthly = Math.max(0, monthlySupporters - weeklySupporters);
  const weeklyDelta = weeklySupporters - previousWeekly;
  const monthlyDelta = monthlySupporters - previousMonthly;
  const filteredTimeline = (runtime?.timeline ?? [])
    .filter((entry) => (activeCampaignId ? entry.campaignId === activeCampaignId : true))
    .slice()
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  const feed: CampaignEngagementFeedItem[] = filteredTimeline.map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    timestamp: entry.timestamp,
    kind: mapTimelineKind(entry.kind, entry.title)
  }));
  const campaignWallets = (runtime?.wallets ?? []).filter((wallet) =>
    activeCampaignId ? wallet.campaignId === activeCampaignId : true
  );
  const generatedCredits = campaignWallets.reduce((sum, wallet) => sum + wallet.balance.totalEarned, 0);
  const snapshots = (runtime?.supporterSnapshots ?? []).filter((snapshot) =>
    activeCampaignId ? snapshot.campaignId === activeCampaignId : true
  );
  const recognitionCoverage = snapshots.length === 0
    ? 0
    : Math.round(
      (snapshots.filter((snapshot) => Boolean(snapshot.currentRecognitionLevelId)).length / snapshots.length) * 100
    );
  const challengeCompletions = (runtime?.achievements ?? []).filter((achievement) =>
    activeCampaignId ? achievement.campaignId === activeCampaignId : true
  ).length;
  const influenceScore = Math.round(model.summary.referralRate * 0.6 + model.summary.growthScore * 0.4);
  const energyScore = Math.round((Math.max(0, weeklyDelta) + model.summary.growthScore + model.analytics.conversionRate) / 3);
  const conversionRatio = model.summary.referralSignatures === 0
    ? 0
    : Math.round((model.analytics.verifiedSupporters / model.summary.referralSignatures) * 100);

  const milestones = [100, 500, 1000, 5000, 10000].map((target) => ({
    id: `milestone-${target}`,
    title: `${target.toLocaleString()} supporters`,
    description: "Campaign growth threshold for public momentum.",
    target,
    achieved: totalSupporters >= target,
    reward: target >= 1000 ? "Campaign celebration card" : "Recognition badge"
  }));

  const activityDates = filteredTimeline.map((entry) => entry.timestamp.slice(0, 10));

  return {
    metrics: [
      metric({
        id: "campaign-health",
        label: "Campaign Health",
        value: model.summary.growthScore,
        detail: "Composite score from conversion, referral, and supporter growth.",
        trendDelta: weeklyDelta,
        comparisonLabel: "vs previous week",
        accent: "green",
        thresholds: [85, 70, 55],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "growth-velocity",
        label: "Growth Velocity",
        value: Math.max(0, Math.round(weeklySupporters / 7)),
        detail: "Average daily supporter growth during the last week.",
        trendDelta: weeklyDelta,
        comparisonLabel: "week over week",
        accent: "blue",
        thresholds: [50, 20, 5],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "daily-supporters",
        label: "Daily Supporters",
        value: todaySignatures,
        detail: "Supporters joined in the latest tracked day.",
        trendDelta: todaySignatures - (signaturesSeries[signaturesSeries.length - 2] ?? 0),
        comparisonLabel: "vs yesterday",
        accent: "amber",
        thresholds: [80, 30, 10],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "weekly-supporters",
        label: "Weekly Supporters",
        value: weeklySupporters,
        detail: "Total supporters during the last 7-day window.",
        trendDelta: weeklyDelta,
        comparisonLabel: "vs previous 7 days",
        accent: "purple",
        thresholds: [400, 150, 50],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "monthly-supporters",
        label: "Monthly Supporters",
        value: monthlySupporters,
        detail: "Current campaign supporter total this month.",
        trendDelta: monthlyDelta,
        comparisonLabel: "vs previous month",
        accent: "green",
        thresholds: [2000, 700, 150],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "virality-score",
        label: "Virality Score",
        value: model.summary.referralRate,
        detail: "Referral participation percentage among supporters.",
        trendDelta: model.summary.referralRate - (model.analytics.channels.find((channel) => channel.channel === "referral")?.percentage ?? 0),
        comparisonLabel: "vs channel baseline",
        accent: "blue",
        thresholds: [40, 25, 10],
        series: referralSeries.slice(-8)
      }),
      metric({
        id: "referral-conversion",
        label: "Referral Conversion",
        value: conversionRatio,
        detail: "Verified supporters generated from referral signatures.",
        trendDelta: conversionRatio - model.analytics.conversionRate,
        comparisonLabel: "vs overall conversion",
        accent: "amber",
        thresholds: [75, 55, 30],
        series: referralSeries.slice(-8)
      }),
      metric({
        id: "share-conversion",
        label: "Share Conversion",
        value: Math.round((model.summary.referralRate * model.analytics.conversionRate) / 100),
        detail: "Estimated conversion from share-led supporter growth.",
        trendDelta: weeklyDelta,
        comparisonLabel: "weekly trend",
        accent: "purple",
        thresholds: [30, 18, 8],
        series: referralSeries.slice(-8)
      }),
      metric({
        id: "credits-generated",
        label: "Growth Credits Generated",
        value: generatedCredits,
        detail: "Total earned growth credits in active campaign wallets.",
        trendDelta: generatedCredits - Math.round(generatedCredits * 0.85),
        comparisonLabel: "vs prior window",
        accent: "green",
        thresholds: [10000, 3000, 500],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "recognition-distribution",
        label: "Recognition Distribution",
        value: recognitionCoverage,
        detail: "Supporters who have reached recognition levels.",
        trendDelta: recognitionCoverage,
        comparisonLabel: "campaign coverage",
        accent: "blue",
        thresholds: [80, 55, 25],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "challenge-completion",
        label: "Challenge Completion",
        value: challengeCompletions,
        detail: "Qualified achievement events from campaign runtime.",
        trendDelta: challengeCompletions,
        comparisonLabel: "total qualified",
        accent: "amber",
        thresholds: [30, 12, 3],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "campaign-momentum",
        label: "Campaign Momentum",
        value: Math.max(0, weeklyDelta),
        detail: "Net supporter movement compared to previous week.",
        trendDelta: weeklyDelta,
        comparisonLabel: "supporter delta",
        accent: "purple",
        thresholds: [120, 40, 10],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "campaign-energy",
        label: "Campaign Energy Score",
        value: energyScore,
        detail: "Blend of growth score, conversion, and momentum.",
        trendDelta: energyScore - model.summary.growthScore,
        comparisonLabel: "vs growth score",
        accent: "green",
        thresholds: [80, 60, 40],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "campaign-reach",
        label: "Campaign Reach",
        value: totalSupporters + model.referrals.edges.length,
        detail: "Supporters plus referral-edge distribution reach.",
        trendDelta: model.referrals.edges.length,
        comparisonLabel: "edge amplification",
        accent: "blue",
        thresholds: [3000, 1000, 250],
        series: signaturesSeries.slice(-8)
      }),
      metric({
        id: "campaign-influence",
        label: "Campaign Influence",
        value: influenceScore,
        detail: "Weighted influence from referrals and campaign health.",
        trendDelta: influenceScore - model.summary.growthScore,
        comparisonLabel: "impact differential",
        accent: "amber",
        thresholds: [85, 65, 45],
        series: referralSeries.slice(-8)
      })
    ],
    feed,
    feedEmptyMessage: "No activity yet. Publish a quick update or share prompt to start campaign momentum.",
    milestones,
    challenges: [
      {
        id: "challenge-referral-wave",
        title: "Referral Wave",
        description: "Increase referral signatures by 15% this week.",
        startDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        requiredActivity: "Referrals",
        requiredPoints: Math.max(10, Math.round(model.summary.referralSignatures * 1.15)),
        reward: "Momentum badge"
      },
      {
        id: "challenge-conversion-lift",
        title: "Conversion Lift",
        description: "Lift verification conversion by engaging top channels.",
        startDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        requiredActivity: "Verification",
        requiredPoints: Math.max(20, model.analytics.verifiedSupporters + Math.round(model.analytics.verifiedSupporters * 0.12)),
        reward: "Recognition spotlight"
      }
    ],
    streak: buildCampaignStreak(activityDates),
    shareTemplates: [
      {
        id: "share-whatsapp",
        title: "WhatsApp Momentum",
        channel: "WhatsApp",
        description: "Share latest milestone and referral link in one tap."
      },
      {
        id: "share-linkedin",
        title: "LinkedIn Influence",
        channel: "LinkedIn",
        description: "Publish campaign progress and influence summary."
      },
      {
        id: "share-copy",
        title: "Copy Campaign Link",
        channel: "Copy",
        description: "Use in direct community outreach and volunteer groups."
      }
    ],
    announcements: feed
      .filter((item) => item.kind === "announcement" || item.kind === "milestone")
      .slice(0, 3)
      .map((item) => item.title),
    impactSummary: [
      `People joined: ${toCompactNumber(totalSupporters)}`,
      `People verified: ${toCompactNumber(model.analytics.verifiedSupporters)}`,
      `Growth credits: ${toCompactNumber(generatedCredits)}`
    ],
    adminQuickActions: [
      {
        id: "quick-publish",
        label: "Quick Publish",
        description: "Publish campaign update instantly."
      },
      {
        id: "quick-share",
        label: "Quick Share",
        description: "Open share actions for top channels."
      },
      {
        id: "create-challenge",
        label: "Create Challenge",
        description: "Launch a supporter challenge from current metrics."
      },
      {
        id: "create-milestone",
        label: "Create Milestone",
        description: "Set a campaign milestone target."
      },
      {
        id: "announcement",
        label: "Announcement",
        description: "Broadcast progress updates to supporters."
      },
      {
        id: "download-qr",
        label: "Download QR",
        description: "Get a campaign-ready QR asset."
      },
      {
        id: "view-leaderboard",
        label: "View Leaderboard",
        description: "Jump to current supporter standings."
      },
      {
        id: "reward-summary",
        label: "Reward Summary",
        description: "Review recognition and prize qualification."
      }
    ]
  };
}
