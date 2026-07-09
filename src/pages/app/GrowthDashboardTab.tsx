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
  const maxValue = Math.max(1, ...trends.map((point) => point.signatures));
  return (
    <div className="growth-trend-bars" aria-label="14 day campaign growth trend">
      {trends.map((point) => (
        <div className="growth-trend-bar" key={point.label}>
          <span
            style={{ height: `${Math.max(8, (point.signatures / maxValue) * 100)}%` }}
            title={`${point.signatures} signatures, ${point.referrals} referrals`}
          />
          <small>{point.label}</small>
        </div>
      ))}
    </div>
  );
}

function LeaderboardList({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="growth-leaderboard-list">
      {entries.length === 0 && <p className="helper-text">Leaderboard appears after supporters join and share.</p>}
      {entries.map((entry) => (
        <article className="growth-leaderboard-row" key={entry.id}>
          <span>{entry.rank}</span>
          <div>
            <strong>{entry.name}</strong>
            <small>{entry.level} - {entry.location}</small>
          </div>
          <div>
            <strong>{entry.score.toLocaleString()}</strong>
            <small>{entry.directReferrals.toLocaleString()} referrals</small>
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
      const label = snapshot.currentRecognitionLevelName ?? "In progress";
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
      <Panel title="Campaign Growth Dashboard" icon={<TrendingUp />}>
        <div className="growth-hero">
          <div>
            <span className="eyebrow">Growth Engine Foundation</span>
            <h2>{model.scope.label}</h2>
            <p>
              Track referrals, ambassadors, rewards, leaderboards, and campaign growth signals using existing
              supporter and referral data.
            </p>
          </div>
          <div className="growth-stage-card">
            <span>Growth stage</span>
            <strong>{model.summary.stage}</strong>
            <small>{model.summary.growthScore}/100 growth score</small>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard
            icon={<UsersRound />}
            label="Supporters"
            value={model.summary.totalSupporters}
            detail={`${model.analytics.newSupporters7d.toLocaleString()} joined in 7 days`}
          />
          <MetricCard
            icon={<Share2 />}
            label="Referral signatures"
            value={model.summary.referralSignatures}
            detail={`${model.summary.referralRate}% referral rate`}
          />
          <MetricCard
            icon={<BadgeCheck />}
            label="Ambassadors"
            value={model.summary.ambassadorCount}
            detail={`Top level: ${model.ambassadors.topLevel}`}
          />
          <MetricCard
            icon={<Award />}
            label="Rewards earned"
            value={model.summary.earnedRewards}
            detail={`${model.rewards.availableRewards.toLocaleString()} rewards nearly available`}
          />
        </div>
      </Panel>

      <div className="growth-dashboard-grid">
        <Panel title="Growth Analytics" icon={<BarChart3 />}>
          <TrendBars trends={model.analytics.trends} />
          <div className="growth-channel-list">
            {model.analytics.channels.map((channel) => (
              <article className="growth-channel-row" key={channel.channel}>
                <div>
                  <strong>{channel.label}</strong>
                  <small>{channel.count.toLocaleString()} supporter record{channel.count === 1 ? "" : "s"}</small>
                </div>
                <span>{channel.percentage}%</span>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Referral Domain" icon={<GitBranch />}>
          <div className="growth-domain-summary">
            <strong>{model.referrals.edges.length.toLocaleString()}</strong>
            <span>referral edges recorded</span>
            <small>
              Strongest code: {model.referrals.strongestCode || "Appears after referral activity"}
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
              <p className="helper-text">Referral nodes appear when signatures include referral metadata.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="growth-dashboard-grid">
        <Panel title="Growth Wallet Summary" icon={<Award />}>
          <div className="growth-channel-list">
            <article className="growth-channel-row">
              <div>
                <strong>Wallet credits</strong>
                <small>Credits retained by supporters</small>
              </div>
              <span>{walletSummary.walletCredits.toLocaleString()}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>Promotion credits</strong>
                <small>Credits moving supporters toward recognition</small>
              </div>
              <span>{walletSummary.promotionCredits.toLocaleString()}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>Contribution credits</strong>
                <small>Credits received through the growth tree</small>
              </div>
              <span>{walletSummary.contributionCredits.toLocaleString()}</span>
            </article>
            <article className="growth-channel-row">
              <div>
                <strong>Reserved and redeemed</strong>
                <small>Marketplace reservations and completed wallet burn</small>
              </div>
              <span>{campaignWallets.reduce((sum, wallet) => sum + wallet.balance.reservedCredits + wallet.balance.redeemedCredits, 0).toLocaleString()}</span>
            </article>
          </div>
        </Panel>

        <Panel title="Recognition Distribution" icon={<BadgeCheck />}>
          <div className="growth-node-list">
            {Object.entries(recognitionDistribution).map(([label, count]) => (
              <article className="growth-node-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <small>Supporter recognition level</small>
                </div>
                <span>{count.toLocaleString()}</span>
              </article>
            ))}
            {Object.keys(recognitionDistribution).length === 0 && (
              <p className="helper-text">Recognition updates appear after supporter activity.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Growth Timeline" icon={<TrendingUp />}>
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
            <p className="helper-text">Growth timeline records appear when supporters sign, verify, share, or earn credits.</p>
          )}
        </div>
      </Panel>

      <div className="growth-dashboard-grid">
        <Panel title="Ambassador Domain" icon={<Network />}>
          <div className="growth-ambassador-list">
            {model.ambassadors.profiles.slice(0, 6).map((profile) => (
              <article className="growth-ambassador-row" key={profile.id}>
                <div>
                  <strong>{profile.name}</strong>
                  <small>{profile.level} - {profile.location}</small>
                </div>
                <div>
                  <span>{profile.totalPoints.toLocaleString()} pts</span>
                  <small>{profile.directReferrals.toLocaleString()} referrals</small>
                </div>
              </article>
            ))}
            {model.ambassadors.profiles.length === 0 && (
              <p className="helper-text">Ambassador profiles appear after supporters sign the campaign.</p>
            )}
          </div>
        </Panel>

        <Panel title="Reward Domain" icon={<Medal />}>
          <div className="growth-reward-rule-grid">
            {model.rewards.rules.map((rule) => (
              <article className="growth-reward-rule" key={rule.id}>
                <Sparkles size={18} />
                <div>
                  <strong>{rule.label}</strong>
                  <small>{rule.pointsRequired.toLocaleString()} points required</small>
                  <p>{rule.description}</p>
                </div>
              </article>
            ))}
            {activeCampaign && model.rewards.catalogCount === 0 && <p className="helper-text">Configure merchants and reward catalog items in Growth Configuration Studio.</p>}
          </div>
        </Panel>
      </div>

      {activeCampaign && merchantDashboard && rewardAnalytics && (
        <>
          <div className="growth-dashboard-grid">
            <Panel title="Campaign Reward Analytics" icon={<Gift />}>
              <div className="growth-insight-grid">
                <article><span>Reward Popularity</span><strong>{rewardAnalytics.rewardPopularity[0]?.label ?? "No rewards yet"}</strong><small>{rewardAnalytics.rewardPopularity[0]?.redemptionCount ?? 0} redemption(s)</small></article>
                <article><span>Wallet Burn Rate</span><strong>{rewardAnalytics.walletBurnRate.toLocaleString()}</strong><small>Points spent on completed rewards</small></article>
                <article><span>Redemption Rate</span><strong>{rewardAnalytics.redemptionRate}%</strong><small>Completed vs active redemption pipeline</small></article>
                <article><span>Average Wallet Balance</span><strong>{rewardAnalytics.averageWalletBalance.toLocaleString()}</strong><small>Across campaign wallets</small></article>
              </div>
              <div className="growth-node-list">
                {rewardAnalytics.mostDesiredRewards.map((item) => (
                  <article className="growth-node-row" key={item.rewardId}><div><strong>{item.label}</strong><small>Wishlist demand</small></div><span>{item.wishlistCount}</span></article>
                ))}
                {rewardAnalytics.topRedeemers.map((item) => (
                  <article className="growth-node-row" key={item.supporterId}><div><strong>{item.supporterId}</strong><small>Top redeemer</small></div><span>{item.pointsBurned}</span></article>
                ))}
              </div>
            </Panel>

            <Panel title="Merchant Reward Dashboard" icon={<Gift />}>
              <Suspense fallback={<div className="growth-skeleton-loader"><span /><span /><span /></div>}>
                <MerchantDashboard model={merchantDashboard} pendingRedemptions={pendingRedemptions} onAction={handleRewardAction} />
              </Suspense>
            </Panel>
          </div>
        </>
      )}

      <Panel title="Leaderboard Domain" icon={<Trophy />}>
        <div className="growth-leaderboard-grid">
          <div>
            <span className="eyebrow">Overall</span>
            <LeaderboardList entries={model.leaderboards.overall} />
          </div>
          <div>
            <span className="eyebrow">Referrals</span>
            <LeaderboardList entries={model.leaderboards.referral} />
          </div>
          <div>
            <span className="eyebrow">Field</span>
            <LeaderboardList entries={model.leaderboards.field} />
          </div>
        </div>
      </Panel>
    </section>
  );
}
