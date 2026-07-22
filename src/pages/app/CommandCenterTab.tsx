import { useMemo, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  Building2,
  ClipboardList,
  Crosshair,
  Gauge,
  Flag,
  Sparkles,
  UsersRound
} from "lucide-react";
import type { getCampaignMetrics } from "../../lib";
import type {
  AuthorityRule,
  Campaign,
  IntegrationSettings,
  Organization,
  ScanReviewItem,
  Signer
} from "../../types";
import { Panel } from "../../ui/Panel";
import { getLocationGovernance } from "../../utils/campaign";
import { useTranslation } from "../../i18n/useTranslation";

interface CommandCenterTabProps {
  activeCampaign: Campaign | undefined;
  campaigns: Campaign[];
  campaignSigners: Signer[];
  signers: Signer[];
  authorities: AuthorityRule[];
  scanItems: ScanReviewItem[];
  organization: Organization;
  integrations: IntegrationSettings;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authorityMatch: { authority: AuthorityRule; score: number } | undefined;
  stateTotals: Record<string, number>;
  districtTotals: Record<string, number>;
  blockTotals: Record<string, number>;
  panchayatTotals: Record<string, number>;
  onOpenCampaigns: () => void;
  onOpenFieldCollection: () => void;
  onOpenEngagement: () => void;
  onOpenAuthorities: () => void;
  onOpenSaas: () => void;
  onOpenMovement: () => void;
  onOpenActivity: () => void;
  onOpenFund: () => void;
  onOpenProve: () => void;
  canAccessPlatformAdmin: boolean;
}

type ActionPriority = "P0" | "P1" | "P2";

function getRiskLevel(score: number, hasAuthority: boolean, hasSupporters: boolean) {
  if (score < 45 || !hasAuthority || !hasSupporters) return "High";
  if (score < 75) return "Medium";
  return "Low";
}

function FrameworkLinkCard({
  icon,
  title,
  description,
  status,
  viewLabel,
  onClick
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
  viewLabel: string;
  onClick: () => void;
}) {
  return (
    <button className="vboss-command-card" type="button" onClick={onClick}>
      <span className="vboss-card-icon" aria-hidden="true">{icon}</span>
      <span className="vboss-card-status">{status}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      <small>{viewLabel}<ArrowRight size={14} /></small>
    </button>
  );
}

