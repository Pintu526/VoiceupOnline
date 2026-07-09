export interface CampaignEngagementMetricCard {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  detail: string;
  trendDirection: "up" | "down" | "flat";
  trendDelta: number;
  comparisonLabel: string;
  health: "great" | "good" | "watch" | "risk";
  series: number[];
  accent: "green" | "blue" | "purple" | "amber";
}

export type CampaignActivityFilter = "today" | "week" | "month" | "everything";

export interface CampaignEngagementFeedItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  kind:
    | "achievement"
    | "milestone"
    | "challenge"
    | "announcement"
    | "share"
    | "streak"
    | "otp"
    | "verification"
    | "contribution"
    | "volunteer";
}

export interface CampaignEngagementMilestone {
  id: string;
  title: string;
  description: string;
  target: number;
  achieved: boolean;
  reward: string;
}

export interface CampaignEngagementChallenge {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  requiredActivity: string;
  requiredPoints: number;
  reward: string;
}

export interface CampaignEngagementStreakSummary {
  current: number;
  longest: number;
  upcomingReward: string;
  broken: boolean;
  recoveryOption: string;
}

export interface CampaignEngagementShareTemplate {
  id: string;
  title: string;
  channel: string;
  description: string;
}

export interface CampaignEngagementHubModel {
  metrics: CampaignEngagementMetricCard[];
  feed: CampaignEngagementFeedItem[];
  feedEmptyMessage: string;
  milestones: CampaignEngagementMilestone[];
  challenges: CampaignEngagementChallenge[];
  streak: CampaignEngagementStreakSummary;
  shareTemplates: CampaignEngagementShareTemplate[];
  announcements: string[];
  impactSummary: string[];
  adminQuickActions: Array<{
    id: string;
    label: string;
    description: string;
  }>;
}

