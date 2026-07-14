import {
  Award,
  BadgeCheck,
  BarChart3,
  Gift,
  GitBranch,
  Medal,
  Network,
  Share2,
  Sparkles,
  TrendingUp,
  Trophy,
  UsersRound
} from "lucide-react";
import { lazy, Suspense } from "react";
import type { Campaign, Organization, Signer } from "../../types";
import type { GrowthTrendPoint, LeaderboardEntry } from "../../growth";
import type { GrowthRuntimeState } from "../../growth/lifecycle";
import { GrowthProvider } from "../../growth/providers/GrowthProvider";
import { useGrowth } from "../../growth/hooks/useGrowth";
import { Panel } from "../../ui/Panel";
import { MetricCard } from "../../ui/MetricCard";
import { CampaignEngagementHub } from "../../growth/components/engagement";
import { buildGrowthEngagementHubViewModel } from "../../growth/viewModels/engagementViewModel";
import { buildMerchantDashboardModel } from "../../growth/merchant";
import { buildRewardCenterModel } from "../../growth/rewards";
import { applyRewardRuntimeAction, type RewardRuntimeAction } from "../../growth/rewards/rewardRuntimeService";
import { useTranslation } from "../../i18n/useTranslation";

const MerchantDashboard = lazy(() => import("../../growth/merchant/components/MerchantDashboard"));

interface GrowthDashboardTabProps {
  campaigns: Campaign[];
  activeCampaign: Campaign | undefined;
  organization: Organization;
  signers: Signer[];
  campaignSigners: Signer[];
  growthRuntime?: GrowthRuntimeState;
  onGrowthRuntimeChange: (updater: (current: GrowthRuntimeState) => GrowthRuntimeState) => void;
}

function TrendBars({ trends }: { trends: GrowthTrendPoint[] }) {
  const { t } = useTranslation();
  const maxValue = Math.max(1, ...trends.map((point) => point.signatures));
  return (
    <div className="growth-trend-bars" aria-label={t("growth.analytics.trendAria")}>
      {trends.map((point) => (
        <div className="growth-trend-bar" key={point.label}>
          <span
            style={{ height: `${Math.max(8, (point.signatures / maxValue) * 100)}%` }}
            title={`${point.signatures} ${t("growth.common.signatures")}, ${point.referrals} ${t("growth.common.referrals")}`}
          />
          <small>{point.label}</small>
        </div>
      ))}
    </div>
  );
}

