import { lazy, Suspense, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Gift,
  Globe,
  MessageCircleMore,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  UsersRound
} from "lucide-react";
import { Panel } from "../../../ui/Panel";
import { CelebrationCard } from "../../celebrations";
import type { CampaignActivityFilter } from "../../engagement/types";
import { AnimatedCounter, MiniTrend, ProgressRing, SkeletonLoader, StatusBadge } from "../../ui";
import type { GrowthEngagementHubViewModel } from "../../viewModels/engagementViewModel";
import { useTranslation } from "../../../i18n/useTranslation";

const ActionCenter = lazy(() => import("../actionCenter/ActionCenter"));

interface CampaignEngagementHubProps {
  viewModel: GrowthEngagementHubViewModel;
}

function activityFilterWindow(filter: CampaignActivityFilter) {
  if (filter === "today") return 1;
  if (filter === "week") return 7;
  if (filter === "month") return 31;
  return Number.POSITIVE_INFINITY;
}

function daysAgo(value: string) {
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - at) / 86_400_000);
}

function trendLabel(delta: number) {
  if (delta > 0) return { icon: <TrendingUp size={14} />, text: `+${delta.toLocaleString()}`, tone: "good" as const };
  if (delta < 0) return { icon: <TrendingDown size={14} />, text: delta.toLocaleString(), tone: "danger" as const };
  return { icon: <ArrowRight size={14} />, text: "0", tone: "neutral" as const };
}

function leaderboardSignal(overallRank: number, referralRank: number | undefined) {
  if (!referralRank) return "new" as const;
  if (referralRank < overallRank) return "up" as const;
  if (referralRank > overallRank) return "down" as const;
  return "new" as const;
}

