import { lazy, Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  AlertTriangle,
  Command,
  Crosshair,
  FileScan,
  FileText,
  Globe2,
  Megaphone,
  MessageCircle,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  UsersRound,
  WalletCards
} from "lucide-react";
import type { Campaign, Organization } from "../types";
import type { AuthorityRule, Signer, ScanReviewItem, AuditLogEntry, IntegrationSettings, CommercialPackage } from "../types";
import type { LocationDeletions, LocationDeletions as LD, LocationOverrides } from "../geography";
import { NavButton, type Tab } from "../components/NavButton";
import { CommandPalette } from "../components/CommandPalette";
import { AppToast } from "../components/AppToast";
import { DashboardTab } from "../pages/app/DashboardTab";
import { CampaignsTab } from "../pages/app/CampaignsTab";
import { ActivityTab } from "../pages/app/ActivityTab";
import { SaasTab } from "../pages/app/SaasTab";
import { IdeasTab } from "../pages/app/IdeasTab";
import { PublicCampaignPage } from "../pages/PublicCampaignPage";
import type { getCampaignMetrics } from "../lib";
import type { BillingPlan } from "../types";
import type { LocationDeletionLevel, LocationWithPin } from "../geography";
import type { ScanReviewItem as SRI } from "../types";
import type { FormEvent } from "react";
import { blankSigner } from "../constants";
import type { AiCampaignCopilotResult } from "../ai/types";
import { createId } from "../lib";
import { getCampaignAdminUrl, getCampaignPublicUrl } from "../utils/campaign";

const MovementCrmTab = lazy(() =>
  import("../pages/app/MovementCrmTab").then((module) => ({ default: module.MovementCrmTab }))
);
const CommandCenterTab = lazy(() =>
  import("../pages/app/CommandCenterTab").then((module) => ({ default: module.CommandCenterTab }))
);
const ScansTab = lazy(() =>
  import("../pages/app/ScansTab").then((module) => ({ default: module.ScansTab }))
);
const ReportsTab = lazy(() =>
  import("../pages/app/ReportsTab").then((module) => ({ default: module.ReportsTab }))
);
const EngagementTab = lazy(() =>
  import("../pages/app/EngagementTab").then((module) => ({ default: module.EngagementTab }))
);
const AiCampaignCopilot = lazy(() => import("../pages/app/AiCampaignCopilot"));

type AiReviewState = Record<string, "accepted" | "rejected" | "editing">;

