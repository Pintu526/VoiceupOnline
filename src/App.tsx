import { FormEvent, useEffect, useMemo, useState } from "react";
import * as Toast from "@radix-ui/react-toast";
import {
  initialAuthorities,
  initialCampaigns,
  initialCommercialPackages,
  initialIntegrationSettings,
  initialOrganization,
  initialSigners
} from "./data";
import {
  clearCustomerSessionToken,
  createTrialWorkspace,
  debugSupabaseAuthBeforeVerification,
  debugSupabaseSessionTiming,
  getAuthContext,
  getCurrentAuthUser,
  getCurrentWorkspaceId,
  getLatestSignInResult,
  isBackendConfigured,
  isSupabaseAuthAvailable,
  isSupabaseStorageAvailable,
  loadPublicCampaign,
  loadRemoteState,
  saveRemoteState,
  signInWithSupabase,
  signOutSupabase,
  submitPublicSignatureSecure,
  uploadFileToStorage,
  uploadPrivateFileToStorage,
  createSignedStorageUrl,
  verifySecureFieldUploadAccess
} from "./backend";
import type { PublicCampaignPayload } from "./backend";
import {
  createId,
  createScanReviewItem,
  detectDuplicate,
  getCampaignMetrics,
  getCampaignSigners,
  groupSignersByLocation,
  groupSignersByDay,
  groupSignersByWeek,
  makePublicSigner,
  parseSignerFromText
} from "./lib";
import { planScanApprovals, type ScanApprovalCounts } from "./scanApproval";
import {
  createConfirmationQueueItems,
  getPaperSupporterConfirmationStatus
} from "./confirmationQueue";
import { buildPrivateScanStoragePath, validateScanImageFile } from "./mobileScanCapture";
import {
  evaluateSecureFieldUploadAccess,
  SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE,
  shouldSignOutCampaignAdminSupabaseSession,
  type SecureFieldUploadAccess
} from "./secureFieldUploadAuth";
import {
  addLocationOverride,
  clearLocationDeletion,
  emptyLocationDeletions,
  mergeLocationOverrides,
  removeLocationOption,
  type LocationDeletionLevel,
  type LocationDeletions,
  type LocationOverrides,
  type LocationWithPin
} from "./geography";
import type {
  AuthorityRule,
  AuditLogEntry,
  BillingPlan,
  Campaign,
  CommercialPackage,
  ConfirmationQueueItem,
  IntegrationSettings,
  Organization,
  ScanCaptureMetadata,
  ScanReviewItem,
  Signer
} from "./types";

// Refactored imports
import { usePersistentState } from "./hooks/usePersistentState";
import {
  blankAdminLogin,
  blankAppLogin,
  blankScanTemplate,
  blankSigner,
  emptyMetrics,
  storagePrefix
} from "./constants";
import {
  getCampaignAdminSlug,
  getIsAppRoute,
  getIsLandingPageRoute,
  getIsStartRoute,
  getIsSaasAdminRoute,
  getLegalPage,
  getPublicCampaignSlug,
  getSupporterPortalCode
} from "./utils/routing";
import { updateSeoMetadata } from "./utils/seo";
import {
  clearCampaignAdminSupabaseSession,
  clearPlatformAdminSession,
  createAdminPasscode,
  getCampaignAdminEmail,
  getCampaignAdminPasscode,
  getCurrentActorEmail,
  hasConfiguredPlatformAdminFallback,
  hasRestoredPlatformAdminSession,
  matchesConfiguredPlatformAdminCredentials,
  readAuthenticatedAdminSlugs,
  readCampaignAdminSupabaseSession,
  writeCampaignAdminSupabaseSession,
  writePlatformAdminSession,
  writeAuthenticatedAdminSlugs
} from "./utils/auth";
import { fileToDataUrl } from "./utils/files";
import { parseCsv, getCsvColumns, getCsvValue } from "./utils/csv";
import {
  getAppealAuthority,
  getAuthorityDepartmentLabel,
  getAuthorityPositionLabel,
  getSignerSelectedAuthority,
  normalizeAuthorityLevel
} from "./utils/authority";
import {
  getCreateCampaignBlockReason,
  getDefaultMessageLimit,
  getEffectiveScanLimit,
  getEffectiveSignatureLimit,
  getMonthlySignerCount,
  getMonthlyScanCount,
  getPublishCampaignBlockReason,
  getSigningBlockReason,
  getSubscriptionBlockReason,
  getSubscriptionPlan,
  isFeatureIncludedInPlan
} from "./utils/subscription";
import {
  applyLocationGovernanceToCampaign,
  applySignerLocationRestriction,
  createRemoteState,
  getCampaignAdminUrl,
  getCampaignGoalValue,
  getCampaignPublicUrl,
  isWithinLocationRestriction,
  getTomorrowDate,
  startOfToday,
  renderCampaignMessage,
  signerFieldLabel
} from "./utils/campaign";
import {
  createReferralCode,
  findReferrer,
  getSupporterReferralCode,
  normalizeReferralCode
} from "./utils/referrals";
import { GROWTH_FEATURE_FLAGS } from "./growth/constants";
import {
  appendGrowthLifecycleEventIntent,
  applyGrowthLifecycleEvent,
  createEmptyGrowthRuntimeState,
  getSupporterGrowthPortal,
  getSupporterGrowthSnapshot,
  type GrowthRuntimeState,
  type GrowthShareContext
} from "./growth/lifecycle";
import { GrowthEventPriority, GrowthEventType } from "./growth/events";
import {
  resolveSupporterGrowthPortal,
  SupporterGrowthPortalLoading,
  SupporterGrowthPortalNotFound,
  SupporterGrowthPortalPage
} from "./growth/supporter";
import { applyRewardRuntimeAction, type RewardRuntimeAction } from "./growth/rewards/rewardRuntimeService";

// Pages
import { MarketingHomePage } from "./pages/MarketingHomePage";
import type {
  OnboardingCompletionPayload,
  OnboardingCompletionResult
} from "./pages/OnboardingWizard";
import { LegalPage } from "./pages/LegalPage";
import { SaasAppLoginPage } from "./pages/SaasAppLoginPage";
import {
  PublicCampaignPage,
  PublicCampaignNotFound,
  PublicCampaignLoading
} from "./pages/PublicCampaignPage";
import {
  CampaignAdminLoginPage,
  CampaignAdminNotFound
} from "./pages/CampaignAdminLoginPage";

// Layout
import { AppShell } from "./layouts/AppShell";

// ─── Route detection (computed once, outside component) ──────────────────────
const publicCampaignSlug = getPublicCampaignSlug();
const supporterPortalCode = getSupporterPortalCode();
const adminCampaignSlug = getCampaignAdminSlug();
const isAppRoute = getIsAppRoute();
const isSaasAdminRoute = getIsSaasAdminRoute();
const legalPage = getLegalPage();
const isLandingPageRoute = getIsLandingPageRoute();
const isStartRoute = getIsStartRoute();
const isPublicCampaignRoute = Boolean(publicCampaignSlug);
const isSupporterPortalRoute = Boolean(supporterPortalCode);
const isCampaignAdminRoute = Boolean(adminCampaignSlug);

function slugifyOnboardingValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function createUniqueOnboardingSlug(payload: OnboardingCompletionPayload, campaigns: Campaign[]): string {
  const base =
    slugifyOnboardingValue(payload.campaignName) ||
    slugifyOnboardingValue(payload.campaignGoal) ||
    "voice-campaign";
  const existingSlugs = new Set(campaigns.map((campaign) => campaign.slug));
  let slug = base;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function createUniqueCampaignSlug(slugValue: string, campaigns: Campaign[]): string {
  const base = slugifyOnboardingValue(slugValue) || `campaign-${Date.now()}`;
  const existingSlugs = new Set(campaigns.map((campaign) => campaign.slug));
  let slug = base;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function prepareUniqueCampaignCommit(
  campaign: Campaign,
  campaigns: Campaign[],
  organization: Organization
): Campaign {
  const existingIds = new Set(campaigns.map((existingCampaign) => existingCampaign.id));
  const id = existingIds.has(campaign.id) ? createId("cmp") : campaign.id;
  const slug = createUniqueCampaignSlug(campaign.slug, campaigns);
  return {
    ...campaign,
    id,
    slug,
    shareUrl: getCampaignPublicUrl(organization, { slug }),
    adminUrl: getCampaignAdminUrl(organization, { slug })
  };
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildOnboardingTitle(payload: OnboardingCompletionPayload): string {
  const name = payload.campaignName.trim();
  return name ? toTitleCase(name) : "New Voiceup Campaign";
}

function inferOnboardingGoal(goalText: string): number {
  const numberMatch = goalText.replace(/,/g, "").match(/\d{2,}/);
  if (!numberMatch) return 100;
  const parsed = Number(numberMatch[0]);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 25), 1000000);
}

function inferOnboardingCategory(text: string): Campaign["category"] {
  const normalized = text.toLowerCase();
  if (/cow|forest|tree|river|water|pollution|climate|animal|environment/.test(normalized)) return "Environment";
  if (/school|student|college|education|teacher/.test(normalized)) return "Education";
  if (/blood|health|hospital|doctor|medicine|clinic/.test(normalized)) return "Health";
  if (/road|bus|train|traffic|transport|metro/.test(normalized)) return "Transport";
  if (/house|housing|rent|slum|apartment/.test(normalized)) return "Housing";
  return "Civic";
}

function buildOnboardingDescription(payload: OnboardingCompletionPayload): string {
  const goal = payload.campaignGoal.trim();
  const business = payload.businessName.trim();
  const country = payload.country.trim();
  return `${business} is launching a public campaign in ${country} to ${goal.charAt(0).toLowerCase()}${goal.slice(1)} Add your voice and help build visible support.`;
}

function buildOnboardingAppeal(payload: OnboardingCompletionPayload, campaignTitle: string): string {
  return `I support "${campaignTitle}" and request the relevant authority, community leaders, and stakeholders to take timely action. ${payload.campaignGoal.trim()}`;
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function describeSupabaseAuthError(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("invalid login credentials") || normalized.includes("invalid credentials")) {
    return "Wrong email or password.";
  }
  if (normalized.includes("user not found") || normalized.includes("email not found")) {
    return "Unknown user.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Email address is not confirmed.";
  }
  if (normalized.includes("network") || normalized.includes("fetch") || normalized.includes("failed to fetch")) {
    return "Supabase is unavailable or unreachable.";
  }
  return errorMessage;
}

type StartupMode = "pending" | "local-mvp" | "saas-workspace";

function App() {
  // ─── Persistent state ────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = usePersistentState<Campaign[]>(
    `${storagePrefix}-campaigns`,
    initialCampaigns
  );
  const [signers, setSigners] = usePersistentState<Signer[]>(
    `${storagePrefix}-signers`,
    initialSigners
  );
  const [authorities, setAuthorities] = usePersistentState<AuthorityRule[]>(
    `${storagePrefix}-authorities`,
    initialAuthorities
  );
  const [organization, setOrganization] = usePersistentState<Organization>(
    `${storagePrefix}-organization`,
    initialOrganization
  );
  const [scanItems, setScanItems] = usePersistentState<ScanReviewItem[]>(
    `${storagePrefix}-scan-items`,
    []
  );
  const [confirmationQueue, setConfirmationQueue] = usePersistentState<ConfirmationQueueItem[]>(
    `${storagePrefix}-confirmation-queue`,
    []
  );
  const [auditLogs, setAuditLogs] = usePersistentState<AuditLogEntry[]>(
    `${storagePrefix}-audit-logs`,
    []
  );
  const [growthRuntime, setGrowthRuntime] = usePersistentState<GrowthRuntimeState>(
    `${storagePrefix}-growth-runtime`,
    createEmptyGrowthRuntimeState()
  );
  const [integrations, setIntegrations] = usePersistentState<IntegrationSettings>(
    `${storagePrefix}-integrations`,
    initialIntegrationSettings
  );
  const [commercialPackages, setCommercialPackages] = usePersistentState<CommercialPackage[]>(
    `${storagePrefix}-commercial-packages`,
    initialCommercialPackages
  );
  const [locationOverrides, setLocationOverrides] = usePersistentState<LocationOverrides>(
    `${storagePrefix}-location-overrides`,
    {}
  );
  const [locationDeletions, setLocationDeletions] = usePersistentState<LocationDeletions>(
    `${storagePrefix}-location-deletions`,
    emptyLocationDeletions
  );

  // ─── UI state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "command" | "campaigns" | "public" | "movement" | "growth" | "scans" | "reports" | "engagement" | "activity" | "saas" | "ideas"
  >("dashboard");
  const [theme, setTheme] = usePersistentState<"light" | "dark">(`${storagePrefix}-theme`, "light");
  const [commandOpen, setCommandOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [toast, setToast] = useState({ open: false, title: "", description: "" });
  const [activeCampaignId, setActiveCampaignId] = useState(initialCampaigns[0]?.id ?? "");
  const [campaignDraft, setCampaignDraft] = useState<Campaign | null>(campaigns[0] ?? null);
  const [campaignFormMode, setCampaignFormMode] = useState<"create" | "edit">("edit");
  const [publicForm, setPublicForm] = useState(blankSigner);
  const [publicMessage, setPublicMessage] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [lastSignedSigner, setLastSignedSigner] = useState<Signer | null>(null);
  const [publicCampaignPayload, setPublicCampaignPayload] = useState<PublicCampaignPayload | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(isStartRoute);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState("");
  const [locationCsvFile, setLocationCsvFile] = useState<File | null>(null);
  const [authorityCsvFile, setAuthorityCsvFile] = useState<File | null>(null);
  const [csvUploadMessage, setCsvUploadMessage] = useState("");
  const [scanText, setScanText] = useState(blankScanTemplate);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [backendLoading, setBackendLoading] = useState(isBackendConfigured);
  const [backendMessage, setBackendMessage] = useState(
    isBackendConfigured
      ? "Connecting to shared campaign database..."
      : "Local preview mode: configure Supabase for public links across devices."
  );
  const [remoteStateLoaded, setRemoteStateLoaded] = useState(!isBackendConfigured);
  const [startupMode, setStartupMode] = useState<StartupMode>(
    isBackendConfigured ? "pending" : "local-mvp"
  );
  const [adminLogin, setAdminLogin] = useState(blankAdminLogin);
  const [adminLoginMessage, setAdminLoginMessage] = useState("");
  const [appLogin, setAppLogin] = useState(blankAppLogin);
  const [appLoginMessage, setAppLoginMessage] = useState("");
  const [authContextLoading, setAuthContextLoading] = useState(isBackendConfigured);
  const [isPlatformAdminAuthenticated, setIsPlatformAdminAuthenticated] = useState(false);
  const [isCustomerWorkspaceAuthenticated, setIsCustomerWorkspaceAuthenticated] = useState(false);
  const [saasSection, setSaasSection] = useState<
    "organization" | "usage" | "packages" | "integrations" | "plans"
  >("organization");
  const [authenticatedAdminSlugs, setAuthenticatedAdminSlugs] = useState<
    Record<string, boolean>
  >(() => readAuthenticatedAdminSlugs());
  const [secureFieldUploadAccess, setSecureFieldUploadAccess] = useState<SecureFieldUploadAccess>(
    () => evaluateSecureFieldUploadAccess({
      supabaseConfigured: isBackendConfigured,
      storageProvider: initialIntegrationSettings.storageProvider,
      currentWorkspaceId: getCurrentWorkspaceId()
    })
  );
  const [campaignAdminSupabaseSessionOwned, setCampaignAdminSupabaseSessionOwned] = useState(false);

  // ─── Derived / memoised ──────────────────────────────────────────────────
  const activeCampaign = useMemo(() => {
    if (publicCampaignSlug) {
      return publicCampaignPayload?.campaign.slug === publicCampaignSlug
        ? publicCampaignPayload.campaign
        : campaigns.find((c) => c.slug === publicCampaignSlug);
    }
    if (adminCampaignSlug) {
      return campaigns.find((c) => c.slug === adminCampaignSlug);
    }
    if (campaignFormMode === "create" && campaignDraft) {
      return campaignDraft;
    }
    return campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0];
  }, [activeCampaignId, campaignDraft, campaignFormMode, campaigns, publicCampaignPayload]);
  const secureFieldUploadAvailable =
    secureFieldUploadAccess.available &&
    isSupabaseStorageAvailable &&
    integrations.storageProvider === "Supabase Storage";
  const campaignSigners = useMemo(
    () => {
      if (!activeCampaign) return [];
      if (isPublicCampaignRoute) {
        return lastSignedSigner?.campaignId === activeCampaign.id ? [lastSignedSigner] : [];
      }
      return getCampaignSigners(activeCampaign.id, signers);
    },
    [activeCampaign, lastSignedSigner, signers]
  );
  const lastSignedGrowthSnapshot = useMemo(
    () =>
      lastSignedSigner
        ? getSupporterGrowthSnapshot(growthRuntime, lastSignedSigner.campaignId, lastSignedSigner.id)
        : undefined,
    [growthRuntime, lastSignedSigner]
  );
  const lastSignedGrowthPortal = useMemo(
    () => (lastSignedSigner ? getSupporterGrowthPortal(growthRuntime, lastSignedSigner.id) : undefined),
    [growthRuntime, lastSignedSigner]
  );
  const supporterPortalResult = useMemo(
    () =>
      supporterPortalCode
        ? resolveSupporterGrowthPortal({
            supporterCode: supporterPortalCode,
            campaigns,
            signers,
            organization,
            runtime: growthRuntime,
            baseUrl: typeof window === "undefined" ? "https://voiceup.live" : window.location.origin
          })
        : undefined,
    [campaigns, growthRuntime, organization, signers, supporterPortalCode]
  );

  function handleSupporterRewardAction(action: RewardRuntimeAction) {
    setGrowthRuntime((current) => {
      const campaign = campaigns.find((item) => item.id === action.campaignId);
      if (!campaign) return current;
      return applyRewardRuntimeAction({ runtime: current, campaign, action }).runtime;
    });
  }
  const canAccessPlatformAdmin = isPlatformAdminAuthenticated;
  const canAccessCustomerWorkspace = isCustomerWorkspaceAuthenticated || isPlatformAdminAuthenticated;
  const campaignCreationBlockReason = getCreateCampaignBlockReason(
    organization,
    campaigns,
    isBackendConfigured
  );
  const metrics = useMemo(
    () =>
      isPublicCampaignRoute && publicCampaignPayload?.metrics
        ? publicCampaignPayload.metrics
        : activeCampaign
          ? getCampaignMetrics(activeCampaign, signers)
          : emptyMetrics,
    [activeCampaign, publicCampaignPayload, signers]
  );
  const authorityMatch = useMemo(
    () =>
      activeCampaign
        ? { authority: getAppealAuthority(activeCampaign, authorities), score: 100 }
        : undefined,
    [activeCampaign, authorities]
  );
  const dailyTotals = useMemo(() => groupSignersByDay(campaignSigners), [campaignSigners]);
  const weeklyTotals = useMemo(() => groupSignersByWeek(campaignSigners), [campaignSigners]);
  const stateTotals = useMemo(
    () => groupSignersByLocation(campaignSigners, "state"),
    [campaignSigners]
  );
  const districtTotals = useMemo(
    () => groupSignersByLocation(campaignSigners, "district"),
    [campaignSigners]
  );
  const blockTotals = useMemo(
    () => groupSignersByLocation(campaignSigners, "block"),
    [campaignSigners]
  );
  const panchayatTotals = useMemo(
    () => groupSignersByLocation(campaignSigners, "panchayat"),
    [campaignSigners]
  );

  const commandItems = useMemo(() => {
    const enabledFeatureKeys = new Set(organization.enabledFeatureKeys ?? []);
    const hasFeature = (featureKey: string) =>
      canAccessPlatformAdmin ||
      isFeatureIncludedInPlan(organization.plan, featureKey) ||
      enabledFeatureKeys.has(featureKey);
    const canUseGrowthEngine =
      hasFeature(GROWTH_FEATURE_FLAGS.growthEngine) ||
      enabledFeatureKeys.has(GROWTH_FEATURE_FLAGS.legacyMovementCrm);
    const hasReports = hasFeature("basic_reports") || hasFeature("advanced_reports");
    const campaignAdminItems = [
      { label: "Dashboard", detail: "Open campaign overview", action: () => setActiveTab("dashboard") },
      { label: "Campaign admin", detail: "Edit campaign settings", action: () => setActiveTab("campaigns") },
      ...(hasFeature("public_signing")
        ? [{ label: "Public signing", detail: "Preview signup page", action: () => setActiveTab("public" as const) }]
        : []),
      ...(hasReports
        ? [{ label: "Reports", detail: "Open analytics and exports", action: () => setActiveTab("reports" as const) }]
        : []),
      ...(hasFeature("command_center")
        ? [{ label: "Command Center", detail: "Open movement operations", action: () => setActiveTab("command" as const) }]
        : []),
      ...(hasFeature("movement_crm")
        ? [{ label: "Movement CRM", detail: "Open supporter and volunteer graph", action: () => setActiveTab("movement" as const) }]
        : []),
      ...(canUseGrowthEngine
        ? [{ label: "Growth Engine", detail: "Open campaign growth dashboard", action: () => setActiveTab("growth" as const) }]
        : []),
      ...(hasFeature("field_collection")
        ? [{ label: "Field Collection", detail: "Open scan and field collection", action: () => setActiveTab("scans" as const) }]
        : []),
      ...(hasFeature("communication_hub")
        ? [{ label: "Engagement", detail: "Message participants", action: () => setActiveTab("engagement" as const) }]
        : []),
      ...(hasFeature("roles")
        ? [{ label: "Activity", detail: "Review admin activity", action: () => setActiveTab("activity" as const) }]
        : [])
    ];
    if (isCampaignAdminRoute) return campaignAdminItems;
    return [
      ...campaignAdminItems,
      ...(canAccessPlatformAdmin
        ? [{ label: "SaaS admin", detail: "Subscription and integrations", action: () => setActiveTab("saas" as const) }]
        : []),
      ...(campaignCreationBlockReason
        ? [
            {
              label: "Upgrade Plan",
              detail: campaignCreationBlockReason,
              action: () => {
                if (canAccessPlatformAdmin) {
                  setActiveTab("saas");
                } else {
                  setBackendMessage(campaignCreationBlockReason);
                }
              }
            }
          ]
        : [{ label: "Create campaign", detail: "Start a new campaign", action: createCampaign }]),
      ...campaigns.map((campaign) => ({
        label: campaign.title,
        detail: `Open ${campaign.status} campaign`,
        action: () => {
          setCampaignFormMode("edit");
          setActiveCampaignId(campaign.id);
          setActiveTab("dashboard");
        }
      }))
    ];
  }, [
    campaignCreationBlockReason,
    campaigns,
    canAccessPlatformAdmin,
    isCampaignAdminRoute,
    organization.enabledFeatureKeys,
    organization.plan
  ]);

  const filteredCommandItems = commandItems.filter((item) =>
    `${item.label} ${item.detail}`.toLowerCase().includes(globalSearch.toLowerCase())
  );

  // ─── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!isBackendConfigured) {
      const restored = hasRestoredPlatformAdminSession();
      setIsPlatformAdminAuthenticated(restored);
      setStartupMode("local-mvp");
      setAuthContextLoading(false);
      return;
    }
    let isCancelled = false;

    async function validateSession() {
      try {
        const context = await getAuthContext();
        if (isCancelled) return;
        const restored = hasRestoredPlatformAdminSession();
        setIsPlatformAdminAuthenticated(Boolean(context.platformAdmin || restored));
        setIsCustomerWorkspaceAuthenticated(Boolean(context.workspaceMember || context.customerWorkspace));
      } catch {
        if (isCancelled) return;
        const restored = hasRestoredPlatformAdminSession();
        setIsPlatformAdminAuthenticated(restored);
        setIsCustomerWorkspaceAuthenticated(false);
      } finally {
        if (!isCancelled) setAuthContextLoading(false);
      }
    }

    void validateSession();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const campaignAdminAccessActive = Boolean(
      activeCampaign && authenticatedAdminSlugs[activeCampaign.slug]
    );
    if (!activeCampaign || (isCampaignAdminRoute && !campaignAdminAccessActive)) {
      setSecureFieldUploadAccess(
        evaluateSecureFieldUploadAccess({
          supabaseConfigured: isBackendConfigured,
          storageProvider: integrations.storageProvider,
          currentWorkspaceId: getCurrentWorkspaceId()
        })
      );
      setCampaignAdminSupabaseSessionOwned(false);
      return;
    }

    const activeCampaignSlug = activeCampaign.slug;
    let isCancelled = false;
    async function refreshSecureFieldUploadAccess() {
      await debugSupabaseAuthBeforeVerification();
      const access = await verifySecureFieldUploadAccess(
        getCurrentWorkspaceId(),
        integrations.storageProvider
      );
      if (isCancelled) return;
      setSecureFieldUploadAccess(access);
      if (isCampaignAdminRoute) {
        const marker = readCampaignAdminSupabaseSession(activeCampaignSlug);
        setCampaignAdminSupabaseSessionOwned(
          shouldSignOutCampaignAdminSupabaseSession(marker, access)
        );
      } else {
        setCampaignAdminSupabaseSessionOwned(false);
      }
    }

    void refreshSecureFieldUploadAccess();
    return () => {
      isCancelled = true;
    };
  }, [activeCampaign, authenticatedAdminSlugs, integrations.storageProvider]);

  useEffect(() => {
    if (!isBackendConfigured) return;
    if (authContextLoading) return;

    const shouldUseSaasWorkspace =
      isCustomerWorkspaceAuthenticated || isPlatformAdminAuthenticated;
    const nextMode: StartupMode = shouldUseSaasWorkspace ? "saas-workspace" : "local-mvp";

    setStartupMode(nextMode);

    if (nextMode === "local-mvp" && !isPublicCampaignRoute) {
      setRemoteStateLoaded(true);
      setBackendLoading(false);
      setBackendMessage("Local MVP mode active. Sign in to load your SaaS workspace.");
    }

    if (import.meta.env.DEV) {
      console.info(
        `[startup] mode=${nextMode} auth=${shouldUseSaasWorkspace ? "authenticated-workspace" : "anonymous-local"}`
      );
    }
  }, [
    authContextLoading,
    isCustomerWorkspaceAuthenticated,
    isPlatformAdminAuthenticated,
    isPublicCampaignRoute
  ]);

  useEffect(() => {
    updateSeoMetadata(activeCampaign, legalPage, isPublicCampaignRoute);
  }, [activeCampaign]);

  useEffect(() => {
    if (campaignFormMode === "create") return;
    if (!campaigns.some((c) => c.id === activeCampaignId)) {
      setActiveCampaignId(campaigns[0]?.id ?? "");
    }
  }, [activeCampaignId, campaignFormMode, campaigns]);

  useEffect(() => {
    if (!isBackendConfigured) return;
    if (!isPublicCampaignRoute && startupMode !== "saas-workspace") return;
    let isCancelled = false;

    async function loadSharedState() {
      try {
        if (isPublicCampaignRoute && publicCampaignSlug) {
          const publicCampaign = await loadPublicCampaign(publicCampaignSlug);
          if (isCancelled) return;
          setPublicCampaignPayload(publicCampaign);
          if (publicCampaign) {
            setCampaigns([publicCampaign.campaign]);
            setSigners([]);
            setAuthorities(publicCampaign.authorities ?? []);
            if (publicCampaign.organization) setOrganization(publicCampaign.organization);
            setActiveCampaignId(publicCampaign.campaign.id);
            setCampaignFormMode("edit");
            setBackendMessage("Published campaign loaded.");
          } else {
            setCampaigns([]);
            setSigners([]);
            setBackendMessage("Campaign link was not found or is not published.");
          }
          return;
        }

        const remoteState = await loadRemoteState();
        if (isCancelled) return;

        if (remoteState) {
          const remoteCampaigns = remoteState.campaigns ?? [];
          setCampaigns(remoteState.campaigns ?? []);
          setSigners(remoteState.signers ?? []);
          setAuthorities(remoteState.authorities ?? initialAuthorities);
          setOrganization(remoteState.organization ?? initialOrganization);
          setScanItems(remoteState.scanItems ?? []);
          setActiveCampaignId(remoteState.activeCampaignId ?? remoteCampaigns[0]?.id ?? "");
          setLocationOverrides((current) =>
            mergeLocationOverrides(remoteState.locationOverrides ?? {}, current)
          );
          setLocationDeletions(remoteState.locationDeletions ?? emptyLocationDeletions);
          setAuditLogs(remoteState.auditLogs ?? []);
          setIntegrations(remoteState.integrations ?? initialIntegrationSettings);
          setCommercialPackages(remoteState.commercialPackages ?? initialCommercialPackages);
          setBackendMessage(`Shared campaign database connected (${remoteCampaigns.length} campaign(s)).`);
        } else {
          setCampaigns([]);
          setSigners([]);
          setAuthorities(initialAuthorities);
          setOrganization(initialOrganization);
          setScanItems([]);
          setActiveCampaignId("");
          setCampaignDraft(null);
          setCampaignFormMode("edit");
          setLocationOverrides({});
          setLocationDeletions(emptyLocationDeletions);
          setAuditLogs([]);
          setIntegrations(initialIntegrationSettings);
          setCommercialPackages(initialCommercialPackages);
          setBackendMessage("Shared campaign database connected (0 campaign(s)).");
        }
      } catch (error) {
        setBackendMessage(`Shared database error: ${error instanceof Error ? error.message : "Unable to connect"}`);
      } finally {
        if (!isCancelled) {
          setRemoteStateLoaded(true);
          setBackendLoading(false);
        }
      }
    }

    void loadSharedState();
    return () => { isCancelled = true; };
  }, [
    isPublicCampaignRoute,
    startupMode,
    setAuthorities, setAuditLogs, setCampaigns, setCommercialPackages,
    setIntegrations, setLocationDeletions, setLocationOverrides,
    setOrganization, setScanItems, setSigners
  ]);

  useEffect(() => {
    if (
      !isBackendConfigured ||
      startupMode !== "saas-workspace" ||
      !remoteStateLoaded ||
      isPublicCampaignRoute
    ) return;
    const timeoutId = window.setTimeout(() => {
      const state = createRemoteState({
        campaigns,
        activeCampaignId,
        signers,
        authorities,
        organization,
        scanItems,
        locationOverrides, locationDeletions, auditLogs, integrations, commercialPackages
      });
      void saveRemoteState(state)
        .then(() => setBackendMessage("Saved to shared campaign database."))
        .catch((error) =>
          setBackendMessage(`Shared database save error: ${error instanceof Error ? error.message : "Unable to save"}`)
        );
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [
    startupMode,
    activeCampaignId, authorities, auditLogs, campaigns, commercialPackages, integrations,
    locationDeletions, locationOverrides, organization, remoteStateLoaded, scanItems, signers
  ]);

  useEffect(() => {
    if (campaignFormMode === "edit") {
      setCampaignDraft(activeCampaign ?? null);
    }
  }, [activeCampaign, campaignFormMode]);

  useEffect(() => {
    const slugFromPath = window.location.pathname.match(/^\/c\/([^/]+)/)?.[1];
    if (!slugFromPath) return;
    const campaignFromPath = campaigns.find((c) => c.slug === slugFromPath);
    if (campaignFromPath) {
      setCampaignFormMode("edit");
      setActiveCampaignId(campaignFromPath.id);
      setActiveTab("public");
    }
  }, [campaigns]);

  useEffect(() => {
    if (!adminCampaignSlug) return;
    const campaignFromPath = campaigns.find((c) => c.slug === adminCampaignSlug);
    if (campaignFromPath) {
      setCampaignFormMode("edit");
      setActiveCampaignId(campaignFromPath.id);
      setActiveTab((current) =>
        current === "saas" || current === "ideas" ? "dashboard" : current
      );
    }
  }, [adminCampaignSlug, campaigns]);

  // ─── Business logic handlers ──────────────────────────────────────────────
  async function completeOnboardingCampaign(
    payload: OnboardingCompletionPayload
  ): Promise<OnboardingCompletionResult> {
    if (isBackendConfigured) {
      const response = await createTrialWorkspace(payload);
      setOrganization(response.state.organization);
      setCampaigns(response.state.campaigns ?? []);
      setSigners(response.state.signers ?? []);
      setAuthorities(response.state.authorities ?? initialAuthorities);
      setScanItems(response.state.scanItems ?? []);
      setLocationOverrides(response.state.locationOverrides ?? {});
      setLocationDeletions(response.state.locationDeletions ?? emptyLocationDeletions);
      setAuditLogs(response.state.auditLogs ?? []);
      setIntegrations(response.state.integrations ?? initialIntegrationSettings);
      setCommercialPackages(response.state.commercialPackages ?? initialCommercialPackages);
      setCampaignDraft(response.result.campaign);
      setCampaignFormMode("edit");
      setActiveCampaignId(response.result.campaign.id);
      setIsCustomerWorkspaceAuthenticated(true);
      setBackendMessage(
        response.result.restored
          ? `Restored trial workspace for ${response.result.campaign.title}.`
          : `Created trial campaign "${response.result.campaign.title}" in secure workspace.`
      );
      return response.result;
    }

    const restoredCampaign = payload.returningSession
      ? campaigns.find(
          (campaign) =>
            campaign.id === payload.returningSession?.campaignId ||
            campaign.slug === payload.returningSession?.slug
        )
      : undefined;

    if (restoredCampaign && payload.returningSession) {
      const returningSession = payload.returningSession;
      const restoredOrganization = organization.trialEndsAt
        ? organization
        : { ...organization, trialEndsAt: getTomorrowDate(), subscriptionStatus: "Trial" as const };
      const restoredWithUrls = {
        ...restoredCampaign,
        shareUrl: getCampaignPublicUrl(restoredOrganization, restoredCampaign),
        adminUrl: getCampaignAdminUrl(restoredOrganization, restoredCampaign)
      };
      setOrganization(restoredOrganization);
      setCampaigns((current) =>
        current.map((campaign) =>
          campaign.id === restoredWithUrls.id ? restoredWithUrls : campaign
        )
      );
      setCampaignDraft(restoredWithUrls);
      setCampaignFormMode("edit");
      setActiveCampaignId(restoredWithUrls.id);
      setIsCustomerWorkspaceAuthenticated(true);
      setBackendMessage(`Restored trial workspace for ${restoredWithUrls.title}.`);
      const restoreLog: AuditLogEntry = {
        id: createId("audit"),
        action: "auth.login",
        actor: payload.email || payload.mobileNumber,
        campaignId: restoredWithUrls.id,
        description: `Restored passwordless trial workspace for "${restoredWithUrls.title}"`,
        createdAt: new Date().toISOString(),
        metadata: {
          userId: returningSession.userId,
          tenantId: returningSession.tenantId,
          workspaceId: returningSession.workspaceId,
          source: payload.tracking.utmSource || "direct",
          deviceId: payload.tracking.deviceId
        }
      };
      setAuditLogs((current) => [restoreLog, ...current].slice(0, 500));

      return {
        campaign: restoredWithUrls,
        organization: restoredOrganization,
        userId: returningSession.userId,
        tenantId: returningSession.tenantId,
        workspaceId: returningSession.workspaceId,
        shareUrl: restoredWithUrls.shareUrl,
        shortUrl: restoredWithUrls.shareUrl,
        qrValue: restoredWithUrls.shareUrl,
        trialEndsAt: restoredOrganization.trialEndsAt,
        restored: true
      };
    }

    const blockReason = getCreateCampaignBlockReason(organization, campaigns, isBackendConfigured);
    if (blockReason) {
      throw new Error(blockReason);
    }

    const trialPlan = getSubscriptionPlan("Free Trial");
    const campaignTitle = buildOnboardingTitle(payload);
    const slug = createUniqueOnboardingSlug(payload, campaigns);
    const campaignId = createId("cmp");
    const userId = createId("guest");
    const tenantId = createId("tenant");
    const workspaceId = createId("workspace");
    const goal = inferOnboardingGoal(payload.campaignGoal);
    const campaignLimit =
      trialPlan.supporterLimit === "Unlimited" ? goal : Math.min(goal, trialPlan.supporterLimit);
    const nextOrganization: Organization = {
      ...organization,
      id: tenantId,
      name: payload.businessName.trim(),
      plan: trialPlan.name,
      subscriptionStatus: "Trial",
      trialEndsAt: getTomorrowDate(),
      monthlySignatureLimit: trialPlan.monthlySignatureLimit,
      monthlyScanLimit: trialPlan.monthlyScanLimit,
      monthlyMessageLimit: trialPlan.monthlyMessageLimit,
      bonusSignatureCredits: 0,
      bonusScanCredits: 0,
      bonusMessageCredits: 0,
      customBranding: false,
      ownerEmail: payload.email.trim(),
      billingEmail: payload.email.trim(),
      seats: 1,
      paymentReference: "",
      billingCadence: "monthly",
      campaignDurationDays: 30,
      supporterCountEstimate: campaignLimit,
      enabledFeatureKeys: trialPlan.featureKeys,
      prepaidWalletEnabled: false,
      prepaidWalletMode: "online_payment",
      signaturePriceInr: trialPlan.pricePerSignatureInr ?? 0,
      signatureWalletBalanceInr: 0,
      signaturePinPrefix: "VUP"
    };

    const campaignShell: Campaign = {
      id: campaignId,
      title: campaignTitle,
      slug,
      category: inferOnboardingCategory(`${payload.campaignName} ${payload.campaignGoal}`),
      description: buildOnboardingDescription(payload),
      appealContent: buildOnboardingAppeal(payload, campaignTitle),
      authorityTargetLevel: "country",
      authoritySelectionMode: "admin_enforced",
      selectedAuthorityId: "",
      geographyMode: "global",
      campaignScope: payload.country === "Other" ? "global" : "national",
      country: payload.country,
      donationEnabled: false,
      donationLockedBySaas: false,
      donationCaption: "Support this campaign with a voluntary contribution.",
      donationUpiId: "",
      donationQrImage: "",
      donationPaymentDetails: "",
      donationAllowOneTime: true,
      donationAllowRecurring: false,
      state: "",
      district: "",
      block: "",
      panchayat: "",
      location: payload.country,
      postalCode: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: addDaysIso(30),
      goal,
      status: "Published",
      consentText: "I consent to this organization storing my details and using them only for this campaign.",
      requiredFields: ["name", "phone"],
      requiredFieldsLockedBySaas: false,
      authorityLockedBySaas: false,
      publishingLockedBySaas: false,
      goalLockedBySaas: false,
      datesLockedBySaas: false,
      maxSignersAllowed: campaignLimit,
      maxScansAllowed: trialPlan.monthlyScanLimit,
      shareUrl: getCampaignPublicUrl(nextOrganization, { slug }),
      adminUrl: getCampaignAdminUrl(nextOrganization, { slug }),
      adminEmail: payload.email.trim(),
      adminPasscode: createAdminPasscode(),
      qrLabel: "VOICEUP-GLOBAL-TRIAL",
      heroImage: "",
      heroImagePosition: "center center",
      heroImageZoom: 120,
      campaignVideoUrl: "",
      socialShareText: `Add your voice to ${campaignTitle}.`,
      thankYouMessage: `Thank you for signing ${campaignTitle}. Share this campaign: {{url}}`,
      participantUpdateMessage:
        `{{campaign}} update: {{verified}} verified supporters have joined. Share this campaign: {{url}}`,
      signerLocationRestrictionLevel: "none"
    };
    const publishedCampaign = applyLocationGovernanceToCampaign(campaignShell, nextOrganization);
    const onboardingLogs: AuditLogEntry[] = [
      {
        id: createId("audit"),
        action: "campaign.created",
        actor: payload.email || payload.mobileNumber,
        campaignId: publishedCampaign.id,
        description: `Created public onboarding campaign "${publishedCampaign.title}"`,
        createdAt: new Date().toISOString(),
        metadata: {
          userId,
          tenantId,
          workspaceId,
          source: payload.tracking.utmSource || "direct",
          medium: payload.tracking.utmMedium,
          campaign: payload.tracking.utmCampaign,
          referralCode: payload.tracking.referralCode,
          deviceId: payload.tracking.deviceId,
          language: payload.language,
          country: payload.country
        }
      },
      {
        id: createId("audit"),
        action: "campaign.published",
        actor: payload.email || payload.mobileNumber,
        campaignId: publishedCampaign.id,
        description: `Published campaign from 60-second onboarding`,
        createdAt: new Date().toISOString(),
        metadata: {
          shareUrl: publishedCampaign.shareUrl,
          trialEndsAt: nextOrganization.trialEndsAt,
          smsWelcomePrepared: true,
          whatsappWelcomePrepared: true,
          emailWelcomePrepared: true
        }
      },
      {
        id: createId("audit"),
        action: "integration.updated",
        actor: "system",
        campaignId: publishedCampaign.id,
        description: "Queued welcome email, WhatsApp, SMS, trial explanation, premium education, and next steps",
        createdAt: new Date().toISOString(),
        metadata: {
          communicationSetupPrepared: true,
          analyticsEvents: payload.analyticsEvents.length,
          landingPath: payload.tracking.landingPath
        }
      }
    ];

    setOrganization(nextOrganization);
    setCampaigns((current) => [...current, publishedCampaign]);
    setCampaignDraft(publishedCampaign);
    setCampaignFormMode("edit");
    setActiveCampaignId(publishedCampaign.id);
    setIsCustomerWorkspaceAuthenticated(true);
    setAuditLogs((current) => [...onboardingLogs, ...current].slice(0, 500));
    setBackendMessage(
      isBackendConfigured
        ? `Created trial campaign "${publishedCampaign.title}". Syncing to shared database...`
        : `Created trial campaign "${publishedCampaign.title}" in local preview mode.`
    );

    return {
      campaign: publishedCampaign,
      organization: nextOrganization,
      userId,
      tenantId,
      workspaceId,
      shareUrl: publishedCampaign.shareUrl,
      shortUrl: publishedCampaign.shareUrl,
      qrValue: publishedCampaign.shareUrl,
      trialEndsAt: nextOrganization.trialEndsAt,
      restored: false
    };
  }

  function saveCampaign(event: FormEvent) {
    event.preventDefault();
    if (!campaignDraft) return;
    const draftWithSlugUrls = {
      ...campaignDraft,
      shareUrl: getCampaignPublicUrl(organization, campaignDraft),
      adminUrl: getCampaignAdminUrl(organization, campaignDraft)
    };
    const governedCampaignDraft = applyLocationGovernanceToCampaign(draftWithSlugUrls, organization);
    const isExistingCampaign = campaigns.some((campaign) => campaign.id === governedCampaignDraft.id);
    const isCreateCommit = campaignFormMode === "create" || !isExistingCampaign;
    const campaignToCommit = isCreateCommit
      ? prepareUniqueCampaignCommit(governedCampaignDraft, campaigns, organization)
      : governedCampaignDraft;
    if (isCreateCommit) {
      const blockReason = getCreateCampaignBlockReason(organization, campaigns, isBackendConfigured);
      if (blockReason) {
        throw new Error(blockReason);
      }
    }
    setCampaigns((current) => {
      if (isCreateCommit) {
        return [...current, campaignToCommit];
      }
      return current.map((c) => (c.id === campaignToCommit.id ? campaignToCommit : c));
    });
    setActiveCampaignId(campaignToCommit.id);
    setCampaignDraft(campaignToCommit);
    setCampaignFormMode("edit");
    addAuditLog(
      isCreateCommit ? "campaign.created" : "campaign.saved",
      `${isCreateCommit ? "Created" : "Saved"} campaign "${campaignToCommit.title}"`,
      campaignToCommit.id
    );
  }

  function createCampaign() {
    const slug = `new-campaign-${Date.now()}`;
    const campaign: Campaign = applyLocationGovernanceToCampaign({
      id: createId("cmp"),
      title: "New Public Campaign",
      slug,
      category: "Civic",
      description: "Describe the public issue, requested action, and why citizens should support it.",
      appealContent:
        "I support this appeal and request the selected authority to take appropriate action for the public cause described in this campaign.",
      authorityTargetLevel: "district",
      authoritySelectionMode: "admin_enforced",
      selectedAuthorityId: "",
      geographyMode: "global",
      campaignScope: "city",
      country: "",
      donationEnabled: false,
      donationLockedBySaas: false,
      donationCaption: "Support this campaign with a voluntary contribution.",
      donationUpiId: "",
      donationQrImage: "",
      donationPaymentDetails: "",
      donationAllowOneTime: true,
      donationAllowRecurring: false,
      state: "",
      district: "",
      block: "",
      panchayat: "",
      location: "City / District / Ward",
      postalCode: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      goal: 1000,
      status: "Draft",
      consentText:
        "I consent to this organization storing my details and using them only for this campaign submission.",
      requiredFields: ["name", "phone"],
      requiredFieldsLockedBySaas: false,
      authorityLockedBySaas: false,
      publishingLockedBySaas: false,
      goalLockedBySaas: false,
      datesLockedBySaas: false,
      maxSignersAllowed: 0,
      maxScansAllowed: 0,
      shareUrl: getCampaignPublicUrl(organization, { slug }),
      adminUrl: getCampaignAdminUrl(organization, { slug }),
      adminEmail: organization.ownerEmail || organization.billingEmail || "",
      adminPasscode: createAdminPasscode(),
      qrLabel: "VOICEUP-GLOBAL-CAMPAIGN",
      heroImage: "",
      heroImagePosition: "center center",
      heroImageZoom: 120,
      campaignVideoUrl: "",
      socialShareText: "Join this public campaign and add your voice.",
      thankYouMessage:
        "Thank you for signing {{campaign}}. Your voice has been recorded. Track campaign progress here: {{url}}",
      participantUpdateMessage:
        "{{campaign}} update: {{verified}} verified supporters have joined so far. Share this campaign: {{url}}",
      signerLocationRestrictionLevel: "none"
    }, organization);
    setActiveCampaignId("");
    setCampaignDraft(campaign);
    setCampaignFormMode("create");
    setActiveTab("campaigns");
  }

  function cloneCampaign() {
    if (!campaignDraft) return;
    const sourceSlug = campaignDraft.slug.trim() || `campaign-${Date.now()}`;
    const slug = `${sourceSlug}-copy-${Date.now()}`;
    const clonedCampaign: Campaign = applyLocationGovernanceToCampaign({
      ...campaignDraft,
      id: createId("cmp"),
      title: `Copy of ${campaignDraft.title || "Untitled campaign"}`,
      slug,
      status: "Draft",
      shareUrl: getCampaignPublicUrl(organization, { slug }),
      adminUrl: getCampaignAdminUrl(organization, { slug }),
      clonedFromCampaignId: campaignDraft.id,
      archivedAt: undefined
    }, organization);
    setCampaignDraft(clonedCampaign);
    setCampaignFormMode("create");
    setActiveTab("campaigns");
    addAuditLog("campaign.cloned", `Prepared clone draft from "${campaignDraft.title}"`, campaignDraft.id);
    showToast("Campaign cloned", "Review the cloned draft, then create it as a new campaign.");
  }

  function archiveCampaign() {
    if (!campaignDraft) return;
    const isExistingCampaign = campaigns.some((campaign) => campaign.id === campaignDraft.id);
    if (!isExistingCampaign || campaignFormMode === "create") {
      showToast("Archive unavailable", "Create or save this campaign before archiving it.");
      return;
    }
    const archivedCampaign = applyLocationGovernanceToCampaign({
      ...campaignDraft,
      status: "Closed" as const,
      archivedAt: new Date().toISOString(),
      shareUrl: getCampaignPublicUrl(organization, campaignDraft),
      adminUrl: getCampaignAdminUrl(organization, campaignDraft)
    }, organization);
    setCampaigns((current) =>
      current.map((campaign) => (campaign.id === archivedCampaign.id ? archivedCampaign : campaign))
    );
    setCampaignDraft(archivedCampaign);
    setCampaignFormMode("edit");
    setActiveCampaignId(archivedCampaign.id);
    addAuditLog("campaign.archived", `Archived campaign "${archivedCampaign.title}"`, archivedCampaign.id);
    showToast("Campaign archived", "The campaign was marked Closed and remains available in the workspace.");
  }

  function deleteCampaign() {
    if (!activeCampaign || campaignFormMode === "create") return;
    const deletedCampaignId = activeCampaign.id;
    const deletedCampaignTitle = activeCampaign.title || "Untitled campaign";
    const remainingCampaigns = campaigns.filter((campaign) => campaign.id !== deletedCampaignId);
    const nextActiveCampaign = remainingCampaigns[0] ?? null;

    setCampaigns(remainingCampaigns);
    setSigners((current) => current.filter((signer) => signer.campaignId !== deletedCampaignId));
    setScanItems((current) => current.filter((item) => item.campaignId !== deletedCampaignId));
    setActiveCampaignId(nextActiveCampaign?.id ?? "");
    setCampaignDraft(nextActiveCampaign);
    setCampaignFormMode("edit");
    setActiveTab("dashboard");
    showToast("Campaign deleted", `Deleted campaign "${deletedCampaignTitle}" from this workspace.`);
  }

  function publishCampaign() {
    if (!campaignDraft) return;
    if (campaignDraft.publishingLockedBySaas && isCampaignAdminRoute) {
      setBackendMessage("Publishing is locked for this campaign.");
      return;
    }
    const blockReason = getPublishCampaignBlockReason(campaignDraft, organization, campaigns);
    if (blockReason) {
      setBackendMessage(blockReason);
      if (canAccessPlatformAdmin) {
        setActiveTab("saas");
      }
      return;
    }
    if (organization.subscriptionStatus === "Trial" && !organization.trialEndsAt) {
      setOrganization({ ...organization, trialEndsAt: getTomorrowDate() });
    }
    const governedPublishedCampaign = applyLocationGovernanceToCampaign({
      ...campaignDraft,
      status: "Published" as const,
      shareUrl: getCampaignPublicUrl(organization, campaignDraft),
      adminUrl: getCampaignAdminUrl(organization, campaignDraft)
    }, organization);
    const isExistingCampaign = campaigns.some((campaign) => campaign.id === governedPublishedCampaign.id);
    const isCreateCommit = campaignFormMode === "create" || !isExistingCampaign;
    const publishedCampaign = isCreateCommit
      ? prepareUniqueCampaignCommit(governedPublishedCampaign, campaigns, organization)
      : governedPublishedCampaign;
    setCampaignDraft(publishedCampaign);
    setCampaigns((current) => {
      if (isCreateCommit) {
        return [...current, publishedCampaign];
      }
      return current.map((c) => (c.id === publishedCampaign.id ? publishedCampaign : c));
    });
    setActiveCampaignId(publishedCampaign.id);
    setCampaignFormMode("edit");
    addAuditLog("campaign.published", `Published campaign "${publishedCampaign.title}"`, publishedCampaign.id);
  }

  async function submitPublicSignature(event: FormEvent) {
    event.preventDefault();
    if (!activeCampaign) {
      setPublicMessage("Create and publish a campaign before collecting signatures.");
      return;
    }
    const signingBlockReason = getSigningBlockReason(activeCampaign, organization, signers);
    if (signingBlockReason) { setPublicMessage(signingBlockReason); return; }
    if (getMonthlySignerCount(signers) >= getEffectiveSignatureLimit(organization)) {
      setPublicMessage("This campaign owner has reached the available signature credits. Please ask them to upgrade or recharge.");
      return;
    }
    if (
      activeCampaign.maxSignersAllowed > 0 &&
      getCampaignSigners(activeCampaign.id, signers).length >= activeCampaign.maxSignersAllowed
    ) {
      setPublicMessage("This campaign has reached its signer limit.");
      return;
    }
    if (!publicForm.otpVerified) {
      setPublicMessage("Please verify your phone number with OTP before signing.");
      return;
    }
    const restrictedPublicForm = applySignerLocationRestriction(activeCampaign, publicForm, organization);
    if (!isWithinLocationRestriction(activeCampaign, restrictedPublicForm, organization)) {
      setPublicMessage("Your selected location is outside this campaign's restricted signing area.");
      return;
    }
    const requiredFields = activeCampaign.requiredFields ?? [];
    const missingRequiredField = requiredFields.find(
      (field) => !restrictedPublicForm[field]?.trim()
    );
    if (missingRequiredField) {
      setPublicMessage(`${signerFieldLabel(missingRequiredField)} is required to sign this campaign.`);
      return;
    }
    const signerAuthority = getSignerSelectedAuthority(
      activeCampaign,
      restrictedPublicForm.selectedAuthorityId,
      authorities
    );
    const referralInput = restrictedPublicForm.referredByPhoneOrCode?.trim() ?? "";
    const referrer = findReferrer(campaignSigners, activeCampaign.id, referralInput);
    const referredBy = referrer ? getSupporterReferralCode(referrer) : normalizeReferralCode(referralInput);
    const signerReferralCode = createReferralCode(
      activeCampaign.id,
      restrictedPublicForm.phone || restrictedPublicForm.email || restrictedPublicForm.name || `${Date.now()}`
    );
    if (isBackendConfigured) {
      try {
        const result = await submitPublicSignatureSecure(activeCampaign.slug, {
          ...restrictedPublicForm,
          selectedAuthorityId: signerAuthority.id,
          selectedAuthorityName: signerAuthority.name,
          referralCode: signerReferralCode,
          referredBy,
          referredByPhoneOrCode: referralInput,
          referralSource: referralInput ? restrictedPublicForm.referralSource ?? "manual" : undefined
        });
        setPublicForm(blankSigner);
        setOtpInput("");
        setOtpMessage("");
        setLastSignedSigner(result.signer);
        if (result.signer.status !== "duplicate") {
          recordGrowthLifecycle(
            result.signer.referredBy || result.signer.referredByPhoneOrCode ? "referral_signed" : "supporter_signed",
            result.signer,
            [result.signer, ...campaignSigners.filter((signer) => signer.id !== result.signer.id)]
          );
        }
        setPublicCampaignPayload((current) =>
          current?.campaign.id === activeCampaign.id
            ? { ...current, metrics: result.metrics }
            : current
        );
        setPublicMessage(result.message);
      } catch (error) {
        setPublicMessage(error instanceof Error ? error.message : "Signature submission failed. Please retry.");
      }
      return;
    }
    const signer = makePublicSigner(
      activeCampaign.id,
      {
        ...restrictedPublicForm,
        selectedAuthorityId: signerAuthority.id,
        selectedAuthorityName: signerAuthority.name,
        referralCode: signerReferralCode,
        referredBy,
        referredByPhoneOrCode: referralInput,
        referralSource: referralInput ? restrictedPublicForm.referralSource ?? "manual" : undefined,
        comment: `Accepted published appeal to ${signerAuthority.name}: ${activeCampaign.appealContent || activeCampaign.description}`
      },
      campaignSigners
    );
    const nextSigners = [signer, ...signers.filter((item) => item.id !== signer.id)];
    setSigners(nextSigners);
    if (signer.status !== "duplicate") {
      recordGrowthLifecycle(
        signer.referredBy || signer.referredByPhoneOrCode ? "referral_signed" : "supporter_signed",
        signer,
        nextSigners
      );
    }
    addAuditLog("campaign.signed", `${signer.name} signed "${activeCampaign.title}"`, activeCampaign.id);
    setPublicForm(blankSigner);
    setLastSignedSigner(signer);
    setPublicMessage(
      signer.status === "duplicate"
        ? "Thanks. This looks like a duplicate, so it was sent to review."
        : "Thank you. Your signature has been recorded."
    );
  }

  function sendOtp() {
    if (!publicForm.phone.trim()) { setOtpMessage("Enter phone number before requesting OTP."); return; }
    const nextOtp = String(Math.floor(100000 + Math.random() * 900000));
    setOtpCode(nextOtp);
    setPublicForm({ ...publicForm, otpVerified: false });
    setOtpMessage(
      `OTP : ${nextOtp}.`
    );
  }

  function verifyOtp() {
    if (!otpCode) { setOtpMessage("Generate OTP first."); return; }
    if (otpInput.trim() !== otpCode) { setOtpMessage("Invalid OTP."); return; }
    setPublicForm({ ...publicForm, otpVerified: true });
    setOtpMessage("Phone number verified.");
  }

  async function uploadScan(file: File, metadata?: ScanCaptureMetadata): Promise<boolean> {
    if (!activeCampaign) { setScanMessage("Create a campaign before uploading scanned signatures."); return false; }
    if (
      activeCampaign.maxScansAllowed > 0 &&
      scanItems.filter((item) => item.campaignId === activeCampaign.id).length >= activeCampaign.maxScansAllowed
    ) {
      setScanMessage("This campaign has reached its scan upload limit.");
      return false;
    }
    if (getMonthlyScanCount(scanItems) >= getEffectiveScanLimit(organization)) {
      setScanMessage("This organization has reached available scan credits. Upgrade or recharge the workspace plan.");
      return false;
    }
    const validationError = validateScanImageFile(file);
    if (validationError) {
      setScanMessage(
        validationError === "file_too_large"
          ? "The image exceeds the 12 MB secure-upload limit."
          : "Choose a supported image file."
      );
      return false;
    }
    if (!secureFieldUploadAvailable) {
      setScanMessage(secureFieldUploadAccess.message || SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE);
      return false;
    }

    const capturedAt = metadata?.capturedAt || new Date().toISOString();
    const sourceBatchId = metadata?.sourceBatchId.trim() || `batch-${capturedAt.slice(0, 10)}`;
    const baseItem = createScanReviewItem(activeCampaign.id, file.name, scanText);
    const privatePath = buildPrivateScanStoragePath(
      activeCampaign.id,
      sourceBatchId,
      baseItem.id,
      file.name
    );
    setIsScanning(true);
    setScanMessage(`Securely uploading ${file.name}. Handwriting may need manual correction.`);
    try {
      const uploaded = await uploadPrivateFileToStorage("campaign-private", privatePath, file);
      const commonItem = {
        ...baseItem,
        filePath: uploaded.path,
        sourceBatchId,
        collectorId: metadata?.collectorId.trim() || undefined,
        collectorName: metadata?.collectorName.trim() || undefined,
        capturedAt,
        paperConsentRecorded: metadata?.paperConsentRecorded ?? false,
        smsConsent: metadata?.smsConsent ?? false,
        whatsappConsent: metadata?.whatsappConsent ?? false,
        noOngoingCommunications: metadata?.noOngoingCommunications ?? false,
        consentPurpose: metadata?.consentPurpose.trim() || undefined,
        consentCapturedAt: metadata?.consentCapturedAt,
        consentCapturedBy: metadata?.consentCapturedBy?.trim() || undefined
      };
      try {
        const { recognize } = await import("tesseract.js");
        const result = await recognize(file, "eng");
        const extractedText = result.data.text.trim() || scanText;
        const item = {
          ...commonItem,
          extractedText,
          parsedSigner: parseSignerFromText(extractedText)
        };
        setScanItems((current) => [item, ...current]);
        setScanText(extractedText);
        setScanMessage("Private upload and OCR completed. Review this signer before approval.");
      } catch {
        setScanItems((current) => [commonItem, ...current]);
        setScanMessage("Private upload completed. OCR could not read the file, so the record remains ready for manual review.");
      }
      return true;
    } catch (error) {
      setScanMessage(
        `Secure upload failed. No scan record was created. ${error instanceof Error ? error.message : "Unable to upload file."}`
      );
      return false;
    } finally {
      setIsScanning(false);
    }
  }

  function createManualScanItem() {
    if (!activeCampaign) { setScanMessage("Create a campaign before adding scanned signatures."); return; }
    const item = createScanReviewItem(activeCampaign.id, "manual-scan-entry.txt", scanText);
    setScanItems((current) => [item, ...current]);
    setScanMessage("Manual scan review item created.");
  }

  function updateScanParsedSigner(
    scanId: string,
    field: keyof ScanReviewItem["parsedSigner"],
    value: string
  ) {
    setScanItems((current) =>
      current.map((item) =>
        item.id === scanId ? { ...item, parsedSigner: { ...item.parsedSigner, [field]: value } } : item
      )
    );
  }

  function approveScan(scans: ScanReviewItem | ScanReviewItem[]): ScanApprovalCounts {
    const requestedScans = Array.isArray(scans) ? scans : [scans];
    if (!activeCampaign) {
      return {
        approved: 0,
        skippedAlreadyApproved: 0,
        skippedDuplicate: 0,
        failed: requestedScans.length
      };
    }

    const campaignId = activeCampaign.id;
    const plan = planScanApprovals({
      campaignId,
      requestedScanItemIds: requestedScans.map((scan) => scan.id),
      scanItems,
      signers,
      createSigner: (scan, currentSigners) => {
        if (!scan.paperConsentRecorded) {
          throw new Error("Paper consent is required before creating a digital supporter record.");
        }
        const duplicate = detectDuplicate(scan.parsedSigner, currentSigners);
        const confirmationStatus = getPaperSupporterConfirmationStatus(scan, Boolean(duplicate));
        return {
          id: createId("sig"),
          campaignId,
          ...scan.parsedSigner,
          source: "scan",
          status: duplicate ? "duplicate" : "pending",
          signedAt: new Date().toISOString(),
          scanFileName: scan.fileName,
          scanFileUrl: scan.fileUrl,
          scanFilePath: scan.filePath,
          sourceScanItemId: scan.id,
          sourceBatchId: scan.sourceBatchId,
          collectorId: scan.collectorId,
          collectorName: scan.collectorName,
          capturedAt: scan.capturedAt || scan.createdAt,
          paperConsentRecorded: scan.paperConsentRecorded,
          smsConsent: scan.smsConsent ?? false,
          whatsappConsent: scan.whatsappConsent ?? false,
          noOngoingCommunications: scan.noOngoingCommunications ?? false,
          consentPurpose: scan.consentPurpose,
          consentCapturedAt: scan.consentCapturedAt,
          consentCapturedBy: scan.consentCapturedBy,
          confirmationStatus,
          reviewerNote: duplicate
            ? `Possible duplicate of ${duplicate.name}`
            : "Imported from scanned hard copy."
        };
      }
    });
    const approvedScanItemIds = new Set(plan.approvedScanItemIds);
    const projectedSigners = [...plan.newSigners, ...signers];

    setSigners((current) => {
      const linkedScanItemIds = new Set(
        current.map((signer) => signer.sourceScanItemId).filter((id): id is string => Boolean(id))
      );
      const additions = plan.newSigners.filter(
        (signer) => !signer.sourceScanItemId || !linkedScanItemIds.has(signer.sourceScanItemId)
      );
      return additions.length > 0 ? [...additions, ...current] : current;
    });
    setScanItems((current) =>
      current.map((item) =>
        approvedScanItemIds.has(item.id) && item.status === "Needs review"
          ? { ...item, status: "Approved" }
          : item
      )
    );
    setConfirmationQueue((current) => {
      let next = current;
      plan.newSigners.forEach((signer) => {
        if (signer.status === "duplicate") return;
        const additions = createConfirmationQueueItems({
          workspaceId: organization.id,
          campaign: activeCampaign,
          signer,
          currentQueue: next,
          createId
        });
        if (additions.length > 0) next = [...additions, ...next];
      });
      return next;
    });

    plan.newSigners.forEach((signer) => {
      if (signer.status !== "duplicate") {
        recordGrowthLifecycle("supporter_signed", signer, projectedSigners);
      }
      addAuditLog("scan.approved", `Approved scanned signer "${signer.name}"`, campaignId);
    });

    return plan.counts;
  }

  async function openPrivateScan(scan: ScanReviewItem): Promise<string> {
    if (!scan.filePath) throw new Error("This scan does not have private evidence attached.");
    if (!secureFieldUploadAvailable) {
      const error = new Error(
        secureFieldUploadAccess.message || SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE
      );
      setScanMessage(error.message);
      throw error;
    }
    try {
      return await createSignedStorageUrl("campaign-private", scan.filePath, 300);
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : "Unable to open private evidence.");
      throw error;
    }
  }

  function updateSignerStatus(signerId: string, status: Signer["status"]) {
    const previousSigner = signers.find((signer) => signer.id === signerId);
    const nextSigner = previousSigner ? { ...previousSigner, status } : undefined;
    const nextSigners = signers.map((s) => (s.id === signerId ? { ...s, status } : s));
    setSigners(nextSigners);
    if (nextSigner && status === "verified" && previousSigner?.status !== "verified") {
      recordGrowthLifecycle(
        nextSigner.referredBy || nextSigner.referredByPhoneOrCode ? "referral_verified" : "supporter_verified",
        nextSigner,
        nextSigners
      );
    }
    addAuditLog("signer.status_updated", `Updated signer status to ${status}`, activeCampaign?.id);
  }

  function addAuthorityRule() {
    if (!activeCampaign) { setActiveTab("campaigns"); return; }
    const rule: AuthorityRule = {
      id: createId("auth"),
      name: "New Authority",
      department: "Department name",
      position: getAuthorityPositionLabel(activeCampaign.authorityTargetLevel),
      level: activeCampaign.authorityTargetLevel,
      state: activeCampaign.state,
      district: activeCampaign.district,
      address: "",
      phone: "",
      category: activeCampaign.category,
      locationKeyword: activeCampaign.location.split(" ")[0] ?? "",
      postalPrefix: activeCampaign.postalCode.slice(0, 3),
      email: "authority@example.gov",
      submissionMethod: "Email",
      confidence: 70
    };
    setAuthorities((current) => [rule, ...current]);
  }

  async function uploadLocationCsv(file: File) {
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) { setCsvUploadMessage("Location CSV failed: no rows found."); return; }
      let nextOverrides = locationOverrides;
      let addedCount = 0;
      rows.forEach((row) => {
        const values: LocationWithPin = {
          country: getCsvValue(row, "country"),
          state: getCsvValue(row, "state"),
          district: getCsvValue(row, "district"),
          block: getCsvValue(row, "block", "tehsil", "taluk"),
          panchayat: getCsvValue(row, "panchayat", "gramPanchayat", "ward", "village"),
          postalCode: getCsvValue(row, "pin", "pinCode", "postalCode", "postcode")
        };
        if (values.state && values.district) {
          nextOverrides = addLocationOverride(nextOverrides, values);
          addedCount += 1;
        }
      });
      if (addedCount === 0) {
        setCsvUploadMessage(
          `Location CSV failed: include at least state and district values. Detected columns: ${
            getCsvColumns(rows).join(", ") || "none"
          }. First row: ${JSON.stringify(rows[0] ?? {})}.`
        );
        return;
      }
      setLocationOverrides(nextOverrides);
      setLocationCsvFile(null);
      setCsvUploadMessage(`Location CSV uploaded successfully. Added/updated ${addedCount} row(s).`);
      addAuditLog("location.added", `Uploaded ${addedCount} location rows from CSV`, activeCampaign?.id);
    } catch (error) {
      setCsvUploadMessage(`Location CSV failed: ${error instanceof Error ? error.message : "Unable to parse file"}`);
    }
  }

  async function uploadAuthorityCsv(file: File) {
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) { setCsvUploadMessage("Authority CSV failed: no rows found."); return; }
      const uploadedAuthorities = rows.reduce<AuthorityRule[]>((acc, row) => {
        const level = normalizeAuthorityLevel(getCsvValue(row, "level", "authorityLevel", "target"));
        const name = getCsvValue(row, "name", "authorityName");
        if (!name) return acc;
        acc.push({
          id: createId("auth"),
          name,
          department: getCsvValue(row, "department", "office") || getAuthorityDepartmentLabel(level),
          position: getCsvValue(row, "position") || getAuthorityPositionLabel(level),
          level,
          state: getCsvValue(row, "state"),
          district: getCsvValue(row, "district"),
          block: getCsvValue(row, "block", "tehsil", "taluk"),
          panchayat: getCsvValue(row, "panchayat", "gramPanchayat", "ward", "village"),
          address: getCsvValue(row, "address"),
          phone: getCsvValue(row, "phone", "mobile"),
          category: "Any" as const,
          locationKeyword: [getCsvValue(row, "district"), getCsvValue(row, "state")].filter(Boolean).join(" "),
          postalPrefix: getCsvValue(row, "pinPrefix", "postalPrefix"),
          email: getCsvValue(row, "email"),
          submissionMethod: "Email" as const,
          confidence: 100
        });
        return acc;
      }, []);
      if (uploadedAuthorities.length === 0) {
        setCsvUploadMessage(
          `Authority CSV failed: include at least a name or authority_name value. Detected columns: ${
            getCsvColumns(rows).join(", ") || "none"
          }. First row: ${JSON.stringify(rows[0] ?? {})}.`
        );
        return;
      }
      setAuthorities((current) => [...uploadedAuthorities, ...current]);
      setAuthorityCsvFile(null);
      setCsvUploadMessage(`Authority CSV uploaded successfully. Added ${uploadedAuthorities.length} authority row(s).`);
      addAuditLog("integration.updated", `Uploaded ${uploadedAuthorities.length} authority rows from CSV`, activeCampaign?.id);
    } catch (error) {
      setCsvUploadMessage(`Authority CSV failed: ${error instanceof Error ? error.message : "Unable to parse file"}`);
    }
  }

  function addAdminLocationOption(values: LocationWithPin): boolean {
    const level = getLocationLevel(values);
    const nextOverrides = addLocationOverride(locationOverrides, values);
    const nextDeletions = clearLocationDeletion(locationDeletions, values, level);
    setLocationOverrides(nextOverrides);
    setLocationDeletions(nextDeletions);
    addAuditLog("location.added", `Added ${level} dropdown value`, activeCampaign?.id);
    setBackendMessage(`Added ${level} location option. Saving to shared database...`);

    if (isBackendConfigured && startupMode === "saas-workspace" && remoteStateLoaded) {
      void saveRemoteState(createRemoteState({
          campaigns,
          activeCampaignId,
          signers,
          authorities,
          organization,
          scanItems,
          locationOverrides: nextOverrides,
          locationDeletions: nextDeletions,
          auditLogs,
          integrations,
          commercialPackages
        }))
        .then(() => {
          setBackendMessage(`Added ${level} location option and saved to shared database.`);
          showToast("Location added", "The new location option was saved.");
        })
        .catch((error) => {
          setBackendMessage(`Location save error: ${error instanceof Error ? error.message : "Unable to save"}`);
          showToast("Location save failed", "The option was added locally but could not be saved remotely.");
        });
    } else {
      setBackendMessage(`Added ${level} location option locally.`);
      showToast("Location added", "The new location option was added locally.");
    }

    return true;
  }

  function removeAdminLocationOption(values: LocationWithPin, level: LocationDeletionLevel) {
    setLocationOverrides((currentOverrides) => {
      const result = removeLocationOption(currentOverrides, locationDeletions, values, level);
      setLocationDeletions(result.deletions);
      return result.overrides;
    });
    addAuditLog("location.deleted", `Deleted ${level} dropdown value`, activeCampaign?.id);
  }

  function selectSubscriptionPlan(planName: BillingPlan) {
    const plan = getSubscriptionPlan(planName);
    setOrganization((current) => ({
      ...current,
      plan: plan.name,
      monthlySignatureLimit: plan.monthlySignatureLimit,
      monthlyScanLimit: plan.monthlyScanLimit,
      monthlyMessageLimit: getDefaultMessageLimit(plan.name),
      subscriptionStatus:
        plan.name === "Free Trial"
          ? "Trial"
          : current.subscriptionStatus === "Cancelled"
            ? "Trial"
            : current.subscriptionStatus,
      customBranding:
        plan.name === "Pro Movement" || plan.name === "Enterprise"
          ? current.customBranding
          : false,
      billingCadence: current.billingCadence ?? "monthly",
      campaignDurationDays: current.campaignDurationDays ?? 30,
      supporterCountEstimate: current.supporterCountEstimate ?? plan.monthlySignatureLimit,
      signaturePriceInr: current.signaturePriceInr ?? plan.pricePerSignatureInr ?? 1
    }));
  }

  function startOneDayTrial() {
    const trialPlan = getSubscriptionPlan("Free Trial");
    setOrganization({
      ...organization,
      plan: trialPlan.name,
      subscriptionStatus: "Trial",
      trialEndsAt: getTomorrowDate(),
      monthlySignatureLimit: trialPlan.monthlySignatureLimit,
      monthlyScanLimit: trialPlan.monthlyScanLimit,
      monthlyMessageLimit: trialPlan.monthlyMessageLimit,
      customBranding: false
    });
    addAuditLog("integration.updated", "Started one-day free publishing trial");
  }

  function activateSubscriptionManually() {
    const plan = getSubscriptionPlan(organization.plan);
    setOrganization({
      ...organization,
      subscriptionStatus: "Active",
      monthlySignatureLimit: plan.monthlySignatureLimit,
      monthlyScanLimit: plan.monthlyScanLimit,
      monthlyMessageLimit: getDefaultMessageLimit(plan.name)
    });
    addAuditLog("integration.updated", `Manually activated ${organization.plan} subscription`);
  }

  function markSubscriptionPastDue() {
    setOrganization({ ...organization, subscriptionStatus: "Past due" });
    addAuditLog("integration.updated", "Marked subscription as past due");
  }

  function cancelSubscription() {
    setOrganization({ ...organization, subscriptionStatus: "Cancelled" });
    addAuditLog("integration.updated", "Cancelled subscription");
  }

  function applyCommercialPackage(pkg: CommercialPackage) {
    setOrganization({
      ...organization,
      bonusSignatureCredits: (organization.bonusSignatureCredits ?? 0) + pkg.signatureCredits,
      bonusScanCredits: (organization.bonusScanCredits ?? 0) + pkg.scanCredits,
      bonusMessageCredits: (organization.bonusMessageCredits ?? 0) + pkg.messageCredits
    });
    addAuditLog(
      "integration.updated",
      `Granted package "${pkg.name}" (INR ${pkg.priceInr}) with ${pkg.signatureCredits} signatures, ${pkg.scanCredits} scans, ${pkg.messageCredits} messages`
    );
  }

  async function updateCampaignMedia(file: File) {
    if (!campaignDraft) return;
    const imageUrl = await uploadCampaignAsset(file, "banner", true);
    setCampaignDraft({ ...campaignDraft, heroImage: imageUrl });
  }

  async function updateCampaignDonationQr(file: File) {
    if (!campaignDraft) return;
    const imageUrl = await uploadCampaignAsset(file, "donation-qr", true);
    setCampaignDraft({ ...campaignDraft, donationQrImage: imageUrl });
  }

  async function uploadCampaignAsset(file: File, assetType: string, isPublic: boolean) {
    const fallbackDataUrl = await fileToDataUrl(file);
    if (!isSupabaseStorageAvailable || integrations.storageProvider !== "Supabase Storage") {
      return fallbackDataUrl;
    }
    const bucket = isPublic ? integrations.storageBucket || "campaign-public" : "campaign-private";
    const campaignSlug = (campaignDraft ?? activeCampaign)?.slug ?? "workspace";
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${campaignSlug}/${assetType}/${Date.now()}-${safeFileName}`;
    try {
      const uploaded = await uploadFileToStorage(bucket, path, file);
      setBackendMessage(`Uploaded ${assetType} to Supabase Storage.`);
      return uploaded.publicUrl;
    } catch (error) {
      setBackendMessage(
        `Storage upload failed; using local fallback. ${error instanceof Error ? error.message : "Unable to upload file"}`
      );
      return fallbackDataUrl;
    }
  }

  function addAuditLog(
    action: AuditLogEntry["action"],
    description: string,
    campaignId?: string
  ) {
    setAuditLogs((current) =>
      [
        {
          id: createId("audit"),
          action,
          actor: getCurrentActorEmail(),
          campaignId,
          description,
          createdAt: new Date().toISOString()
        },
        ...current
      ].slice(0, 500)
    );
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedMessage("Copied message to clipboard.");
    showToast("Copied", "Message copied to clipboard.");
    window.setTimeout(() => setCopiedMessage(""), 2500);
  }

  function showToast(title: string, description: string) {
    setToast({ open: false, title, description });
    window.setTimeout(() => setToast({ open: true, title, description }), 20);
  }

  function getGrowthBaseUrl() {
    return typeof window === "undefined" ? "https://voiceup.live" : window.location.origin;
  }

  function recordGrowthLifecycle(
    kind:
      | "supporter_signed"
      | "otp_verified"
      | "supporter_verified"
      | "share_completed"
      | "referral_signed"
      | "referral_verified"
      | "volunteer_joined"
      | "event_attended"
      | "points_earned"
      | "recognition_reached",
    signer: Signer,
    nextSigners: Signer[],
    share?: GrowthShareContext
  ) {
    const campaign = campaigns.find((item) => item.id === signer.campaignId) ?? activeCampaign;
    if (!campaign) return;
    const growthConfiguration = campaign.growthConfiguration;
    setGrowthRuntime((current) =>
      applyGrowthLifecycleEvent(current, {
        kind,
        signer,
        signers: nextSigners,
        campaignSlug: campaign.slug,
        baseUrl: getGrowthBaseUrl(),
        occurredAt: new Date().toISOString(),
        share,
        configuration: growthConfiguration?.operatingSystem,
        contribution: growthConfiguration?.contribution,
        achievements: growthConfiguration?.achievements,
        leaderboardFilters: growthConfiguration?.leaderboard.enabled ? growthConfiguration.leaderboard.filters : undefined,
        rewards: growthConfiguration?.rewards
      }).state
    );
  }

  function recordGrowthEventIntent(
    type: GrowthEventType,
    campaignId: string,
    metadata: Record<string, string | number | boolean | null | undefined>
  ) {
    setGrowthRuntime((current) =>
      appendGrowthLifecycleEventIntent(current, {
        type,
        priority: GrowthEventPriority.Normal,
        context: { campaignId },
        metadata
      })
    );
  }

  function recordPublicShareGrowth(share: GrowthShareContext) {
    if (!lastSignedSigner || !activeCampaign || lastSignedSigner.campaignId !== activeCampaign.id) return;
    const nextSigners = signers.some((signer) => signer.id === lastSignedSigner.id)
      ? signers
      : [lastSignedSigner, ...signers];
    recordGrowthLifecycle("share_completed", lastSignedSigner, nextSigners, share);
  }

  async function submitCampaignAdminLogin(event: FormEvent) {
    event.preventDefault();
    if (!activeCampaign) return;
    const submittedEmail = adminLogin.email.trim();
    const submittedPasscode = adminLogin.passcode.trim();
    const expectedEmail = getCampaignAdminEmail(activeCampaign);
    const expectedPasscode = getCampaignAdminPasscode(activeCampaign);
    if (!expectedEmail || !expectedPasscode) {
      setAdminLoginMessage(
        "Campaign admin login is disabled because this campaign does not have admin credentials configured."
      );
      return;
    }
    const emailMatches = submittedEmail.toLowerCase() === expectedEmail.trim().toLowerCase();
    const passcodeMatches = submittedPasscode === expectedPasscode.trim();
    if (!emailMatches || !passcodeMatches) {
      setAdminLoginMessage("Invalid campaign admin email or passcode.");
      return;
    }
    const nextAuth = { ...authenticatedAdminSlugs, [activeCampaign.slug]: true };
    setAuthenticatedAdminSlugs(nextAuth);
    writeAuthenticatedAdminSlugs(nextAuth);
    setAdminLogin(blankAdminLogin);
    setAdminLoginMessage("");

    const workspaceId = getCurrentWorkspaceId();
    if (!isSupabaseAuthAvailable || integrations.storageProvider !== "Supabase Storage") {
      const access = evaluateSecureFieldUploadAccess({
        supabaseConfigured: isSupabaseAuthAvailable,
        storageProvider: integrations.storageProvider,
        currentWorkspaceId: workspaceId
      });
      setSecureFieldUploadAccess(access);
      setCampaignAdminSupabaseSessionOwned(false);
      setScanMessage(SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE);
      setBackendMessage(SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE);
      return;
    }

    let establishedCampaignAdminSession = false;
    try {
      const existingUser = await getCurrentAuthUser();
      if (!existingUser) {
        console.debug("[AUTH FLOW] before signIn");
        const signedInUser = await signInWithSupabase(submittedEmail, submittedPasscode);
        const signInResult = getLatestSignInResult();
        console.debug("[AUTH FLOW] after signIn", {
          returnedUserId: signedInUser?.id ?? "",
          returnedEmail: signedInUser?.email ?? "",
          returnedSessionExists: signInResult.sessionExists
        });
        await debugSupabaseSessionTiming("[AUTH FLOW] post-signIn getSession");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await debugSupabaseSessionTiming("[AUTH FLOW] delayed getSession");
        establishedCampaignAdminSession = true;
      }

      await debugSupabaseAuthBeforeVerification();
      const access = await verifySecureFieldUploadAccess(
        workspaceId,
        integrations.storageProvider
      );
      const existingMarker = readCampaignAdminSupabaseSession(activeCampaign.slug);
      const campaignAdminOwnsSession =
        establishedCampaignAdminSession ||
        shouldSignOutCampaignAdminSupabaseSession(existingMarker, access);
      if (!access.available) {
        if (campaignAdminOwnsSession) await signOutSupabase();
        clearCampaignAdminSupabaseSession(activeCampaign.slug);
        setSecureFieldUploadAccess(access);
        setCampaignAdminSupabaseSessionOwned(false);
        setScanMessage(SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE);
        setBackendMessage(SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE);
        return;
      }

      setSecureFieldUploadAccess(access);
      setCampaignAdminSupabaseSessionOwned(campaignAdminOwnsSession);
      if (establishedCampaignAdminSession) {
        writeCampaignAdminSupabaseSession({
          slug: activeCampaign.slug,
          userId: access.userId,
          workspaceId: access.workspaceId
        });
      }
      setScanMessage(access.message);
      setBackendMessage(access.message);
    } catch {
      if (establishedCampaignAdminSession) await signOutSupabase();
      clearCampaignAdminSupabaseSession(activeCampaign.slug);
      setSecureFieldUploadAccess(
        evaluateSecureFieldUploadAccess({
          supabaseConfigured: true,
          storageProvider: integrations.storageProvider,
          currentWorkspaceId: workspaceId
        })
      );
      setCampaignAdminSupabaseSessionOwned(false);
      setScanMessage(SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE);
      setBackendMessage(SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE);
    }
  }

  async function logoutCampaignAdmin() {
    if (!activeCampaign) return;
    const nextAuth = { ...authenticatedAdminSlugs, [activeCampaign.slug]: false };
    setAuthenticatedAdminSlugs(nextAuth);
    writeAuthenticatedAdminSlugs(nextAuth);
    clearCampaignAdminSupabaseSession(activeCampaign.slug);
    setSecureFieldUploadAccess(
      evaluateSecureFieldUploadAccess({
        supabaseConfigured: isBackendConfigured,
        storageProvider: integrations.storageProvider,
        currentWorkspaceId: getCurrentWorkspaceId()
      })
    );
    if (campaignAdminSupabaseSessionOwned) await signOutSupabase();
    setCampaignAdminSupabaseSessionOwned(false);
  }

  async function submitAppLogin(event: FormEvent) {
    event.preventDefault();
    const email = appLogin.email.trim();
    const passcode = appLogin.passcode.trim();
    const hasFallbackCredentials = hasConfiguredPlatformAdminFallback();

    if (!isSupabaseAuthAvailable && !hasFallbackCredentials) {
      setAppLoginMessage(
        "Platform administration is not configured. Set Supabase env vars or VITE_VOICEUP_APP_ADMIN_EMAIL and VITE_VOICEUP_APP_ADMIN_PASSCODE."
      );
      return;
    }

    let supabaseUser = null;
    let authFailureMessage = "";

    if (isSupabaseAuthAvailable) {
      try {
        console.debug("[AUTH FLOW] before signIn");
        supabaseUser = await signInWithSupabase(email, passcode);
        const signInResult = getLatestSignInResult();
        console.debug("[AUTH FLOW] after signIn", {
          returnedUserId: supabaseUser?.id ?? "",
          returnedEmail: supabaseUser?.email ?? "",
          returnedSessionExists: signInResult.sessionExists
        });
        await debugSupabaseSessionTiming("[AUTH FLOW] post-signIn getSession");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await debugSupabaseSessionTiming("[AUTH FLOW] delayed getSession");
      } catch (error) {
        authFailureMessage = error instanceof Error ? error.message : "Unable to login with Supabase Auth";
      }
    }

    if (supabaseUser) {
      try {
        const context = await getAuthContext();
        if (context.platformAdmin) {
          clearPlatformAdminSession();
          setIsPlatformAdminAuthenticated(true);
          setIsCustomerWorkspaceAuthenticated(Boolean(context.workspaceMember || context.customerWorkspace));
          setActiveTab("dashboard");
          setAppLogin(blankAppLogin);
          setAppLoginMessage("");
          addAuditLog("auth.login", `SaaS admin logged in with Supabase Auth: ${supabaseUser.email ?? email}`);
          return;
        }

        await signOutSupabase();
        if (matchesConfiguredPlatformAdminCredentials(email, passcode)) {
          writePlatformAdminSession(email);
          setIsPlatformAdminAuthenticated(true);
          setIsCustomerWorkspaceAuthenticated(Boolean(context.workspaceMember || context.customerWorkspace));
          setActiveTab("dashboard");
          setAppLogin(blankAppLogin);
          setAppLoginMessage("");
          addAuditLog("auth.login", `SaaS admin logged in with configured fallback credentials: ${email}`);
          return;
        }

        setIsPlatformAdminAuthenticated(false);
        setAppLoginMessage(
          context.role
            ? `Authenticated Supabase user has ${context.role} access, not platform_owner.`
            : "Authenticated Supabase user does not have a platform_owner membership row."
        );
        return;
      } catch (error) {
        await signOutSupabase();
        if (matchesConfiguredPlatformAdminCredentials(email, passcode)) {
          writePlatformAdminSession(email);
          setIsPlatformAdminAuthenticated(true);
          setIsCustomerWorkspaceAuthenticated(false);
          setActiveTab("dashboard");
          setAppLogin(blankAppLogin);
          setAppLoginMessage("");
          addAuditLog("auth.login", `SaaS admin logged in with configured fallback credentials: ${email}`);
          return;
        }
        const roleMessage = error instanceof Error ? error.message : "Unable to verify platform role";
        setAppLoginMessage(`Supabase Auth login succeeded, but role verification failed: ${roleMessage}.`);
        return;
      }
    }

    if (matchesConfiguredPlatformAdminCredentials(email, passcode)) {
      writePlatformAdminSession(email);
      setIsPlatformAdminAuthenticated(true);
      setIsCustomerWorkspaceAuthenticated(false);
      setActiveTab("dashboard");
      setAppLogin(blankAppLogin);
      setAppLoginMessage("");
      addAuditLog("auth.login", `SaaS admin logged in with configured fallback credentials: ${email}`);
      return;
    }

    setAppLoginMessage(
      hasFallbackCredentials
        ? `Supabase Auth login failed: ${describeSupabaseAuthError(authFailureMessage || "Unable to login with Supabase Auth")}. The configured fallback admin credentials did not match.`
        : `Supabase Auth login failed: ${describeSupabaseAuthError(authFailureMessage || "Unable to login with Supabase Auth")}. Verify the Supabase admin account or configure VITE_VOICEUP_APP_ADMIN_EMAIL and VITE_VOICEUP_APP_ADMIN_PASSCODE.`
    );
  }

  async function logoutAppAdmin() {
    if (isSaasAdminRoute) {
      if (isSupabaseAuthAvailable) await signOutSupabase();
      clearPlatformAdminSession();
      clearCustomerSessionToken();
      setIsPlatformAdminAuthenticated(false);
      window.location.assign("/");
      return;
    }
    if (isSupabaseAuthAvailable) await signOutSupabase();
    clearPlatformAdminSession();
    clearCustomerSessionToken();
    setIsCustomerWorkspaceAuthenticated(false);
    setIsPlatformAdminAuthenticated(false);
    setCampaigns(initialCampaigns);
    setSigners(initialSigners);
    setAuthorities(initialAuthorities);
    setOrganization(initialOrganization);
    setScanItems([]);
    setAuditLogs([]);
    setIntegrations(initialIntegrationSettings);
    setCommercialPackages(initialCommercialPackages);
    setLocationOverrides({});
    setLocationDeletions(emptyLocationDeletions);
    setActiveCampaignId(initialCampaigns[0]?.id ?? "");
    setCampaignDraft(initialCampaigns[0] ?? null);
    setCampaignFormMode("edit");
    setPublicForm(blankSigner);
    setPublicMessage("");
    setLastSignedSigner(null);
    setBackendMessage("");
    setCommandOpen(false);
    setGlobalSearch("");
    const preservedRecoveryValues = new Map<string, string>();
    ["voiceup-onboarding-session-v1", "voiceup-device-id"].forEach((key) => {
      const value = window.localStorage.getItem(key);
      if (value) preservedRecoveryValues.set(key, value);
    });
    window.localStorage.clear();
    preservedRecoveryValues.forEach((value, key) => window.localStorage.setItem(key, value));
    window.sessionStorage.clear();
    window.location.assign("/");
  }

  const marketingHome = (
    <MarketingHomePage
      theme={theme}
      setTheme={setTheme}
      onboardingOpen={onboardingOpen}
      onOpenOnboarding={() => setOnboardingOpen(true)}
      onCloseOnboarding={() => setOnboardingOpen(false)}
      onCompleteOnboarding={completeOnboardingCampaign}
    />
  );
  const workspaceRestoreHome = (
    <MarketingHomePage
      theme={theme}
      setTheme={setTheme}
      onboardingOpen
      onOpenOnboarding={() => setOnboardingOpen(true)}
      onCloseOnboarding={() => window.location.assign("/")}
      onCompleteOnboarding={completeOnboardingCampaign}
    />
  );

  // ─── Route rendering ──────────────────────────────────────────────────────
  if (isSupporterPortalRoute) {
    if (backendLoading || (isBackendConfigured && !remoteStateLoaded)) {
      return <SupporterGrowthPortalLoading />;
    }
    return supporterPortalResult?.status === "ready" && supporterPortalResult.portal ? (
      <SupporterGrowthPortalPage portal={supporterPortalResult.portal} onRewardAction={handleSupporterRewardAction} />
    ) : (
      <SupporterGrowthPortalNotFound
        message={supporterPortalResult?.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (isPublicCampaignRoute) {
    if (backendLoading || (isBackendConfigured && !remoteStateLoaded)) {
      return <PublicCampaignLoading message={backendMessage} />;
    }
    return activeCampaign ? (
      <div className="public-only-shell">
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
          growthSnapshot={lastSignedGrowthSnapshot}
          growthPortal={lastSignedGrowthPortal}
          otpInput={otpInput}
          setOtpInput={setOtpInput}
          otpMessage={otpMessage}
          onSendOtp={sendOtp}
          onVerifyOtp={verifyOtp}
          onGrowthShare={recordPublicShareGrowth}
          locationOverrides={locationOverrides}
          locationDeletions={locationDeletions}
          onSubmit={submitPublicSignature}
        />
      </div>
    ) : (
      <PublicCampaignNotFound onRetry={() => window.location.reload()} />
    );
  }

  if (isCampaignAdminRoute) {
    if (backendLoading) return <PublicCampaignLoading message={backendMessage} />;
    if (!activeCampaign) return <CampaignAdminNotFound />;
    if (!authenticatedAdminSlugs[activeCampaign.slug]) {
      return (
        <CampaignAdminLoginPage
          campaign={activeCampaign}
          adminLogin={adminLogin}
          setAdminLogin={setAdminLogin}
          message={adminLoginMessage}
          onSubmit={submitCampaignAdminLogin}
        />
      );
    }
  }

  if (legalPage) return <LegalPage page={legalPage} />;
  if (isLandingPageRoute || isStartRoute) return marketingHome;
  if (!isAppRoute && !isSaasAdminRoute && !isCampaignAdminRoute && !isSupporterPortalRoute) {
    return marketingHome;
  }
  if ((isAppRoute || isSaasAdminRoute) && (backendLoading || authContextLoading)) {
    return (
      <main className="app-loading-screen">
        <div className="app-loading-card">
          <div className="app-loading-spinner" aria-hidden="true" />
          <strong>Connecting to campaign workspace</strong>
          <p>{backendMessage}</p>
        </div>
      </main>
    );
  }

  if (isSaasAdminRoute && !canAccessPlatformAdmin) {
    return (
      <SaasAppLoginPage
        mode="platform"
        appLogin={appLogin}
        setAppLogin={setAppLogin}
        message={appLoginMessage}
        onSubmit={submitAppLogin}
      />
    );
  }

  if (isAppRoute && !canAccessCustomerWorkspace) {
    return workspaceRestoreHome;
  }

  return (
    <Toast.Provider swipeDirection="right">
      <AppShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        setTheme={setTheme}
        commandOpen={commandOpen}
        setCommandOpen={setCommandOpen}
        globalSearch={globalSearch}
        setGlobalSearch={setGlobalSearch}
        toast={toast}
        setToast={setToast}
        campaigns={campaigns}
        activeCampaignId={activeCampaignId}
        setActiveCampaignId={setActiveCampaignId}
        activeCampaign={activeCampaign}
        campaignDraft={campaignDraft}
        setCampaignDraft={setCampaignDraft}
        campaignFormMode={campaignFormMode}
        setCampaignFormMode={setCampaignFormMode}
        isCampaignAdminRoute={isCampaignAdminRoute}
        isAppRoute={isAppRoute || isSaasAdminRoute}
        canAccessPlatformAdmin={canAccessPlatformAdmin}
        signers={signers}
        growthRuntime={growthRuntime}
        setGrowthRuntime={setGrowthRuntime}
        authorities={authorities}
        setAuthorities={setAuthorities}
        organization={organization}
        setOrganization={setOrganization}
        scanItems={scanItems}
        setScanItems={setScanItems}
        confirmationQueue={confirmationQueue}
        auditLogs={auditLogs}
        integrations={integrations}
        setIntegrations={setIntegrations}
        commercialPackages={commercialPackages}
        setCommercialPackages={setCommercialPackages}
        locationOverrides={locationOverrides}
        locationDeletions={locationDeletions}
        metrics={metrics}
        authorityMatch={authorityMatch}
        dailyTotals={dailyTotals}
        weeklyTotals={weeklyTotals}
        stateTotals={stateTotals}
        districtTotals={districtTotals}
        blockTotals={blockTotals}
        panchayatTotals={panchayatTotals}
        campaignSigners={campaignSigners}
        saasSection={saasSection}
        setSaasSection={setSaasSection}
        publicForm={publicForm}
        setPublicForm={setPublicForm}
        publicMessage={publicMessage}
        lastSignedSigner={lastSignedSigner}
        growthSnapshot={lastSignedGrowthSnapshot}
        growthPortal={lastSignedGrowthPortal}
        otpInput={otpInput}
        setOtpInput={setOtpInput}
        otpMessage={otpMessage}
        scanText={scanText}
        setScanText={setScanText}
        isScanning={isScanning}
        scanMessage={scanMessage}
        secureFieldUploadAvailable={secureFieldUploadAvailable}
        secureFieldUploadMessage={secureFieldUploadAccess.message}
        broadcastMessage={broadcastMessage}
        setBroadcastMessage={setBroadcastMessage}
        copiedMessage={copiedMessage}
        locationCsvFile={locationCsvFile}
        setLocationCsvFile={setLocationCsvFile}
        authorityCsvFile={authorityCsvFile}
        setAuthorityCsvFile={setAuthorityCsvFile}
        csvUploadMessage={csvUploadMessage}
        setCsvUploadMessage={setCsvUploadMessage}
        backendMessage={backendMessage}
        filteredCommandItems={filteredCommandItems}
        onCreateCampaign={createCampaign}
        onCloneCampaign={cloneCampaign}
        onArchiveCampaign={archiveCampaign}
        onDeleteCampaign={deleteCampaign}
        onSaveCampaign={saveCampaign}
        onPublishCampaign={publishCampaign}
        onSubmitPublicSignature={submitPublicSignature}
        onSendOtp={sendOtp}
        onVerifyOtp={verifyOtp}
        onGrowthShare={recordPublicShareGrowth}
        onUploadScan={uploadScan}
        onOpenPrivateScan={openPrivateScan}
        onCreateManualScanItem={createManualScanItem}
        onUpdateScanParsedSigner={updateScanParsedSigner}
        onApproveScan={approveScan}
        onUpdateSignerStatus={updateSignerStatus}
        onAddAuthorityRule={addAuthorityRule}
        onAddAdminLocationOption={addAdminLocationOption}
        onRemoveAdminLocationOption={removeAdminLocationOption}
        onUploadLocationCsv={uploadLocationCsv}
        onUploadAuthorityCsv={uploadAuthorityCsv}
        onUpdateCampaignMedia={updateCampaignMedia}
        onUpdateCampaignDonationQr={updateCampaignDonationQr}
        onSelectSubscriptionPlan={selectSubscriptionPlan}
        onStartOneDayTrial={startOneDayTrial}
        onActivateSubscriptionManually={activateSubscriptionManually}
        onMarkSubscriptionPastDue={markSubscriptionPastDue}
        onCancelSubscription={cancelSubscription}
        onApplyCommercialPackage={applyCommercialPackage}
        onAuditIntegrationUpdate={() => addAuditLog("integration.updated", "Updated Razorpay key reference")}
        onCopyText={copyText}
        onLogoutCampaignAdmin={logoutCampaignAdmin}
        onLogoutAppAdmin={logoutAppAdmin}
      />
    </Toast.Provider>
  );
}

// ─── Helpers local to App.tsx ─────────────────────────────────────────────────
function getLocationLevel(values: LocationWithPin): LocationDeletionLevel {
  if (values.panchayat.trim()) return "panchayat";
  if (values.block.trim()) return "block";
  return "district";
}

export default App;
