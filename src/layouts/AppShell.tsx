import { lazy, Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Command,
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
import { ScansTab } from "../pages/app/ScansTab";
import { ReportsTab } from "../pages/app/ReportsTab";
import { EngagementTab } from "../pages/app/EngagementTab";
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

const MovementCrmTab = lazy(() =>
  import("../pages/app/MovementCrmTab").then((module) => ({ default: module.MovementCrmTab }))
);
const AiCampaignCopilot = lazy(() => import("../pages/app/AiCampaignCopilot"));

type AiReviewState = Record<string, "accepted" | "rejected" | "editing">;

function addDays(dateValue: string, days: number) {
  const baseDate = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toISOString().slice(0, 10);
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

  function applyAiDraftToCampaign(
    aiResult: AiCampaignCopilotResult,
    reviewState: AiReviewState
  ) {
    if (!campaignDraft) return;
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

    const nextDraft: Campaign = {
      ...campaignDraft,
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
      qrLabel: isRejected("Press Release") ? campaignDraft.qrLabel : aiResult.draft.qrPosterHeadline
    };

    setCampaignDraft(nextDraft);
    setAiDraftAppliedFocusKey((current) => current + 1);
    setActiveTab("campaigns");
    setAiCopilotOpen(false);
    setToast({
      open: true,
      title: "AI draft applied",
      description: "AI draft applied. Review and save your campaign."
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
              onClick={setActiveTab}
            />
            <NavButton
              icon={<Megaphone />}
              label="Campaign admin"
              tab="campaigns"
              activeTab={activeTab}
              onClick={setActiveTab}
            />
            <NavButton
              icon={<Globe2 />}
              label="Public signing"
              tab="public"
              activeTab={activeTab}
              onClick={setActiveTab}
            />
            <NavButton
              icon={<UsersRound />}
              label="Movement CRM"
              tab="movement"
              activeTab={activeTab}
              onClick={setActiveTab}
            />
            <NavButton
              icon={<FileScan />}
              label="Field Collection"
              tab="scans"
              activeTab={activeTab}
              onClick={setActiveTab}
            />
            <NavButton
              icon={<FileText />}
              label="Reports"
              tab="reports"
              activeTab={activeTab}
              onClick={setActiveTab}
            />
            <NavButton
              icon={<MessageCircle />}
              label="Engagement"
              tab="engagement"
              activeTab={activeTab}
              onClick={setActiveTab}
            />
            <NavButton
              icon={<ShieldCheck />}
              label="Activity"
              tab="activity"
              activeTab={activeTab}
              onClick={setActiveTab}
            />
            {!isCampaignAdminRoute && (
              <>
                <NavButton
                  icon={<WalletCards />}
                  label="SaaS admin"
                  tab="saas"
                  activeTab={activeTab}
                  onClick={setActiveTab}
                />
                <NavButton
                  icon={<Sparkles />}
                  label="Feature ideas"
                  tab="ideas"
                  activeTab={activeTab}
                  onClick={setActiveTab}
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
                {isCampaignAdminRoute ? "Campaign admin page" : "Selected campaign"}
              </span>
              {isCampaignAdminRoute ? (
                <strong>{activeCampaign?.title}</strong>
              ) : (
                <select
                  value={activeCampaignId}
                  onChange={(e) => setActiveCampaignId(e.target.value)}
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
                  onClick={onCreateCampaign}
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
              metrics={metrics}
              authorityMatch={authorityMatch}
              dailyTotals={dailyTotals}
              organization={organization}
              onCreateCampaign={onCreateCampaign}
              onOpenSubscription={() => setActiveTab("saas")}
              onOpenAiCopilot={() => setAiCopilotOpen(true)}
            />
          )}

          {activeTab === "campaigns" && (
            <CampaignsTab
              campaignDraft={campaignDraft}
              setCampaignDraft={setCampaignDraft}
              authorities={authorities}
              setAuthorities={setAuthorities}
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
              onSaveCampaign={onSaveCampaign}
              onPublishCampaign={onPublishCampaign}
              onCreateCampaign={onCreateCampaign}
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
                  onClick={onCreateCampaign}
                >
                  <Plus size={18} /> Create campaign
                </button>
              </div>
            ))}

          {activeTab === "movement" && (
            <Suspense fallback={<div className="empty-state compact-empty">Loading Movement CRM...</div>}>
              <MovementCrmTab
                campaigns={campaigns}
                activeCampaign={activeCampaign}
                signers={signers}
                campaignSigners={campaignSigners}
                authorities={authorities}
                onOpenAiCopilot={() => setAiCopilotOpen(true)}
              />
            </Suspense>
          )}

          {activeTab === "scans" && (
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
              onCreateCampaign={onCreateCampaign}
            />
          )}

          {activeTab === "reports" && (
            <ReportsTab
              activeCampaign={activeCampaign}
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
              onCreateCampaign={onCreateCampaign}
            />
          )}

          {activeTab === "engagement" && (
            <EngagementTab
              activeCampaign={activeCampaign}
              campaignSigners={campaignSigners}
              metrics={metrics}
              broadcastMessage={broadcastMessage}
              setBroadcastMessage={setBroadcastMessage}
              copiedMessage={copiedMessage}
              onCopyText={onCopyText}
              onCreateCampaign={onCreateCampaign}
            />
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
            onClose={() => setAiCopilotOpen(false)}
          />
        </Suspense>
      )}
      <AppToast toast={toast} setToast={setToast} />
    </>
  );
}
