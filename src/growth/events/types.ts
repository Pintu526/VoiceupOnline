export enum GrowthEventType {
  CampaignCreated = "campaign.created",
  CampaignPublished = "campaign.published",
  CampaignUpdated = "campaign.updated",
  CampaignClosed = "campaign.closed",
  SupporterViewed = "supporter.viewed",
  SupporterSigned = "supporter.signed",
  OtpRequested = "otp.requested",
  OtpVerified = "otp.verified",
  ReferralLinkGenerated = "referral.link_generated",
  ReferralLinkShared = "referral.link_shared",
  ReferralLinkClicked = "referral.link_clicked",
  ReferralConverted = "referral.converted",
  QrGenerated = "qr.generated",
  QrScanned = "qr.scanned",
  RewardEarned = "reward.earned",
  VoucherGenerated = "voucher.generated",
  VoucherRedeemed = "voucher.redeemed",
  GrowthLevelChanged = "growth.level_changed",
  LeaderboardUpdated = "leaderboard.updated",
  VolunteerJoined = "volunteer.joined",
  DonationRecorded = "donation.recorded",
  GrowthCreditsEarned = "growth.credits_earned",
  GrowthWalletUpdated = "growth.wallet_updated",
  GrowthPromotionQualified = "growth.promotion_qualified",
  GrowthPromotionCompleted = "growth.promotion_completed",
  GrowthRecognitionEvaluated = "growth.recognition_evaluated",
  GrowthRecognitionChanged = "growth.recognition_changed",
  GrowthRecognitionTreeUpdated = "growth.recognition_tree_updated",
  GrowthTimelineRecorded = "growth.timeline_recorded",
  GrowthCalculationSimulated = "growth.calculation_simulated",
  PointsEarned = "points.earned",
  PointsContributed = "points.contributed",
  ContributionCalculated = "contribution.calculated",
  AdvancementEvaluated = "advancement.evaluated",
  AchievementQualified = "achievement.qualified",
  PrizeQualified = "prize.qualified",
  RewardAvailable = "reward.available",
  RewardReserved = "reward.reserved",
  RewardApproved = "reward.approved",
  RewardRejected = "reward.rejected",
  RewardRedeemed = "reward.redeemed",
  RewardExpired = "reward.expired",
  RewardRefunded = "reward.refunded",
  ShareCompleted = "share.completed",
  NotificationSent = "notification.sent",
  SubscriptionChanged = "subscription.changed",
  WorkspaceCreated = "workspace.created",
  OrganizationCreated = "organization.created",
  Login = "auth.login",
  Logout = "auth.logout",
  Error = "system.error",
  Warning = "system.warning",
  SystemEvent = "system.event"
}

export enum GrowthEventSource {
  Campaign = "campaign",
  Supporter = "supporter",
  Otp = "otp",
  Referral = "referral",
  Qr = "qr",
  Reward = "reward",
  Voucher = "voucher",
  Leaderboard = "leaderboard",
  Volunteer = "volunteer",
  Donation = "donation",
  Credit = "credit",
  Wallet = "wallet",
  Promotion = "promotion",
  Recognition = "recognition",
  Tree = "tree",
  Calculator = "calculator",
  Timeline = "timeline",
  Contribution = "contribution",
  Advancement = "advancement",
  Achievement = "achievement",
  Prize = "prize",
  Share = "share",
  Notification = "notification",
  Subscription = "subscription",
  Workspace = "workspace",
  Organization = "organization",
  Auth = "auth",
  Analytics = "analytics",
  AiGrowth = "ai_growth",
  Merchant = "merchant",
  Reporting = "reporting",
  Workflow = "workflow",
  System = "system"
}

export enum GrowthEventPriority {
  Low = "low",
  Normal = "normal",
  High = "high",
  Critical = "critical"
}

export enum GrowthEventStatus {
  Pending = "pending",
  Queued = "queued",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
  Ignored = "ignored"
}

export interface GrowthEventMetadata extends Record<string, unknown> {}