function addDays(dateValue: string, days: number) {
  const baseDate = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

function slugifyCampaignTitle(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `ai-campaign-${Date.now()}`;
}

function campaignSnapshot(campaign: Campaign | null | undefined) {
  return campaign ? JSON.stringify(campaign) : "";
}

function getErrorDescription(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "The action could not be completed. Please retry after checking the campaign fields and connection.";
}

function ModuleSkeleton({ label }: { label: string }) {
  return (
    <div className="module-skeleton" role="status" aria-live="polite">
      <span className="skeleton-line short" />
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-card" />
      <strong>{label}</strong>
    </div>
  );
}

interface ToastState {
  open: boolean;
  title: string;
  description: string;
}

interface AppShellProps {
  // Navigation
  activeTab: Tab;
  setActiveTab: React.Dispatch<React.SetStateAction<Tab>>;
  theme: "light" | "dark";
  setTheme: React.Dispatch<React.SetStateAction<"light" | "dark">>;
  commandOpen: boolean;
  setCommandOpen: React.Dispatch<React.SetStateAction<boolean>>;
  globalSearch: string;
  setGlobalSearch: React.Dispatch<React.SetStateAction<string>>;
  toast: ToastState;
  setToast: React.Dispatch<React.SetStateAction<ToastState>>;

  // Campaign selection
  campaigns: Campaign[];
  activeCampaignId: string;
  setActiveCampaignId: React.Dispatch<React.SetStateAction<string>>;
  activeCampaign: Campaign | undefined;
  campaignDraft: Campaign | null;
  setCampaignDraft: React.Dispatch<React.SetStateAction<Campaign | null>>;
  campaignFormMode: "create" | "edit";
  setCampaignFormMode: React.Dispatch<React.SetStateAction<"create" | "edit">>;
  isCampaignAdminRoute: boolean;
  isAppRoute: boolean;

  // Core state
  signers: Signer[];
  authorities: AuthorityRule[];
  setAuthorities: React.Dispatch<React.SetStateAction<AuthorityRule[]>>;
  organization: Organization;
  setOrganization: React.Dispatch<React.SetStateAction<Organization>>;
  scanItems: ScanReviewItem[];
  setScanItems: React.Dispatch<React.SetStateAction<ScanReviewItem[]>>;
  auditLogs: AuditLogEntry[];
  integrations: IntegrationSettings;
  setIntegrations: React.Dispatch<React.SetStateAction<IntegrationSettings>>;
  commercialPackages: CommercialPackage[];
  setCommercialPackages: React.Dispatch<React.SetStateAction<CommercialPackage[]>>;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;

  // Metrics / computed
  metrics: ReturnType<typeof getCampaignMetrics>;
  authorityMatch: { authority: AuthorityRule; score: number } | undefined;
  dailyTotals: Record<string, number>;
  weeklyTotals: Record<string, number>;
  stateTotals: Record<string, number>;
  districtTotals: Record<string, number>;
  blockTotals: Record<string, number>;
  panchayatTotals: Record<string, number>;
  campaignSigners: Signer[];

  // SaaS section
  saasSection: "organization" | "usage" | "packages" | "integrations" | "plans";
  setSaasSection: React.Dispatch<
    React.SetStateAction<"organization" | "usage" | "packages" | "integrations" | "plans">
  >;

  // Public signing (preview tab)
  publicForm: typeof blankSigner;
  setPublicForm: React.Dispatch<React.SetStateAction<typeof blankSigner>>;
  publicMessage: string;
  lastSignedSigner: Signer | null;
  otpInput: string;
  setOtpInput: React.Dispatch<React.SetStateAction<string>>;
  otpMessage: string;

  // Scan
  scanText: string;
  setScanText: React.Dispatch<React.SetStateAction<string>>;
  isScanning: boolean;
  scanMessage: string;

  // Engagement
  broadcastMessage: string;
  setBroadcastMessage: React.Dispatch<React.SetStateAction<string>>;
  copiedMessage: string;

  // CSV
  locationCsvFile: File | null;
  setLocationCsvFile: React.Dispatch<React.SetStateAction<File | null>>;
  authorityCsvFile: File | null;
  setAuthorityCsvFile: React.Dispatch<React.SetStateAction<File | null>>;
  csvUploadMessage: string;
  setCsvUploadMessage: React.Dispatch<React.SetStateAction<string>>;

  // Backend status
  backendMessage: string;

  // Command palette items
  filteredCommandItems: Array<{ label: string; detail: string; action: () => void }>;

  // Handlers
  onCreateCampaign: () => void;
  onCloneCampaign: () => void;
  onArchiveCampaign: () => void;
  onSaveCampaign: (event: FormEvent) => void;
  onPublishCampaign: () => void;
  onSubmitPublicSignature: (event: FormEvent) => void;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onUploadScan: (file: File) => void;
  onCreateManualScanItem: () => void;
  onUpdateScanParsedSigner: (
    scanId: string,
    field: keyof SRI["parsedSigner"],
    value: string
  ) => void;
  onApproveScan: (scan: SRI) => void;
  onUpdateSignerStatus: (signerId: string, status: Signer["status"]) => void;
  onAddAuthorityRule: () => void;
  onAddAdminLocationOption: (values: LocationWithPin) => boolean | Promise<boolean>;
  onRemoveAdminLocationOption: (values: LocationWithPin, level: LocationDeletionLevel) => void;
  onUploadLocationCsv: (file: File) => void;
  onUploadAuthorityCsv: (file: File) => void;
  onUpdateCampaignMedia: (file: File) => void;
  onUpdateCampaignDonationQr: (file: File) => void;
  onSelectSubscriptionPlan: (planName: BillingPlan) => void;
  onStartOneDayTrial: () => void;
  onActivateSubscriptionManually: () => void;
  onMarkSubscriptionPastDue: () => void;
  onCancelSubscription: () => void;
  onApplyCommercialPackage: (pkg: CommercialPackage) => void;
  onAuditIntegrationUpdate: () => void;
  onCopyText: (text: string) => void;
  onLogoutCampaignAdmin: () => void;
  onLogoutAppAdmin: () => void;
}

export function AppShell({
  activeTab,
  setActiveTab,
  theme,
  setTheme,
  commandOpen,
  setCommandOpen,
  globalSearch,
  setGlobalSearch,
  toast,
  setToast,
  campaigns,
  activeCampaignId,
  setActiveCampaignId,
  activeCampaign,
  campaignDraft,
  setCampaignDraft,
  campaignFormMode,
  setCampaignFormMode,
  isCampaignAdminRoute,
  isAppRoute,
  signers,
  authorities,
  setAuthorities,
  organization,
  setOrganization,
  scanItems,
  setScanItems,
  auditLogs,
  integrations,
  setIntegrations,
  commercialPackages,
  setCommercialPackages,
  locationOverrides,
  locationDeletions,
  metrics,
  authorityMatch,
  dailyTotals,
  weeklyTotals,
  stateTotals,
  districtTotals,
  blockTotals,
  panchayatTotals,
  campaignSigners,
  saasSection,
  setSaasSection,
  publicForm,
  setPublicForm,
  publicMessage,
  lastSignedSigner,
  otpInput,
  setOtpInput,
  otpMessage,
  scanText,
  setScanText,
  isScanning,
  scanMessage,
  broadcastMessage,
  setBroadcastMessage,
  copiedMessage,
  locationCsvFile,
  setLocationCsvFile,
  authorityCsvFile,
  setAuthorityCsvFile,
  csvUploadMessage,
  setCsvUploadMessage,
  backendMessage,
  filteredCommandItems,
  onCreateCampaign,
  onCloneCampaign,
  onArchiveCampaign,
  onSaveCampaign,
  onPublishCampaign,
  onSubmitPublicSignature,
  onSendOtp,
  onVerifyOtp,
  onUploadScan,
  onCreateManualScanItem,
  onUpdateScanParsedSigner,
  onApproveScan,
  onUpdateSignerStatus,
  onAddAuthorityRule,
  onAddAdminLocationOption,
  onRemoveAdminLocationOption,
  onUploadLocationCsv,
  onUploadAuthorityCsv,
  onUpdateCampaignMedia,
  onUpdateCampaignDonationQr,
  onSelectSubscriptionPlan,
  onStartOneDayTrial,
  onActivateSubscriptionManually,
  onMarkSubscriptionPastDue,
  onCancelSubscription,
  onApplyCommercialPackage,
  onAuditIntegrationUpdate,
  onCopyText,
  onLogoutCampaignAdmin,
  onLogoutAppAdmin
}: AppShellProps) {
  const [aiCopilotOpen, setAiCopilotOpen] = useState(false);
  const [aiDraftAppliedFocusKey, setAiDraftAppliedFocusKey] = useState(0);
  const [aiUndoDraft, setAiUndoDraft] = useState<Campaign | null>(null);
  const [operationNotice, setOperationNotice] = useState<{
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const savedCampaignSnapshot = campaignFormMode === "edit" ? campaignSnapshot(activeCampaign) : "";
  const draftCampaignSnapshot = campaignSnapshot(campaignDraft);
  const hasUnsavedCampaignChanges = Boolean(campaignDraft) && (
    campaignFormMode === "create" || draftCampaignSnapshot !== savedCampaignSnapshot
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ai") === "1") {
      setAiCopilotOpen(true);
      params.delete("ai");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  function requestTabChange(tab: Tab) {
    if (
      tab !== activeTab &&
      activeTab === "campaigns" &&
      hasUnsavedCampaignChanges &&
      !window.confirm("You have unsaved campaign changes. Leave without saving?")
    ) {
      return;
    }
    setOperationNotice(null);
    setActiveTab(tab);
  }

  function requestCreateCampaign() {
    if (
      activeTab === "campaigns" &&
      hasUnsavedCampaignChanges &&
      !window.confirm("You have unsaved campaign changes. Start a new campaign anyway?")
    ) {
      return;
    }
    setOperationNotice(null);
    onCreateCampaign();
  }

  function handleSafeSaveCampaign(event: FormEvent) {
    setOperationNotice(null);
    try {
      onSaveCampaign(event);
    } catch (error) {
      event.preventDefault();
      setOperationNotice({
        title: "Campaign save did not complete",
        description: getErrorDescription(error),
        actionLabel: "Review campaign",
        onAction: () => requestTabChange("campaigns")
      });
    }
  }

  function handleSafePublishCampaign() {
    setOperationNotice(null);
    try {
      onPublishCampaign();
    } catch (error) {
      setOperationNotice({
        title: "Publish did not complete",
        description: getErrorDescription(error),
        actionLabel: "Retry publish",
        onAction: handleSafePublishCampaign
      });
    }
  }

  function applyAiDraftToCampaign(
    aiResult: AiCampaignCopilotResult,
    reviewState: AiReviewState
  ) {
    if (!campaignDraft) return;
    setAiUndoDraft(campaignDraft);
    const isRejected = (section: string) => reviewState[section] === "rejected";
    const objectiveText = aiResult.draft.objectives.map((item) => `- ${item}`).join("\n");
    const volunteerText = aiResult.draft.volunteerPlan.map((item) => `- ${item}`).join("\n");
    const appealSections = [
      !isRejected("Campaign Title") ? `Subtitle:\n${aiResult.draft.subtitle}` : "",
      !isRejected("Full Description") ? aiResult.draft.fullDescription : campaignDraft.appealContent,
      !isRejected("Full Description") ? `Problem statement:\n${aiResult.draft.problemStatement}` : "",
      !isRejected("Objectives") ? `Objectives:\n${objectiveText}` : "",
      !isRejected("Full Description") ? `Expected outcome:\n${aiResult.draft.expectedOutcome}` : "",
      !isRejected("Authority") ? `Suggested authority:\n${aiResult.draft.suggestedAuthority}` : "",
      !isRejected("Summary") ? `Suggested tags:\n${aiResult.draft.suggestedTags.join(", ")}` : "",
      !isRejected("Summary") ? `Suggested banner style:\n${aiResult.draft.suggestedBannerStyle}` : "",
      !isRejected("Summary") ? `Suggested hero image prompt:\n${aiResult.draft.suggestedHeroImagePrompt}` : "",
      !isRejected("Volunteer Plan") ? `Volunteer plan:\n${volunteerText}` : "",
      !isRejected("Press Release") ? `Press release:\n${aiResult.draft.pressRelease}` : ""
    ].filter(Boolean).join("\n\n");

    const newCampaignId = createId("cmp");
    const newSlug = `${slugifyCampaignTitle(aiResult.draft.title)}-${Date.now()}`;
    const nextDraft: Campaign = {
      ...campaignDraft,
      id: newCampaignId,
      slug: newSlug,
      status: "Draft",
      title: isRejected("Campaign Title") ? campaignDraft.title : aiResult.draft.title,
      description: isRejected("Summary") ? campaignDraft.description : aiResult.draft.summary,
      appealContent: appealSections || campaignDraft.appealContent,
      category: aiResult.draft.suggestedCategory,
      goal: campaignDraft.goalLockedBySaas ? campaignDraft.goal : aiResult.draft.suggestedTarget,
      endDate: campaignDraft.datesLockedBySaas
        ? campaignDraft.endDate
        : addDays(campaignDraft.startDate, aiResult.draft.suggestedDurationDays),
      requiredFields: campaignDraft.requiredFieldsLockedBySaas
        ? campaignDraft.requiredFields
        : Array.from(new Set(aiResult.draft.suggestedSupporterFields)),
      socialShareText: isRejected("Social Posts") ? campaignDraft.socialShareText : aiResult.draft.whatsappMessage,
      thankYouMessage: isRejected("Social Posts") ? campaignDraft.thankYouMessage : aiResult.draft.whatsappMessage,
      participantUpdateMessage: isRejected("Social Posts")
        ? campaignDraft.participantUpdateMessage
        : aiResult.draft.linkedInPost,
      qrLabel: isRejected("Press Release") ? campaignDraft.qrLabel : aiResult.draft.qrPosterHeadline,
      shareUrl: getCampaignPublicUrl(organization, { slug: newSlug }),
      adminUrl: getCampaignAdminUrl(organization, { slug: newSlug })
    };

    setCampaignDraft(nextDraft);
    setCampaignFormMode("create");
    setAiDraftAppliedFocusKey((current) => current + 1);
    setActiveTab("campaigns");
    setAiCopilotOpen(false);
    setToast({
      open: true,
      title: "AI draft applied",
      description: "AI draft applied. Review and save your campaign."
    });
  }

  function applyAiSectionToCampaign(aiResult: AiCampaignCopilotResult, section: string) {
    if (!campaignDraft) return;
    setAiUndoDraft(campaignDraft);
    const nextDraft: Campaign = { ...campaignDraft };
    if (section === "Campaign Title") {
      nextDraft.title = aiResult.draft.title;
      nextDraft.appealContent = [`Subtitle:\n${aiResult.draft.subtitle}`, nextDraft.appealContent].filter(Boolean).join("\n\n");
    } else if (section === "Summary") {
      nextDraft.description = aiResult.draft.summary;
    } else if (section === "Full Description") {
      nextDraft.appealContent = [
        aiResult.draft.fullDescription,
        `Problem statement:\n${aiResult.draft.problemStatement}`,
        `Expected outcome:\n${aiResult.draft.expectedOutcome}`
      ].join("\n\n");
    } else if (section === "Objectives") {
      nextDraft.appealContent = [
        nextDraft.appealContent,
        `Objectives:\n${aiResult.draft.objectives.map((item) => `- ${item}`).join("\n")}`
      ].filter(Boolean).join("\n\n");
    } else if (section === "Authority") {
      nextDraft.category = aiResult.draft.suggestedCategory;
      nextDraft.goal = nextDraft.goalLockedBySaas ? nextDraft.goal : aiResult.draft.suggestedTarget;
    } else if (section === "Social Posts") {
      nextDraft.socialShareText = aiResult.draft.whatsappMessage;
      nextDraft.thankYouMessage = aiResult.draft.whatsappMessage;
      nextDraft.participantUpdateMessage = aiResult.draft.linkedInPost;
    } else if (section === "Volunteer Plan") {
      nextDraft.appealContent = [
        nextDraft.appealContent,
        `Volunteer plan:\n${aiResult.draft.volunteerPlan.map((item) => `- ${item}`).join("\n")}`
      ].filter(Boolean).join("\n\n");
    } else if (section === "Press Release") {
      nextDraft.qrLabel = aiResult.draft.qrPosterHeadline;
      nextDraft.appealContent = [nextDraft.appealContent, `Press release:\n${aiResult.draft.pressRelease}`].filter(Boolean).join("\n\n");
    }
    setCampaignDraft(nextDraft);
    setAiDraftAppliedFocusKey((current) => current + 1);
    setActiveTab("campaigns");
    setToast({
      open: true,
      title: "AI section applied",
      description: `${section} was applied to the current draft.`
    });
  }

  function undoLastAiApply() {
    if (!aiUndoDraft) return;
    setCampaignDraft(aiUndoDraft);
    setCampaignFormMode("create");
    setActiveTab("campaigns");
    setAiUndoDraft(null);
    setToast({
      open: true,
      title: "AI apply undone",
      description: "The previous campaign draft has been restored."
    });
  }

  return (
    <>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        query={globalSearch}
        setQuery={setGlobalSearch}
        items={filteredCommandItems}
      />
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <Megaphone size={24} />
            </div>
            <div>
              <strong>Voiceup Bharat</strong>
              <span>Indian Campaign SaaS</span>
            </div>
          </div>
          <nav className="nav">
            <NavButton
              icon={<BarChart3 />}
              label="Dashboard"
              tab="dashboard"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<Crosshair />}
              label="Command Center"
              tab="command"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<Megaphone />}
              label="Campaign admin"
              tab="campaigns"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<Globe2 />}
              label="Public signing"
              tab="public"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<UsersRound />}
              label="Movement CRM"
              tab="movement"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<FileScan />}
              label="Field Collection"
              tab="scans"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<FileText />}
              label="Reports"
              tab="reports"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<MessageCircle />}
              label="Engagement"
              tab="engagement"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            <NavButton
              icon={<ShieldCheck />}
              label="Activity"
              tab="activity"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            {!isCampaignAdminRoute && (
              <>
                <NavButton
                  icon={<WalletCards />}
                  label="SaaS admin"
                  tab="saas"
                  activeTab={activeTab}
                  onClick={requestTabChange}
                />
                <NavButton
                  icon={<Sparkles />}
                  label="Feature ideas"
                  tab="ideas"
                  activeTab={activeTab}
                  onClick={requestTabChange}
                />
              </>
            )}
          </nav>
          <div className="sidebar-card">
            <span className="eyebrow">Current plan</span>
            <strong>{organization.plan}</strong>
            <small>{organization.monthlySignatureLimit.toLocaleString()} signatures/month</small>
            <small>{backendMessage}</small>
          </div>
        </aside>

        <motion.main
          className="main"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="topbar">
            <div className="topbar-context">
              <span className="eyebrow">
                {isCampaignAdminRoute
                  ? "Campaign Administration"
                  : activeTab === "saas"
                    ? "SaaS Administration"
                    : "Selected campaign"}
              </span>
              {isCampaignAdminRoute ? (
                <strong>
                  {activeCampaign?.title}
                  {activeCampaign?.slug ? <small>/{activeCampaign.slug}</small> : null}
                </strong>
              ) : (
                <select
                  value={activeCampaignId}
                  onChange={(e) => {
                  if (
                    hasUnsavedCampaignChanges &&
                    !window.confirm("You have unsaved campaign changes. Switch campaigns without saving?")
                  ) {
                    return;
                  }
                  setCampaignFormMode("edit");
                  setActiveCampaignId(e.target.value);
                  }}
                  disabled={campaigns.length === 0}
                >
                  {campaigns.length === 0 ? (
                    <option>No campaign yet</option>
                  ) : (
                    campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.title}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>
            {isCampaignAdminRoute ? (
              <button
                className="secondary-button"
                type="button"
                onClick={onLogoutCampaignAdmin}
              >
                Logout campaign admin
              </button>
            ) : (
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setAiCopilotOpen(true)}
                >
                  <Sparkles size={18} /> Create with AI
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={requestCreateCampaign}
                >
                  <Plus size={18} /> New campaign
                </button>
                <button
                  className="secondary-button icon-button"
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  title="Open command palette (Ctrl/⌘ K)"
                  aria-label="Open command palette"
                >
                  <Command size={18} />
                </button>
                <button
                  className="secondary-button icon-button"
                  type="button"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title="Toggle theme"
                  aria-label="Toggle color theme"
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                {isAppRoute && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onLogoutAppAdmin}
                  >
                    Logout
                  </button>
                )}
              </div>
            )}
          </header>

          {activeTab === "dashboard" && (
            <DashboardTab
              activeCampaign={activeCampaign}
              campaigns={campaigns}
              metrics={metrics}
              authorityMatch={authorityMatch}
              dailyTotals={dailyTotals}
              organization={organization}
              onCreateCampaign={requestCreateCampaign}
              onOpenSubscription={() => requestTabChange("saas")}
              onOpenAiCopilot={() => setAiCopilotOpen(true)}
            />
          )}

          {activeTab === "command" && (
            <Suspense fallback={<ModuleSkeleton label="Loading Command Center" />}>
              <CommandCenterTab
                activeCampaign={activeCampaign}
                campaigns={campaigns}
                campaignSigners={campaignSigners}
                signers={signers}
                authorities={authorities}
                scanItems={scanItems}
                organization={organization}
                integrations={integrations}
                metrics={metrics}
                authorityMatch={authorityMatch}
                stateTotals={stateTotals}
                districtTotals={districtTotals}
                blockTotals={blockTotals}
                panchayatTotals={panchayatTotals}
                onOpenCampaigns={() => requestTabChange("campaigns")}
                onOpenFieldCollection={() => requestTabChange("scans")}
                onOpenEngagement={() => requestTabChange("engagement")}
                onOpenAuthorities={() => requestTabChange("campaigns")}
                onOpenSaas={() => requestTabChange("saas")}
                onOpenMovement={() => requestTabChange("movement")}
              />
            </Suspense>
          )}

          {operationNotice && (
            <div className="operation-safety-banner" role="alert">
              <AlertTriangle size={20} />
              <div>
                <strong>{operationNotice.title}</strong>
                <p>{operationNotice.description}</p>
              </div>
              {operationNotice.actionLabel && operationNotice.onAction && (
                <button className="secondary-button" type="button" onClick={operationNotice.onAction}>
                  {operationNotice.actionLabel}
                </button>
              )}
            </div>
          )}

          {activeTab === "campaigns" && (
            <CampaignsTab
              campaignDraft={campaignDraft}
              activeCampaign={activeCampaign}
              setCampaignDraft={setCampaignDraft}
              campaignFormMode={campaignFormMode}
              setCampaignFormMode={setCampaignFormMode}
              authorities={authorities}
              setAuthorities={setAuthorities}
              auditLogs={auditLogs}
              organization={organization}
              isCampaignAdminRoute={isCampaignAdminRoute}
              locationOverrides={locationOverrides}
              locationDeletions={locationDeletions}
              locationCsvFile={locationCsvFile}
              setLocationCsvFile={setLocationCsvFile}
              authorityCsvFile={authorityCsvFile}
              setAuthorityCsvFile={setAuthorityCsvFile}
              csvUploadMessage={csvUploadMessage}
              setCsvUploadMessage={setCsvUploadMessage}
              onSaveCampaign={handleSafeSaveCampaign}
              onPublishCampaign={handleSafePublishCampaign}
              onCreateCampaign={requestCreateCampaign}
              onCloneCampaign={onCloneCampaign}
              onArchiveCampaign={onArchiveCampaign}
              onOpenAiCopilot={() => setAiCopilotOpen(true)}
              aiDraftAppliedFocusKey={aiDraftAppliedFocusKey}
              onAddAuthorityRule={onAddAuthorityRule}
              onAddAdminLocationOption={onAddAdminLocationOption}
              onRemoveAdminLocationOption={onRemoveAdminLocationOption}
              onUploadLocationCsv={onUploadLocationCsv}
              onUploadAuthorityCsv={onUploadAuthorityCsv}
              onUpdateCampaignMedia={onUpdateCampaignMedia}
              onUpdateCampaignDonationQr={onUpdateCampaignDonationQr}
            />
          )}

          {activeTab === "public" &&
            (activeCampaign ? (
              <PublicCampaignPage
                campaign={activeCampaign}
                organization={organization}
                metrics={metrics}
                authority={authorityMatch?.authority}
                authorities={authorities}
                publicForm={publicForm}
                setPublicForm={setPublicForm}
                publicMessage={publicMessage}
                lastSignedSigner={lastSignedSigner}
                otpInput={otpInput}
                setOtpInput={setOtpInput}
                otpMessage={otpMessage}
                onSendOtp={onSendOtp}
                onVerifyOtp={onVerifyOtp}
                locationOverrides={locationOverrides}
                locationDeletions={locationDeletions}
                onSubmit={onSubmitPublicSignature}
              />
            ) : (
              <div className="empty-state compact-empty">
                <span className="eyebrow">No campaign data</span>
                <h2>No public campaign yet</h2>
                <p>
                  Create and publish a campaign before collecting signatures from the public page.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={requestCreateCampaign}
                >
                  <Plus size={18} /> Create campaign
                </button>
              </div>
            ))}

          {activeTab === "movement" && (
            <Suspense fallback={<ModuleSkeleton label="Loading Movement CRM" />}>
              <MovementCrmTab
                campaigns={campaigns}
                activeCampaign={activeCampaign}
                signers={signers}
                campaignSigners={campaignSigners}
                scanItems={scanItems}
                authorities={authorities}
                onOpenAiCopilot={() => setAiCopilotOpen(true)}
              />
            </Suspense>
          )}

          {activeTab === "scans" && (
            <Suspense fallback={<ModuleSkeleton label="Loading Field Collection" />}>
              <ScansTab
                activeCampaign={activeCampaign}
                scanItems={scanItems}
                campaignSigners={campaignSigners}
                setScanItems={setScanItems}
                scanText={scanText}
                setScanText={setScanText}
                isScanning={isScanning}
                scanMessage={scanMessage}
                onUploadScan={onUploadScan}
                onCreateManualScanItem={onCreateManualScanItem}
                onUpdateScanParsedSigner={onUpdateScanParsedSigner}
                onApproveScan={onApproveScan}
                onCreateCampaign={requestCreateCampaign}
              />
            </Suspense>
          )}

          {activeTab === "reports" && (
            <Suspense fallback={<ModuleSkeleton label="Loading Reports" />}>
              <ReportsTab
                activeCampaign={activeCampaign}
                campaigns={campaigns}
                signers={signers}
                scanItems={scanItems}
                integrations={integrations}
                campaignSigners={campaignSigners}
                metrics={metrics}
                authorityMatch={authorityMatch}
                dailyTotals={dailyTotals}
                weeklyTotals={weeklyTotals}
                stateTotals={stateTotals}
                districtTotals={districtTotals}
                blockTotals={blockTotals}
                panchayatTotals={panchayatTotals}
                onUpdateSignerStatus={onUpdateSignerStatus}
                onCreateCampaign={requestCreateCampaign}
              />
            </Suspense>
          )}

          {activeTab === "engagement" && (
            <Suspense fallback={<ModuleSkeleton label="Loading Communication Hub" />}>
              <EngagementTab
                activeCampaign={activeCampaign}
                organization={organization}
                integrations={integrations}
                campaignSigners={campaignSigners}
                metrics={metrics}
                broadcastMessage={broadcastMessage}
                setBroadcastMessage={setBroadcastMessage}
                copiedMessage={copiedMessage}
                onCopyText={onCopyText}
                onCreateCampaign={requestCreateCampaign}
              />
            </Suspense>
          )}

          {activeTab === "activity" && <ActivityTab auditLogs={auditLogs} />}

          {activeTab === "saas" && (
            <SaasTab
              saasSection={saasSection}
              setSaasSection={setSaasSection}
              organization={organization}
              setOrganization={setOrganization}
              campaigns={campaigns}
              signers={signers}
              scanItems={scanItems}
              commercialPackages={commercialPackages}
              setCommercialPackages={setCommercialPackages}
              integrations={integrations}
              setIntegrations={setIntegrations}
              locationOverrides={locationOverrides}
              locationDeletions={locationDeletions}
              onSelectSubscriptionPlan={onSelectSubscriptionPlan}
              onStartOneDayTrial={onStartOneDayTrial}
              onActivateSubscriptionManually={onActivateSubscriptionManually}
              onMarkSubscriptionPastDue={onMarkSubscriptionPastDue}
              onCancelSubscription={onCancelSubscription}
              onApplyCommercialPackage={onApplyCommercialPackage}
              onAuditIntegrationUpdate={onAuditIntegrationUpdate}
            />
          )}

          {activeTab === "ideas" && <IdeasTab />}
        </motion.main>
      </div>
      {aiCopilotOpen && (
        <Suspense fallback={<div className="empty-state compact-empty">Loading AI Campaign Copilot...</div>}>
          <AiCampaignCopilot
            campaignDraft={campaignDraft}
            onApplyAiDraft={applyAiDraftToCampaign}
            onApplyAiSection={applyAiSectionToCampaign}
            onUndoAiApply={undoLastAiApply}
            canUndoAiApply={Boolean(aiUndoDraft)}
            onClose={() => setAiCopilotOpen(false)}
          />
        </Suspense>
      )}
      <AppToast toast={toast} setToast={setToast} />
    </>
  );
}
