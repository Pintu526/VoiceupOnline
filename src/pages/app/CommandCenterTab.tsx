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
import type { Language } from "../../i18n/provider";
import {
  campaignReadinessLabels,
  campaignShowcaseCopy,
  campaignShowcaseModules,
  campaignShowcaseTracks,
  type CampaignReadinessStatus,
  type CampaignShowcaseModule
} from "../../campaignShowcaseCatalog";
import {
  campaignCapabilityAssessments,
  campaignCompletionLabels,
  getCampaignCompletionSummary
} from "../../campaignCompletion";
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
  canOpenModule: (module: CampaignShowcaseModule) => boolean;
  onNavigateModule: (module: CampaignShowcaseModule) => void;
  canAccessPlatformAdmin: boolean;
  showUnfinishedModules?: boolean;
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

function getCriterionResultLabel(result: "verified" | "notMet" | "notAssessed", language: Language) {
  return campaignCompletionLabels[result][language];
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
  canOpenModule,
  onNavigateModule,
  canAccessPlatformAdmin,
  showUnfinishedModules = true
}: CommandCenterTabProps) {
  const { t, language } = useTranslation();
  const completionSummary = getCampaignCompletionSummary();
  const assessmentById = new Map(campaignCapabilityAssessments.map((assessment) => [assessment.id, assessment]));
  const formatPercent = (value: number | null) =>
    value === null ? campaignCompletionLabels.notAssessed[language] : `${value}%`;
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
          show: showUnfinishedModules && metrics.total > 0 && verifiedSupporters < Math.ceil(metrics.total * 0.5),
          priority: "P1" as ActionPriority,
          title: t("command.actions.lowVerified"),
          reason: t("command.actions.lowVerifiedReason"),
          owner: t("command.owners.reviewLead"),
          action: onOpenFieldCollection
        },
        {
          show: showUnfinishedModules && pendingScans > 0,
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
      showUnfinishedModules,
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
          {showUnfinishedModules && <FrameworkLinkCard icon={<Sparkles />} title={t("framework.command.cards.fund")} description={t("framework.command.cards.fundPurpose")} status={t("framework.placeholder.comingSoon")} viewLabel={t("framework.command.view")} onClick={onOpenFund} />}
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
          <MovementDashboardCard icon={<ClipboardList />} title={t("framework.command.movement.pending")} value={actionBoard.length.toLocaleString()} detail={showUnfinishedModules && pendingScans ? `${pendingScans} ${t("command.status.pending")}` : t("command.status.clear")} />
          <MovementDashboardCard icon={<BellRing />} title={t("framework.command.movement.activity")} value={lastActivity} detail={t("framework.command.movement.activityDetail")} />
        </div>
        <div className="button-row vboss-command-actions">
          <button className="secondary-button" type="button" onClick={onOpenCampaigns}>{t("framework.command.quickActions.plan")}</button>
          {showUnfinishedModules && <button className="secondary-button" type="button" onClick={onOpenProve}>{t("framework.command.quickActions.prove")}</button>}
          {showUnfinishedModules && <button className="secondary-button" type="button" onClick={onOpenFund}>{t("framework.command.quickActions.fund")}</button>}
        </div>
        <section className="campaign-showcase" aria-labelledby="campaign-showcase-title">
          <div className="campaign-showcase-heading">
            <div>
              <span className="eyebrow">{campaignShowcaseModules.length.toLocaleString(language)}</span>
              <h3 id="campaign-showcase-title">{campaignShowcaseCopy.title[language]}</h3>
              <p>{campaignShowcaseCopy.description[language]}</p>
            </div>
          </div>
          <ul className="campaign-showcase-status-key" aria-label={campaignShowcaseCopy.title[language]}>
            {(Object.keys(campaignReadinessLabels) as CampaignReadinessStatus[]).map((status) => (
              <li key={status}>
                <span className={`campaign-readiness-badge status-${status}`}>
                  {campaignReadinessLabels[status][language]}
                </span>
              </li>
            ))}
          </ul>
          <section className="campaign-completion-summary" aria-label={campaignCompletionLabels.developmentCompletion[language]}>
            <div className="campaign-completion-metrics">
              <article>
                <span>{campaignCompletionLabels.totalCapabilities[language]}</span>
                <strong>{completionSummary.totalCapabilities.toLocaleString(language)}</strong>
              </article>
              <article>
                <span>{campaignCompletionLabels.developmentCompletion[language]}</span>
                <strong>{formatPercent(completionSummary.developmentCompletionPercent)}</strong>
              </article>
              <article>
                <span>{campaignCompletionLabels.productionReadiness[language]}</span>
                <strong>{formatPercent(completionSummary.productionReadinessPercent)}</strong>
                <small>{completionSummary.productionUnassessedCapabilityCount.toLocaleString(language)} / {completionSummary.totalCapabilities.toLocaleString(language)} {campaignCompletionLabels.notAssessed[language]}</small>
              </article>
              <article>
                <span>{campaignCompletionLabels.unassessedCapabilities[language]}</span>
                <strong>{completionSummary.unassessedCapabilityCount.toLocaleString(language)}</strong>
                <small>{completionSummary.unassessedCriterionCount.toLocaleString(language)} {campaignCompletionLabels.unassessedCriteria[language]}</small>
              </article>
            </div>
            <ul className="campaign-completion-status-counts">
              {(Object.keys(campaignReadinessLabels) as CampaignReadinessStatus[]).map((status) => (
                <li key={status}>
                  <span className={`campaign-readiness-badge status-${status}`}>
                    {campaignCompletionLabels[status][language]}
                  </span>
                  <strong>{completionSummary.statusCounts[status].toLocaleString(language)}</strong>
                </li>
              ))}
            </ul>
            <p className="campaign-completion-method">{campaignCompletionLabels.scoreMethod[language]}</p>
            <p className="campaign-completion-method">{campaignCompletionLabels.productionNote[language]}</p>
          </section>
          <div className="campaign-showcase-tracks">
            {campaignShowcaseTracks.map((track) => {
              const modules = campaignShowcaseModules.filter((module) => module.track === track.id);
              const trackCompletion = completionSummary.trackCompletion[track.id];
              return (
                <section className="campaign-showcase-track" key={track.id} aria-labelledby={`campaign-track-${track.id}`}>
                  <header className="campaign-showcase-track-heading">
                    <h4 id={`campaign-track-${track.id}`}>{track.title[language]}</h4>
                    <p>{track.description[language]}</p>
                    <strong className="campaign-showcase-track-completion">
                      {campaignCompletionLabels.trackCompletion[language]}: {formatPercent(trackCompletion)}
                    </strong>
                  </header>
                  <div className="campaign-showcase-grid">
                    {modules.map((module) => {
                      const assessment = assessmentById.get(module.id);
                      if (!assessment) throw new Error(`Missing completion assessment for capability ${module.id}`);
                      const title = module.title[language];
                      const hasDestination = Boolean(module.tab || module.action);
                      const accessible = hasDestination && canOpenModule(module);
                      const blocked = module.status === "blocked";
                      const disabled = !accessible || blocked;
                      const actionLabel = blocked || !hasDestination
                        ? campaignShowcaseCopy.noAction[language]
                        : accessible
                          ? campaignShowcaseCopy.openModule[language]
                          : campaignShowcaseCopy.restricted[language];
                      return (
                        <article className="campaign-showcase-card" key={module.id}>
                          <div className="campaign-showcase-card-heading">
                            <h5>{title}</h5>
                          </div>
                          <p>{module.description[language]}</p>
                          <div className="campaign-showcase-assessment-status">
                            <span>
                              <small>{campaignCompletionLabels.previousStatus[language]}</small>
                              <strong className={`campaign-readiness-badge status-${assessment.previousStatus}`}>
                                {campaignReadinessLabels[assessment.previousStatus][language]}
                              </strong>
                            </span>
                            <span>
                              <small>{campaignCompletionLabels.actualStatus[language]}</small>
                              <strong className={`campaign-readiness-badge status-${assessment.actualStatus}`}>
                                {campaignReadinessLabels[assessment.actualStatus][language]}
                              </strong>
                            </span>
                            <span>
                              <small>{campaignCompletionLabels.completion[language]}</small>
                              <strong className="campaign-completion-percent">{formatPercent(assessment.completionPercent)}</strong>
                            </span>
                          </div>
                          <p className="campaign-showcase-status-help">{assessment.statusRationale[language]}</p>
                          <dl className="campaign-showcase-facts">
                            <div>
                              <dt>{campaignCompletionLabels.working[language]}</dt>
                              <dd>{assessment.workingFunctionality[language]}</dd>
                            </div>
                            <div>
                              <dt>{campaignCompletionLabels.remaining[language]}</dt>
                              <dd>{assessment.remainingFunctionality[language]}</dd>
                            </div>
                            <div>
                              <dt>{campaignCompletionLabels.blockers[language]}</dt>
                              <dd>{assessment.blocker?.[language] ?? campaignCompletionLabels.noKnownBlockers[language]}</dd>
                            </div>
                          </dl>
                          <details className="campaign-showcase-evidence">
                            <summary>{campaignCompletionLabels.evidence[language]} · {campaignCompletionLabels.criteria[language]}</summary>
                            <p>{campaignCompletionLabels.capabilityWeight[language]}: {assessment.capabilityWeight}</p>
                            <ul>
                              {assessment.criteria.map((criterion) => (
                                <li key={criterion.id}>
                                  <div className="campaign-showcase-criterion-heading">
                                    <strong>{criterion.label[language]}</strong>
                                    <span>{criterion.weight}% · {getCriterionResultLabel(criterion.result, language)}</span>
                                  </div>
                                  <small>{criterion.evidence.join(", ")}</small>
                                </li>
                              ))}
                            </ul>
                            <p>
                              {campaignCompletionLabels.productionReadiness[language]}:{" "}
                              {getCriterionResultLabel(assessment.productionReadiness.result, language)} —{" "}
                              {assessment.productionReadiness.evidence.join(", ")}
                            </p>
                            <ol className="campaign-showcase-status-history">
                              {assessment.statusHistory.map((entry) => (
                                <li key={`${entry.phase}-${entry.status}`}>
                                  {entry.phase === "beforeVerification"
                                    ? campaignCompletionLabels.previousStatus[language]
                                    : campaignCompletionLabels.actualStatus[language]}:{" "}
                                  {campaignReadinessLabels[entry.status][language]} · {entry.date}
                                </li>
                              ))}
                            </ol>
                            <small>
                              {campaignCompletionLabels.lastVerified[language]}: {assessment.lastVerified}
                            </small>
                          </details>
                          <button
                            className="campaign-showcase-action"
                            type="button"
                            disabled={disabled}
                            aria-label={`${actionLabel}: ${title}`}
                            onClick={() => onNavigateModule(module)}
                          >
                            {actionLabel}
                            {!disabled && <ArrowRight size={14} aria-hidden="true" />}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </Panel>

    </section>
  );
}

export default CommandCenterTab;