export interface GrowthEventIntent {
  type: GrowthEventType;
  metadata?: GrowthEventMetadata;
  context?: Partial<GrowthEventContext>;
  priority?: GrowthEventPriority;
}

export interface GrowthEventContext {
  workspaceId: string;
  campaignId?: string;
  supporterId?: string;
  actorId?: string;
  device?: string;
  browser?: string;
  platform?: string;
  country?: string;
  state?: string;
  city?: string;
  language?: string;
  timezone?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referralId?: string;
  correlationId?: string;
  traceId?: string;
}

export interface GrowthEvent {
  eventId: string;
  timestamp: string;
  workspaceId: string;
  campaignId?: string;
  supporterId?: string;
  actorId?: string;
  type: GrowthEventType;
  source: GrowthEventSource;
  status: GrowthEventStatus;
  priority: GrowthEventPriority;
  device?: string;
  browser?: string;
  platform?: string;
  country?: string;
  state?: string;
  city?: string;
  language?: string;
  timezone?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referralId?: string;
  metadata: GrowthEventMetadata;
  correlationId: string;
  traceId: string;
}

export interface GrowthTimelineEntry {
  id: string;
  eventId: string;
  type: GrowthEventType;
  title: string;
  description: string;
  timestamp: string;
  campaignId?: string;
  supporterId?: string;
  priority: GrowthEventPriority;
  status: GrowthEventStatus;
}

export interface GrowthEventDefinition {
  type: GrowthEventType;
  label: string;
  source: GrowthEventSource;
  defaultPriority: GrowthEventPriority;
  description: string;
}

export interface GrowthEventListener {
  id: string;
  name: string;
  supportedTypes?: GrowthEventType[];
  handle(event: GrowthEvent): void | Promise<void>;
}

export interface GrowthAnalyticsListener extends GrowthEventListener {
  listenerType: "analytics";
}

export interface GrowthReferralListener extends GrowthEventListener {
  listenerType: "referral";
}

export interface GrowthRewardsListener extends GrowthEventListener {
  listenerType: "rewards";
}

export interface GrowthLeaderboardsListener extends GrowthEventListener {
  listenerType: "leaderboards";
}

export interface GrowthNotificationsListener extends GrowthEventListener {
  listenerType: "notifications";
}

export interface GrowthAiGrowthListener extends GrowthEventListener {
  listenerType: "ai_growth";
}

export interface GrowthMerchantListener extends GrowthEventListener {
  listenerType: "merchant";
}

export interface GrowthAuditListener extends GrowthEventListener {
  listenerType: "audit";
}

export interface GrowthReportingListener extends GrowthEventListener {
  listenerType: "reporting";
}

export interface GrowthWorkflowAutomationListener extends GrowthEventListener {
  listenerType: "workflow_automation";
}

export type GrowthPreparedListener =
  | GrowthAnalyticsListener
  | GrowthReferralListener
  | GrowthRewardsListener
  | GrowthLeaderboardsListener
  | GrowthNotificationsListener
  | GrowthAiGrowthListener
  | GrowthMerchantListener
  | GrowthAuditListener
  | GrowthReportingListener
  | GrowthWorkflowAutomationListener;

export interface GrowthEventAuditEntry {
  id: string;
  eventId: string;
  action: "queued" | "published" | "listener.completed" | "listener.failed" | "validation.failed";
  message: string;
  timestamp: string;
  listenerId?: string;
  durationMs?: number;
  metadata?: GrowthEventMetadata;
}

export interface GrowthEventObservability {
  structuredLog?: (entry: GrowthEventAuditEntry) => void;
  performanceMetric?: (name: string, value: number, event: GrowthEvent) => void;
  aiRecommendation?: (event: GrowthEvent) => void;
  notification?: (event: GrowthEvent) => void;
  webhook?: (event: GrowthEvent) => void;
}

export interface GrowthEventHookSet {
  beforePublish?: (event: GrowthEvent) => void | Promise<void>;
  afterPublish?: (event: GrowthEvent) => void | Promise<void>;
  onListenerError?: (event: GrowthEvent, listener: GrowthEventListener, error: unknown) => void;
}
