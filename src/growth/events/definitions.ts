import {
  GrowthEventPriority,
  GrowthEventSource,
  GrowthEventType,
  type GrowthEventDefinition
} from "./types";

export const growthEventDefinitions: Record<GrowthEventType, GrowthEventDefinition> = {
  [GrowthEventType.CampaignCreated]: {
    type: GrowthEventType.CampaignCreated,
    label: "Campaign Created",
    source: GrowthEventSource.Campaign,
    defaultPriority: GrowthEventPriority.High,
    description: "A campaign draft or campaign record was created."
  },
  [GrowthEventType.CampaignPublished]: {
    type: GrowthEventType.CampaignPublished,
    label: "Campaign Published",
    source: GrowthEventSource.Campaign,
    defaultPriority: GrowthEventPriority.High,
    description: "A campaign became publicly available."
  },
  [GrowthEventType.CampaignUpdated]: {
    type: GrowthEventType.CampaignUpdated,
    label: "Campaign Updated",
    source: GrowthEventSource.Campaign,
    defaultPriority: GrowthEventPriority.Normal,
    description: "Campaign settings, content, or growth fields changed."
  },
  [GrowthEventType.CampaignClosed]: {
    type: GrowthEventType.CampaignClosed,
    label: "Campaign Closed",
    source: GrowthEventSource.Campaign,
    defaultPriority: GrowthEventPriority.High,
    description: "A campaign was closed or archived."
  },
  [GrowthEventType.SupporterViewed]: {
    type: GrowthEventType.SupporterViewed,
    label: "Supporter Viewed",
    source: GrowthEventSource.Supporter,
    defaultPriority: GrowthEventPriority.Low,
    description: "A public supporter viewed a campaign page."
  },
  [GrowthEventType.SupporterSigned]: {
    type: GrowthEventType.SupporterSigned,
    label: "Supporter Signed",
    source: GrowthEventSource.Supporter,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter signed a campaign."
  },
  [GrowthEventType.OtpRequested]: {
    type: GrowthEventType.OtpRequested,
    label: "OTP Requested",
    source: GrowthEventSource.Otp,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A mobile OTP was requested."
  },
  [GrowthEventType.OtpVerified]: {
    type: GrowthEventType.OtpVerified,
    label: "OTP Verified",
    source: GrowthEventSource.Otp,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A mobile OTP was verified."
  },
  [GrowthEventType.ReferralLinkGenerated]: {
    type: GrowthEventType.ReferralLinkGenerated,
    label: "Referral Link Generated",
    source: GrowthEventSource.Referral,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A campaign or supporter referral link was generated."
  },
  [GrowthEventType.ReferralLinkShared]: {
    type: GrowthEventType.ReferralLinkShared,
    label: "Referral Link Shared",
    source: GrowthEventSource.Referral,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A referral link was shared to a channel."
  },
  [GrowthEventType.ReferralLinkClicked]: {
    type: GrowthEventType.ReferralLinkClicked,
    label: "Referral Link Clicked",
    source: GrowthEventSource.Referral,
    defaultPriority: GrowthEventPriority.Low,
    description: "A referral link received a click."
  },
  [GrowthEventType.ReferralConverted]: {
    type: GrowthEventType.ReferralConverted,
    label: "Referral Converted",
    source: GrowthEventSource.Referral,
    defaultPriority: GrowthEventPriority.High,
    description: "A referral produced a signature or conversion."
  },
  [GrowthEventType.QrGenerated]: {
    type: GrowthEventType.QrGenerated,
    label: "QR Generated",
    source: GrowthEventSource.Qr,
    defaultPriority: GrowthEventPriority.Low,
    description: "A QR asset was generated."
  },
  [GrowthEventType.QrScanned]: {
    type: GrowthEventType.QrScanned,
    label: "QR Scanned",
    source: GrowthEventSource.Qr,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A campaign or referral QR was scanned."
  },
  [GrowthEventType.RewardEarned]: {
    type: GrowthEventType.RewardEarned,
    label: "Reward Earned",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.High,
    description: "An ambassador or supporter earned a reward."
  },
  [GrowthEventType.RewardRedeemed]: {
    type: GrowthEventType.RewardRedeemed,
    label: "Reward Redeemed",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.High,
    description: "A reward was redeemed."
  },
  [GrowthEventType.VoucherGenerated]: {
    type: GrowthEventType.VoucherGenerated,
    label: "Voucher Generated",
    source: GrowthEventSource.Voucher,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A merchant or rewards voucher was generated."
  },
  [GrowthEventType.VoucherRedeemed]: {
    type: GrowthEventType.VoucherRedeemed,
    label: "Voucher Redeemed",
    source: GrowthEventSource.Voucher,
    defaultPriority: GrowthEventPriority.High,
    description: "A merchant or rewards voucher was redeemed."
  },
  [GrowthEventType.GrowthLevelChanged]: {
    type: GrowthEventType.GrowthLevelChanged,
    label: "Growth Level Changed",
    source: GrowthEventSource.Analytics,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A campaign or ambassador growth level changed."
  },
  [GrowthEventType.LeaderboardUpdated]: {
    type: GrowthEventType.LeaderboardUpdated,
    label: "Leaderboard Updated",
    source: GrowthEventSource.Leaderboard,
    defaultPriority: GrowthEventPriority.Low,
    description: "A leaderboard ranking changed."
  },
  [GrowthEventType.VolunteerJoined]: {
    type: GrowthEventType.VolunteerJoined,
    label: "Volunteer Joined",
    source: GrowthEventSource.Volunteer,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A supporter joined as a volunteer."
  },
  [GrowthEventType.DonationRecorded]: {
    type: GrowthEventType.DonationRecorded,
    label: "Donation Recorded",
    source: GrowthEventSource.Donation,
    defaultPriority: GrowthEventPriority.High,
    description: "A donation was recorded."
  },
  [GrowthEventType.GrowthCreditsEarned]: {
    type: GrowthEventType.GrowthCreditsEarned,
    label: "Growth Credits Earned",
    source: GrowthEventSource.Credit,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter earned configurable Growth Credits from a campaign activity."
  },
  [GrowthEventType.GrowthWalletUpdated]: {
    type: GrowthEventType.GrowthWalletUpdated,
    label: "Growth Wallet Updated",
    source: GrowthEventSource.Wallet,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A supporter Growth Wallet balance changed."
  },
  [GrowthEventType.GrowthPromotionQualified]: {
    type: GrowthEventType.GrowthPromotionQualified,
    label: "Growth Promotion Qualified",
    source: GrowthEventSource.Promotion,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter qualified for a configured recognition promotion."
  },
  [GrowthEventType.GrowthPromotionCompleted]: {
    type: GrowthEventType.GrowthPromotionCompleted,
    label: "Growth Promotion Completed",
    source: GrowthEventSource.Promotion,
    defaultPriority: GrowthEventPriority.High,
    description: "A configured promotion calculation completed."
  },
  [GrowthEventType.GrowthRecognitionEvaluated]: {
    type: GrowthEventType.GrowthRecognitionEvaluated,
    label: "Growth Recognition Evaluated",
    source: GrowthEventSource.Recognition,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A supporter recognition level was evaluated using campaign configuration."
  },
  [GrowthEventType.GrowthRecognitionChanged]: {
    type: GrowthEventType.GrowthRecognitionChanged,
    label: "Growth Recognition Changed",
    source: GrowthEventSource.Recognition,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter moved to a different configured recognition level."
  },
  [GrowthEventType.GrowthRecognitionTreeUpdated]: {
    type: GrowthEventType.GrowthRecognitionTreeUpdated,
    label: "Growth Recognition Tree Updated",
    source: GrowthEventSource.Tree,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A private supporter recognition tree model was updated."
  },
  [GrowthEventType.GrowthTimelineRecorded]: {
    type: GrowthEventType.GrowthTimelineRecorded,
    label: "Growth Timeline Recorded",
    source: GrowthEventSource.Timeline,
    defaultPriority: GrowthEventPriority.Low,
    description: "A replayable Growth timeline record was created."
  },
  [GrowthEventType.GrowthCalculationSimulated]: {
    type: GrowthEventType.GrowthCalculationSimulated,
    label: "Growth Calculation Simulated",
    source: GrowthEventSource.Calculator,
    defaultPriority: GrowthEventPriority.Low,
    description: "A campaign or supporter Growth Calculator simulation ran without mutating data."
  },
  [GrowthEventType.PointsEarned]: {
    type: GrowthEventType.PointsEarned,
    label: "Points Earned",
    source: GrowthEventSource.Contribution,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter earned points from an eligible campaign activity."
  },
  [GrowthEventType.PointsContributed]: {
    type: GrowthEventType.PointsContributed,
    label: "Points Contributed",
    source: GrowthEventSource.Contribution,
    defaultPriority: GrowthEventPriority.High,
    description: "A configured share of earned points was contributed to a parent referrer."
  },
  [GrowthEventType.ContributionCalculated]: {
    type: GrowthEventType.ContributionCalculated,
    label: "Contribution Calculated",
    source: GrowthEventSource.Contribution,
    defaultPriority: GrowthEventPriority.Normal,
    description: "The contribution engine completed an auditable point calculation."
  },
  [GrowthEventType.AdvancementEvaluated]: {
    type: GrowthEventType.AdvancementEvaluated,
    label: "Advancement Evaluated",
    source: GrowthEventSource.Advancement,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A supporter recognition level was evaluated against campaign-defined rules."
  },
  [GrowthEventType.AchievementQualified]: {
    type: GrowthEventType.AchievementQualified,
    label: "Achievement Qualified",
    source: GrowthEventSource.Achievement,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter qualified for a time-bound campaign achievement."
  },
  [GrowthEventType.PrizeQualified]: {
    type: GrowthEventType.PrizeQualified,
    label: "Prize Qualified",
    source: GrowthEventSource.Prize,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter qualified for a configurable recognition prize."
  },
  [GrowthEventType.RewardAvailable]: {
    type: GrowthEventType.RewardAvailable,
    label: "Reward Available",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A reward became available in the marketplace."
  },
  [GrowthEventType.RewardReserved]: {
    type: GrowthEventType.RewardReserved,
    label: "Reward Reserved",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.High,
    description: "A supporter reserved a reward using Growth Wallet balance."
  },
  [GrowthEventType.RewardApproved]: {
    type: GrowthEventType.RewardApproved,
    label: "Reward Approved",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.High,
    description: "A reward reservation was approved for fulfillment."
  },
  [GrowthEventType.RewardRejected]: {
    type: GrowthEventType.RewardRejected,
    label: "Reward Rejected",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.High,
    description: "A reward reservation was rejected."
  },
  [GrowthEventType.RewardExpired]: {
    type: GrowthEventType.RewardExpired,
    label: "Reward Expired",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A reserved reward or coupon expired."
  },
  [GrowthEventType.RewardRefunded]: {
    type: GrowthEventType.RewardRefunded,
    label: "Reward Refunded",
    source: GrowthEventSource.Reward,
    defaultPriority: GrowthEventPriority.High,
    description: "A redeemed reward was refunded back into wallet value."
  },
  [GrowthEventType.ShareCompleted]: {
    type: GrowthEventType.ShareCompleted,
    label: "Share Completed",
    source: GrowthEventSource.Share,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A campaign, referral, or reward share completed."
  },
  [GrowthEventType.NotificationSent]: {
    type: GrowthEventType.NotificationSent,
    label: "Notification Sent",
    source: GrowthEventSource.Notification,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A notification was sent or queued."
  },
  [GrowthEventType.SubscriptionChanged]: {
    type: GrowthEventType.SubscriptionChanged,
    label: "Subscription Changed",
    source: GrowthEventSource.Subscription,
    defaultPriority: GrowthEventPriority.High,
    description: "A workspace subscription state changed."
  },
  [GrowthEventType.WorkspaceCreated]: {
    type: GrowthEventType.WorkspaceCreated,
    label: "Workspace Created",
    source: GrowthEventSource.Workspace,
    defaultPriority: GrowthEventPriority.High,
    description: "A customer workspace was created."
  },
  [GrowthEventType.OrganizationCreated]: {
    type: GrowthEventType.OrganizationCreated,
    label: "Organization Created",
    source: GrowthEventSource.Organization,
    defaultPriority: GrowthEventPriority.High,
    description: "An organization or tenant identity was created."
  },
  [GrowthEventType.Login]: {
    type: GrowthEventType.Login,
    label: "Login",
    source: GrowthEventSource.Auth,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A user session was restored or authenticated."
  },
  [GrowthEventType.Logout]: {
    type: GrowthEventType.Logout,
    label: "Logout",
    source: GrowthEventSource.Auth,
    defaultPriority: GrowthEventPriority.Normal,
    description: "A user logged out."
  },
  [GrowthEventType.Error]: {
    type: GrowthEventType.Error,
    label: "Error",
    source: GrowthEventSource.System,
    defaultPriority: GrowthEventPriority.Critical,
    description: "An application or growth engine error occurred."
  },
  [GrowthEventType.Warning]: {
    type: GrowthEventType.Warning,
    label: "Warning",
    source: GrowthEventSource.System,
    defaultPriority: GrowthEventPriority.High,
    description: "A non-fatal warning occurred."
  },
  [GrowthEventType.SystemEvent]: {
    type: GrowthEventType.SystemEvent,
    label: "System Event",
    source: GrowthEventSource.System,
    defaultPriority: GrowthEventPriority.Low,
    description: "A generic system event was recorded."
  }
};
