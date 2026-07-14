import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import {
  Archive,
  BarChart3,
  AlertTriangle,
  Command,
  Copy,
  Crosshair,
  FileScan,
  FileText,
  Globe2,
  Megaphone,
  MessageCircle,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  Trash2,
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
import { formatAuthorityDisplay, getAppealAuthority } from "../utils/authority";
import { getCreateCampaignBlockReason, isFeatureIncludedInPlan } from "../utils/subscription";
import { GROWTH_FEATURE_FLAGS } from "../growth/constants";
import type { GrowthRuntimeState, GrowthShareContext, GrowthSupporterSnapshot } from "../growth/lifecycle";
import type { SupporterGrowthPortalModel } from "../growth/tree";
import { useTranslation } from "../i18n";

const MovementCrmTab = lazy(() =>
  import("../pages/app/MovementCrmTab").then((module) => ({ default: module.MovementCrmTab }))
);
const GrowthDashboardTab = lazy(() =>
  import("../pages/app/GrowthDashboardTab").then((module) => ({ default: module.GrowthDashboardTab }))
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

function readStoredIdList(storageKey: string) {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const parsedValue = storedValue ? JSON.parse(storedValue) : [];
    return Array.isArray(parsedValue)
      ? parsedValue.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStoredIdList(storageKey: string, ids: string[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Campaign switching should keep working even when localStorage is unavailable.
  }
}

function getCampaignSelectorStatus(campaign: Campaign) {
  if (campaign.archivedAt) return "Archived";
  return campaign.status === "Closed" ? "Completed" : campaign.status;
}

function getCampaignSelectorStatusData(campaign: Campaign) {
  return campaign.archivedAt || campaign.status === "Closed" ? "Closed" : campaign.status;
}

function getCampaignAuthorityText(campaign: Campaign, authorities: AuthorityRule[]) {
  const authority = getAppealAuthority(campaign, authorities);
  return formatAuthorityDisplay(authority);
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
  canAccessPlatformAdmin: boolean;

  // Core state
  signers: Signer[];
  growthRuntime: GrowthRuntimeState;
  setGrowthRuntime: React.Dispatch<React.SetStateAction<GrowthRuntimeState>>;
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
  growthSnapshot?: GrowthSupporterSnapshot;
  growthPortal?: SupporterGrowthPortalModel;
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
  onDeleteCampaign: () => void;
  onSaveCampaign: (event: FormEvent) => void;
  onPublishCampaign: () => void;
  onSubmitPublicSignature: (event: FormEvent) => void;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onGrowthShare: (share: GrowthShareContext) => void;
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
  canAccessPlatformAdmin,
  signers,
  growthRuntime,
  setGrowthRuntime,
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
  growthSnapshot,
  growthPortal,
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
  onDeleteCampaign,
  onSaveCampaign,
  onPublishCampaign,
  onSubmitPublicSignature,
  onSendOtp,
  onVerifyOtp,
  onGrowthShare,
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
  const { t } = useTranslation();
  const [aiCopilotOpen, setAiCopilotOpen] = useState(false);
  const [aiDraftAppliedFocusKey, setAiDraftAppliedFocusKey] = useState(0);
  const [aiUndoDraft, setAiUndoDraft] = useState<Campaign | null>(null);
  const [operationNotice, setOperationNotice] = useState<{
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const pinnedCampaignStorageKey = `voiceup-campaign-selector-pinned-${organization.id}`;
  const recentCampaignStorageKey = `voiceup-campaign-selector-recent-${organization.id}`;
  const [campaignSelectorOpen, setCampaignSelectorOpen] = useState(false);
  const [campaignSelectorQuery, setCampaignSelectorQuery] = useState("");
  const [pinnedCampaignIds, setPinnedCampaignIds] = useState<string[]>(() =>
    readStoredIdList(pinnedCampaignStorageKey)
  );
  const [recentCampaignIds, setRecentCampaignIds] = useState<string[]>(() =>
    readStoredIdList(recentCampaignStorageKey)
  );
  const campaignAuthorityTextById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, getCampaignAuthorityText(campaign, authorities)])),
    [authorities, campaigns]
  );
  const savedCampaignSnapshot = campaignFormMode === "edit" ? campaignSnapshot(activeCampaign) : "";
  const draftCampaignSnapshot = campaignSnapshot(campaignDraft);
  const hasUnsavedCampaignChanges = Boolean(campaignDraft) && (
    campaignFormMode === "create" || draftCampaignSnapshot !== savedCampaignSnapshot
  );
  const campaignCreationBlockReason = getCreateCampaignBlockReason(organization, campaigns);
  const campaignCreationLocked = Boolean(campaignCreationBlockReason);
  const canShowWorkspaceCreateActions = !isCampaignAdminRoute && activeTab === "dashboard";
  const enabledFeatureKeys = new Set(organization.enabledFeatureKeys ?? []);
  const hasWorkspaceFeature = (featureKey: string) =>
    canAccessPlatformAdmin ||
    isFeatureIncludedInPlan(organization.plan, featureKey) ||
    enabledFeatureKeys.has(featureKey);
  const canUseGrowthEngine =
    hasWorkspaceFeature(GROWTH_FEATURE_FLAGS.growthEngine) ||
    enabledFeatureKeys.has(GROWTH_FEATURE_FLAGS.legacyMovementCrm);
  const canUseReports = hasWorkspaceFeature("basic_reports") || hasWorkspaceFeature("advanced_reports");
  const canUseAiCopilot = hasWorkspaceFeature("ai_copilot");

  useEffect(() => {
    setPinnedCampaignIds(readStoredIdList(pinnedCampaignStorageKey));
    setRecentCampaignIds(readStoredIdList(recentCampaignStorageKey));
  }, [pinnedCampaignStorageKey, recentCampaignStorageKey]);

  useEffect(() => {
    const validCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
    writeStoredIdList(
      pinnedCampaignStorageKey,
      pinnedCampaignIds.filter((campaignId) => validCampaignIds.has(campaignId))
    );
  }, [campaigns, pinnedCampaignIds, pinnedCampaignStorageKey]);

  useEffect(() => {
    const validCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
    writeStoredIdList(
      recentCampaignStorageKey,
      recentCampaignIds.filter((campaignId) => validCampaignIds.has(campaignId)).slice(0, 6)
    );
  }, [campaigns, recentCampaignIds, recentCampaignStorageKey]);

  const campaignSelectorSearchTerm = campaignSelectorQuery.trim().toLowerCase();
  const visibleCampaigns = useMemo(() => {
    if (!campaignSelectorSearchTerm) return campaigns;
    return campaigns.filter((campaign) =>
      [
        campaign.title,
        campaign.slug,
        campaign.category,
        campaign.status,
        getCampaignSelectorStatus(campaign),
        campaignAuthorityTextById.get(campaign.id),
        campaign.location,
        campaign.state,
        campaign.district,
        campaign.country
      ]
        .join(" ")
        .toLowerCase()
        .includes(campaignSelectorSearchTerm)
    );
  }, [campaignAuthorityTextById, campaignSelectorSearchTerm, campaigns]);
  const shouldWindowCampaignList = visibleCampaigns.length > 100;
  const campaignGroupRenderLimit = shouldWindowCampaignList ? 80 : Number.POSITIVE_INFINITY;
  const pinnedCampaignIdSet = useMemo(() => new Set(pinnedCampaignIds), [pinnedCampaignIds]);
  const pinnedCampaigns = pinnedCampaignIds
    .map((campaignId) => visibleCampaigns.find((campaign) => campaign.id === campaignId))
    .filter((campaign): campaign is Campaign => Boolean(campaign));
  const recentCampaigns = recentCampaignIds
    .map((campaignId) => visibleCampaigns.find((campaign) => campaign.id === campaignId))
    .filter((campaign): campaign is Campaign => Boolean(campaign));
  const draftCampaigns = visibleCampaigns.filter(
    (campaign) => campaign.status === "Draft" && getCampaignSelectorStatus(campaign) !== "Archived"
  );
  const publishedCampaigns = visibleCampaigns.filter(
    (campaign) => campaign.status === "Published" && getCampaignSelectorStatus(campaign) !== "Archived"
  );
  const pausedCampaigns = visibleCampaigns.filter(
    (campaign) => campaign.status === "Paused" && getCampaignSelectorStatus(campaign) !== "Archived"
  );
  const completedCampaigns = visibleCampaigns.filter(
    (campaign) => campaign.status === "Closed" && !campaign.archivedAt
  );
  const archivedCampaigns = visibleCampaigns.filter(
    (campaign) => Boolean(campaign.archivedAt)
  );

  function getLockedTabMessage(tab: Tab): string {
    const messages: Partial<Record<Tab, string>> = {
      command: "Command Center is available on Pro Movement or Enterprise plans.",
      public: "Public signing is not enabled on the current plan.",
      movement: "Movement CRM is available on Pro Movement or Enterprise plans.",
      growth: "Campaign Growth Engine is available on Pro Movement or Enterprise plans.",
      scans: "Field Collection is available on Growth, Pro Movement, or Enterprise plans.",
      reports: "Reports are not enabled on the current plan.",
      engagement: "Communication Hub is available on Growth, Pro Movement, or Enterprise plans.",
      activity: "Activity and role audit views require an Enterprise roles plan.",
      saas: "SaaS administration requires platform admin authentication.",
      ideas: "Feature ideas require platform admin authentication."
    };
    return messages[tab] ?? "Upgrade the workspace plan to use this feature.";
  }

  function canAccessWorkspaceTab(tab: Tab): boolean {
    if (canAccessPlatformAdmin) return true;
    if (tab === "dashboard" || tab === "campaigns") return true;
    if (tab === "public") return hasWorkspaceFeature("public_signing");
    if (tab === "reports") return canUseReports;
    if (tab === "command") return hasWorkspaceFeature("command_center");
    if (tab === "movement") return hasWorkspaceFeature("movement_crm");
    if (tab === "growth") return canUseGrowthEngine;
    if (tab === "scans") return hasWorkspaceFeature("field_collection");
    if (tab === "engagement") return hasWorkspaceFeature("communication_hub");
    if (tab === "activity") return hasWorkspaceFeature("roles");
    if (tab === "saas" || tab === "ideas") return false;
    return false;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ai") === "1") {
      if (!canUseAiCopilot) {
        setOperationNotice({
          title: "Upgrade plan required",
          description: "AI Copilot is available on Growth, Pro Movement, or Enterprise plans."
        });
      } else if (campaignCreationBlockReason) {
        setOperationNotice({
          title: "Upgrade plan required",
          description: campaignCreationBlockReason
        });
      } else {
        setAiCopilotOpen(true);
      }
      params.delete("ai");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [campaignCreationBlockReason, canUseAiCopilot]);

  function requestTabChange(tab: Tab) {
    if ((tab === "saas" || tab === "ideas") && !canAccessPlatformAdmin) {
      setOperationNotice({
        title: "Platform admin access required",
        description: "SaaS billing, packages, integrations, and global platform controls require platform admin authentication."
      });
      return;
    }
    if (!canAccessWorkspaceTab(tab)) {
      setOperationNotice({
        title: "Upgrade plan required",
        description: getLockedTabMessage(tab)
      });
      setActiveTab("dashboard");
      return;
    }
    if (
      tab !== activeTab &&
      activeTab === "campaigns" &&
      hasUnsavedCampaignChanges &&
      !window.confirm(t("campaignAdmin.confirm.leaveUnsaved"))
    ) {
      return;
    }
    setOperationNotice(null);
    setActiveTab(tab);
  }

  useEffect(() => {
    if (!canAccessWorkspaceTab(activeTab)) {
      setOperationNotice({
        title: "Upgrade plan required",
        description: getLockedTabMessage(activeTab)
      });
      setActiveTab("dashboard");
    }
  }, [activeTab, canAccessPlatformAdmin, organization.enabledFeatureKeys, organization.plan, setActiveTab]);

  function requestUpgradePlan() {
    if (canAccessPlatformAdmin) {
      requestTabChange("saas");
      return;
    }
    setOperationNotice({
      title: "Upgrade plan required",
      description:
        campaignCreationBlockReason ||
        "Upgrade the workspace plan before creating another campaign."
    });
  }

  function requestAiCampaignCreation() {
    if (!canUseAiCopilot) {
      setOperationNotice({
        title: "Upgrade plan required",
        description: "AI Copilot is available on Growth, Pro Movement, or Enterprise plans."
      });
      return;
    }
    if (campaignCreationLocked) {
      requestUpgradePlan();
      return;
    }
    setOperationNotice(null);
    setAiCopilotOpen(true);
  }

  function requestCreateCampaign() {
    if (
      activeTab === "campaigns" &&
      hasUnsavedCampaignChanges &&
      !window.confirm(t("campaignAdmin.confirm.startNewUnsaved"))
    ) {
      return;
    }
    setOperationNotice(null);
    setCampaignSelectorOpen(false);
    setCampaignSelectorQuery("");
    setCommandOpen(false);
    setGlobalSearch("");
    setAiCopilotOpen(false);
    onCreateCampaign();
    if (campaignCreationBlockReason) {
      setOperationNotice({
        title: "Campaign creation unavailable",
        description: campaignCreationBlockReason
      });
    }
  }

  function selectCampaign(campaignId: string) {
    const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
    if (!selectedCampaign) return;
    if (
      hasUnsavedCampaignChanges &&
      !window.confirm(t("campaignAdmin.confirm.switchUnsaved"))
    ) {
      return;
    }
    setCampaignFormMode("edit");
    setActiveCampaignId(selectedCampaign.id);
    setRecentCampaignIds((current) => [
      selectedCampaign.id,
      ...current.filter((currentCampaignId) => currentCampaignId !== selectedCampaign.id)
    ].slice(0, 6));
    setCampaignSelectorOpen(false);
    setCampaignSelectorQuery("");
  }

  function requestOpenCampaignDashboard() {
    if (hasUnsavedCampaignChanges && !window.confirm(t("campaignAdmin.confirm.dashboardUnsaved"))) {
      return;
    }
    setCampaignSelectorOpen(false);
    setOperationNotice(null);
    setActiveTab("dashboard");
  }

  function requestDuplicateCampaign() {
    if (!campaignDraft) return;
    if (hasUnsavedCampaignChanges && !window.confirm(t("campaignAdmin.confirm.duplicateUnsaved"))) {
      return;
    }
    onCloneCampaign();
    setCampaignSelectorOpen(false);
  }

  function requestArchiveCampaign() {
    if (campaignFormMode === "create" || !activeCampaign) return;
    if (hasUnsavedCampaignChanges && !window.confirm(t("campaignAdmin.confirm.archiveUnsaved"))) {
      return;
    }
    if (!window.confirm(`${t("campaignAdmin.confirm.archive")} "${activeCampaign.title || t("campaignAdmin.common.thisCampaign")}"?`)) return;
    onArchiveCampaign();
    setCampaignSelectorOpen(false);
  }

  function requestDeleteCampaign() {
    if (campaignFormMode === "create" || !activeCampaign) return;
    if (hasUnsavedCampaignChanges && !window.confirm(t("campaignAdmin.confirm.deleteUnsaved"))) {
      return;
    }
    const campaignName = activeCampaign.title || t("campaignAdmin.common.thisCampaign");
    if (!window.confirm(`${t("campaignAdmin.confirm.deletePrefix")} "${campaignName}" ${t("campaignAdmin.confirm.deleteSuffix")}`)) return;
    onDeleteCampaign();
    setCampaignSelectorOpen(false);
  }

  function togglePinnedCampaign(campaignId: string) {
    setPinnedCampaignIds((current) =>
      current.includes(campaignId)
        ? current.filter((currentCampaignId) => currentCampaignId !== campaignId)
        : [campaignId, ...current]
    );
  }

  function renderCampaignSelectorItem(campaign: Campaign, groupName: string) {
    const isSelected = campaignFormMode === "edit" && activeCampaignId === campaign.id;
    const isPinned = pinnedCampaignIdSet.has(campaign.id);
    const authorityText = campaignAuthorityTextById.get(campaign.id) || t("campaignAdmin.selector.authorityNotConfigured");
    return (
      <div className="campaign-switcher-item" key={`${groupName}-${campaign.id}`}>
        <button
          className={isSelected ? "selected" : ""}
          type="button"
          onClick={() => selectCampaign(campaign.id)}
        >
          <span>
            <strong>{campaign.title || t("campaignAdmin.selector.untitled")}</strong>
            <small>
              {campaign.slug ? `/${campaign.slug}` : t("campaignAdmin.selector.noSlug")} · {authorityText}
            </small>
          </span>
          <span className="status-pill" data-status={getCampaignSelectorStatusData(campaign)}>
            {t(`campaignAdmin.status.${getCampaignSelectorStatus(campaign).toLowerCase()}`)}
          </span>
        </button>
        <button
          className={isPinned ? "campaign-pin-button active" : "campaign-pin-button"}
          type="button"
          aria-label={t(isPinned ? "campaignAdmin.selector.removeFavourite" : "campaignAdmin.selector.favourite")}
          onClick={() => togglePinnedCampaign(campaign.id)}
        >
          <Star size={15} />
        </button>
      </div>
    );
  }

  function renderCampaignSelectorGroup(title: string, groupCampaigns: Campaign[]) {
    if (groupCampaigns.length === 0) return null;
    const renderedCampaigns = groupCampaigns.slice(0, campaignGroupRenderLimit);
    return (
      <section className="campaign-switcher-group" aria-label={title}>
        <div className="campaign-switcher-group-header">
          <span>{title}</span>
          <small>{groupCampaigns.length}</small>
        </div>
        {renderedCampaigns.map((campaign) => renderCampaignSelectorItem(campaign, title))}
        {renderedCampaigns.length < groupCampaigns.length && (
          <p className="campaign-switcher-window-note">
            {t("campaignAdmin.selector.showingFirst")} {renderedCampaigns.length} {t("campaignAdmin.selector.of")} {groupCampaigns.length}. {t("campaignAdmin.selector.narrowResults")}
          </p>
        )}
      </section>
    );
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
      <Dialog.Root open={campaignSelectorOpen} onOpenChange={setCampaignSelectorOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="command-overlay" />
          <Dialog.Content className="campaign-switcher-dialog" aria-label={t("campaignAdmin.selector.aria")}>
            <div className="command-search campaign-switcher-search">
              <Search size={18} />
              <input
                autoFocus
                aria-label={t("campaignAdmin.selector.searchAria")}
                placeholder={t("campaignAdmin.selector.searchPlaceholder")}
                value={campaignSelectorQuery}
                onChange={(event) => setCampaignSelectorQuery(event.target.value)}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="campaign-switcher-actions">
              {campaignFormMode === "create" && campaignDraft && (
                <button
                  className="campaign-switcher-draft-card"
                  type="button"
                  onClick={() => setCampaignSelectorOpen(false)}
                >
                  <span className="eyebrow">{t("campaignAdmin.selector.currentDraft")}</span>
                  <strong>{campaignDraft.title || t("campaignAdmin.selector.newUnsaved")}</strong>
                  <small>{t("campaignAdmin.selector.separateId")}</small>
                </button>
              )}
              <button className="secondary-button" type="button" onClick={requestCreateCampaign}>
                <Plus size={18} /> {t("campaignAdmin.actions.newCampaign")}
              </button>
              <div className="campaign-manager-button-row" aria-label={t("campaignAdmin.actions.aria")}>
                <button className="secondary-button" type="button" onClick={requestDuplicateCampaign} disabled={!campaignDraft}>
                  <Copy size={16} /> {t("campaignAdmin.actions.duplicate")}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={requestArchiveCampaign}
                  disabled={campaignFormMode === "create" || !activeCampaign}
                >
                  <Archive size={16} /> {t("campaignAdmin.actions.archive")}
                </button>
                <button
                  className="secondary-button danger-action"
                  type="button"
                  onClick={requestDeleteCampaign}
                  disabled={campaignFormMode === "create" || !activeCampaign}
                >
                  <Trash2 size={16} /> {t("campaignAdmin.actions.delete")}
                </button>
                <button className="secondary-button" type="button" onClick={requestOpenCampaignDashboard}>
                  <BarChart3 size={16} /> {t("campaignAdmin.actions.openDashboard")}
                </button>
              </div>
            </div>
            {shouldWindowCampaignList && (
              <div className="campaign-switcher-performance-note" role="status">
                {t("campaignAdmin.selector.largeWorkspace")}
              </div>
            )}
            <div className="campaign-switcher-list">
              {campaigns.length === 0 ? (
                <div className="command-empty">{t("campaignAdmin.selector.empty")}</div>
              ) : visibleCampaigns.length === 0 ? (
                <div className="command-empty">{t("campaignAdmin.selector.noMatch")}</div>
              ) : (
                <>
                  {!campaignSelectorSearchTerm && renderCampaignSelectorGroup(t("campaignAdmin.selector.favourites"), pinnedCampaigns)}
                  {!campaignSelectorSearchTerm && renderCampaignSelectorGroup(t("campaignAdmin.selector.recent"), recentCampaigns)}
                  {renderCampaignSelectorGroup(t("campaignAdmin.selector.drafts"), draftCampaigns)}
                  {renderCampaignSelectorGroup(t("campaignAdmin.selector.published"), publishedCampaigns)}
                  {renderCampaignSelectorGroup(t("campaignAdmin.selector.paused"), pausedCampaigns)}
                  {renderCampaignSelectorGroup(t("campaignAdmin.selector.completed"), completedCampaigns)}
                  {renderCampaignSelectorGroup(t("campaignAdmin.selector.archived"), archivedCampaigns)}
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <Megaphone size={24} />
            </div>
            <div>
              <strong>Voiceup Global</strong>
              <span>{t("campaignAdmin.shell.tagline")}</span>
            </div>
          </div>
          <nav className="nav">
            <NavButton
              icon={<BarChart3 />}
              label={t("campaignAdmin.nav.dashboard")}
              tab="dashboard"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            {hasWorkspaceFeature("command_center") && (
              <NavButton
                icon={<Crosshair />}
                label={t("campaignAdmin.nav.commandCenter")}
                tab="command"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            <NavButton
              icon={<Megaphone />}
              label={t("campaignAdmin.nav.campaignAdmin")}
              tab="campaigns"
              activeTab={activeTab}
              onClick={requestTabChange}
            />
            {hasWorkspaceFeature("public_signing") && (
              <NavButton
                icon={<Globe2 />}
                label={t("campaignAdmin.nav.publicSigning")}
                tab="public"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            {hasWorkspaceFeature("movement_crm") && (
              <NavButton
                icon={<UsersRound />}
                label={t("campaignAdmin.nav.movementCrm")}
                tab="movement"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            {canUseGrowthEngine && (
              <NavButton
                icon={<TrendingUp />}
                label={t("campaignAdmin.nav.growthEngine")}
                tab="growth"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            {hasWorkspaceFeature("field_collection") && (
              <NavButton
                icon={<FileScan />}
                label={t("campaignAdmin.nav.fieldCollection")}
                tab="scans"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            {canUseReports && (
              <NavButton
                icon={<FileText />}
                label={t("campaignAdmin.nav.reports")}
                tab="reports"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            {hasWorkspaceFeature("communication_hub") && (
              <NavButton
                icon={<MessageCircle />}
                label={t("campaignAdmin.nav.engagement")}
                tab="engagement"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            {hasWorkspaceFeature("roles") && (
              <NavButton
                icon={<ShieldCheck />}
                label={t("campaignAdmin.nav.activity")}
                tab="activity"
                activeTab={activeTab}
                onClick={requestTabChange}
              />
            )}
            {!isCampaignAdminRoute && canAccessPlatformAdmin && (
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
            <span className="eyebrow">{t("campaignAdmin.shell.currentPlan")}</span>
            <strong>{organization.plan}</strong>
            <small>{organization.monthlySignatureLimit.toLocaleString()} {t("campaignAdmin.shell.signaturesPerMonth")}</small>
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
                  ? t("campaignAdmin.shell.administration")
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
                <button
                  className="campaign-switcher-trigger"
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={campaignSelectorOpen}
                  onClick={() => setCampaignSelectorOpen(true)}
                >
                  <span>{campaignFormMode === "create" ? "New draft" : activeCampaign ? getCampaignSelectorStatus(activeCampaign) : "Campaign Manager"}</span>
                  <strong>
                    {campaignFormMode === "create"
                      ? campaignDraft?.title || "New unsaved campaign"
                      : activeCampaign?.title || "No campaign yet"}
                  </strong>
                  <small>
                    {campaignFormMode === "create"
                      ? "Will save as a separate campaign"
                      : activeCampaign?.slug
                        ? `/${activeCampaign.slug}`
                        : "Search or create a campaign"}
                  </small>
                </button>
              )}
            </div>
            {isCampaignAdminRoute ? (
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={requestCreateCampaign}
                >
                  <Plus size={18} /> {t("campaignAdmin.actions.newCampaign")}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onLogoutCampaignAdmin}
                >
                  {t("campaignAdmin.actions.logout")}
                </button>
              </div>
            ) : (
              <div className="button-row">
                {canShowWorkspaceCreateActions &&
                  (campaignCreationLocked ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={requestUpgradePlan}
                    >
                      <WalletCards size={18} /> Upgrade Plan
                    </button>
                  ) : (
                    <>
                      {canUseAiCopilot && (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={requestAiCampaignCreation}
                        >
                          <Sparkles size={18} /> Create with AI
                        </button>
                      )}
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={requestCreateCampaign}
                      >
                        <Plus size={18} /> New campaign
                      </button>
                    </>
                  ))}
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
              onOpenSubscription={requestUpgradePlan}
              onOpenAiCopilot={requestAiCampaignCreation}
              onOpenCampaignAdmin={() => requestTabChange("campaigns")}
              onOpenPublicCampaign={() => requestTabChange("public")}
              onOpenReports={() => requestTabChange("reports")}
              createCampaignBlockReason={campaignCreationBlockReason}
              canUseAiCopilot={canUseAiCopilot}
              onUpgradePlan={requestUpgradePlan}
            />
          )}

          {activeTab === "command" && hasWorkspaceFeature("command_center") && (
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
                canAccessPlatformAdmin={canAccessPlatformAdmin}
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
              onCloneCampaign={onCloneCampaign}
              onArchiveCampaign={onArchiveCampaign}
              onOpenAiCopilot={requestAiCampaignCreation}
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
            hasWorkspaceFeature("public_signing") &&
            (activeCampaign ? (
              <PublicCampaignPage
                campaign={activeCampaign}
                organization={organization}
                metrics={metrics}
                authority={authorityMatch?.authority}
                authorities={authorities}
                campaignSigners={campaignSigners}
                publicForm={publicForm}
                setPublicForm={setPublicForm}
                publicMessage={publicMessage}
                lastSignedSigner={lastSignedSigner}
                growthSnapshot={growthSnapshot}
                growthPortal={growthPortal}
                otpInput={otpInput}
                setOtpInput={setOtpInput}
                otpMessage={otpMessage}
                onSendOtp={onSendOtp}
                onVerifyOtp={onVerifyOtp}
                onGrowthShare={onGrowthShare}
                locationOverrides={locationOverrides}
                locationDeletions={locationDeletions}
                onSubmit={onSubmitPublicSignature}
              />
            ) : (
              <div className="empty-state compact-empty">
                <span className="eyebrow">{t("campaignAdmin.empty.noData")}</span>
                <h2>{t("campaignAdmin.empty.noPublicCampaign")}</h2>
                <p>
                  Create and publish a campaign before collecting signatures from the public page.
                </p>
              </div>
            ))}

          {activeTab === "movement" && hasWorkspaceFeature("movement_crm") && (
            <Suspense fallback={<ModuleSkeleton label="Loading Movement CRM" />}>
              <MovementCrmTab
                campaigns={campaigns}
                activeCampaign={activeCampaign}
                signers={signers}
                campaignSigners={campaignSigners}
                scanItems={scanItems}
                authorities={authorities}
              />
            </Suspense>
          )}

          {activeTab === "growth" && canUseGrowthEngine && (
            <Suspense fallback={<ModuleSkeleton label="Loading Growth Engine" />}>
              <GrowthDashboardTab
                campaigns={campaigns}
                activeCampaign={activeCampaign}
                organization={organization}
                signers={signers}
                campaignSigners={campaignSigners}
                growthRuntime={growthRuntime}
                onGrowthRuntimeChange={setGrowthRuntime}
              />
            </Suspense>
          )}

          {activeTab === "scans" && hasWorkspaceFeature("field_collection") && (
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
              />
            </Suspense>
          )}

          {activeTab === "reports" && canUseReports && (
            <Suspense fallback={<ModuleSkeleton label="Loading Reports" />}>
              <ReportsTab
                activeCampaign={activeCampaign}
                campaigns={campaigns}
                organization={organization}
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
              />
            </Suspense>
          )}

          {activeTab === "engagement" && hasWorkspaceFeature("communication_hub") && (
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
              />
            </Suspense>
          )}

          {activeTab === "activity" && hasWorkspaceFeature("roles") && <ActivityTab auditLogs={auditLogs} />}

          {activeTab === "saas" && canAccessPlatformAdmin && (
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

          {activeTab === "ideas" && canAccessPlatformAdmin && <IdeasTab />}
        </motion.main>
      </div>
      {aiCopilotOpen && (
        <Suspense fallback={<div className="empty-state compact-empty">{t("campaignAdmin.common.loadingAi")}</div>}>
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
