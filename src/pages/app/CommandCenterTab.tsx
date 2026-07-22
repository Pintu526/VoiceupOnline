import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  ClipboardList,
  Crosshair,
  FileScan,
  Flag,
  Landmark,
  MapPin,
  MessageCircle,
  RadioTower,
  ShieldCheck,
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
import { getCampaignGoalValue, getLocationGovernance } from "../../utils/campaign";
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

function rankedEntries(data: Record<string, number>) {
  return Object.entries(data)
    .filter(([label]) => Boolean(label))
    .sort((a, b) => b[1] - a[1]);
}

function getRiskLevel(score: number, hasAuthority: boolean, hasSupporters: boolean) {
  if (score < 45 || !hasAuthority || !hasSupporters) return "High";
  if (score < 75) return "Medium";
  return "Low";
}

function CommandMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="command-metric-card">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function CommandCenterTab({
  activeCampaign,
  campaigns,
  campaignSigners,
  signers,
  authorities,
  scanItems,
  organization,
  integrations,
  metrics,
  authorityMatch,
  stateTotals,
  districtTotals,
  blockTotals,
  panchayatTotals,
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
  const [missionGenerated, setMissionGenerated] = useState(false);
  const campaignScanItems = activeCampaign
    ? scanItems.filter((item) => item.campaignId === activeCampaign.id)
    : scanItems;
  const pendingScans = campaignScanItems.filter((item) => item.status === "Needs review").length;
  const verifiedSupporters = campaignSigners.filter(
    (signer) => signer.status === "verified" || signer.otpVerified
  ).length;
  const reachableSupporters = campaignSigners.filter((signer) => signer.phone || signer.email).length;
  const onlineSupporters = campaignSigners.filter((signer) => signer.source === "online").length;
  const paperSupporters = campaignSigners.filter((signer) => signer.source === "scan" || signer.source === "field").length;
  const communicationProviderReady =
    integrations.whatsappProvider !== "Not configured" ||
    integrations.smsProvider !== "Not configured" ||
    integrations.emailProvider !== "Not configured";
  const governance = getLocationGovernance(organization);
  const governanceConfigured = governance.lockLevel !== "none";
  const authorityReady = Boolean(activeCampaign?.selectedAuthorityId || authorityMatch || authorities.length > 0);
  const petitionReady = Boolean(activeCampaign?.title && activeCampaign.description && activeCampaign.slug);
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
  const topLocations = [
    ...rankedEntries(panchayatTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "Panchayat/Ward" })),
    ...rankedEntries(blockTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "Block" })),
    ...rankedEntries(districtTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "District" })),
    ...rankedEntries(stateTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "State" }))
  ].slice(0, 6);
  const weakLocations = topLocations.filter((item) => item.value <= Math.max(1, Math.floor(metrics.total * 0.08)));
  const locationCoverage =
    Object.keys(stateTotals).length +
    Object.keys(districtTotals).length +
    Object.keys(blockTotals).length +
    Object.keys(panchayatTotals).length;

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

  const recommendedActions = [
    actionBoard[0]?.title ?? t("command.recommendations.shareUpdate"),
    authorityReady ? t("command.recommendations.prepareAuthority") : t("command.recommendations.confirmAuthority"),
    pendingScans > 0 ? t("command.recommendations.reviewSheets") : t("command.recommendations.assignLocality"),
    reachableSupporters > 0 ? t("command.recommendations.sendProgress") : t("command.recommendations.collectContacts"),
    activeCampaign?.heroImage ? t("command.recommendations.recruitCoordinators") : t("command.recommendations.uploadBanner")
  ];
  const missionPlan = [
    [t("command.mission.fieldTask"), pendingScans > 0 ? t("command.mission.reviewSheets") : t("command.mission.collectSupporters")],
    [t("command.mission.authorityTask"), authorityMatch ? `${t("command.mission.prepareFollowup")} ${authorityMatch.authority.name}.` : t("command.mission.selectAuthority")],
    [t("command.mission.communicationTask"), reachableSupporters > 0 ? `${t("command.mission.sendPreview")} ${reachableSupporters.toLocaleString()} ${t("command.mission.reachableSupporters")}.` : t("command.mission.prepareWhatsapp")],
    [t("command.mission.volunteerTask"), t("command.mission.assignVolunteers")],
    [t("command.mission.polishTask"), activeCampaign?.heroImage ? t("command.mission.reviewPublicPage") : t("command.mission.uploadBanner")]
  ];
  const coordinatorLevels = ["Ward", "Panchayat", "Block", "District", "State"];

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
        <div className="vboss-command-grid">
          {([
            [t("framework.command.cards.campaign"), t("framework.command.cards.campaignPurpose"), onOpenCampaigns],
            [t("framework.command.cards.organization"), t("framework.command.cards.organizationPurpose"), onOpenSaas],
            [t("framework.command.cards.readiness"), t("framework.command.cards.readinessPurpose"), onOpenCampaigns],
            [t("framework.command.cards.supporters"), t("framework.command.cards.supportersPurpose"), onOpenEngagement],
            [t("framework.command.cards.fund"), t("framework.command.cards.fundPurpose"), onOpenFund],
            [t("framework.command.cards.team"), t("framework.command.cards.teamPurpose"), onOpenMovement],
            [t("framework.command.cards.activity"), t("framework.command.cards.activityPurpose"), onOpenActivity],
            [t("framework.command.cards.nextAction"), t("framework.command.cards.nextActionPurpose"), onOpenCampaigns]
          ] as Array<[string, string, () => void]>).map(([label, purpose, action]) => (
            <button className="vboss-command-card" key={label} type="button" onClick={action as () => void}>
              <span>{label}</span>
              <strong>{purpose}</strong>
              <small>{t("framework.command.openModule")}</small>
            </button>
          ))}
        </div>
        <div className="button-row vboss-command-actions">
          <button className="secondary-button" type="button" onClick={onOpenCampaigns}>{t("framework.command.quickActions.plan")}</button>
          <button className="secondary-button" type="button" onClick={onOpenProve}>{t("framework.command.quickActions.prove")}</button>
          <button className="secondary-button" type="button" onClick={onOpenFund}>{t("framework.command.quickActions.fund")}</button>
        </div>
      </Panel>
      <Panel title={t("command.title")} icon={<Crosshair />}>
        <div className="command-hero">
          <div>
            <span className="eyebrow">{t("command.hero.eyebrow")}</span>
            <h2>{activeCampaign?.title ?? t("command.hero.selectCampaign")}</h2>
            <p>{t("command.hero.description")}</p>
          </div>
          <div className={`command-risk-card risk-${riskLevel.toLowerCase()}`}>
            <span>{t("command.metrics.campaignRisk")}</span>
            <strong>{t(`command.risk.${riskLevel.toLowerCase()}`)}</strong>
            <small>{t("command.metrics.movementHealth")} {movementHealthScore}/100</small>
          </div>
        </div>
        <div className="command-metric-grid">
          <CommandMetric label={t("command.metrics.selectedCampaign")} value={activeCampaign ? t(`campaignAdmin.status.${activeCampaign.status.toLowerCase()}`) : t("command.status.setupNeeded")} detail={activeCampaign?.slug ? `/${activeCampaign.slug}` : t("command.status.noCampaignSelected")} />
          <CommandMetric label={t("command.metrics.totalSupporters")} value={metrics.total} detail={`${onlineSupporters} ${t("command.metrics.online")}, ${paperSupporters} ${t("command.metrics.paperManual")}`} />
          <CommandMetric label={t("command.metrics.verifiedSupporters")} value={verifiedSupporters} detail={`${metrics.total ? Math.round((verifiedSupporters / Math.max(metrics.total, 1)) * 100) : 0}% ${t("command.metrics.verification")}`} />
          <CommandMetric label={t("command.metrics.fieldPending")} value={pendingScans} detail={t("command.metrics.scanQueue")} />
          <CommandMetric label={t("command.metrics.authorityReadiness")} value={authorityReady ? t("command.status.ready") : t("command.status.setupNeeded")} detail={authorityMatch ? `${authorityMatch.score}% ${t("command.metrics.match")}` : `${authorities.length} ${t("command.metrics.authorityRules")}`} />
          <CommandMetric label={t("command.metrics.communication")} value={reachableSupporters} detail={communicationProviderReady ? t("command.status.providerConfigured") : t("command.status.setupNeeded")} />
          <CommandMetric label={t("command.metrics.movementHealth")} value={`${movementHealthScore}/100`} detail={t("command.metrics.operationsScore")} />
          <CommandMetric label={t("command.metrics.campaignRisk")} value={t(`command.risk.${riskLevel.toLowerCase()}`)} detail={t("command.metrics.riskHelp")} />
        </div>
      </Panel>

      <div className="two-column">
        <Panel title={t("command.geography.title")} icon={<MapPin />}>
          <div className="command-location-grid">
            <CommandMetric label={t("command.geography.coverage")} value={locationCoverage} detail={t("command.geography.coverageHelp")} />
            <CommandMetric label={t("command.geography.onlineVsPaper")} value={`${onlineSupporters}/${paperSupporters}`} detail={t("command.geography.splitHelp")} />
          </div>
          <div className="ranked-list">
            <span className="eyebrow">{t("command.geography.topLocations")}</span>
            {topLocations.length === 0 && <p className="helper-text">{t("command.geography.collectLocation")}</p>}
            {topLocations.map((item) => (
              <div key={`${item.level}-${item.label}`}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{t(`command.levels.${item.level.replace("/", "").toLowerCase()}`)}</small>
                </div>
                <span>{item.value.toLocaleString()}</span>
                <div className="progress"><div style={{ width: `${Math.min(100, (item.value / Math.max(metrics.total, 1)) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="ranked-list weak">
            <span className="eyebrow">{t("command.geography.weakLocations")}</span>
            {weakLocations.length === 0 ? (
              <p className="helper-text">{t("command.geography.noWeakInsight")}</p>
            ) : weakLocations.map((item) => (
              <div key={`weak-${item.level}-${item.label}`}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{t(`command.levels.${item.level.replace("/", "").toLowerCase()}`)} {t("command.geography.needsSupporters")}</small>
                </div>
                <span>{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("command.actionBoard.title")} icon={<ClipboardList />}>
          <div className="action-board-list">
            {actionBoard.length === 0 && <p className="success-message">{t("command.actionBoard.noGaps")}</p>}
            {actionBoard.map((task) => (
              <article className={`action-card priority-${task.priority.toLowerCase()}`} key={task.title}>
                <span>{task.priority}</span>
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.reason}</p>
                  <small>{t("command.actionBoard.owner")}: {task.owner}</small>
                </div>
                {task.providerReady && <em>{t("command.status.setupNeeded")}</em>}
                <button className="secondary-button" type="button" onClick={task.action}>
                  {t("command.actionBoard.open")}
                </button>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column">
        <Panel title={t("command.brain.title")} icon={<Sparkles />}>
          <div className="brain-card">
            <span className="eyebrow">{t("command.brain.next")}</span>
            <strong>{recommendedActions[0]}</strong>
            <p>{t("command.brain.suggestionsHelp")}</p>
          </div>
          <div className="mission-list">
            {recommendedActions.map((action, index) => (
              <div key={action}>
                <span>{index + 1}</span>
                <strong>{action}</strong>
              </div>
            ))}
          </div>
          <div className="command-insight-grid">
            <div><span>{t("command.brain.campaignStrength")}</span><strong>{movementHealthScore}/100</strong></div>
            <div><span>{t("command.brain.riskLevel")}</span><strong>{t(`command.risk.${riskLevel.toLowerCase()}`)}</strong></div>
            <div><span>{t("command.brain.weakLocation")}</span><strong>{weakLocations[0]?.label ?? t("command.status.setupNeeded")}</strong></div>
            <div><span>{t("command.brain.authorityFollowup")}</span><strong>{authorityMatch?.authority.name ?? t("command.brain.selectAuthority")}</strong></div>
            <div><span>{t("command.brain.volunteerSuggestion")}</span><strong>{t("command.recommendations.recruitCoordinators")}</strong></div>
            <div><span>{t("command.brain.communicationSuggestion")}</span><strong>{reachableSupporters ? t("command.recommendations.sendProgress") : t("command.brain.buildAudience")}</strong></div>
          </div>
        </Panel>

        <Panel title={t("command.mission.title")} icon={<Flag />}>
          <button className="primary-button" type="button" onClick={() => setMissionGenerated(true)}>
            {t("command.mission.generate")}
          </button>
          {missionGenerated ? (
            <div className="mission-list">
              {missionPlan.map(([label, task]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{task}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="helper-text">{t("command.mission.generateHelp")}</p>
          )}
        </Panel>
      </div>

      <div className="two-column">
        <Panel title={t("command.volunteers.title")} icon={<UsersRound />}>
          <div className="command-insight-grid">
            <div><span>{t("command.volunteers.readiness")}</span><strong>{metrics.total > 25 ? t("command.volunteers.readyRecruit") : t("command.status.setupNeeded")}</strong></div>
            <div><span>{t("command.volunteers.topVolunteer")}</span><strong>{t("command.status.setupNeeded")}</strong></div>
            <div><span>{t("command.volunteers.uploadStatus")}</span><strong>{pendingScans ? `${pendingScans} ${t("command.status.pending")}` : t("command.status.clear")}</strong></div>
            <div><span>{t("command.volunteers.districtGaps")}</span><strong>{Object.keys(districtTotals).length ? t("command.volunteers.reviewCoverage") : t("command.status.setupNeeded")}</strong></div>
          </div>
          <div className="coordinator-grid">
            {coordinatorLevels.map((level) => (
              <div key={level}>
                <strong>{t(`command.levels.${level.toLowerCase()}`)} {t("command.volunteers.coordinator")}</strong>
                <small>{Object.keys(districtTotals).length ? t("command.volunteers.assignOwner") : t("command.status.setupNeeded")}</small>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("command.authority.title")} icon={<Landmark />}>
          <div className="delivery-tracker">
            {[
              [t("command.authority.primary"), authorityMatch?.authority.name ?? t("command.status.setupNeeded")],
              [t("command.authority.suggested"), authorityReady ? `${authorities.length} ${t("command.status.available")}` : t("command.status.setupNeeded")],
              [t("command.authority.petitionReady"), petitionReady ? t("command.status.ready") : t("command.authority.needsCopy")],
              [t("command.authority.exportReady"), petitionReady ? t("command.authority.exportsAvailable") : t("command.status.setupNeeded")],
              [t("command.authority.emailReady"), integrations.emailProvider === "Not configured" ? t("command.status.setupNeeded") : integrations.emailProvider],
              [t("command.authority.followupDue"), t("command.status.setupNeeded")],
              [t("command.authority.responseStatus"), t("command.status.setupNeeded")]
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title={t("command.communication.title")} icon={<MessageCircle />}>
        <div className="command-metric-grid">
          <CommandMetric label={t("command.communication.reachable")} value={reachableSupporters} detail={t("command.communication.contactAvailable")} />
          <CommandMetric label={t("command.communication.audienceCount")} value={campaignSigners.length} detail={t("command.communication.selectedSupporters")} />
          <CommandMetric label="WhatsApp" value={integrations.whatsappProvider === "Not configured" ? t("command.status.setupNeeded") : integrations.whatsappProvider} detail={t("command.communication.noBulkSend")} />
          <CommandMetric label="SMS" value={integrations.smsProvider === "Not configured" ? t("command.status.setupNeeded") : integrations.smsProvider} detail={t("command.communication.noSend")} />
          <CommandMetric label="Email" value={integrations.emailProvider === "Not configured" ? t("command.status.setupNeeded") : integrations.emailProvider} detail={t("command.communication.noSend")} />
          <CommandMetric label="IVR" value={t("command.status.afterSetup")} detail={t("command.communication.futureVoice") } />
        </div>
        <div className="brain-card">
          <span className="eyebrow">{t("command.communication.consentReminder")}</span>
          <strong>{t("command.communication.consentWarning")}</strong>
          <p>{activeCampaign?.participantUpdateMessage || activeCampaign?.socialShareText || t("command.communication.messageAfterCopy")}</p>
        </div>
      </Panel>
    </section>
  );
}

export default CommandCenterTab;
