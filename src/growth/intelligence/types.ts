export interface IntelligenceMetric {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  trendDelta: number;
  trendDirection: "up" | "down" | "flat";
  detail: string;
}

export interface CampaignRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  actionLabel: string;
}

export interface GrowthForecast {
  projectedSupporters30d: number;
  projectedCompletionDate?: string;
  targetCompletionForecast: string;
}

export interface SocialImpactSummary {
  totalPeopleReached: number;
  totalShares: number;
  estimatedReach: number;
  volunteerHours: number;
  districtCoverage: number;
  stateCoverage: number;
  countryCoverage: number;
  supportGrowth: number;
  referralTreeSize: number;
  communityInfluenceScore: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  category:
    | "achievements"
    | "promotion"
    | "wallet"
    | "mission"
    | "challenge"
    | "leaderboard"
    | "rewards"
    | "recognition"
    | "announcements"
    | "campaign_updates";
  unread: boolean;
}

export interface GroupedNotifications {
  unread: NotificationItem[];
  today: NotificationItem[];
  thisWeek: NotificationItem[];
  older: NotificationItem[];
}

export interface AutomationTimelineItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  kind:
    | "mission_completed"
    | "promotion"
    | "reward"
    | "recognition"
    | "challenge_joined"
    | "challenge_completed"
    | "certificate_issued"
    | "milestone"
    | "leaderboard_change"
    | "wallet_activity"
    | "contribution_distribution";
}

export interface CertificatePreviewModel {
  enabled: boolean;
  name: string;
  title: string;
  signatory: string;
  badge: string;
  qrEnabled: boolean;
  verificationLink: string;
  issueRule: string;
}

export interface CampaignIntelligenceModel {
  metrics: IntelligenceMetric[];
  recommendations: CampaignRecommendation[];
  forecast: GrowthForecast;
  socialImpact: SocialImpactSummary;
  notifications: GroupedNotifications;
  automationTimeline: AutomationTimelineItem[];
  topGrowthChannel: string;
  fastestGrowingLocation: string;
  certificatePreview: CertificatePreviewModel;
}
