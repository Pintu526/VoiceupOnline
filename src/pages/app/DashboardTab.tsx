import { useMemo, useState } from "react";
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
  createCampaignBlockReason?: string;
  canUseAiCopilot: boolean;
  onUpgradePlan: () => void;
}

const organizationTypes = [
  {
    label: "NGO",
    templates: "Civic, health, education, environment",
    fields: "Name, phone, district",
    authorities: "Collector, department officer, municipal body",
    channels: "WhatsApp, email, field collection"
  },
  {
    label: "Political organization",
    templates: "Citizen rights, public policy, infrastructure",
    fields: "Name, phone, ward, booth/locality",
    authorities: "Councillor, MLA, MP, party office",
    channels: "WhatsApp, SMS, social media"
  },
  {
    label: "Temple trust",
    templates: "Temple development, heritage, festival",
    fields: "Name, phone, address",
    authorities: "Temple committee, endowments, municipal body",
    channels: "WhatsApp, posters, QR"
  },
  {
    label: "RWA",
    templates: "Road, garbage, street light, water",
    fields: "Name, phone, block, apartment/ward",
    authorities: "Municipal Commissioner, engineer, councillor",
    channels: "WhatsApp, QR, field collection"
  },
  {
    label: "Student body",
    templates: "Scholarship, library, college infrastructure",
    fields: "Name, phone, institution",
    authorities: "Principal, education officer, university",
    channels: "Social media, WhatsApp, email"
  },
  {
    label: "Citizen group",
    templates: "Civic infrastructure, RTI, public policy",
    fields: "Name, phone, district",
    authorities: "Collector, municipal body, public grievance",
    channels: "WhatsApp, email, press"
  },
  {
    label: "Social movement",
    templates: "Citizen rights, women safety, youth",
    fields: "Name, phone, state, district",
    authorities: "Collector, CM office, department secretary",
    channels: "Social media, WhatsApp, email"
  },
  {
    label: "Educational institution",
    templates: "School improvement, teacher recruitment, library",
    fields: "Name, phone, role",
    authorities: "Education officer, school committee",
    channels: "Email, WhatsApp, QR"
  },
  {
    label: "Healthcare group",
    templates: "Medical camp, hospital upgrade, ambulance",
    fields: "Name, phone, district",
    authorities: "CDMO, hospital superintendent, collector",
    channels: "WhatsApp, email, field collection"
  },
  {
    label: "Animal welfare group",
    templates: "Animal shelter, veterinary support, cow protection",
    fields: "Name, phone, locality",
    authorities: "Veterinary officer, animal resources, collector",
    channels: "WhatsApp, social media, posters"
  },
  {
    label: "Environment group",
    templates: "Tree plantation, river cleaning, lake restoration",
    fields: "Name, phone, district",
    authorities: "Forest officer, pollution board, collector",
    channels: "Social media, WhatsApp, press"
  }
];

const helpPanels = [
  ["Campaign Studio", "Build the public petition page, signer form, media, and publish readiness."],
  ["Authority Intelligence", "Choose or recommend the offices that should receive the petition."],
  ["Field Collection", "Bring paper sheets, OCR review, and manual supporter entry into one workflow."],
  ["Movement CRM", "Understand supporters, volunteers, referrals, and movement health."],
  ["AI Campaign Copilot", "Turn one sentence into a professional campaign draft you can review and save."]
];

