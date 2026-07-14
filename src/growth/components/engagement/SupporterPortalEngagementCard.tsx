import { ArrowRight, Share2, Sparkles, Trophy } from "lucide-react";
import type { SupporterGrowthPortalViewModel } from "../../supporter/types";
import { useTranslation } from "../../../i18n/useTranslation";
import { ProgressRing, StatusBadge } from "../../ui";

function formatNumber(value: number | undefined) {
  return Math.max(0, Math.round(value ?? 0)).toLocaleString();
}

export function SupporterPortalEngagementCard({ portal }: { portal: SupporterGrowthPortalViewModel }) {
  const { t } = useTranslation();
  const activeDays = Array.from(new Set(portal.timeline.map((event) => event.timestamp.slice(0, 10)))).length;
  const streak = Math.max(0, Math.min(30, activeDays));
  const rank = portal.leaderboards.find((item) => item.filter === "overall")?.rank;
  const regionalRank = rank ? `${t("growth.portal.top")} ${Math.min(99, Math.max(5, rank * 3))}%` : t("growth.portal.building");
  const nationalRank = rank ? `${t("growth.portal.top")} ${Math.min(99, Math.max(10, rank * 5))}%` : t("growth.portal.building");
  const influenceScore = Math.round(
    portal.impact.signaturesInfluenced * 1.2 + portal.impact.verifiedReferrals * 2 + portal.wallet.balance.walletCredits * 0.4
  );

  return (
    <article className="supporter-portal-card">
      <div className="supporter-card-heading">
        <Sparkles />
        <div>
        <span className="eyebrow">{t("growth.engagement.title")}</span>
        <h2>{t("growth.portal.momentum")}</h2>
        </div>
      </div>
      <div className="supporter-metric-grid compact">
        <div className="supporter-portal-metric">
          <span>{t("growth.engagement.currentStreak")}</span>
          <strong>{streak} {t("growth.portal.days")}</strong>
          <small>{t("growth.portal.keepMomentum")}</small>
        </div>
        <div className="supporter-portal-metric">
          <span>{t("growth.wallet.walletCredits")}</span>
          <strong>{formatNumber(portal.wallet.balance.walletCredits)}</strong>
          <small>{t("growth.portal.readyRecognition")}</small>
        </div>
        <div className="supporter-portal-metric">
          <span>{t("growth.portal.nextMilestone")}</span>
          <strong>{portal.nextLevel?.name ?? t("growth.portal.champion")}</strong>
          <small>{portal.remainingReferralsNeeded} {t("growth.portal.referralsAway")}</small>
        </div>
        <div className="supporter-portal-metric">
          <span>{t("growth.portal.influenceScore")}</span>
          <strong>{formatNumber(influenceScore)}</strong>
          <small>{t("growth.portal.influenceHelp")}</small>
        </div>
      </div>
      <div className="supporter-pill-row">
        <span><Trophy size={14} /> {portal.currentLevel?.name ?? t("growth.portal.supporter")}</span>
          <span><Share2 size={14} /> {t("growth.portal.shareReadyCards")}</span>
      </div>
      <div className="supporter-metric-grid compact">
        <div className="supporter-portal-metric">
          <span>{t("growth.portal.currentRank")}</span>
          <strong>{rank ? `#${rank}` : t("growth.portal.unranked")}</strong>
          <small>{t("growth.portal.overallLeaderboard")}</small>
        </div>
        <div className="supporter-portal-metric">
          <span>{t("growth.portal.regionalRank")}</span>
          <strong>{regionalRank}</strong>
          <small>{t("growth.portal.regionalEstimate")}</small>
        </div>
        <div className="supporter-portal-metric">
          <span>{t("growth.portal.nationalRank")}</span>
          <strong>{nationalRank}</strong>
          <small>{t("growth.portal.nationalEstimate")}</small>
        </div>
        <div className="supporter-portal-metric">
          <span>{t("growth.portal.progress")}</span>
          <div className="supporter-inline-progress-ring">
          <ProgressRing value={portal.progressPercentage} size={58} stroke={7} label={t("growth.portal.progressNextLevel")} />
          </div>
          <small>{portal.remainingCreditsNeeded} {t("growth.portal.creditsToNextLevel")}</small>
        </div>
      </div>
        <p>{t("growth.portal.announcementsHelp")}</p>
      <div className="supporter-pill-row">
        <StatusBadge label={portal.achievements.length > 0 ? t("growth.portal.achievementUnlocked") : t("growth.portal.firstAchievementPending")} tone={portal.achievements.length > 0 ? "good" : "warning"} />
        <StatusBadge label={portal.prizes.length > 0 ? t("growth.portal.upcomingReward") : t("growth.portal.rewardPathActive")} tone="info" />
      </div>
      <div className="supporter-share-grid">
        <button className="secondary-button" type="button">{t("growth.portal.dailyTarget")} <ArrowRight size={14} /></button>
        <button className="secondary-button" type="button">{t("growth.portal.volunteerCall")} <ArrowRight size={14} /></button>
      </div>
    </article>
  );
}
