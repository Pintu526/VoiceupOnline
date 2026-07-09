import type { Campaign } from "../../types";
import {
  createDefaultGrowthContributionSettings,
  createDefaultGrowthLifecycleConfiguration
} from "../lifecycle";
import type { CampaignGrowthConfiguration } from "./types";

const defaultSharingVariables = [
  "{{campaign}}",
  "{{supporter}}",
  "{{referral_link}}",
  "{{wallet}}",
  "{{recognition}}",
  "{{organization}}",
  "{{campaign_progress}}",
  "{{verified_supporters}}"
];

export function createDefaultCampaignGrowthConfiguration(
  campaign?: Pick<Campaign, "id" | "title">
): CampaignGrowthConfiguration {
  const operatingSystem = createDefaultGrowthLifecycleConfiguration();
  const campaignTitle = campaign?.title || "{{campaign}}";

  return {
    enabled: true,
    merchants: [],
    operatingSystem,
    contribution: createDefaultGrowthContributionSettings(),
    achievements: [
      {
        id: `${campaign?.id ?? "campaign"}-top-growth`,
        label: "Top Growth",
        kind: "campaign_duration",
        startAt: "1970-01-01T00:00:00.000Z",
        endAt: "2999-12-31T23:59:59.999Z",
        minimumPoints: 1,
        minimumVerifiedReferrals: 0,
        minimumConversions: 0,
        prizeDescription: "Campaign recognition",
        numberOfWinners: 10,
        selectionCriteria: "top_points",
        active: true
      }
    ],
    leaderboard: {
      enabled: true,
      filters: [
        "current_campaign",
        "this_week",
        "this_month",
        "overall",
        "current_level",
        "highest_growth",
        "highest_contribution",
        "highest_verified_referrals",
        "highest_campaign_influence"
      ]
    },
    rewards: [],
    sharing: {
      journeyDisplayName: "My Campaign Journey",
      whatsappMessage: `I supported ${campaignTitle}. Add your voice here: {{referral_link}}`,
      smsTemplate: `Support ${campaignTitle}: {{referral_link}}`,
      emailSubject: `Support ${campaignTitle}`,
      emailTemplate: `I supported ${campaignTitle}. You can add your voice here: {{referral_link}}`,
      nativeShareMessage: `Add your voice to ${campaignTitle}: {{referral_link}}`,
      referralPosterHeadline: `Support ${campaignTitle}`,
      qrBranding: "VoiceUp",
      campaignSlogan: "Create and publish your campaign in 60 seconds.",
      dynamicVariables: defaultSharingVariables
    },
    analytics: {
      viralityScore: true,
      referralFunnel: true,
      growthFunnel: true,
      dropOffFunnel: true,
      treeDepth: true,
      walletDistribution: true,
      contributionDistribution: true,
      promotionStatistics: true,
      growthVelocity: true,
      dailyActiveSupporters: true
    },
    customActivities: ["custom"],
    automationRules: [
      {
        id: "auto-congratulations",
        label: "Auto Congratulations",
        enabled: false,
        schedule: {
          frequency: "immediate",
          time: "09:00",
          quietHours: {
            enabled: true,
            start: "22:00",
            end: "07:00"
          }
        }
      },
      {
        id: "auto-milestone-announcement",
        label: "Auto Milestone Announcement",
        enabled: false,
        schedule: {
          frequency: "daily",
          time: "10:00",
          quietHours: {
            enabled: true,
            start: "22:00",
            end: "07:00"
          }
        }
      },
      {
        id: "auto-weekly-summary",
        label: "Auto Weekly Summary",
        enabled: false,
        schedule: {
          frequency: "weekly",
          time: "18:00",
          dayOfWeek: 1,
          quietHours: {
            enabled: true,
            start: "22:00",
            end: "07:00"
          }
        }
      },
      {
        id: "auto-monthly-summary",
        label: "Auto Monthly Summary",
        enabled: false,
        schedule: {
          frequency: "monthly",
          time: "18:00",
          dayOfMonth: 1,
          quietHours: {
            enabled: true,
            start: "22:00",
            end: "07:00"
          }
        }
      }
    ],
    missions: [],
    challenges: [],
    notifications: {
      enabled: true,
      categories: [
        "achievements",
        "promotion",
        "wallet",
        "mission",
        "challenge",
        "leaderboard",
        "rewards",
        "recognition",
        "announcements",
        "campaign_updates"
      ]
    },
    certificates: {
      enabled: true,
      templates: [
        {
          id: `${campaign?.id ?? "campaign"}-certificate-template`,
          name: "Campaign Recognition",
          signatory: "Campaign Admin",
          title: `${campaignTitle} Recognition`,
          badge: "Campaign Supporter",
          qrEnabled: true,
          verificationLinkTemplate: "{{referral_link}}",
          issueAutomatically: false,
          issueRule: "achievement_qualified"
        }
      ]
    },
    updatedAt: new Date().toISOString()
  };
}

