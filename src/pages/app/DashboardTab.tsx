import { useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  FileImage,
  FileScan,
  Globe2,
  Landmark,
  Megaphone,
  QrCode,
  SearchCheck,
  Send,
  Sparkles,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AuthorityRule, Campaign } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { Panel } from "../../ui/Panel";
import { MetricCard } from "../../ui/MetricCard";
import { BarList } from "../../ui/BarList";
import { Hero } from "../../components/Hero";
import { EmptyWorkspace } from "../../components/EmptyWorkspace";
import { VoiceUpStoryCarousel, type VoiceUpStoryAction } from "../../components/VoiceUpStoryCarousel";
import type { Organization } from "../../types";
import { useTranslation } from "../../i18n";

interface DashboardTabProps {
  activeCampaign: Campaign | undefined;
  campaigns: Campaign[];
  metrics: ReturnType<typeof getCampaignMetrics>;
  authorityMatch: { authority: AuthorityRule; score: number } | undefined;
  dailyTotals: Record<string, number>;
  organization: Organization;
  onCreateCampaign: () => void;
  onOpenSubscription: () => void;
  onOpenAiCopilot: () => void;
  onOpenCampaignAdmin: () => void;
  onOpenPublicCampaign: () => void;
  onOpenReports: () => void;
  onOpenOrganise: () => void;
  createCampaignBlockReason?: string;
  canUseAiCopilot: boolean;
  onUpgradePlan: () => void;
  isCampaignAdminRoute: boolean;
}

const helpPanels = ["studio", "authority", "field", "crm", "copilot"] as const;

const quickStartSteps: Array<[string, LucideIcon]> = [
  ["organization", Building2],
  ["location", Globe2],
  ["template", Megaphone],
  ["authority", Landmark],
  ["fields", Users],
  ["media", FileImage],
  ["publish", CheckCircle2],
  ["share", QrCode]
];

const PLACEHOLDER_CAMPAIGN: Campaign = {
  id: "",
  title: "Your Campaign Dashboard",
  slug: "",
  category: "Civic",
  description: "Create your first campaign to start collecting signatures and tracking progress.",
  appealContent: "",
  authorityTargetLevel: "district",
  authoritySelectionMode: "admin_enforced",
  selectedAuthorityId: "",
  donationEnabled: false,
  donationLockedBySaas: false,
  donationCaption: "",
  donationUpiId: "",
  donationQrImage: "",
  donationPaymentDetails: "",
  donationAllowOneTime: false,
  donationAllowRecurring: false,
  state: "",
  district: "",
  block: "",
  panchayat: "",
  location: "",
  postalCode: "",
  startDate: "",
  endDate: "",
  goal: 0,
  status: "Draft",
  consentText: "",
  requiredFields: [],
  requiredFieldsLockedBySaas: false,
  authorityLockedBySaas: false,
  publishingLockedBySaas: false,
  goalLockedBySaas: false,
  datesLockedBySaas: false,
  maxSignersAllowed: 0,
  maxScansAllowed: 0,
  shareUrl: "",
  adminUrl: "",
  adminEmail: "",
  adminPasscode: "",
  qrLabel: "",
  heroImage: "",
  heroImagePosition: "center center",
  heroImageZoom: 120,
  campaignVideoUrl: "",
  socialShareText: "",
  thankYouMessage: "",
  participantUpdateMessage: ""
};

