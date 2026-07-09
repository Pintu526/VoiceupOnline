import type { GrowthOperatingSystemConfiguration } from "../services/growthOperatingSystemService";
import type { PointContributionSettings } from "../contributions";

export function createDefaultGrowthContributionSettings(): PointContributionSettings {
  return {
    enabled: true,
    levels: [
      { level: 1, percentage: 10 },
      { level: 2, percentage: 5 },
      { level: 3, percentage: 2 }
    ],
    maxContributionCap: undefined,
    eligibleActivities: [
      "verified_referral",
      "campaign_sign_completion",
      "volunteer_participation",
      "event_attendance"
    ]
  };
}

export function createDefaultGrowthLifecycleConfiguration(): GrowthOperatingSystemConfiguration {
  const baseDistribution = {
    enabled: true,
    depth: 3,
    maximumLevels: 3,
    contributionPercentage: 100,
    strategy: "recognition_tree" as const,
    formula: "progressive" as const
  };

  return {
    features: {
      growthEngineEnabled: true,
      recognitionEnabled: true,
      leaderboardEnabled: true,
      contributionEngineEnabled: true,
      promotionEngineEnabled: true,
      growthCalculatorEnabled: true,
      recognitionTreeEnabled: true,
      achievementEngineEnabled: true,
      walletEnabled: true,
      timelineEnabled: true
    },
    credits: {
      enabled: true,
      rules: [
        { id: "campaign-signature-wallet", activityKind: "campaign_signature", creditKind: "wallet", enabled: true, credits: 5 },
        { id: "campaign-signature-promotion", activityKind: "campaign_signature", creditKind: "promotion", enabled: true, credits: 5 },
        { id: "verified-referral-wallet", activityKind: "verified_referral", creditKind: "wallet", enabled: true, credits: 10 },
        { id: "verified-referral-promotion", activityKind: "verified_referral", creditKind: "promotion", enabled: true, credits: 10 },
        { id: "volunteer-wallet", activityKind: "volunteer_activity", creditKind: "wallet", enabled: true, credits: 4 },
        { id: "volunteer-promotion", activityKind: "volunteer_activity", creditKind: "promotion", enabled: true, credits: 4 },
        { id: "attendance-wallet", activityKind: "attendance", creditKind: "wallet", enabled: true, credits: 3 },
        { id: "attendance-promotion", activityKind: "attendance", creditKind: "promotion", enabled: true, credits: 3 },
        { id: "share-wallet", activityKind: "share", creditKind: "wallet", enabled: true, credits: 1 },
        { id: "share-promotion", activityKind: "share", creditKind: "promotion", enabled: true, credits: 1 }
      ]
    },
    recognition: {
      enabled: true,
      levels: [
        {
          id: "level-1",
          order: 1,
          name: "Level 1",
          description: "First campaign growth milestone.",
          color: "#0f7a3b",
          icon: "badge",
          badge: "Level 1",
          certificate: false,
          privileges: [],
          prizeEligibility: false,
          promotionCreditsRequired: 10,
          promotionPercentage: 50,
          roundStrategy: { strategy: "level_number" },
          distributionStrategy: baseDistribution,
          eligibilityPeriod: "all_time"
        },
        {
          id: "level-2",
          order: 2,
          name: "Level 2",
          description: "Growing supporter influence.",
          color: "#123a8c",
          icon: "star",
          badge: "Level 2",
          certificate: true,
          privileges: ["Certificate eligibility"],
          prizeEligibility: false,
          promotionCreditsRequired: 25,
          promotionPercentage: 50,
          roundStrategy: { strategy: "level_number" },
          distributionStrategy: baseDistribution,
          eligibilityPeriod: "all_time"
        },
        {
          id: "level-3",
          order: 3,
          name: "Level 3",
          description: "High campaign growth contribution.",
          color: "#7c3aed",
          icon: "trophy",
          badge: "Level 3",
          certificate: true,
          privileges: ["Certificate eligibility", "Prize review eligibility"],
          prizeEligibility: true,
          promotionCreditsRequired: 50,
          promotionPercentage: 50,
          roundStrategy: { strategy: "level_number" },
          distributionStrategy: baseDistribution,
          eligibilityPeriod: "all_time"
        }
      ]
    },
    promotion: {
      enabled: true,
      roundConfiguration: { strategy: "level_number" },
      distributionConfiguration: baseDistribution
    }
  };
}