function MovementDashboardCard({ icon, title, value, detail }: { icon: ReactNode; title: string; value: string; detail: string }) {
  return (
    <article className="movement-dashboard-card">
      <span className="vboss-card-icon" aria-hidden="true">{icon}</span>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function CommandCenterTab({
  activeCampaign,
  campaignSigners,
  authorities,
  scanItems,
  organization,
  integrations,
  metrics,
  authorityMatch,
  onOpenCampaigns,
  onOpenFieldCollection,
  onOpenEngagement,
  onOpenAuthorities,
  onOpenSaas,
  onOpenMovement,
  onOpenActivity,
  onOpenFund,
  onOpenProve,
  canAccessPlatformAdmin
}: CommandCenterTabProps) {
  const { t } = useTranslation();
  const campaignScanItems = activeCampaign
    ? scanItems.filter((item) => item.campaignId === activeCampaign.id)
    : scanItems;
  const pendingScans = campaignScanItems.filter((item) => item.status === "Needs review").length;
  const verifiedSupporters = campaignSigners.filter(
    (signer) => signer.status === "verified" || signer.otpVerified
  ).length;
  const communicationProviderReady =
    integrations.whatsappProvider !== "Not configured" ||
    integrations.smsProvider !== "Not configured" ||
    integrations.emailProvider !== "Not configured";
  const governance = getLocationGovernance(organization);
  const governanceConfigured = governance.lockLevel !== "none";
  const authorityReady = Boolean(activeCampaign?.selectedAuthorityId || authorityMatch || authorities.length > 0);
  const movementHealthScore = Math.min(
    100,
    (activeCampaign ? 12 : 0) +
      (activeCampaign?.status === "Published" ? 14 : 0) +
      (activeCampaign?.heroImage ? 10 : 0) +
      (authorityReady ? 16 : 0) +
      (metrics.total > 0 ? 14 : 0) +
      (metrics.total ? Math.round((verifiedSupporters / Math.max(metrics.total, 1)) * 14) : 0) +
      (pendingScans === 0 ? 8 : 0) +
      (communicationProviderReady ? 6 : 0) +
      (governanceConfigured ? 6 : 0)
  );
  const riskLevel = getRiskLevel(movementHealthScore, authorityReady, metrics.total > 0);
  const actionBoard = useMemo(
    () =>
      [
        {
          show: Boolean(activeCampaign && activeCampaign.status !== "Published"),
          priority: "P0" as ActionPriority,
          title: t("command.actions.campaignUnpublished"),
          reason: t("command.actions.campaignUnpublishedReason"),
          owner: t("command.owners.campaignOwner"),
          action: onOpenCampaigns
        },
        {
          show: !authorityReady,
          priority: "P0" as ActionPriority,
          title: t("command.actions.missingAuthority"),
          reason: t("command.actions.missingAuthorityReason"),
          owner: t("command.owners.campaignAdmin"),
          action: onOpenAuthorities
        },
        {
          show: Boolean(activeCampaign && !activeCampaign.heroImage),
          priority: "P1" as ActionPriority,
          title: t("command.actions.missingBanner"),
          reason: t("command.actions.missingBannerReason"),
          owner: t("command.owners.contentOwner"),
          action: onOpenCampaigns
        },
        {
          show: metrics.total === 0,
          priority: "P0" as ActionPriority,
          title: t("command.actions.noSupporters"),
          reason: t("command.actions.noSupportersReason"),
          owner: t("command.owners.campaignOwner"),
          action: onOpenEngagement
        },
        {
          show: metrics.total > 0 && verifiedSupporters < Math.ceil(metrics.total * 0.5),
          priority: "P1" as ActionPriority,
          title: t("command.actions.lowVerified"),
          reason: t("command.actions.lowVerifiedReason"),
          owner: t("command.owners.reviewLead"),
          action: onOpenFieldCollection
        },
        {
          show: pendingScans > 0,
          priority: "P1" as ActionPriority,
          title: t("command.actions.scansPending"),
          reason: `${pendingScans} ${t(pendingScans === 1 ? "command.actions.scanItemNeedsReview" : "command.actions.scanItemsNeedReview")}`,
          owner: t("command.owners.fieldOpsLead"),
          action: onOpenFieldCollection
        },
        {
          show: canAccessPlatformAdmin && !governanceConfigured,
          priority: "P2" as ActionPriority,
          title: t("command.actions.missingGovernance"),
          reason: t("command.actions.missingGovernanceReason"),
          owner: t("command.owners.saasAdmin"),
          action: onOpenSaas
        },
        {
          show: !communicationProviderReady,
          priority: "P2" as ActionPriority,
          title: t("command.actions.providerMissing"),
          reason: t("command.actions.providerMissingReason"),
          owner: t("command.owners.workspaceAdmin"),
          action: onOpenEngagement,
          providerReady: true
        },
        {
          show: Boolean(activeCampaign && !activeCampaign.shareUrl),
          priority: "P2" as ActionPriority,
          title: t("command.actions.linkNotShared"),
          reason: t("command.actions.linkNotSharedReason"),
          owner: t("command.owners.campaignOwner"),
          action: onOpenCampaigns
        }
      ].filter((item) => item.show),
    [
      activeCampaign,
      authorityReady,
      canAccessPlatformAdmin,
      communicationProviderReady,
      governanceConfigured,
      metrics.total,
      onOpenAuthorities,
      onOpenCampaigns,
      onOpenEngagement,
      onOpenFieldCollection,
      onOpenSaas,
      pendingScans,
      t,
      verifiedSupporters
    ]
  );

  const campaignProgress = activeCampaign?.goal
    ? Math.min(100, Math.round((metrics.total / Math.max(activeCampaign.goal, 1)) * 100))
    : undefined;
  const latestActivityTimestamp = [...campaignSigners.map((signer) => signer.signedAt), ...campaignScanItems.map((item) => item.createdAt)]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const lastActivity = latestActivityTimestamp
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(latestActivityTimestamp)
    : "--";
  const campaignProgressLabel = campaignProgress === undefined ? "--" : `${campaignProgress}%`;
  const campaignGoalLabel = activeCampaign?.goal
    ? `${metrics.total.toLocaleString()} / ${activeCampaign.goal.toLocaleString()}`
    : "--";

  return (
    <section className="page-stack command-center">
      <Panel title={t("framework.command.title")} icon={<Crosshair />}>
        <div className="vboss-command-heading">
          <div>
            <span className="eyebrow">{t("framework.command.eyebrow")}</span>
            <h2>{t("framework.command.title")}</h2>
            <p>{t("framework.command.description")}</p>
          </div>
        </div>
        <div className="vboss-overview-strip" aria-label={t("framework.command.overview.label")}>
          {[
            [t("framework.command.overview.campaignName"), activeCampaign?.title ?? "--"],
            [t("framework.command.overview.campaignStatus"), activeCampaign?.status ?? "--"],
            [t("framework.command.overview.campaignProgress"), campaignProgressLabel],
            [t("framework.command.overview.lastActivity"), lastActivity],
            [t("framework.command.overview.teamMembers"), "--"],
            [t("framework.command.overview.supporters"), metrics.total.toLocaleString()],
            [t("framework.command.overview.fundsRaised"), "--"]
          ].map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
        <div className="vboss-command-grid">
          <FrameworkLinkCard icon={<Flag />} title={t("framework.command.cards.campaign")} description={t("framework.command.cards.campaignPurpose")} status={activeCampaign?.status ?? "--"} viewLabel={t("framework.command.view")} onClick={onOpenCampaigns} />
          <FrameworkLinkCard icon={<Building2 />} title={t("framework.command.cards.organization")} description={t("framework.command.cards.organizationPurpose")} status={organization.name || "--"} viewLabel={t("framework.command.view")} onClick={onOpenSaas} />
          <FrameworkLinkCard icon={<BadgeCheck />} title={t("framework.command.cards.readiness")} description={t("framework.command.cards.readinessPurpose")} status={campaignProgressLabel} viewLabel={t("framework.command.view")} onClick={onOpenCampaigns} />
          <FrameworkLinkCard icon={<UsersRound />} title={t("framework.command.cards.supporters")} description={t("framework.command.cards.supportersPurpose")} status={metrics.total.toLocaleString()} viewLabel={t("framework.command.view")} onClick={onOpenEngagement} />
          <FrameworkLinkCard icon={<Sparkles />} title={t("framework.command.cards.fund")} description={t("framework.command.cards.fundPurpose")} status={t("framework.placeholder.comingSoon")} viewLabel={t("framework.command.view")} onClick={onOpenFund} />
          <FrameworkLinkCard icon={<UsersRound />} title={t("framework.command.cards.team")} description={t("framework.command.cards.teamPurpose")} status={t("framework.command.status.connected")} viewLabel={t("framework.command.view")} onClick={onOpenMovement} />
          <FrameworkLinkCard icon={<Activity />} title={t("framework.command.cards.activity")} description={t("framework.command.cards.activityPurpose")} status={lastActivity} viewLabel={t("framework.command.view")} onClick={onOpenActivity} />
          <FrameworkLinkCard icon={<ClipboardList />} title={t("framework.command.cards.nextAction")} description={actionBoard[0]?.title ?? t("framework.command.cards.nextActionPurpose")} status={actionBoard[0]?.priority ?? t("framework.command.status.onTrack")} viewLabel={t("framework.command.view")} onClick={actionBoard[0]?.action ?? onOpenCampaigns} />
        </div>
        <div className="vboss-section-heading">
          <div><span className="eyebrow">{t("command.hero.eyebrow")}</span><h3>{t("command.title")}</h3></div>
          <small>{t("framework.command.movementSummary")}</small>
        </div>
        <div className="movement-dashboard-grid">
          <MovementDashboardCard icon={<AlertTriangle />} title={t("framework.command.movement.risk")} value={t(`command.risk.${riskLevel.toLowerCase()}`)} detail={`${movementHealthScore}/100 ${t("command.metrics.movementHealth")}`} />
          <MovementDashboardCard icon={<BadgeCheck />} title={t("framework.command.movement.readiness")} value={campaignProgressLabel} detail={authorityReady ? t("command.status.ready") : t("command.status.setupNeeded")} />
          <MovementDashboardCard icon={<Gauge />} title={t("framework.command.movement.growth")} value={campaignGoalLabel} detail={t("framework.command.movement.goalProgress")} />
          <MovementDashboardCard icon={<ClipboardList />} title={t("framework.command.movement.pending")} value={actionBoard.length.toLocaleString()} detail={pendingScans ? `${pendingScans} ${t("command.status.pending")}` : t("command.status.clear")} />
          <MovementDashboardCard icon={<BellRing />} title={t("framework.command.movement.activity")} value={lastActivity} detail={t("framework.command.movement.activityDetail")} />
        </div>
        <div className="button-row vboss-command-actions">
          <button className="secondary-button" type="button" onClick={onOpenCampaigns}>{t("framework.command.quickActions.plan")}</button>
          <button className="secondary-button" type="button" onClick={onOpenProve}>{t("framework.command.quickActions.prove")}</button>
          <button className="secondary-button" type="button" onClick={onOpenFund}>{t("framework.command.quickActions.fund")}</button>
        </div>
      </Panel>

    </section>
  );
}

export default CommandCenterTab;