export function CampaignEngagementHub({ viewModel }: CampaignEngagementHubProps) {
  const { t } = useTranslation();
  const { engagement, gamification, shareStudio, insights, celebrations, intelligence } = viewModel;
  const [filter, setFilter] = useState<CampaignActivityFilter>("week");
  const filteredFeed = useMemo(
    () => engagement.feed.filter((item) => daysAgo(item.timestamp) <= activityFilterWindow(filter)),
    [engagement.feed, filter]
  );

  return (
    <section className="page-stack growth-dashboard">
      <Panel title={t("growth.engagement.title")} icon={<Sparkles />}>
        <div className="growth-hero">
          <div>
            <span className="eyebrow">{t("growth.engagement.commandCenter")}</span>
            <h2>{t("growth.engagement.headline")}</h2>
            <p>{t("growth.engagement.description")}</p>
          </div>
          <div className="growth-stage-card">
            <span>{t("growth.engagement.influence")}</span>
            <strong>
              <AnimatedCounter value={gamification.profile.impactPercentage} format={(value) => `${Math.round(value)}%`} />
            </strong>
            <small>{gamification.profile.currentRank} {t("growth.engagement.rank")}</small>
          </div>
        </div>

        <div className="growth-premium-metric-grid">
          {engagement.metrics.map((metric) => {
            const trend = trendLabel(metric.trendDelta);
            return (
              <article key={metric.id} className={`growth-premium-metric-card ${metric.health}`}>
                <div className="growth-premium-card-head">
                  <span className="eyebrow">{metric.label}</span>
                  <StatusBadge label={metric.health} tone={trend.tone} />
                </div>
                <strong>
                  <AnimatedCounter value={metric.value} format={() => metric.formattedValue} />
                </strong>
                <p>{metric.detail}</p>
                <MiniTrend values={metric.series} ariaLabel={`${metric.label} trend`} />
                <div className="growth-premium-card-footer">
                  <span>{trend.icon} {trend.text}</span>
                  <small>{metric.comparisonLabel}</small>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.engagement.activityTitle")} icon={<Activity />}>
          <div className="growth-filter-row" role="tablist" aria-label={t("growth.engagement.filtersAria")}>
            {(["today", "week", "month", "everything"] as CampaignActivityFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {t(`growth.engagement.filters.${item}`)}
              </button>
            ))}
          </div>
          <div className="growth-node-list">
            {filteredFeed.map((item) => (
              <article className="growth-node-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
                <StatusBadge label={item.kind} tone="info" />
              </article>
            ))}
            {engagement.feed.length > 0 && filteredFeed.length === 0 && (
              <article className="growth-empty-state-row">
                <strong>{t("growth.engagement.noFilterActivity")}</strong>
                <p>{t("growth.engagement.widerWindow")}</p>
                <div className="growth-empty-state-actions">
                  <button className="primary-button" type="button">{t("growth.engagement.createAnnouncement")}</button>
                  <button className="secondary-button" type="button">{t("growth.engagement.switchFilter")}</button>
                </div>
              </article>
            )}
            {engagement.feed.length === 0 && (
              <article className="growth-empty-state-row">
                <strong>{t("growth.engagement.noActivity")}</strong>
                <p>{engagement.feedEmptyMessage}</p>
                <div className="growth-empty-state-actions">
                  <button className="primary-button" type="button">{t("growth.engagement.quickShare")}</button>
                  <button className="secondary-button" type="button">{t("growth.engagement.createChallenge")}</button>
                </div>
              </article>
            )}
          </div>
        </Panel>

        <Panel title={t("growth.engagement.celebrations")} icon={<Gift />}>
          <div className="growth-celebration-grid">
            {celebrations.map((item) => (
              <CelebrationCard key={item.id} item={item} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.engagement.milestones")} icon={<Trophy />}>
          <div className="growth-node-list">
            {engagement.milestones.map((milestone) => (
              <article className="growth-node-row" key={milestone.id}>
                <div>
                  <strong>{milestone.title}</strong>
                  <small>{milestone.description}</small>
                </div>
                <StatusBadge
                  label={milestone.achieved ? t("growth.status.achieved") : `${milestone.target.toLocaleString()} ${t("growth.engagement.target")}`}
                  tone={milestone.achieved ? "good" : "neutral"}
                />
              </article>
            ))}
          </div>
        </Panel>

        <Panel title={t("growth.engagement.streakImpact")} icon={<TrendingUp />}>
          <div className="growth-channel-list">
            <article className="growth-channel-row">
              <div>
                <strong>{t("growth.engagement.currentStreak")}</strong>
                <small>{engagement.streak.current} {t("growth.engagement.activeDays")}</small>
              </div>
              <ProgressRing value={Math.min(100, engagement.streak.current * 14)} size={58} stroke={7} label={t("growth.engagement.currentStreak")} />
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>{t("growth.engagement.longestStreak")}</strong>
                <small>{t("growth.engagement.bestRun")}</small>
              </div>
              <span>{engagement.streak.longest}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>{t("growth.engagement.nextReward")}</strong>
                <small>{engagement.streak.upcomingReward}</small>
              </div>
              <StatusBadge label={t(engagement.streak.broken ? "growth.status.needsRecovery" : "growth.status.onTrack")} tone={engagement.streak.broken ? "warning" : "good"} />
            </article>
          </div>
          <div className="growth-impact-pill-list">
            {engagement.impactSummary.map((item) => (
              <span key={item}><UsersRound size={13} /> {item}</span>
            ))}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.engagement.insights")} icon={<ShieldCheck />}>
          <div className="growth-insight-grid">
            {insights.map((insight) => (
              <article key={insight.id}>
                <span>{insight.label}</span>
                <strong>{insight.value}</strong>
                <small>{insight.detail}</small>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title={t("growth.engagement.intelligenceCenter")} icon={<Rocket />}>
          <div className="growth-node-list">
            {intelligence.metrics.map((metric) => (
              <article className="growth-node-row" key={metric.id}>
                <div>
                  <strong>{metric.label}</strong>
                  <small>{metric.detail}</small>
                </div>
                <div>
                  <strong>{metric.formattedValue}</strong>
                  <small>{metric.trendDelta > 0 ? `+${metric.trendDelta}` : metric.trendDelta}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="growth-impact-pill-list">
            <span><TrendingUp size={13} /> {t("growth.engagement.topChannel")}: {intelligence.topGrowthChannel}</span>
            <span><Globe size={13} /> {t("growth.engagement.fastestLocation")}: {intelligence.fastestGrowingLocation}</span>
          </div>
          <div className="growth-admin-actions-grid">
            {intelligence.recommendations.map((item) => (
              <button key={item.id} type="button" className="growth-admin-action-button">
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <StatusBadge label={item.priority} tone={item.priority === "high" ? "warning" : item.priority === "medium" ? "info" : "neutral"} />
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t("growth.engagement.visualLeaderboard")} icon={<Trophy />}>
          {viewModel.gamification.profile.achievements.length === 0 && <SkeletonLoader lines={4} />}
          <div className="growth-podium-grid">
            {viewModel.leaderboard.overall.length > 0 && (
              <>
                {viewModel.leaderboard.overall.slice(0, 3).map((item, index) => (
                  <article key={item.id} className={`growth-podium-card rank-${index + 1}`}>
                    <span>#{index + 1}</span>
                    <strong>{item.name}</strong>
                    <small>{item.score.toLocaleString()} {t("growth.common.points")}</small>
                  </article>
                ))}
              </>
            )}
          </div>
          <div className="growth-leaderboard-list">
            {viewModel.leaderboard.overall.slice(0, 8).map((entry) => {
              const referralRank = viewModel.leaderboard.referral.find((item) => item.id === entry.id)?.rank;
              const signal = leaderboardSignal(entry.rank, referralRank);
              return (
                <article className="growth-leaderboard-row" key={entry.id}>
                  <span>{entry.rank}</span>
                  <div>
                    <strong>{entry.name}</strong>
                    <small>{t(signal === "up" ? "growth.status.up" : signal === "down" ? "growth.status.down" : "growth.status.new")}</small>
                  </div>
                  <div>
                    <strong>{entry.score.toLocaleString()} {t("growth.common.points")}</strong>
                    <small>{entry.level}</small>
                  </div>
                </article>
              );
            })}
            {viewModel.leaderboard.overall.length === 0 && (
              <article className="growth-empty-state-row">
                <strong>{t("growth.engagement.noLeaderboard")}</strong>
                <p>{t("growth.engagement.unlockRankings")}</p>
                <div className="growth-empty-state-actions">
                  <button className="primary-button" type="button">{t("growth.engagement.shareCampaign")}</button>
                  <button className="secondary-button" type="button">{t("growth.engagement.createChallenge")}</button>
                </div>
              </article>
            )}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.engagement.notifications")} icon={<Bell />}>
          <div className="growth-node-list">
            {intelligence.notifications.unread.slice(0, 4).map((item) => (
              <article className="growth-node-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
                <StatusBadge label={item.category} tone="info" />
              </article>
            ))}
            {intelligence.notifications.unread.length === 0 && intelligence.notifications.today.slice(0, 4).map((item) => (
              <article className="growth-node-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
                <StatusBadge label={item.category} tone="neutral" />
              </article>
            ))}
            {intelligence.notifications.unread.length === 0 && intelligence.notifications.today.length === 0 && (
              <article className="growth-empty-state-row">
                <strong>{t("growth.engagement.noNotifications")}</strong>
                <p>{t("growth.engagement.notificationsHelp")}</p>
              </article>
            )}
          </div>
        </Panel>

        <Panel title={t("growth.engagement.automationTimeline")} icon={<Sparkles />}>
          <div className="growth-node-list">
            {intelligence.automationTimeline.map((item) => (
              <article className="growth-node-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
                <StatusBadge label={item.kind} tone="neutral" />
              </article>
            ))}
            {intelligence.automationTimeline.length === 0 && (
              <article className="growth-empty-state-row">
                <strong>{t("growth.engagement.noAutomation")}</strong>
                <p>{t("growth.engagement.automationHelp")}</p>
              </article>
            )}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.engagement.shareStudio")} icon={<MessageCircleMore />}>
          <div className="growth-node-list">
            {shareStudio.cards.map((card) => (
              <article className="growth-node-row" key={card.id}>
                <div>
                  <strong>{card.title}</strong>
                  <small>{card.description}</small>
                </div>
                <StatusBadge label={card.channel} tone="neutral" />
              </article>
            ))}
          </div>
        </Panel>

        <Panel title={t("growth.engagement.quickActions")} icon={<ShieldCheck />}>
          <div className="growth-admin-actions-grid">
            {engagement.adminQuickActions.map((action) => (
              <button key={action.id} type="button" className="growth-admin-action-button">
                <strong>{action.label}</strong>
                <small>{action.description}</small>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.impact.title")} icon={<Globe />}>
          <div className="growth-insight-grid">
            <article>
              <span>{t("growth.impact.peopleReached")}</span>
              <strong>{intelligence.socialImpact.totalPeopleReached.toLocaleString()}</strong>
              <small>{t("growth.impact.estimatedReach")} {intelligence.socialImpact.estimatedReach.toLocaleString()}</small>
            </article>
            <article>
              <span>{t("growth.impact.volunteerHours")}</span>
              <strong>{intelligence.socialImpact.volunteerHours.toLocaleString()}</strong>
              <small>{t("growth.impact.volunteerHoursHelp")}</small>
            </article>
            <article>
              <span>{t("growth.impact.coverage")}</span>
              <strong>{intelligence.socialImpact.districtCoverage.toLocaleString()} {t("growth.impact.districts")}</strong>
              <small>{intelligence.socialImpact.stateCoverage.toLocaleString()} {t("growth.impact.states")}</small>
            </article>
            <article>
              <span>{t("growth.impact.communityInfluence")}</span>
              <strong>{intelligence.socialImpact.communityInfluenceScore.toLocaleString()}</strong>
              <small>{t("growth.impact.referralTree")} {intelligence.socialImpact.referralTreeSize.toLocaleString()}</small>
            </article>
          </div>
          <div className="growth-impact-pill-list">
            <span><UsersRound size={13} /> {t("growth.impact.shares")} {intelligence.socialImpact.totalShares.toLocaleString()}</span>
            <span><TrendingUp size={13} /> {t("growth.impact.forecast30d")} {intelligence.forecast.projectedSupporters30d.toLocaleString()}</span>
            <span><ArrowRight size={13} /> {intelligence.forecast.targetCompletionForecast}</span>
          </div>
        </Panel>

        <Panel title={t("growth.certificate.title")} icon={<Trophy />}>
          <div className="growth-config-preview">
            <div>
              <span className="eyebrow">{t("growth.certificate.template")}</span>
              <strong>{intelligence.certificatePreview.name}</strong>
              <p>{intelligence.certificatePreview.title}</p>
              <small>{t("growth.certificate.badge")}: {intelligence.certificatePreview.badge}</small>
            </div>
            <div>
              <span className="eyebrow">{t("growth.certificate.issuance")}</span>
              <strong>{intelligence.certificatePreview.issueRule}</strong>
              <p>{t("growth.certificate.signatory")}: {intelligence.certificatePreview.signatory}</p>
              <small>{t(intelligence.certificatePreview.qrEnabled ? "growth.certificate.qrEnabled" : "growth.certificate.qrDisabled")}</small>
            </div>
            <div>
              <span className="eyebrow">{t("growth.certificate.verification")}</span>
              <strong>{intelligence.certificatePreview.verificationLink}</strong>
              <p>{t(intelligence.certificatePreview.enabled ? "growth.certificate.enabled" : "growth.certificate.disabled")}</p>
            </div>
          </div>
        </Panel>
      </div>

      <Suspense fallback={<SkeletonLoader lines={6} />}>
        <ActionCenter runtime={viewModel.runtime} activeCampaignId={viewModel.activeCampaignId} />
      </Suspense>
    </section>
  );
}