function LeaderboardList({ entries }: { entries: LeaderboardEntry[] }) {
  const { t } = useTranslation();
  return (
    <div className="growth-leaderboard-list">
      {entries.length === 0 && <p className="helper-text">{t("growth.leaderboard.empty")}</p>}
      {entries.map((entry) => (
        <article className="growth-leaderboard-row" key={entry.id}>
          <span>{entry.rank}</span>
          <div>
            <strong>{entry.name}</strong>
            <small>{entry.level} - {entry.location}</small>
          </div>
          <div>
            <strong>{entry.score.toLocaleString()}</strong>
            <small>{entry.directReferrals.toLocaleString()} {t("growth.common.referrals")}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

export function GrowthDashboardTab({
  campaigns,
  activeCampaign,
  organization,
  signers,
  campaignSigners,
  growthRuntime,
  onGrowthRuntimeChange
}: GrowthDashboardTabProps) {
  return (
    <GrowthProvider input={{ campaigns, activeCampaign, organization, signers, campaignSigners }}>
      <GrowthDashboardContent
        growthRuntime={growthRuntime}
        activeCampaign={activeCampaign}
        activeCampaignId={activeCampaign?.id}
        campaignSigners={campaignSigners}
        onGrowthRuntimeChange={onGrowthRuntimeChange}
      />
    </GrowthProvider>
  );
}

function GrowthDashboardContent({
  growthRuntime,
  activeCampaign,
  activeCampaignId,
  campaignSigners,
  onGrowthRuntimeChange
}: {
  growthRuntime?: GrowthRuntimeState;
  activeCampaign?: Campaign;
  activeCampaignId?: string;
  campaignSigners: Signer[];
  onGrowthRuntimeChange: (updater: (current: GrowthRuntimeState) => GrowthRuntimeState) => void;
}) {
  const { t } = useTranslation();
  const { dashboardModel: model } = useGrowth();
  const campaignWallets = (growthRuntime?.wallets ?? []).filter((wallet) =>
    activeCampaignId ? wallet.campaignId === activeCampaignId : true
  );
  const walletSummary = campaignWallets.reduce(
    (summary, wallet) => ({
      walletCredits: summary.walletCredits + wallet.balance.walletCredits,
      promotionCredits: summary.promotionCredits + wallet.balance.promotionCredits,
      contributionCredits: summary.contributionCredits + wallet.balance.contributionCredits,
      lifetimeGrowth: summary.lifetimeGrowth + wallet.balance.lifetimeGrowth
    }),
    { walletCredits: 0, promotionCredits: 0, contributionCredits: 0, lifetimeGrowth: 0 }
  );
  const recognitionDistribution = (growthRuntime?.supporterSnapshots ?? [])
    .filter((snapshot) => (activeCampaignId ? snapshot.campaignId === activeCampaignId : true))
    .reduce<Record<string, number>>((items, snapshot) => {
      const label = snapshot.currentRecognitionLevelName ?? t("growth.status.inProgress");
      return { ...items, [label]: (items[label] ?? 0) + 1 };
    }, {});
  const recentTimeline = (growthRuntime?.timeline ?? [])
    .filter((record) => (activeCampaignId ? record.campaignId === activeCampaignId : true))
    .slice(-6)
    .reverse();
  const engagementViewModel = buildGrowthEngagementHubViewModel({
    model,
    runtime: growthRuntime,
    activeCampaignId
  });
  const merchantDashboard = activeCampaign
    ? buildMerchantDashboardModel({
        merchants: activeCampaign.growthConfiguration?.merchants ?? [],
        redemptions: (growthRuntime?.redemptions ?? []).filter((item) => item.campaignId === activeCampaign.id),
        campaignLabels: { [activeCampaign.id]: activeCampaign.title },
        supporterLabels: Object.fromEntries(campaignSigners.map((signer) => [signer.id, signer.name || signer.phone || signer.id]))
      })
    : undefined;
  const rewardAnalytics = activeCampaign
    ? buildRewardCenterModel({
        campaign: activeCampaign,
        merchants: activeCampaign.growthConfiguration?.merchants ?? [],
        redemptions: (growthRuntime?.redemptions ?? []).filter((item) => item.campaignId === activeCampaign.id),
        coupons: (growthRuntime?.coupons ?? []).filter((item) => item.campaignId === activeCampaign.id),
        wishlists: (growthRuntime?.wishlists ?? []).filter((item) => item.campaignId === activeCampaign.id),
        wallet: campaignWallets[0] ?? { id: "aggregate-wallet", campaignId: activeCampaign.id, supporterId: "aggregate", balance: { walletCredits: 0, promotionCredits: 0, contributionCredits: 0, recognitionCredits: 0, bonusCredits: 0, redeemedCredits: 0, reservedCredits: 0, expiredCredits: 0, totalEarned: 0, totalContributed: 0, pendingPromotion: 0, lifetimeGrowth: 0, forecastCredits: 0, currentBalance: 0 }, history: [], updatedAt: new Date().toISOString() },
        supporterId: campaignSigners[0]?.id ?? "aggregate",
        wallets: campaignWallets
      }).analytics
    : undefined;
  const pendingRedemptions = (growthRuntime?.redemptions ?? []).filter(
    (item) => item.campaignId === activeCampaignId && (item.status === "reserved" || item.status === "pending" || item.status === "approved")
  );

  function handleRewardAction(action: RewardRuntimeAction) {
    if (!activeCampaign) return;
    onGrowthRuntimeChange((current) => applyRewardRuntimeAction({ runtime: current, campaign: activeCampaign, action }).runtime);
  }

  return (
    <section className="page-stack growth-dashboard">
      <CampaignEngagementHub viewModel={engagementViewModel} />
      <Panel title={t("growth.dashboard.title")} icon={<TrendingUp />}>
        <div className="growth-hero">
          <div>
            <span className="eyebrow">{t("growth.dashboard.foundation")}</span>
            <h2>{model.scope.label}</h2>
            <p>{t("growth.dashboard.description")}</p>
          </div>
          <div className="growth-stage-card">
            <span>{t("growth.dashboard.stage")}</span>
            <strong>{model.summary.stage}</strong>
            <small>{model.summary.growthScore}/100 {t("growth.dashboard.score")}</small>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard
            icon={<UsersRound />}
            label={t("growth.common.supporters")}
            value={model.summary.totalSupporters}
            detail={`${model.analytics.newSupporters7d.toLocaleString()} ${t("growth.dashboard.joinedSevenDays")}`}
          />
          <MetricCard
            icon={<Share2 />}
            label={t("growth.dashboard.referralSignatures")}
            value={model.summary.referralSignatures}
            detail={`${model.summary.referralRate}% ${t("growth.dashboard.referralRate")}`}
          />
          <MetricCard
            icon={<BadgeCheck />}
            label={t("growth.common.ambassadors")}
            value={model.summary.ambassadorCount}
            detail={`${t("growth.dashboard.topLevel")}: ${model.ambassadors.topLevel}`}
          />
          <MetricCard
            icon={<Award />}
            label={t("growth.dashboard.rewardsEarned")}
            value={model.summary.earnedRewards}
            detail={`${model.rewards.availableRewards.toLocaleString()} ${t("growth.dashboard.rewardsNearlyAvailable")}`}
          />
        </div>
      </Panel>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.analytics.title")} icon={<BarChart3 />}>
          <TrendBars trends={model.analytics.trends} />
          <div className="growth-channel-list">
            {model.analytics.channels.map((channel) => (
              <article className="growth-channel-row" key={channel.channel}>
                <div>
                  <strong>{channel.label}</strong>
                  <small>{channel.count.toLocaleString()} {t("growth.analytics.supporterRecords")}</small>
                </div>
                <span>{channel.percentage}%</span>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title={t("referrals.domain.title")} icon={<GitBranch />}>
          <div className="growth-domain-summary">
            <strong>{model.referrals.edges.length.toLocaleString()}</strong>
            <span>{t("referrals.domain.edgesRecorded")}</span>
            <small>
              {t("referrals.domain.strongestCode")}: {model.referrals.strongestCode || t("referrals.domain.afterActivity")}
            </small>
          </div>
          <div className="growth-node-list">
            {model.referrals.nodes.slice(0, 5).map((node) => (
              <article className="growth-node-row" key={node.code}>
                <div>
                  <strong>{node.label}</strong>
                  <small>{node.location}</small>
                </div>
                <span>{node.directSignatures.toLocaleString()}</span>
              </article>
            ))}
            {model.referrals.nodes.length === 0 && (
              <p className="helper-text">{t("referrals.domain.nodesHelp")}</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.wallet.title")} icon={<Award />}>
          <div className="growth-channel-list">
            <article className="growth-channel-row">
              <div>
                <strong>{t("growth.wallet.walletCredits")}</strong>
                <small>{t("growth.wallet.retained")}</small>
              </div>
              <span>{walletSummary.walletCredits.toLocaleString()}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>{t("growth.wallet.promotionCredits")}</strong>
                <small>{t("growth.wallet.promotionHelp")}</small>
              </div>
              <span>{walletSummary.promotionCredits.toLocaleString()}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>{t("growth.wallet.contributionCredits")}</strong>
                <small>{t("growth.wallet.contributionHelp")}</small>
              </div>
              <span>{walletSummary.contributionCredits.toLocaleString()}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>{t("growth.wallet.reservedRedeemed")}</strong>
                <small>{t("growth.wallet.reservedHelp")}</small>
              </div>
              <span>{campaignWallets.reduce((sum, wallet) => sum + wallet.balance.reservedCredits + wallet.balance.redeemedCredits, 0).toLocaleString()}</span>
            </article>
          </div>
        </Panel>

        <Panel title={t("growth.recognition.title")} icon={<BadgeCheck />}>
          <div className="growth-node-list">
            {Object.entries(recognitionDistribution).map(([label, count]) => (
              <article className="growth-node-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <small>{t("growth.recognition.level")}</small>
                </div>
                <span>{count.toLocaleString()}</span>
              </article>
            ))}
            {Object.keys(recognitionDistribution).length === 0 && (
              <p className="helper-text">{t("growth.recognition.empty")}</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title={t("growth.timeline.title")} icon={<TrendingUp />}>
        <div className="growth-node-list">
          {recentTimeline.map((record) => (
            <article className="growth-node-row" key={record.id}>
              <div>
                <strong>{record.title}</strong>
                <small>{new Date(record.timestamp).toLocaleString()}</small>
              </div>
              <span>{record.kind}</span>
            </article>
          ))}
          {recentTimeline.length === 0 && (
            <p className="helper-text">{t("growth.timeline.empty")}</p>
          )}
        </div>
      </Panel>

      <div className="growth-dashboard-grid">
        <Panel title={t("growth.ambassadors.title")} icon={<Network />}>
          <div className="growth-ambassador-list">
            {model.ambassadors.profiles.slice(0, 6).map((profile) => (
              <article className="growth-ambassador-row" key={profile.id}>
                <div>
                  <strong>{profile.name}</strong>
                  <small>{profile.level} - {profile.location}</small>
                </div>
                <div>
                  <span>{profile.totalPoints.toLocaleString()} {t("growth.common.points")}</span>
                  <small>{profile.directReferrals.toLocaleString()} {t("growth.common.referrals")}</small>
                </div>
              </article>
            ))}
            {model.ambassadors.profiles.length === 0 && (
              <p className="helper-text">{t("growth.ambassadors.empty")}</p>
            )}
          </div>
        </Panel>

        <Panel title={t("growth.rewards.domainTitle")} icon={<Medal />}>
          <div className="growth-reward-rule-grid">
            {model.rewards.rules.map((rule) => (
              <article className="growth-reward-rule" key={rule.id}>
                <Sparkles size={18} />
                <div>
                  <strong>{rule.label}</strong>
                  <small>{rule.pointsRequired.toLocaleString()} {t("growth.rewards.pointsRequired")}</small>
                  <p>{rule.description}</p>
                </div>
              </article>
            ))}
            {activeCampaign && model.rewards.catalogCount === 0 && <p className="helper-text">{t("growth.rewards.configureCatalog")}</p>}
          </div>
        </Panel>
      </div>

      {activeCampaign && merchantDashboard && rewardAnalytics && (
        <>
          <div className="growth-dashboard-grid">
            <Panel title={t("growth.rewards.analyticsTitle")} icon={<Gift />}>
              <div className="growth-insight-grid">
                <article><span>{t("growth.rewards.popularity")}</span><strong>{rewardAnalytics.rewardPopularity[0]?.label ?? t("growth.rewards.noRewards")}</strong><small>{rewardAnalytics.rewardPopularity[0]?.redemptionCount ?? 0} {t("growth.rewards.redemptions")}</small></article>
                <article><span>{t("growth.rewards.burnRate")}</span><strong>{rewardAnalytics.walletBurnRate.toLocaleString()}</strong><small>{t("growth.rewards.pointsSpent")}</small></article>
                <article><span>{t("growth.rewards.redemptionRate")}</span><strong>{rewardAnalytics.redemptionRate}%</strong><small>{t("growth.rewards.pipelineHelp")}</small></article>
                <article><span>{t("growth.rewards.averageBalance")}</span><strong>{rewardAnalytics.averageWalletBalance.toLocaleString()}</strong><small>{t("growth.rewards.acrossWallets")}</small></article>
              </div>
              <div className="growth-node-list">
                {rewardAnalytics.mostDesiredRewards.map((item) => (
                  <article className="growth-node-row" key={item.rewardId}><div><strong>{item.label}</strong><small>{t("growth.rewards.wishlistDemand")}</small></div><span>{item.wishlistCount}</span></article>
                ))}
                {rewardAnalytics.topRedeemers.map((item) => (
                  <article className="growth-node-row" key={item.supporterId}><div><strong>{item.supporterId}</strong><small>{t("growth.rewards.topRedeemer")}</small></div><span>{item.pointsBurned}</span></article>
                ))}
              </div>
            </Panel>

            <Panel title={t("growth.rewards.merchantDashboard")} icon={<Gift />}>
              <Suspense fallback={<div className="growth-skeleton-loader"><span /><span /><span /></div>}>
                <MerchantDashboard model={merchantDashboard} pendingRedemptions={pendingRedemptions} onAction={handleRewardAction} />
              </Suspense>
            </Panel>
          </div>
        </>
      )}

      <Panel title={t("growth.leaderboard.title")} icon={<Trophy />}>
        <div className="growth-leaderboard-grid">
          <div>
            <span className="eyebrow">{t("growth.leaderboard.overall")}</span>
            <LeaderboardList entries={model.leaderboards.overall} />
          </div>
          <div>
            <span className="eyebrow">{t("growth.common.referrals")}</span>
            <LeaderboardList entries={model.leaderboards.referral} />
          </div>
          <div>
            <span className="eyebrow">{t("growth.leaderboard.field")}</span>
            <LeaderboardList entries={model.leaderboards.field} />
          </div>
        </div>
      </Panel>
    </section>
  );
}
