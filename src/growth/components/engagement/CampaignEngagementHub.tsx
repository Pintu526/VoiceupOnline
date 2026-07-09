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
  const { engagement, gamification, shareStudio, insights, celebrations, intelligence } = viewModel;
  const [filter, setFilter] = useState<CampaignActivityFilter>("week");
  const filteredFeed = useMemo(
    () => engagement.feed.filter((item) => daysAgo(item.timestamp) <= activityFilterWindow(filter)),
    [engagement.feed, filter]
  );

  return (
    <section className="page-stack growth-dashboard">
      <Panel title="Campaign Engagement Hub" icon={<Sparkles />}>
        <div className="growth-hero">
          <div>
            <span className="eyebrow">Live campaign command center</span>
            <h2>Momentum, milestones, and supporter delight in one place.</h2>
            <p>
              Premium campaign health metrics, live activity stream, celebrations, and quick actions powered by
              the existing Growth runtime.
            </p>
          </div>
          <div className="growth-stage-card">
            <span>Campaign influence</span>
            <strong>
              <AnimatedCounter value={gamification.profile.impactPercentage} format={(value) => `${Math.round(value)}%`} />
            </strong>
            <small>{gamification.profile.currentRank} rank</small>
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
        <Panel title="Live Activity Stream" icon={<Activity />}>
          <div className="growth-filter-row" role="tablist" aria-label="Activity filters">
            {(["today", "week", "month", "everything"] as CampaignActivityFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
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
                <strong>No activity in this filter</strong>
                <p>Switch to a wider window or publish an announcement to reignite momentum.</p>
                <div className="growth-empty-state-actions">
                  <button className="primary-button" type="button">Create announcement</button>
                  <button className="secondary-button" type="button">Switch filter</button>
                </div>
              </article>
            )}
            {engagement.feed.length === 0 && (
              <article className="growth-empty-state-row">
                <strong>No campaign activity yet</strong>
                <p>{engagement.feedEmptyMessage}</p>
                <div className="growth-empty-state-actions">
                  <button className="primary-button" type="button">Quick share</button>
                  <button className="secondary-button" type="button">Create challenge</button>
                </div>
              </article>
            )}
          </div>
        </Panel>

        <Panel title="Celebrations" icon={<Gift />}>
          <div className="growth-celebration-grid">
            {celebrations.map((item) => (
              <CelebrationCard key={item.id} item={item} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title="Campaign Milestones" icon={<Trophy />}>
          <div className="growth-node-list">
            {engagement.milestones.map((milestone) => (
              <article className="growth-node-row" key={milestone.id}>
                <div>
                  <strong>{milestone.title}</strong>
                  <small>{milestone.description}</small>
                </div>
                <StatusBadge
                  label={milestone.achieved ? "Achieved" : `${milestone.target.toLocaleString()} target`}
                  tone={milestone.achieved ? "good" : "neutral"}
                />
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Streak & Impact" icon={<TrendingUp />}>
          <div className="growth-channel-list">
            <article className="growth-channel-row">
              <div>
                <strong>Current streak</strong>
                <small>{engagement.streak.current} active day(s)</small>
              </div>
              <ProgressRing value={Math.min(100, engagement.streak.current * 14)} size={58} stroke={7} label="Current streak" />
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>Longest streak</strong>
                <small>Best run so far</small>
              </div>
              <span>{engagement.streak.longest}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>Next reward</strong>
                <small>{engagement.streak.upcomingReward}</small>
              </div>
              <StatusBadge label={engagement.streak.broken ? "Needs recovery" : "On track"} tone={engagement.streak.broken ? "warning" : "good"} />
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
        <Panel title="Engagement Insights" icon={<ShieldCheck />}>
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

        <Panel title="Campaign Intelligence Center" icon={<Rocket />}>
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
            <span><TrendingUp size={13} /> Top channel: {intelligence.topGrowthChannel}</span>
            <span><Globe size={13} /> Fastest location: {intelligence.fastestGrowingLocation}</span>
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

        <Panel title="Visual Leaderboard" icon={<Trophy />}>
          {viewModel.gamification.profile.achievements.length === 0 && <SkeletonLoader lines={4} />}
          <div className="growth-podium-grid">
            {viewModel.leaderboard.overall.length > 0 && (
              <>
                {viewModel.leaderboard.overall.slice(0, 3).map((item, index) => (
                  <article key={item.id} className={`growth-podium-card rank-${index + 1}`}>
                    <span>#{index + 1}</span>
                    <strong>{item.name}</strong>
                    <small>{item.score.toLocaleString()} pts</small>
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
                    <small>{signal === "up" ? "Up" : signal === "down" ? "Down" : "New"}</small>
                  </div>
                  <div>
                    <strong>{entry.score.toLocaleString()} pts</strong>
                    <small>{entry.level}</small>
                  </div>
                </article>
              );
            })}
            {viewModel.leaderboard.overall.length === 0 && (
              <article className="growth-empty-state-row">
                <strong>No leaderboard activity yet</strong>
                <p>Invite supporters and publish campaign activity to unlock rankings.</p>
                <div className="growth-empty-state-actions">
                  <button className="primary-button" type="button">Share campaign</button>
                  <button className="secondary-button" type="button">Create challenge</button>
                </div>
              </article>
            )}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title="Notification Center" icon={<Bell />}>
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
                <strong>No notification activity yet</strong>
                <p>Notifications appear as runtime timeline events are processed.</p>
              </article>
            )}
          </div>
        </Panel>

        <Panel title="Automation Timeline" icon={<Sparkles />}>
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
                <strong>No automation timeline events yet</strong>
                <p>Enable automation rules in Growth Configuration Studio to populate this timeline.</p>
              </article>
            )}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title="Social Share Studio" icon={<MessageCircleMore />}>
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

        <Panel title="Admin Quick Actions" icon={<ShieldCheck />}>
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
        <Panel title="Social Impact Dashboard" icon={<Globe />}>
          <div className="growth-insight-grid">
            <article>
              <span>People reached</span>
              <strong>{intelligence.socialImpact.totalPeopleReached.toLocaleString()}</strong>
              <small>Estimated reach {intelligence.socialImpact.estimatedReach.toLocaleString()}</small>
            </article>
            <article>
              <span>Volunteer hours</span>
              <strong>{intelligence.socialImpact.volunteerHours.toLocaleString()}</strong>
              <small>From runtime volunteer timeline events</small>
            </article>
            <article>
              <span>Coverage</span>
              <strong>{intelligence.socialImpact.districtCoverage.toLocaleString()} districts</strong>
              <small>{intelligence.socialImpact.stateCoverage.toLocaleString()} states</small>
            </article>
            <article>
              <span>Community influence</span>
              <strong>{intelligence.socialImpact.communityInfluenceScore.toLocaleString()}</strong>
              <small>Referral tree {intelligence.socialImpact.referralTreeSize.toLocaleString()}</small>
            </article>
          </div>
          <div className="growth-impact-pill-list">
            <span><UsersRound size={13} /> Shares {intelligence.socialImpact.totalShares.toLocaleString()}</span>
            <span><TrendingUp size={13} /> 30d forecast {intelligence.forecast.projectedSupporters30d.toLocaleString()}</span>
            <span><ArrowRight size={13} /> {intelligence.forecast.targetCompletionForecast}</span>
          </div>
        </Panel>

        <Panel title="Certificate Preview" icon={<Trophy />}>
          <div className="growth-config-preview">
            <div>
              <span className="eyebrow">Template</span>
              <strong>{intelligence.certificatePreview.name}</strong>
              <p>{intelligence.certificatePreview.title}</p>
              <small>Badge: {intelligence.certificatePreview.badge}</small>
            </div>
            <div>
              <span className="eyebrow">Issuance</span>
              <strong>{intelligence.certificatePreview.issueRule}</strong>
              <p>Signatory: {intelligence.certificatePreview.signatory}</p>
              <small>{intelligence.certificatePreview.qrEnabled ? "QR verification enabled" : "QR verification disabled"}</small>
            </div>
            <div>
              <span className="eyebrow">Verification</span>
              <strong>{intelligence.certificatePreview.verificationLink}</strong>
              <p>{intelligence.certificatePreview.enabled ? "Certificate issuance is enabled" : "Certificate issuance is disabled"}</p>
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
