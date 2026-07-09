import type { CampaignRecommendation } from "./types";

interface RecommendationInput {
  weeklyGrowthDelta: number;
  inactiveSupporters: number;
  referralVelocity: number;
  shareConversion: number;
  verificationRate: number;
  volunteerHours: number;
  weekendPerformanceGain: number;
  recognitionCoverage: number;
}

export function buildDeterministicRecommendations(input: RecommendationInput): CampaignRecommendation[] {
  const items: CampaignRecommendation[] = [];

  if (input.weeklyGrowthDelta < 0) {
    items.push({
      id: "growth-slowdown",
      priority: "high",
      title: "Campaign growth slowed this week",
      description: "Current weekly growth is below the previous window. Launch a quick campaign update.",
      actionLabel: "Publish update"
    });
  }

  if (input.inactiveSupporters > 0) {
    items.push({
      id: "inactive-supporters",
      priority: "high",
      title: "Invite inactive supporters",
      description: `${input.inactiveSupporters.toLocaleString()} supporters have no recent movement in the runtime timeline.`,
      actionLabel: "Send reminder"
    });
  }

  if (input.shareConversion < 20) {
    items.push({
      id: "share-conversion",
      priority: "medium",
      title: "Share conversion can improve",
      description: "Share-driven conversion is low. Repeat WhatsApp and local group sharing.",
      actionLabel: "Quick share"
    });
  }

  if (input.verificationRate < 65) {
    items.push({
      id: "verification-rate",
      priority: "high",
      title: "Verification rate is below target",
      description: "Encourage supporters to complete verification to improve campaign quality.",
      actionLabel: "Publish verification reminder"
    });
  }

  if (input.volunteerHours < 20) {
    items.push({
      id: "volunteer-participation",
      priority: "medium",
      title: "Volunteer participation is decreasing",
      description: "Volunteer activity is low in the current period. Launch a volunteer mission.",
      actionLabel: "Start mission"
    });
  }

  if (input.weekendPerformanceGain > 10) {
    items.push({
      id: "weekend-performance",
      priority: "medium",
      title: "Weekend campaigns perform better",
      description: "Weekend momentum is measurably higher. Schedule challenge announcements for weekend.",
      actionLabel: "Schedule challenge"
    });
  }

  if (input.recognitionCoverage < 40) {
    items.push({
      id: "recognition-coverage",
      priority: "low",
      title: "Recognition announcements may improve growth",
      description: "Recognition coverage is low. Celebrate newly qualified supporters publicly.",
      actionLabel: "Announce recognition"
    });
  }

  if (items.length === 0) {
    items.push({
      id: "momentum-stable",
      priority: "low",
      title: "Campaign momentum is stable",
      description: "Growth, conversion, and recognition signals are healthy. Keep current cadence.",
      actionLabel: "View analytics"
    });
  }

  return items;
}
