import type { Signer } from "../../types";
import type { AchievementPeriodConfig, AchievementQualification } from "../achievements";
import type { ContributionCalculationAudit, PointContributionSettings } from "../contributions";
import type { GrowthCreditLedgerEntry } from "../credits";
import type { GrowthEventIntent } from "../events";
import type { ContributionLeaderboardFilter, ContributionLeaderboardModel } from "../leaderboards";
import type { PrizeConfig, PrizeQualificationResult } from "../prizes";
import type { DigitalCouponRecord, RedemptionAuditEvent, RedemptionRecord, RewardWishlistEntry } from "../redemption";
import type { RecognitionEvaluationResult } from "../recognition";
import type { GrowthTimelineRecord } from "../timeline";
import type { SupporterGrowthPortalModel } from "../tree";
import type { GrowthWallet } from "../wallet";
import type { GrowthOperatingSystemConfiguration } from "../services/growthOperatingSystemService";

export type GrowthLifecycleEventKind =
  | "supporter_signed"
  | "otp_verified"
  | "supporter_verified"
  | "share_completed"
  | "referral_signed"
  | "referral_verified"
  | "volunteer_joined"
  | "event_attended"
  | "points_earned"
  | "recognition_reached";

export interface GrowthShareContext {
  channel: "native" | "whatsapp" | "sms" | "telegram" | "facebook" | "x" | "linkedin" | "email" | "copy" | "poster" | "qr";
  url: string;
}

export interface GrowthLifecycleInput {
  kind: GrowthLifecycleEventKind;
  signer: Signer;
  signers: Signer[];
  campaignSlug: string;
  baseUrl: string;
  occurredAt?: string;
  share?: GrowthShareContext;
  configuration?: Partial<GrowthOperatingSystemConfiguration>;
  contribution?: PointContributionSettings;
  achievements?: AchievementPeriodConfig[];
  leaderboardFilters?: ContributionLeaderboardFilter[];
  rewards?: PrizeConfig[];
}

export interface GrowthSupporterSnapshot {
  supporterId: string;
  campaignId: string;
  referralCode?: string;
  parentReferralCode?: string;
  depth: number;
  children: string[];
  walletId?: string;
  currentRecognitionLevelId?: string;
  currentRecognitionLevelName?: string;
  contributionGiven: number;
  contributionReceived: number;
  todayGrowth: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
  lifetimeGrowth: number;
  leaderboardPosition?: number;
  achievementBadges: string[];
  certificates: string[];
  prizeEligibility: boolean;
  portalPath?: string;
  updatedAt: string;
}

export interface GrowthRuntimeState {
  processedActivityKeys: string[];
  creditLedger: GrowthCreditLedgerEntry[];
  wallets: GrowthWallet[];
  timeline: GrowthTimelineRecord[];
  eventIntents: GrowthEventIntent[];
  contributionAudits: ContributionCalculationAudit[];
  recognition: RecognitionEvaluationResult[];
  achievements: AchievementQualification[];
  prizes: PrizeQualificationResult[];
  redemptions: RedemptionRecord[];
  coupons: DigitalCouponRecord[];
  wishlists: RewardWishlistEntry[];
  redemptionAudits: RedemptionAuditEvent[];
  leaderboards: ContributionLeaderboardModel[];
  supporterSnapshots: GrowthSupporterSnapshot[];
  supporterPortals: SupporterGrowthPortalModel[];
  updatedAt: string;
}

export interface GrowthLifecycleResult {
  state: GrowthRuntimeState;
  eventIntents: GrowthEventIntent[];
  supporterSnapshot?: GrowthSupporterSnapshot;
  supporterPortal?: SupporterGrowthPortalModel;
  skipped: boolean;
  skippedReason?: string;
}