export function normalizeCampaignGrowthConfiguration(
  campaign?: Pick<Campaign, "id" | "title" | "growthConfiguration">
): CampaignGrowthConfiguration {
  const defaults = createDefaultCampaignGrowthConfiguration(campaign);
  const current = campaign?.growthConfiguration;
  if (!current) return defaults;

  return {
    ...defaults,
    ...current,
    merchants: current.merchants ?? defaults.merchants,
    operatingSystem: {
      ...defaults.operatingSystem,
      ...current.operatingSystem,
      features: {
        ...defaults.operatingSystem.features,
        ...current.operatingSystem?.features
      },
      credits: {
        ...defaults.operatingSystem.credits,
        ...current.operatingSystem?.credits,
        rules: current.operatingSystem?.credits?.rules ?? defaults.operatingSystem.credits.rules
      },
      recognition: {
        ...defaults.operatingSystem.recognition,
        ...current.operatingSystem?.recognition,
        levels: current.operatingSystem?.recognition?.levels ?? defaults.operatingSystem.recognition.levels
      },
      promotion: {
        ...defaults.operatingSystem.promotion,
        ...current.operatingSystem?.promotion,
        roundConfiguration: {
          ...defaults.operatingSystem.promotion.roundConfiguration,
          ...current.operatingSystem?.promotion?.roundConfiguration
        },
        distributionConfiguration: {
          ...defaults.operatingSystem.promotion.distributionConfiguration,
          ...current.operatingSystem?.promotion?.distributionConfiguration
        }
      }
    },
    contribution: {
      ...defaults.contribution,
      ...current.contribution,
      levels: current.contribution?.levels ?? defaults.contribution.levels,
      eligibleActivities: current.contribution?.eligibleActivities ?? defaults.contribution.eligibleActivities
    },
    achievements: current.achievements ?? defaults.achievements,
    leaderboard: {
      ...defaults.leaderboard,
      ...current.leaderboard,
      filters: current.leaderboard?.filters ?? defaults.leaderboard.filters
    },
    rewards: current.rewards ?? defaults.rewards,
    sharing: {
      ...defaults.sharing,
      ...current.sharing,
      dynamicVariables: current.sharing?.dynamicVariables ?? defaults.sharing.dynamicVariables
    },
    analytics: {
      ...defaults.analytics,
      ...current.analytics
    },
    customActivities: current.customActivities ?? defaults.customActivities,
    automationRules: current.automationRules ?? defaults.automationRules,
    missions: current.missions ?? defaults.missions,
    challenges: current.challenges ?? defaults.challenges,
    notifications: {
      ...defaults.notifications,
      ...current.notifications,
      categories: current.notifications?.categories ?? defaults.notifications.categories
    },
    certificates: {
      ...defaults.certificates,
      ...current.certificates,
      templates: current.certificates?.templates ?? defaults.certificates.templates
    }
  };
}