const quickStartSteps: Array<[string, LucideIcon]> = [
  ["Choose organization type", Building2],
  ["Configure location governance", Globe2],
  ["Choose campaign template", Megaphone],
  ["Select authorities", Landmark],
  ["Configure supporter fields", Users],
  ["Add campaign media", FileImage],
  ["Publish campaign", CheckCircle2],
  ["Share link/QR", QrCode]
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
  createCampaignBlockReason = "",
  canUseAiCopilot,
  onUpgradePlan
}: DashboardTabProps) {
  const { t } = useTranslation();
  const displayCampaign = activeCampaign ?? PLACEHOLDER_CAMPAIGN;
  const isTrialWorkspace = organization.plan === "Free Trial";
  const [quickStartDismissed, setQuickStartDismissed] = useState(false);
  const [selectedOrgType, setSelectedOrgType] = useState(organizationTypes[0].label);
  const selectedOrgRecommendation = useMemo(
    () => organizationTypes.find((type) => type.label === selectedOrgType) ?? organizationTypes[0],
    [selectedOrgType]
  );
  const showQuickStart = !quickStartDismissed && campaigns.length <= 2;
  const quickStartItems = [
    {
      label: "Workspace profile completed",
      ready: Boolean(organization.name && organization.ownerEmail)
    },
    {
      label: "Location governance configured",
      ready: Boolean(organization.locationGovernance?.lockLevel && organization.locationGovernance.lockLevel !== "none")
    },
    {
      label: "First campaign drafted",
      ready: campaigns.length > 0
    },
    {
      label: "Authority selected",
      ready: Boolean(activeCampaign?.selectedAuthorityId || authorityMatch)
    },
    {
      label: "Public page reviewed",
      ready: Boolean(activeCampaign?.shareUrl)
    },
    {
      label: "Field collection ready",
      ready: Boolean(activeCampaign)
    },
    {
      label: "Movement CRM ready",
      ready: metrics.total > 0
    },
    {
      label: "Communication setup",
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
    metrics.total === 0 ? "No supporters yet. Share the public campaign link first." : "",
    metrics.verified < Math.max(1, Math.round(metrics.total * 0.5)) ? "Verification coverage is below ideal for authority submission." : "",
    !authorityMatch ? "Authority route needs confirmation before petition delivery." : "",
    !activeCampaign?.heroImage ? "Add a campaign image to improve public page trust." : "",
    !activeCampaign?.socialShareText ? "Prepare WhatsApp/social copy for faster distribution." : ""
  ].filter(Boolean);
  const trialActionCards = [
    {
      label: "Campaign",
      detail: activeCampaign ? "Edit campaign details" : "Create your first campaign",
      icon: Megaphone,
      action: activeCampaign ? onOpenCampaignAdmin : onCreateCampaign
    },
    {
      label: "Share",
      detail: activeCampaign?.shareUrl ? "Open public signing page" : "Create a campaign to get a share link",
      icon: Send,
      action: activeCampaign ? onOpenPublicCampaign : onCreateCampaign
    },
    {
      label: "Analytics",
      detail: `${metrics.total.toLocaleString()} total supporters`,
      icon: SearchCheck,
      action: onOpenReports
    },
    {
      label: "Supporters",
      detail: `${metrics.verified.toLocaleString()} verified signatures`,
      icon: Users,
      action: onOpenReports
    },
    {
      label: "Upgrade",
      detail: "Unlock more campaigns and growth tools",
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
      {isTrialWorkspace && (
        <Panel title="Free Trial Focus" icon={<CheckCircle2 />}>
          <div className="quick-start-panel">
            <div className="quick-start-hero">
              <div>
                <span className="eyebrow">{t("campaignAdmin.dashboard.createSixty")}</span>
                <h2>{t("campaignAdmin.dashboard.trialTitle")}</h2>
                <p>
                  Your trial workspace keeps the first campaign simple: edit the campaign, share the public link,
                  watch supporters, review analytics, and upgrade when you are ready.
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
                  <Send size={18} /> Open share link
                </a>
                <button className="secondary-button" type="button" onClick={onOpenCampaignAdmin}>
                  <Megaphone size={18} /> Edit campaign
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
            <Globe2 size={18} /> Upgrade Plan
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onOpenAiCopilot}>
            <Sparkles size={18} /> Create with AI
          </button>
        )}
      </div>
      )}

      {showQuickStart && (
        <Panel title="Quick Start" icon={<Sparkles />}>
          <div className="quick-start-panel">
            <div className="quick-start-hero">
              <div>
                <span className="eyebrow">{t("campaignAdmin.dashboard.createSixty")}</span>
                <h2>{t("campaignAdmin.dashboard.setupTitle")}</h2>
                <p>
                  Follow the checklist, pick your organization type, draft a campaign, then review
                  and save using the existing campaign workflow.
                </p>
              </div>
              <div className="quick-start-score">
                <span>{t("campaignAdmin.dashboard.setupProgress")}</span>
                <strong>{quickStartProgress}%</strong>
                <small>{quickStartItems.filter((item) => item.ready).length} of {quickStartItems.length} ready</small>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Dismiss Quick Start"
                onClick={() => setQuickStartDismissed(true)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="quick-start-steps">
              {quickStartSteps.map(([label, Icon], index) => (
                <div className="quick-start-step" key={String(label)}>
                  <Icon size={18} />
                  <span>{index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>

            <div className="quick-start-grid">
              <div className="quick-start-card">
                <span className="eyebrow">{t("campaignAdmin.dashboard.organizationType")}</span>
                <div className="org-type-grid" role="list" aria-label="Organization type recommendations">
                  {organizationTypes.map((type) => (
                    <button
                      className={selectedOrgType === type.label ? "selected" : ""}
                      key={type.label}
                      type="button"
                      onClick={() => setSelectedOrgType(type.label)}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="quick-start-card recommendation-card">
                <span className="eyebrow">{t("campaignAdmin.dashboard.recommendedSetup")}</span>
                <strong>{selectedOrgRecommendation.label}</strong>
                <p><b>{t("campaignAdmin.dashboard.templates")}:</b> {selectedOrgRecommendation.templates}</p>
                <p><b>{t("campaignAdmin.dashboard.supporterFields")}:</b> {selectedOrgRecommendation.fields}</p>
                <p><b>{t("campaignAdmin.dashboard.authorities")}:</b> {selectedOrgRecommendation.authorities}</p>
                <p><b>{t("campaignAdmin.dashboard.channels")}:</b> {selectedOrgRecommendation.channels}</p>
              </div>
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
                  <Globe2 size={18} /> Upgrade Plan
                </button>
              ) : (
                <>
                  {canUseAiCopilot && (
                    <button className="primary-button" type="button" onClick={onOpenAiCopilot}>
                      <Sparkles size={18} /> Create with AI
                    </button>
                  )}
                  <button className="secondary-button" type="button" onClick={onCreateCampaign}>
                    <Megaphone size={18} /> Create campaign
                  </button>
                </>
              )}
              <button className="secondary-button" type="button" onClick={onOpenSubscription}>
                <Globe2 size={18} /> Configure workspace
              </button>
              <span className="helper-text">
                Create campaign opens the existing campaign setup flow for review before saving.
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
          detail={`${metrics.verified} verified`}
        />
        <MetricCard
          icon={<Globe2 />}
          label={t("campaignAdmin.dashboard.onlineSignatures")}
          value={metrics.online}
          detail="Collected from public page"
        />
        <MetricCard
          icon={<FileScan />}
          label={t("campaignAdmin.dashboard.scannedRecords")}
          value={metrics.scanned}
          detail={`${metrics.pending} awaiting review`}
        />
        <MetricCard
          icon={<SearchCheck />}
          label={t("campaignAdmin.dashboard.duplicates")}
          value={metrics.duplicates}
          detail="Flagged automatically"
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
              <p>{activeCampaign?.title ?? "Create a campaign to unlock movement insights."}</p>
            </div>
            <div>
              <span>{t("campaignAdmin.dashboard.lowParticipation")}</span>
              <strong>{Object.keys(dailyTotals).length ? "Monitor daily trend" : "No trend yet"}</strong>
              <p>{t("campaignAdmin.dashboard.locationHelp")}</p>
            </div>
            <div>
              <span>{t("campaignAdmin.dashboard.authorityFollowUp")}</span>
              <strong>{authorityMatch ? `${authorityMatch.score}% confidence` : "Needs route"}</strong>
              <p>{authorityMatch ? authorityMatch.authority.name : "Confirm authority before petition delivery."}</p>
            </div>
            <div>
              <span>{t("campaignAdmin.dashboard.nextAction")}</span>
              <strong>{lowParticipationHints[0] ?? "Keep momentum"}</strong>
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
          {helpPanels.map(([title, text]) => (
            <div className="help-panel-card" key={title}>
              <strong>{title}</strong>
              <p>{text}</p>
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
                {authorityMatch.score}% routing confidence by category, location, and postal/PIN code.
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
