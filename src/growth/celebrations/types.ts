export type CelebrationKind =
  | "level_promotion"
  | "challenge_completion"
  | "milestone_achievement"
  | "campaign_milestone"
  | "leaderboard_rank"
  | "recognition_badge"
  | "referral_target"
  | "volunteer_achievement";

export interface CelebrationItem {
  id: string;
  kind: CelebrationKind;
  title: string;
  description: string;
  progressPercentage: number;
  nextTarget: string;
  shareLabel: string;
  certificateReady: boolean;
}
