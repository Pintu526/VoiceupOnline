import type { AchievementPeriodConfig } from "../achievements";
import type { PointContributionSettings } from "../contributions";
import type { MerchantRecord } from "../merchant";
import type { GrowthActivityKind } from "../credits";
import type { ContributionLeaderboardFilter } from "../leaderboards";
import type { PrizeConfig } from "../prizes";
import type { GrowthOperatingSystemConfiguration } from "../services";

export type CampaignGrowthLeaderboardFilter = ContributionLeaderboardFilter;

export interface CampaignGrowthAnalyticsConfiguration {
  viralityScore: boolean;
  referralFunnel: boolean;
  growthFunnel: boolean;
  dropOffFunnel: boolean;
  treeDepth: boolean;
  walletDistribution: boolean;
  contributionDistribution: boolean;
  promotionStatistics: boolean;
  growthVelocity: boolean;
  dailyActiveSupporters: boolean;
}

export interface CampaignGrowthSharingConfiguration {
  journeyDisplayName: string;
  whatsappMessage: string;
  smsTemplate: string;
  emailSubject: string;
  emailTemplate: string;
  nativeShareMessage: string;
  referralPosterHeadline: string;
  qrBranding: string;
  campaignSlogan: string;
  dynamicVariables: string[];
}

export interface CampaignGrowthLeaderboardConfiguration {
  enabled: boolean;
  filters: CampaignGrowthLeaderboardFilter[];
}

export type GrowthAutomationFrequency = "immediate" | "daily" | "weekly" | "monthly";

export interface GrowthAutomationRule {
  id: string;
  label: string;
  enabled: boolean;
  schedule: {
    frequency: GrowthAutomationFrequency;
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
    };
  };
}

export interface CampaignMissionConfiguration {
  id: string;
  name: string;
  icon: string;
  description: string;
  points: number;
  durationDays: number;
  visibility: "public" | "supporter" | "admin";
  reward: string;
  badge: string;
  levelRequirement: number;
  expiresAt?: string;
  repeatable: boolean;
  active: boolean;
}

export interface CampaignChallengeConfiguration {
  id: string;
  name: string;
  icon: string;
  description: string;
  startAt: string;
  endAt: string;
  winnerCount: number;
  prize: string;
  recognition: string;
  visibility: "public" | "supporter" | "admin";
  active: boolean;
}

export interface CampaignNotificationCenterConfiguration {
  enabled: boolean;
  categories: Array<
    | "achievements"
    | "promotion"
    | "wallet"
    | "mission"
    | "challenge"
    | "leaderboard"
    | "rewards"
    | "recognition"
    | "announcements"
    | "campaign_updates"
  >;
}

export interface CampaignCertificateTemplateConfiguration {
  id: string;
  name: string;
  logoUrl?: string;
  signatory: string;
  title: string;
  badge: string;
  qrEnabled: boolean;
  verificationLinkTemplate: string;
  issueAutomatically: boolean;
  issueRule: string;
}

export interface CampaignCertificateConfiguration {
  enabled: boolean;
  templates: CampaignCertificateTemplateConfiguration[];
}

export interface CampaignGrowthConfiguration {
  enabled: boolean;
  merchants: MerchantRecord[];
  operatingSystem: GrowthOperatingSystemConfiguration;
  contribution: PointContributionSettings;
  achievements: AchievementPeriodConfig[];
  leaderboard: CampaignGrowthLeaderboardConfiguration;
  rewards: PrizeConfig[];
  sharing: CampaignGrowthSharingConfiguration;
  analytics: CampaignGrowthAnalyticsConfiguration;
  customActivities: GrowthActivityKind[];
  automationRules: GrowthAutomationRule[];
  missions: CampaignMissionConfiguration[];
  challenges: CampaignChallengeConfiguration[];
  notifications: CampaignNotificationCenterConfiguration;
  certificates: CampaignCertificateConfiguration;
  updatedAt?: string;
}
