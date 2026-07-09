import type { GrowthRuntimeState } from "../lifecycle";
import type { GrowthDashboardModel } from "../types";
import type { CelebrationItem } from "./types";

export function buildCelebrationItems(
  model: GrowthDashboardModel,
  runtime?: GrowthRuntimeState,
  activeCampaignId?: string
): CelebrationItem[] {
  const snapshots = (runtime?.supporterSnapshots ?? []).filter((snapshot) =>
    activeCampaignId ? snapshot.campaignId === activeCampaignId : true
  );
  const achievements = (runtime?.achievements ?? []).filter((item) =>
    activeCampaignId ? item.campaignId === activeCampaignId : true
  );
  const prizes = (runtime?.prizes ?? []).filter((item) =>
    activeCampaignId ? item.campaignId === activeCampaignId : true
  );
  const topOverall = model.leaderboards.overall[0];
  const referralTarget = Math.max(10, Math.ceil(model.summary.totalSupporters * 0.1));
  const currentReferrals = model.summary.referralSignatures;

  return [
    {
      id: "celebration-referral-target",
      kind: "referral_target",
      title: "Referral Target",
      description: "Supporters are progressing toward the next referral milestone.",
      progressPercentage: Math.min(100, Math.round((currentReferrals / referralTarget) * 100)),
      nextTarget: `${referralTarget.toLocaleString()} referral signatures`,
      shareLabel: "Share campaign momentum",
      certificateReady: false
    },
    {
      id: "celebration-leaderboard-rank",
      kind: "leaderboard_rank",
      title: "Leaderboard Momentum",
      description: topOverall
        ? `${topOverall.name} is currently leading the movement.`
        : "Leaderboard starts ranking once supporter activity arrives.",
      progressPercentage: topOverall ? 100 : 0,
      nextTarget: topOverall ? `Rank #${topOverall.rank} maintained` : "First ranked supporter",
      shareLabel: "Share leaderboard",
      certificateReady: false
    },
    {
      id: "celebration-recognition",
      kind: "recognition_badge",
      title: "Recognition Badges",
      description: `${snapshots.length.toLocaleString()} supporter snapshots are tracked for recognition.`,
      progressPercentage: Math.min(100, snapshots.length > 0 ? 100 : 0),
      nextTarget: snapshots.length > 0 ? "Next supporter badge unlock" : "First recognition badge",
      shareLabel: "Share recognition",
      certificateReady: snapshots.some((snapshot) => snapshot.certificates.length > 0)
    },
    {
      id: "celebration-challenge",
      kind: "challenge_completion",
      title: "Challenge Completion",
      description: `${achievements.length.toLocaleString()} challenge-aligned achievements are qualified.`,
      progressPercentage: Math.min(100, achievements.length === 0 ? 0 : 35 + achievements.length * 8),
      nextTarget: achievements.length === 0 ? "First challenge completion" : `${achievements.length + 1} total completions`,
      shareLabel: "Share challenge progress",
      certificateReady: prizes.length > 0
    }
  ];
}