export function DashboardTab({
  activeCampaign,
  campaigns,
  metrics,
  authorityMatch,
  dailyTotals,
  organization,
  onCreateCampaign,
  onOpenSubscription,
  onOpenAiCopilot,
  onOpenCampaignAdmin,
  onOpenPublicCampaign,
  onOpenReports,
  onOpenOrganise,
  createCampaignBlockReason = "",
  canUseAiCopilot,
  onUpgradePlan,
  isCampaignAdminRoute
}: DashboardTabProps) {
  const { t } = useTranslation();
  const displayCampaign = activeCampaign ?? {
    ...PLACEHOLDER_CAMPAIGN,
    title: t("campaignAdmin.dashboard.freeze.placeholderTitle"),
    description: t("campaignAdmin.dashboard.freeze.placeholderDescription")
  };
  const isTrialWorkspace = organization.plan === "Free Trial";
  const [quickStartDismissed, setQuickStartDismissed] = useState(false);
  const showQuickStart = !quickStartDismissed && campaigns.length <= 2;
  const campaignAdminStoryActions: Partial<Record<string, VoiceUpStoryAction>> = {
    publishStrengthen: {
      label: t("storyCarousel.campaignAdmin.slides.publishStrengthen.cta"),
      onClick: onOpenCampaignAdmin
    },
    reportsImpact: {
      label: t("storyCarousel.campaignAdmin.slides.reportsImpact.cta"),
      onClick: onOpenReports
    },
    evidenceUpdates: {
      label: t("storyCarousel.campaignAdmin.slides.evidenceUpdates.cta"),
      onClick: onOpenPublicCampaign
    },
    ...(canUseAiCopilot ? {
      aiCopilot: {
        label: t("storyCarousel.campaignAdmin.slides.aiCopilot.cta"),
        onClick: onOpenAiCopilot
      }
    } : {})
  };
  const quickStartItems = [
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.workspace"),
      ready: Boolean(organization.name && organization.ownerEmail)
    },
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.location"),
      ready: Boolean(organization.locationGovernance?.lockLevel && organization.locationGovernance.lockLevel !== "none")
    },
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.campaign"),
      ready: campaigns.length > 0
    },
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.authority"),
      ready: Boolean(activeCampaign?.selectedAuthorityId || authorityMatch)
    },
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.publicPage"),
      ready: Boolean(activeCampaign?.shareUrl)
    },
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.field"),
      ready: Boolean(activeCampaign)
    },
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.crm"),
      ready: metrics.total > 0
    },
    {
      label: t("campaignAdmin.dashboard.freeze.checklist.communication"),
      ready: Boolean(activeCampaign?.socialShareText || activeCampaign?.thankYouMessage)
    }
  ];
  const quickStartProgress = Math.round(
    (quickStartItems.filter((item) => item.ready).length / quickStartItems.length) * 100
  );
  const movementBrainScore = Math.min(
    100,
    (campaigns.length > 0 ? 20 : 0) +
      (metrics.total > 0 ? 20 : 0) +
      (metrics.verified > 0 ? 20 : 0) +
      (authorityMatch ? 20 : 0) +
      (activeCampaign?.shareUrl ? 20 : 0)
  );
  const lowParticipationHints = [
    metrics.total === 0 ? t("campaignAdmin.dashboard.freeze.hints.noSupporters") : "",
    metrics.verified < Math.max(1, Math.round(metrics.total * 0.5)) ? t("campaignAdmin.dashboard.freeze.hints.verification") : "",
    !authorityMatch ? t("campaignAdmin.dashboard.freeze.hints.authority") : "",
    !activeCampaign?.heroImage ? t("campaignAdmin.dashboard.freeze.hints.image") : "",
    !activeCampaign?.socialShareText ? t("campaignAdmin.dashboard.freeze.hints.shareCopy") : ""
  ].filter(Boolean);
  const trialActionCards = [
    {
      label: t("campaignAdmin.dashboard.freeze.actions.campaign"),
      detail: activeCampaign ? t("campaignAdmin.dashboard.freeze.actions.editCampaign") : t("campaignAdmin.dashboard.freeze.actions.firstCampaign"),
      icon: Megaphone,
      action: activeCampaign ? onOpenCampaignAdmin : onCreateCampaign
    },
    {
      label: t("campaignAdmin.dashboard.freeze.actions.share"),
      detail: activeCampaign?.shareUrl ? t("campaignAdmin.dashboard.freeze.actions.openPublic") : t("campaignAdmin.dashboard.freeze.actions.createForLink"),
      icon: Send,
      action: activeCampaign ? onOpenPublicCampaign : onCreateCampaign
    },
    {
      label: t("campaignAdmin.dashboard.freeze.actions.analytics"),
      detail: t("campaignAdmin.dashboard.freeze.actions.totalSupporters").replace("{count}", metrics.total.toLocaleString()),
      icon: SearchCheck,
      action: onOpenReports
    },
    {
      label: t("campaignAdmin.dashboard.freeze.actions.supporters"),
      detail: t("campaignAdmin.dashboard.freeze.actions.verifiedSignatures").replace("{count}", metrics.verified.toLocaleString()),
      icon: Users,
      action: onOpenReports
    },
    {
      label: t("campaignAdmin.dashboard.freeze.actions.upgrade"),
      detail: t("campaignAdmin.dashboard.freeze.actions.upgradeHelp"),
      icon: Globe2,
      action: onUpgradePlan
    }
  ];

  return (
    <section className="page-stack">
      <Hero
        campaign={displayCampaign}
        metrics={metrics}
        authority={authorityMatch?.authority}
      />
      <div className="button-row dashboard-organise-action">
        <button className="secondary-button" type="button" onClick={onOpenOrganise}>
          <Users size={18} /> Plan / Organise · Coordinator Network
        </button>
      </div>
      {isCampaignAdminRoute && (
        <VoiceUpStoryCarousel
          experience="campaignAdmin"
          actions={campaignAdminStoryActions}
          className="voiceup-story-carousel--dashboard"
        />
      )}
      {isTrialWorkspace && (
        <Panel title={t("campaignAdmin.dashboard.freeze.trialFocus")} icon={<CheckCircle2 />}>
          <div className="quick-start-panel">
            <div className="quick-start-hero">
              <div>
                <span className="eyebrow">{t("campaignAdmin.dashboard.createSixty")}</span>
                <h2>{t("campaignAdmin.dashboard.trialTitle")}</h2>
                <p>
                  {t("campaignAdmin.dashboard.freeze.trialHelp")}
                </p>
              </div>
              <div className="quick-start-score">
                <span>{t("campaignAdmin.dashboard.trialPlan")}</span>
                <strong>1</strong>
                <small>{t("campaignAdmin.dashboard.campaignIncluded")}</small>
              </div>
            </div>
            <div className="quick-start-steps">
              {trialActionCards.map(({ label, detail, icon: Icon, action }) => (
                <button className="quick-start-step" key={label} type="button" onClick={action}>
                  <Icon size={18} />
                  <span>{label}</span>
                  <strong>{detail}</strong>
                </button>
              ))}
            </div>
            {activeCampaign?.shareUrl && (
              <div className="button-row">
                <a className="primary-link-button" href={activeCampaign.shareUrl} target="_blank" rel="noreferrer">
                  <Send size={18} /> {t("campaignAdmin.dashboard.freeze.openShareLink")}
                </a>
                <button className="secondary-button" type="button" onClick={onOpenCampaignAdmin}>
                  <Megaphone size={18} /> {t("campaignAdmin.dashboard.freeze.editCampaign")}
                </button>
              </div>
            )}
          </div>
        </Panel>
      )}
      {!isTrialWorkspace && (
      <div className="ai-entry-strip">
        <div>
          <span className="eyebrow">{t("campaignAdmin.dashboard.aiCopilot")}</span>
          <strong>{t("campaignAdmin.dashboard.aiCopilotHelp")}</strong>
        </div>
        {createCampaignBlockReason || !canUseAiCopilot ? (
          <button className="primary-button" type="button" onClick={onUpgradePlan}>
            <Globe2 size={18} /> {t("campaignAdmin.dashboard.freeze.upgradePlan")}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onOpenAiCopilot}>
            <Sparkles size={18} /> {t("campaignAdmin.dashboard.freeze.createWithAi")}
          </button>
        )}
      </div>
      )}

      {showQuickStart && (
        <Panel title={t("campaignAdmin.dashboard.freeze.quickStart")} icon={<Sparkles />}>
          <div className="quick-start-panel">
            <div className="quick-start-hero">
              <div>
                <span className="eyebrow">{t("campaignAdmin.dashboard.createSixty")}</span>
                <h2>{t("campaignAdmin.dashboard.setupTitle")}</h2>
                <p>
                  {t("campaignAdmin.dashboard.freeze.quickStartHelp")}
                </p>
              </div>
              <div className="quick-start-score">
                <span>{t("campaignAdmin.dashboard.setupProgress")}</span>
                <strong>{quickStartProgress}%</strong>
                <small>{t("campaignAdmin.dashboard.freeze.readyCount").replace("{ready}", String(quickStartItems.filter((item) => item.ready).length)).replace("{total}", String(quickStartItems.length))}</small>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("campaignAdmin.dashboard.freeze.dismissQuickStart")}
                onClick={() => setQuickStartDismissed(true)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="quick-start-steps">
              {quickStartSteps.map(([key, Icon], index) => (
                <div className="quick-start-step" key={key}>
                  <Icon size={18} />
                  <span>{index + 1}</span>
                  <strong>{t(`campaignAdmin.dashboard.freeze.steps.${key}`)}</strong>
                </div>
              ))}
            </div>

            <div className="quick-start-card recommendation-card">
              <span className="eyebrow">{t("campaignAdmin.dashboard.organizationType")}</span>
              <strong>{t("campaignAdmin.dashboard.freeze.guidedSetupTitle")}</strong>
              <p>{t("campaignAdmin.dashboard.freeze.guidedSetupText")}</p>
            </div>

            <div className="guided-checklist">
              {quickStartItems.map((item) => (
                <div className={item.ready ? "ready" : ""} key={item.label}>
                  <CheckCircle2 size={18} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <div className="quick-start-actions">
              {createCampaignBlockReason ? (
                <button className="primary-button" type="button" onClick={onUpgradePlan}>
                  <Globe2 size={18} /> {t("campaignAdmin.dashboard.freeze.upgradePlan")}
                </button>
              ) : (
                <>
                  {canUseAiCopilot && (
                    <button className="primary-button" type="button" onClick={onOpenAiCopilot}>
                      <Sparkles size={18} /> {t("campaignAdmin.dashboard.freeze.createWithAi")}
                    </button>
                  )}
                  <button className="secondary-button" type="button" onClick={onCreateCampaign}>
                    <Megaphone size={18} /> {t("campaignAdmin.dashboard.freeze.createCampaign")}
                  </button>
                </>
              )}
              <button className="secondary-button" type="button" onClick={onOpenSubscription}>
                <Globe2 size={18} /> {t("campaignAdmin.dashboard.freeze.configureWorkspace")}
              </button>
              <span className="helper-text">
                {t("campaignAdmin.dashboard.freeze.createCampaignHelp")}
              </span>
            </div>
          </div>
        </Panel>
      )}

      <div className="metric-grid dashboard-metrics" aria-label={t("campaignAdmin.dashboard.metricsAria")}>
        <MetricCard
          icon={<Users />}
          label={t("campaignAdmin.dashboard.totalSigners")}
          value={metrics.total}
          detail={t("campaignAdmin.dashboard.freeze.verifiedCount").replace("{count}", String(metrics.verified))}
        />
        <MetricCard
          icon={<Globe2 />}
          label={t("campaignAdmin.dashboard.onlineSignatures")}
          value={metrics.online}
          detail={t("campaignAdmin.dashboard.freeze.collectedPublic")}
        />
        <MetricCard
          icon={<FileScan />}
          label={t("campaignAdmin.dashboard.scannedRecords")}
          value={metrics.scanned}
          detail={t("campaignAdmin.dashboard.freeze.awaitingReview").replace("{count}", String(metrics.pending))}
        />
        <MetricCard
          icon={<SearchCheck />}
          label={t("campaignAdmin.dashboard.duplicates")}
          value={metrics.duplicates}
          detail={t("campaignAdmin.dashboard.freeze.flaggedAutomatically")}
        />
      </div>

      {!isTrialWorkspace && (
      <Panel title={t("campaignAdmin.dashboard.suggestions")} icon={<Sparkles />}>
        <div className="movement-brain-panel">
          <div className="movement-brain-score">
            <span className="eyebrow">{t("campaignAdmin.dashboard.health")}</span>
            <strong>{movementBrainScore}/100</strong>
            <small>{t("campaignAdmin.dashboard.suggestionsHelp")}</small>
          </div>
          <div className="movement-brain-grid">
            <div>
              <span>{t("campaignAdmin.dashboard.health")}</span>
              <strong>{t(movementBrainScore >= 70 ? "campaignAdmin.dashboard.shareReady" : "campaignAdmin.dashboard.needsAttention")}</strong>
              <p>{activeCampaign?.title ?? t("campaignAdmin.dashboard.freeze.unlockInsights")}</p>
            </div>
            <div>
              <span>{t("campaignAdmin.dashboard.lowParticipation")}</span>
              <strong>{t(Object.keys(dailyTotals).length ? "campaignAdmin.dashboard.freeze.monitorTrend" : "campaignAdmin.dashboard.freeze.noTrend")}</strong>
              <p>{t("campaignAdmin.dashboard.locationHelp")}</p>
            </div>
            <div>
              <span>{t("campaignAdmin.dashboard.authorityFollowUp")}</span>
              <strong>{authorityMatch ? t("campaignAdmin.dashboard.freeze.confidence").replace("{score}", String(authorityMatch.score)) : t("campaignAdmin.dashboard.freeze.needsRoute")}</strong>
              <p>{authorityMatch ? authorityMatch.authority.name : t("campaignAdmin.dashboard.freeze.confirmAuthority")}</p>
            </div>
            <div>
              <span>{t("campaignAdmin.dashboard.nextAction")}</span>
              <strong>{lowParticipationHints[0] ?? t("campaignAdmin.dashboard.freeze.keepMomentum")}</strong>
              <p>{t("campaignAdmin.dashboard.nextActionHelp")}</p>
            </div>
          </div>
          <div className="quality-suggestions">
            {lowParticipationHints.map((hint) => <p key={hint}>{hint}</p>)}
            {lowParticipationHints.length === 0 && <p>{t("campaignAdmin.dashboard.readyForSharing")}</p>}
          </div>
        </div>
      </Panel>
      )}

      {!activeCampaign && (
        <EmptyWorkspace
          organization={organization}
          onCreateCampaign={onCreateCampaign}
          onOpenSubscription={onOpenSubscription}
          createCampaignBlockReason={createCampaignBlockReason}
          onUpgradePlan={onUpgradePlan}
        />
      )}

      {!isTrialWorkspace && (
      <Panel title={t("campaignAdmin.dashboard.contextualHelp")} icon={<SearchCheck />}>
        <div className="help-panel-grid">
          {helpPanels.map((key) => (
            <div className="help-panel-card" key={key}>
              <strong>{t(`campaignAdmin.dashboard.freeze.help.${key}.title`)}</strong>
              <p>{t(`campaignAdmin.dashboard.freeze.help.${key}.text`)}</p>
            </div>
          ))}
        </div>
      </Panel>
      )}

      <div className="two-column dashboard-insights">
        <Panel title={t("campaignAdmin.dashboard.dailyStatus")} icon={<CalendarDays />}>
          <BarList data={dailyTotals} emptyLabel={t("campaignAdmin.dashboard.noSignerActivity")} />
        </Panel>
        <Panel title={t("campaignAdmin.dashboard.authorityRouting")} icon={<Landmark />}>
          {authorityMatch ? (
            <div className="authority-card">
              <strong>{authorityMatch.authority.name}</strong>
              <span>{authorityMatch.authority.department}</span>
              <span>{authorityMatch.authority.email}</span>
              <div className="progress">
                <div style={{ width: `${authorityMatch.score}%` }} />
              </div>
              <small>
                {t("campaignAdmin.dashboard.freeze.routingConfidence").replace("{score}", String(authorityMatch.score))}
              </small>
            </div>
          ) : (
            <p>{t("campaignAdmin.dashboard.noAuthorityRule")}</p>
          )}
        </Panel>
      </div>
    </section>
  );
}
