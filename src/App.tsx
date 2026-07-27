import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  approveScanReviewItem,
  assignCurrentWorkspaceMemberAsCampaignAdmin,
  clearCustomerSessionToken,
  createPublicParticipationIdempotencyKey,
  createTrialWorkspace,
  getAuthContext,
  getCurrentAuthSession,
  getCurrentAuthUser,
  getCurrentWorkspaceId,
  isBackendConfigured,
  isSupabaseAuthAvailable,
  isSupabaseStorageAvailable,
  loadAuthoritativeFieldCollectionState,
  loadPublicCampaign,
  loadRemoteState,
  mutatePublicParticipation,
  provisionWorkspaceMember,
  recordScanApprovalBatchAudit,
  requestOtp as requestPublicOtp,
  resolveCampaignAdminAssignmentContext,
  saveRemoteState,
  signInWithSupabase,
  signOutSupabase,
  submitPublicSignatureSecure,
  uploadFileToStorage,
  uploadPrivateFileToStorage,
  uploadPublicSupporterPhoto,
  createSignedStorageUrl,
  verifyOtp as verifyPublicOtp,
  verifySecureFieldUploadAccess
} from "./backend";
import type { PublicCampaignPayload } from "./backend";
import { ProvisionWorkspaceMemberError, PublicSignatureSubmissionError } from "./backend";
import {
  applyCampaignAdminProvisioningFailure,
  applyCampaignAdminProvisioningSuccess,
  CAMPAIGN_ADMIN_PROVISIONING_MESSAGES,
  evaluateCampaignAdminProvisioningGate,
  formatCampaignAdminProvisioningFailure
} from "./utils/campaignAdminProvisioning";
import {
  createId,
  createScanReviewItem,
  getCampaignMetrics,
  getCampaignSigners,
  groupSignersByLocation,
  groupSignersByDay,
  groupSignersByWeek,
  makePublicSigner,
  parseSignerFromText
} from "./lib";
import {
  countScanApprovalResult,
  createScanApprovalCounts,
  type ScanApprovalCounts
} from "./scanApproval";
import {
  createConfirmationQueueItems,
  getPaperSupporterConfirmationStatus
} from "./confirmationQueue";
import { buildPrivateScanStoragePath, validateScanImageFile } from "./mobileScanCapture";
import {
  analyzeBusinessOsDocument,
  createDocumentDiagnosticId,
  DOCUMENT_CAMERA_RECOMMENDATION_MESSAGE,
  logDocumentIntelligenceStage,
  logFieldCollectionTrace
} from "./documentIntelligence";
import {
  buildApprovalKey,
  buildSourceRowFingerprint,
  buildUploadFingerprint,
  sha256Blob
} from "./shared/deduplication/supporterIdentity";
import {
  CAMPAIGN_ADMIN_ACCESS_MESSAGES,
  CAMPAIGN_ADMIN_SESSION_MARKER_SCHEMA_VERSION,
  createSecureFieldUploadVerificationCoordinator,
  evaluateCampaignAdminLoginAccess,
  evaluateCampaignAdminSecureFieldUploadAccess,
  evaluateSecureFieldUploadAccess,
  isCampaignAdminSessionMarkerValid,
  isSupabaseSessionOwnedBy,
  reconcileAuthenticatedAdminSlugs,
  resolveSupabaseSessionOwnership,
  SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE,
  shouldSignOutCampaignAdminSupabaseSession,
  type CampaignAdminSecureFieldUploadAccess,
  type CampaignAdminSessionMarkerExpectation,
  type SecureFieldUploadAccess
} from "./secureFieldUploadAuth";

// Either the base membership-only secure field-upload access result, or the Campaign
// Admin-layered result (which additionally requires an exact session marker match plus
// subscription/entitlement gates). Both share the same `available`/`message`/`userId`/
// `workspaceId`/`role` shape and differ only in the possible `reason` literals.
type AnySecureFieldUploadAccess = SecureFieldUploadAccess | CampaignAdminSecureFieldUploadAccess;
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
  BillingCadence,
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
  clearSupabaseSessionOwnership,
  createAdminPasscode,
  getCampaignAdminEmail,
  getCurrentActorEmail,
  hasConfiguredPlatformAdminFallback,
  hasRestoredPlatformAdminSession,
  matchesConfiguredPlatformAdminCredentials,
  readAuthenticatedAdminSlugs,
  readCampaignAdminSupabaseSession,
  readSupabaseSessionOwnership,
  writeCampaignAdminSupabaseSession,
  writePlatformAdminSession,
  writeSupabaseSessionOwnership,
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
  applyCancelSubscription,
  applyChangeBillingCycle,
  applyDowngradePlan,
  applyExtendSubscriptionDuration,
  applyPurchaseAddOn,
  applyReactivateSubscription,
  applyRenewSubscription,
  applyScheduledPlanChangeIfDue,
  applySuspendSubscription,
  applyUpgradePlan,
  backfillOrganizationEntitlements,
  getCampaignEntitlements,
  type AddOnPurchaseRequest
} from "./entitlements";
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
import { buildPublicWebConsentPayload } from "./utils/consent";
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
import { publicCampaignSlugsMatch } from "../supabase/functions/_shared/publicCampaignSlug";
import {
  clearPublicSigningJourney,
  clearPublicSigningOtpState,
  createPublicSigningSubmissionAttempt,
  formatPublicSigningBackendError,
  transitionPublicSigningCampaign,
  type PublicSigningCampaignScope,
  type PublicSigningSubmissionAttempt
} from "./publicSigningJourney";

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

function getInitialWorkspaceTab():
  | "dashboard"
  | "command"
  | "fund"
  | "prove"
  | "campaigns"
  | "public"
  | "movement"
  | "coordinators"
  | "growth"
  | "scans"
  | "reports"
  | "engagement"
  | "activity"
  | "saas"
  | "ideas" {
  if (typeof window === "undefined") return "command";
  const queryTab = new URLSearchParams(window.location.search).get("tab");
  if (queryTab === "coordinators") return "coordinators";
  return "command";
}

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

// Exact, safe SaaS Admin messages (see the Campaign Admin equivalents in
// `secureFieldUploadAuth.ts` for the parallel pattern). Never expose a UUID, token, or raw
// Supabase error string to the user.
const SAAS_ADMIN_AUTH_FAILURE_MESSAGE = "SaaS Admin email or password is incorrect.";
const SAAS_ADMIN_SESSION_DISCONNECTED_MESSAGE =
  "SaaS Admin session is not connected to Supabase. Sign out and sign in again.";

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
  // One-time (per-load), idempotent backfill for entitlement fields that did
  // not exist on older campaigns/organizations, plus applying any downgrade
  // that was scheduled for a date that has now passed. Neither step touches
  // campaigns, signers, scans, or any other data -- guaranteeing zero data
  // loss across the plan/upgrade/downgrade lifecycle.
  useEffect(() => {
    setOrganization((current) => applyScheduledPlanChangeIfDue(backfillOrganizationEntitlements(current)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization.id]);
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
    "dashboard" | "command" | "fund" | "prove" | "campaigns" | "public" | "movement" | "coordinators" | "growth" | "scans" | "reports" | "engagement" | "activity" | "saas" | "ideas"
  >(() => getInitialWorkspaceTab());
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
  const [publicOtpExpiresAt, setPublicOtpExpiresAt] = useState(0);
  const [lastSignedSigner, setLastSignedSigner] = useState<Signer | null>(null);
  const [lastPublicOtpVerificationToken, setLastPublicOtpVerificationToken] = useState("");
  const publicSigningCampaignRef = useRef<PublicSigningCampaignScope | null>(null);
  const publicSigningSubmissionRef = useRef<PublicSigningSubmissionAttempt | null>(null);
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
  const [campaignAdminProvisioningPending, setCampaignAdminProvisioningPending] = useState(false);
  const [campaignAdminProvisioningMessage, setCampaignAdminProvisioningMessage] = useState("");
  const campaignAdminProvisioningInFlightRef = useRef(false);
  const [appLogin, setAppLogin] = useState(blankAppLogin);
  const [appLoginMessage, setAppLoginMessage] = useState("");
  const [authContextLoading, setAuthContextLoading] = useState(isBackendConfigured);
  const [isPlatformAdminAuthenticated, setIsPlatformAdminAuthenticated] = useState(false);
  const [isCustomerWorkspaceAuthenticated, setIsCustomerWorkspaceAuthenticated] = useState(false);
  const [saasSection, setSaasSection] = useState<
    "organization" | "usage" | "packages" | "integrations" | "plans" | "entitlements"
  >("organization");
  const [authenticatedAdminSlugs, setAuthenticatedAdminSlugs] = useState<
    Record<string, boolean>
  >(() => readAuthenticatedAdminSlugs());
  const [secureFieldUploadAccess, setSecureFieldUploadAccess] = useState<AnySecureFieldUploadAccess>(
    () => evaluateSecureFieldUploadAccess({
      supabaseConfigured: isBackendConfigured,
      storageProvider: initialIntegrationSettings.storageProvider,
      currentWorkspaceId: getCurrentWorkspaceId()
    })
  );
  const [campaignAdminSupabaseSessionOwned, setCampaignAdminSupabaseSessionOwned] = useState(false);
  // Single source of truth for ordering secure-upload verification writes: every write to
  // secureFieldUploadAccess (sync reset or async verification) is coordinated by generation id.
  // A synchronous reset always invalidates any in-flight async verification so a stale result
  // can never overwrite a newer/authoritative state.
  const verificationCoordinatorRef = useRef(createSecureFieldUploadVerificationCoordinator());
  // Set while submitCampaignAdminLogin() is running its own (correctly-authenticated) secure
  // field-upload verification. Prevents the unrelated restore/refresh effect below -- which
  // reacts to the authenticatedAdminSlugs update fired at the start of login -- from racing
  // ahead with a stale getCurrentAuthUser() lookup (made before sign-in resolves) and briefly
  // or permanently overwriting the login handler's correct result with "unauthenticated".
  const campaignAdminLoginInFlightRef = useRef(false);

  function resetSecureFieldUploadAccess(access: AnySecureFieldUploadAccess) {
    verificationCoordinatorRef.current.reset();
    setSecureFieldUploadAccess(access);
    setCampaignAdminSupabaseSessionOwned(false);
  }

  async function verifyAndApplySecureFieldUploadAccess(
    workspaceId: string,
    knownUser?: { id: string } | null,
    campaignAdminContext?: CampaignAdminSessionMarkerExpectation
  ): Promise<{ access: AnySecureFieldUploadAccess; applied: boolean }> {
    const requestId = verificationCoordinatorRef.current.beginVerification();
    const baseAccess = await verifySecureFieldUploadAccess(workspaceId, integrations.storageProvider, knownUser);
    // Campaign Admin secure field-upload access additionally requires an exact-context
    // session marker (never an old/incomplete one) plus active subscription +
    // `campaign_admin_access` + `field_collection` + `secure_upload` -- these gates are
    // layered on top of, never in place of, the base membership check above.
    const access = campaignAdminContext
      ? evaluateCampaignAdminSecureFieldUploadAccess({
          baseAccess,
          sessionMarkerValid: isCampaignAdminSessionMarkerValid(
            readCampaignAdminSupabaseSession(campaignAdminContext.slug),
            campaignAdminContext
          ),
          ...getCampaignAdminEntitlementGates()
        })
      : baseAccess;
    const applied = verificationCoordinatorRef.current.isCurrent(requestId);
    if (applied) setSecureFieldUploadAccess(access);
    return { access, applied };
  }

  function getCampaignAdminEntitlementGates() {
    const entitlements = getCampaignEntitlements(organization);
    const subscriptionActive = !entitlements.isSuspended && !entitlements.isCancelled && !entitlements.isExpired;
    return {
      subscriptionActive,
      hasCampaignAdminAccessFeature: entitlements.features.campaign_admin_access === true,
      hasFieldCollectionFeature: entitlements.features.field_collection === true,
      hasSecureUploadFeature: entitlements.features.secure_upload === true
    };
  }

  const [platformAdminSupabaseSessionOwned, setPlatformAdminSupabaseSessionOwned] = useState(
    () => readSupabaseSessionOwnership()?.source === "platform_admin"
  );

  // ─── Derived / memoised ──────────────────────────────────────────────────
  const activeCampaign = useMemo(() => {
    if (publicCampaignSlug) {
      return publicCampaignPayload &&
        publicCampaignSlugsMatch(publicCampaignPayload.campaign.slug, publicCampaignSlug)
        ? publicCampaignPayload.campaign
        : campaigns.find((c) => publicCampaignSlugsMatch(c.slug, publicCampaignSlug));
    }
    if (adminCampaignSlug) {
      return campaigns.find((c) => c.slug === adminCampaignSlug);
    }
    if (campaignFormMode === "create" && campaignDraft) {
      return campaignDraft;
    }
    return campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0];
  }, [activeCampaignId, campaignDraft, campaignFormMode, campaigns, publicCampaignPayload]);
  const publicParticipationSlug = publicCampaignSlug || activeCampaign?.slug || "";

  useEffect(() => {
    if (!isPublicCampaignRoute || !activeCampaign || typeof window === "undefined") return;
    const nextScope = {
      campaignId: activeCampaign.id,
      slug: publicParticipationSlug
    };
    const campaignChanged = transitionPublicSigningCampaign(
      window.sessionStorage,
      publicSigningCampaignRef.current,
      nextScope
    );
    publicSigningCampaignRef.current = nextScope;
    if (!campaignChanged) return;

    publicSigningSubmissionRef.current = null;
    setPublicForm(blankSigner);
    setPublicMessage("");
    setOtpCode("");
    setOtpInput("");
    setOtpMessage("");
    setPublicOtpExpiresAt(0);
    setLastPublicOtpVerificationToken("");
    setLastSignedSigner(null);
  }, [activeCampaign?.id, activeCampaign?.slug, publicParticipationSlug]);

  useEffect(() => {
    if (!publicOtpExpiresAt) return;
    const remaining = publicOtpExpiresAt - Date.now();
    if (remaining <= 0) {
      publicSigningSubmissionRef.current = null;
      setPublicForm((current) => clearPublicSigningOtpState(current));
      setOtpCode("");
      setOtpInput("");
      setOtpMessage("Your OTP verification expired. Request a new code.");
      setPublicMessage("Your OTP verification expired. Request a new code and verify again.");
      setPublicOtpExpiresAt(0);
      setLastPublicOtpVerificationToken("");
      return;
    }
    const timer = window.setTimeout(() => setPublicOtpExpiresAt(Date.now()), remaining);
    return () => window.clearTimeout(timer);
  }, [publicOtpExpiresAt]);
  const campaignAdminSessionEmail =
    isCampaignAdminRoute && activeCampaign
      ? readCampaignAdminSupabaseSession(activeCampaign.slug)?.email ?? ""
      : "";
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
      ...(hasFeature("movement_crm")
        ? [{ label: "Coordinator Network", detail: "Manage coordinator hierarchy", action: () => setActiveTab("coordinators" as const) }]
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
      resetSecureFieldUploadAccess(
        evaluateSecureFieldUploadAccess({
          supabaseConfigured: isBackendConfigured,
          storageProvider: integrations.storageProvider,
          currentWorkspaceId: getCurrentWorkspaceId()
        })
      );
      return;
    }

    if (campaignAdminLoginInFlightRef.current) return;

    const activeCampaignSlug = activeCampaign.slug;
    const activeCampaignId = activeCampaign.id;
    const routeIsCampaignAdmin = isCampaignAdminRoute;
    async function refreshSecureFieldUploadAccess() {
      if (routeIsCampaignAdmin) {
        // Reconcile the restored/reloaded authenticatedAdminSlugs flag against the
        // campaignAdminSupabaseSession marker and the currently authenticated Supabase user
        // before trusting this slug enough to run secure field-upload verification. This
        // prevents an orphaned slug flag (e.g. left over from a stale/QA session, or a slug
        // whose Supabase sign-in never completed) from silently reusing an unrelated ambient
        // Supabase session's access as this slug's secure field-upload result.
        const marker = readCampaignAdminSupabaseSession(activeCampaignSlug);
        const currentUser = await getCurrentAuthUser();
        const reconciliation = reconcileAuthenticatedAdminSlugs(
          activeCampaignSlug,
          authenticatedAdminSlugs,
          marker,
          currentUser?.id ?? ""
        );
        if (!reconciliation.authenticated) {
          if (reconciliation.nextAuthenticatedAdminSlugs !== authenticatedAdminSlugs) {
            setAuthenticatedAdminSlugs(reconciliation.nextAuthenticatedAdminSlugs);
            writeAuthenticatedAdminSlugs(reconciliation.nextAuthenticatedAdminSlugs);
          }
          clearCampaignAdminSupabaseSession(activeCampaignSlug);
          resetSecureFieldUploadAccess(
            evaluateSecureFieldUploadAccess({
              supabaseConfigured: isBackendConfigured,
              storageProvider: integrations.storageProvider,
              currentWorkspaceId: getCurrentWorkspaceId()
            })
          );
          return;
        }

        const { access, applied } = await verifyAndApplySecureFieldUploadAccess(
          getCurrentWorkspaceId(),
          currentUser,
          {
            slug: activeCampaignSlug,
            resourceId: activeCampaignId,
            workspaceId: getCurrentWorkspaceId(),
            userId: currentUser?.id ?? "",
            applicationKey: "voiceup",
            role: "campaign_admin"
          }
        );
        if (!applied) return;
        setCampaignAdminSupabaseSessionOwned(
          shouldSignOutCampaignAdminSupabaseSession(marker, access)
        );
        return;
      }

      const { applied } = await verifyAndApplySecureFieldUploadAccess(getCurrentWorkspaceId());
      if (applied) setCampaignAdminSupabaseSessionOwned(false);
    }

    void refreshSecureFieldUploadAccess();
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
    if (!isPublicCampaignRoute && !isCampaignAdminRoute && startupMode !== "saas-workspace") return;
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

        if (isCampaignAdminRoute && adminCampaignSlug && startupMode !== "saas-workspace") {
          const campaignForAdminRoute = await loadPublicCampaign(adminCampaignSlug);
          if (isCancelled) return;
          if (campaignForAdminRoute) {
            setCampaigns([campaignForAdminRoute.campaign]);
            setSigners([]);
            setAuthorities(campaignForAdminRoute.authorities ?? []);
            if (campaignForAdminRoute.organization) setOrganization(campaignForAdminRoute.organization);
            setActiveCampaignId(campaignForAdminRoute.campaign.id);
            setCampaignFormMode("edit");
            setBackendMessage("Campaign loaded for admin login.");
          } else {
            setCampaigns([]);
            setSigners([]);
            setBackendMessage("Campaign admin link was not found.");
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
        setBackendMessage(
          isPublicCampaignRoute
            ? "Campaign could not be loaded. Please retry."
            : `Shared database error: ${error instanceof Error ? error.message : "Unable to connect"}`
        );
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
    adminCampaignSlug,
    isCampaignAdminRoute,
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
    const campaignFromPath = campaigns.find((c) =>
      publicCampaignSlugsMatch(c.slug, slugFromPath)
    );
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
    if (isCreateCommit) void assignCampaignCreator(campaignToCommit);
  }

  async function assignCampaignCreator(campaign: Campaign) {
    if (!isBackendConfigured) return;
    const [session, user] = await Promise.all([getCurrentAuthSession(), getCurrentAuthUser()]);
    if (!session || !user?.email) return;

    try {
      await assignCurrentWorkspaceMemberAsCampaignAdmin({
        workspaceId: getCurrentWorkspaceId(),
        campaignId: campaign.id,
        campaignSlug: campaign.slug
      });
      const assignedCampaign = applyCampaignAdminProvisioningSuccess(campaign, user.email);
      setCampaigns((current) => current.map((item) => (item.id === assignedCampaign.id ? assignedCampaign : item)));
      setCampaignDraft((current) => (current?.id === assignedCampaign.id ? assignedCampaign : current));
      addAuditLog("campaign.admin_provisioned", `Assigned the campaign creator as Campaign Admin for "${assignedCampaign.title}"`, assignedCampaign.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Campaign Admin assignment could not be completed.";
      showToast("Campaign Admin assignment pending", message);
    }
  }

  /**
   * Provisions (or safely re-provisions/replaces) the real Supabase Auth user and
   * workspace/resource assignment for a Campaign Admin, via the `provision-workspace-member`
   * Edge Function. This is the ONLY place a real Campaign Admin credential is created --
   * `campaign.adminPasscode` is never treated as authoritative and the submitted password is
   * never persisted into the workspace JSON blob.
   *
   * Requires the campaign to already be saved (present in `campaigns`), since provisioning
   * needs a stable campaign id to assign against, and requires the `campaign_admin_access`
   * entitlement (centralized via `getCampaignEntitlements`, never an ad-hoc plan check).
   * Calling this NEVER touches the SaaS Admin's own Supabase session -- it only forwards the
   * already-authenticated session's bearer token to the Edge Function via `functions.invoke`.
   */
  async function provisionCampaignAdminAccount(email: string, password: string) {
    if (!campaignDraft) return;

    const isSavedCampaign = campaigns.some((campaign) => campaign.id === campaignDraft.id);
    const entitlements = getCampaignEntitlements(organization);
    const gate = evaluateCampaignAdminProvisioningGate({
      isSavedCampaign,
      email,
      password,
      hasCampaignAdminAccessFeature: entitlements.features.campaign_admin_access === true,
      provisioningInProgress: campaignAdminProvisioningInFlightRef.current
    });

    if (!gate.allowed) {
      setCampaignAdminProvisioningMessage(gate.message);
      return;
    }

    // Fail-fast: provisioning calls a protected Edge Function that requires a real Supabase
    // user JWT. Never attempt the call without first confirming a real session (session +
    // user + access token all present) is actually held locally.
    const saasAdminSession = await getCurrentAuthSession();
    if (!saasAdminSession) {
      setCampaignAdminProvisioningMessage(SAAS_ADMIN_SESSION_DISCONNECTED_MESSAGE);
      return;
    }

    const trimmedEmail = email.trim();
    const wasAlreadyProvisioned = campaignDraft.adminProvisioningStatus === "provisioned";

    campaignAdminProvisioningInFlightRef.current = true;
    setCampaignAdminProvisioningPending(true);
    setCampaignAdminProvisioningMessage(CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.inProgress);
    try {
      await provisionWorkspaceMember({
        workspaceId: getCurrentWorkspaceId(),
        applicationKey: "voiceup",
        role: "campaign_admin",
        email: trimmedEmail,
        password,
        assignment: {
          resourceType: "campaign",
          resourceId: campaignDraft.id,
          resourceSlug: campaignDraft.slug
        }
      });

      // Only the email is saved for display/compatibility. The password is never
      // persisted -- Campaign Admin login is verified live against Supabase Auth.
      const provisionedCampaign = applyCampaignAdminProvisioningSuccess(campaignDraft, trimmedEmail);
      setCampaigns((current) =>
        current.map((c) => (c.id === provisionedCampaign.id ? provisionedCampaign : c))
      );
      setCampaignDraft(provisionedCampaign);
      addAuditLog(
        "campaign.admin_provisioned",
        `Provisioned Campaign Admin access for "${provisionedCampaign.title}"`,
        provisionedCampaign.id
      );
      setCampaignAdminProvisioningMessage(CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.success);
    } catch (error) {
      if (error instanceof ProvisionWorkspaceMemberError && error.code) {
        // Developer-only observability; never shown to the user and never includes the password.
        console.warn(`Campaign Admin provisioning failed (${error.code}).`);
      }
      const safeMessage = error instanceof Error ? error.message : "Unable to provision Campaign Admin access.";
      setCampaignAdminProvisioningMessage(formatCampaignAdminProvisioningFailure(safeMessage));
      if (!wasAlreadyProvisioned) {
        const failedCampaign = applyCampaignAdminProvisioningFailure(campaignDraft);
        setCampaigns((current) => current.map((c) => (c.id === failedCampaign.id ? failedCampaign : c)));
        setCampaignDraft(failedCampaign);
      }
    } finally {
      setCampaignAdminProvisioningPending(false);
      campaignAdminProvisioningInFlightRef.current = false;
    }
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
      // No real Campaign Admin credential is created here. `adminPasscode` is
      // intentionally left blank -- a real Supabase Auth user + workspace/resource
      // assignment must be provisioned explicitly (see `provisionCampaignAdminAccount`)
      // before Campaign Admin login is possible for this campaign.
      adminPasscode: "",
      adminProvisioningStatus: "unprovisioned",
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
    const form = event.currentTarget as HTMLFormElement;
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
    if (isBackendConfigured && !publicForm.otpVerificationToken) {
      publicSigningSubmissionRef.current = null;
      setPublicForm((current) => clearPublicSigningOtpState(current));
      setOtpCode("");
      setOtpInput("");
      setPublicOtpExpiresAt(0);
      setLastPublicOtpVerificationToken("");
      setPublicMessage("Your OTP verification expired. Request a new code and verify again.");
      return;
    }
    const hasAppealConsent = Boolean(
      (form.elements.namedItem("supportAppealConsent") as HTMLInputElement | null)?.checked
    );
    const hasCampaignConsent = Boolean(
      (form.elements.namedItem("campaignConsent") as HTMLInputElement | null)?.checked
    );
    const hasCommunicationConsent = Boolean(
      (form.elements.namedItem("campaignCommunicationConsent") as HTMLInputElement | null)?.checked
    );
    if (!hasAppealConsent || !hasCampaignConsent) {
      setPublicMessage("consent_required");
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
        const signerPayload = {
          ...restrictedPublicForm,
          selectedAuthorityId: signerAuthority.id,
          selectedAuthorityName: signerAuthority.name,
          referralCode: signerReferralCode,
          referredBy,
          referredByPhoneOrCode: referralInput,
          referralSource: referralInput ? restrictedPublicForm.referralSource ?? "manual" : undefined
        };
        const consentTemplate = buildPublicWebConsentPayload(activeCampaign.consentText ?? "");
        const submissionAttempt = createPublicSigningSubmissionAttempt(
          publicSigningSubmissionRef.current,
          {
            campaignId: activeCampaign.id,
            slug: publicParticipationSlug,
            action: "submit_support",
            signer: signerPayload,
            consent: {
              consentAccepted: consentTemplate.consentAccepted,
              consentText: consentTemplate.consentText,
              consentVersion: consentTemplate.consentVersion,
              consentSource: consentTemplate.consentSource
            },
            communicationConsent: hasCommunicationConsent
          },
          () => createPublicParticipationIdempotencyKey("support")
        );
        publicSigningSubmissionRef.current = submissionAttempt;
        const consentPayload = {
          ...consentTemplate,
          consentAcceptedAt: submissionAttempt.consentAcceptedAt
        };
        const result = await submitPublicSignatureSecure(
          publicParticipationSlug,
          signerPayload,
          consentPayload,
          hasCommunicationConsent,
          submissionAttempt.idempotencyKey
        );
        publicSigningSubmissionRef.current = null;
        if (typeof window !== "undefined" && publicSigningCampaignRef.current) {
          clearPublicSigningJourney(window.sessionStorage, publicSigningCampaignRef.current);
        }
        setPublicForm(blankSigner);
        setOtpCode("");
        setOtpInput("");
        setOtpMessage("");
        setPublicOtpExpiresAt(0);
        setLastPublicOtpVerificationToken("");
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
        if (error instanceof PublicSignatureSubmissionError && error.code === "consent_required") {
          setPublicMessage("consent_required");
          return;
        }
        if (
          error instanceof PublicSignatureSubmissionError &&
          (error.code === "otp_verification_required" || error.code === "invalid_idempotency_key")
        ) {
          publicSigningSubmissionRef.current = null;
          setPublicForm((current) => clearPublicSigningOtpState(current));
          setOtpCode("");
          setOtpInput("");
          setOtpMessage("");
          setPublicOtpExpiresAt(0);
          setLastPublicOtpVerificationToken("");
        }
        setPublicMessage(
          error instanceof PublicSignatureSubmissionError
            ? formatPublicSigningBackendError(error)
            : "Signature submission failed. Please retry."
        );
      }
      return;
    }
    const consentPayload = buildPublicWebConsentPayload(activeCampaign.consentText ?? "");
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
      signer.consentAccepted = true;
      signer.consentTextSnapshot = consentPayload.consentText;
      signer.consentVersion = consentPayload.consentVersion;
      signer.consentAcceptedAt = consentPayload.consentAcceptedAt;
      signer.consentSource = consentPayload.consentSource;
      signer.consentCampaignId = activeCampaign.id;
      signer.consentWorkspaceId = getCurrentWorkspaceId();
      signer.consentEvidence = {
        accepted: true,
        textSnapshot: consentPayload.consentText,
        version: consentPayload.consentVersion,
        acceptedAt: consentPayload.consentAcceptedAt,
        source: consentPayload.consentSource,
        campaignId: activeCampaign.id,
        workspaceId: getCurrentWorkspaceId()
      };
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
    publicSigningSubmissionRef.current = null;
    setOtpCode("");
    setOtpInput("");
    setOtpMessage("");
    setPublicOtpExpiresAt(0);
    setLastPublicOtpVerificationToken("");
    setLastSignedSigner(signer);
    setPublicMessage(
      signer.status === "duplicate"
        ? "Thanks. This looks like a duplicate, so it was sent to review."
        : "Thank you. Your signature has been recorded."
    );
  }

  function startNewPublicSigningJourney() {
    publicSigningSubmissionRef.current = null;
    if (typeof window !== "undefined" && publicSigningCampaignRef.current) {
      clearPublicSigningJourney(window.sessionStorage, publicSigningCampaignRef.current);
    }
    setPublicForm((current) => ({
      ...blankSigner,
      referredByPhoneOrCode: current.referredByPhoneOrCode,
      referralSource: current.referralSource
    }));
    setPublicMessage("");
    setOtpCode("");
    setOtpInput("");
    setOtpMessage("");
    setPublicOtpExpiresAt(0);
    setLastPublicOtpVerificationToken("");
    setLastSignedSigner(null);
  }

  async function sendOtp() {
    const phone = publicForm.phone.trim();
    if (!phone) { setOtpMessage("Enter phone number before requesting OTP."); return; }
    publicSigningSubmissionRef.current = null;
    if (typeof window !== "undefined" && publicSigningCampaignRef.current) {
      clearPublicSigningJourney(window.sessionStorage, publicSigningCampaignRef.current);
    }
    setPublicForm((current) => clearPublicSigningOtpState(current));
    setOtpCode("");
    setOtpInput("");
    setPublicOtpExpiresAt(0);
    setLastPublicOtpVerificationToken("");
    setOtpMessage("Requesting verification code...");
    try {
      const result = await requestPublicOtp(phone, "public-signing", {
        slug: publicParticipationSlug,
        campaignId: activeCampaign?.id ?? ""
      });
      const developmentOtp = import.meta.env.DEV ? result.developmentOtp : undefined;
      setPublicOtpExpiresAt(Date.now() + 10 * 60 * 1000);
      setOtpCode(developmentOtp ?? "");
      setPublicForm((current) => current.phone.trim() === phone
        ? {
            ...current,
            otpVerified: false,
            otpChallengeId: result.challengeId,
            otpVerificationToken: ""
          }
        : current
      );
      setOtpMessage(
        developmentOtp
          ? `${result.message} OTP: ${developmentOtp}`
          : result.message
      );
    } catch (error) {
      setPublicForm((current) => clearPublicSigningOtpState(current));
      setPublicOtpExpiresAt(0);
      setOtpMessage(
        error instanceof PublicSignatureSubmissionError
          ? formatPublicSigningBackendError(error)
          : "Verification code could not be sent. Please retry."
      );
    }
  }

  async function verifyOtp() {
    const phone = publicForm.phone.trim();
    if (!publicForm.otpChallengeId) { setOtpMessage("Request a verification code first."); return; }
    if (!otpInput.trim()) { setOtpMessage("Enter the verification code."); return; }
    setOtpMessage("Verifying phone number...");
    try {
      const result = await verifyPublicOtp(
        publicForm.otpChallengeId,
        phone,
        otpInput,
        "public-signing",
        {
          slug: publicParticipationSlug,
          campaignId: activeCampaign?.id ?? ""
        }
      );
      setOtpCode("");
      setLastPublicOtpVerificationToken(result.verificationToken);
      setPublicForm((current) => current.phone.trim() === phone
        ? {
            ...current,
            otpVerified: result.verified,
            otpVerificationToken: result.verificationToken
          }
        : current
      );
      setOtpMessage(result.message);
      if (isBackendConfigured && activeCampaign?.slug) {
        const resumed = await mutatePublicParticipation({
          slug: publicParticipationSlug,
          action: "resume_verified_supporter",
          phone,
          otpVerificationToken: result.verificationToken,
          idempotencyKey: createPublicParticipationIdempotencyKey("resume")
        });
        if (resumed.signer) {
          let restoredSigner = resumed.signer;
          if (resumed.signer.coordinatorApplication) {
            const synchronized = await mutatePublicParticipation({
              slug: publicParticipationSlug,
              action: "sync_coordinator_application_state",
              phone,
              otpVerificationToken: result.verificationToken,
              idempotencyKey: createPublicParticipationIdempotencyKey("coordinator-sync")
            });
            restoredSigner = synchronized.signer ?? restoredSigner;
          }
          setPublicForm((current) => {
            const restored = Object.fromEntries(
              Object.keys(blankSigner)
                .filter((key) => key in restoredSigner)
                .map((key) => [key, restoredSigner[key as keyof Signer]])
            );
            return {
              ...current,
              ...restored,
              phone,
              otpVerified: true,
              otpChallengeId: current.otpChallengeId,
              otpVerificationToken: result.verificationToken
            };
          });
          if (restoredSigner.status === "verified") setLastSignedSigner(restoredSigner);
          setPublicCampaignPayload((current) =>
            current?.campaign.id === activeCampaign.id
              ? { ...current, metrics: resumed.metrics }
              : current
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof PublicSignatureSubmissionError
          ? formatPublicSigningBackendError(error)
          : "Phone verification failed. Please retry.";
      if (
        /expir|challenge not found/i.test(message) ||
        (
          error instanceof PublicSignatureSubmissionError &&
          (error.code === "otp_verification_required" || error.code === "invalid_idempotency_key")
        )
      ) {
        publicSigningSubmissionRef.current = null;
        setPublicForm((current) => clearPublicSigningOtpState(current));
        setOtpCode("");
        setOtpInput("");
        setPublicOtpExpiresAt(0);
        setLastPublicOtpVerificationToken("");
      }
      setOtpMessage(message);
    }
  }

  async function saveVerifiedPublicDraft() {
    if (!isBackendConfigured || !activeCampaign || !publicParticipationSlug || !publicForm.otpVerificationToken) return;
    try {
      const saved = await mutatePublicParticipation({
        slug: publicParticipationSlug,
        action: "save_draft",
        phone: publicForm.phone,
        otpVerificationToken: publicForm.otpVerificationToken,
        idempotencyKey: createPublicParticipationIdempotencyKey("draft"),
        payload: {
          profile: {
            name: publicForm.name,
            email: publicForm.email,
            whatsappNumber: publicForm.whatsappNumber,
            telegramHandle: publicForm.telegramHandle,
            selectedAuthorityId: publicForm.selectedAuthorityId,
            selectedAuthorityName: publicForm.selectedAuthorityName,
            country: publicForm.country,
            state: publicForm.state,
            district: publicForm.district,
            block: publicForm.block,
            panchayat: publicForm.panchayat,
            address: publicForm.address,
            postalCode: publicForm.postalCode,
            comment: publicForm.comment,
            referredBy: publicForm.referredBy,
            referredByPhoneOrCode: publicForm.referredByPhoneOrCode,
            referralSource: publicForm.referralSource,
            referralCode: publicForm.referralCode
          },
          baseUpdatedAt: lastSignedSigner?.profileUpdatedAt ?? lastSignedSigner?.draftUpdatedAt
        }
      });
      if (saved.signer?.status === "verified") setLastSignedSigner(saved.signer);
    } catch (error) {
      if (
        error instanceof PublicSignatureSubmissionError &&
        (error.code === "otp_verification_required" || error.code === "invalid_idempotency_key")
      ) {
        publicSigningSubmissionRef.current = null;
        setPublicForm((current) => clearPublicSigningOtpState(current));
        setOtpCode("");
        setOtpInput("");
        setOtpMessage("");
        setPublicOtpExpiresAt(0);
        setLastPublicOtpVerificationToken("");
      }
      setPublicMessage(
        error instanceof PublicSignatureSubmissionError
          ? formatPublicSigningBackendError(error)
          : "Verified draft could not be saved."
      );
    }
  }

  async function updatePublicCommunicationConsent(granted: boolean) {
    if (!isBackendConfigured || !activeCampaign || !publicParticipationSlug || !publicForm.otpVerificationToken) return;
    const policy = buildPublicWebConsentPayload(activeCampaign.consentText ?? "");
    try {
      await mutatePublicParticipation({
        slug: publicParticipationSlug,
        action: "record_consents",
        phone: publicForm.phone,
        otpVerificationToken: publicForm.otpVerificationToken,
        idempotencyKey: createPublicParticipationIdempotencyKey("consent"),
        payload: {
          consents: {
            campaignCommunication: {
              granted,
              version: policy.consentVersion,
              policyId: policy.consentVersion
            }
          }
        }
      });
    } catch (error) {
      if (
        error instanceof PublicSignatureSubmissionError &&
        (error.code === "otp_verification_required" || error.code === "invalid_idempotency_key")
      ) {
        publicSigningSubmissionRef.current = null;
        setPublicForm((current) => clearPublicSigningOtpState(current));
        setOtpCode("");
        setOtpInput("");
        setOtpMessage("");
        setPublicOtpExpiresAt(0);
        setLastPublicOtpVerificationToken("");
      }
      setPublicMessage(
        error instanceof PublicSignatureSubmissionError
          ? formatPublicSigningBackendError(error)
          : "Communication preference could not be saved."
      );
    }
  }

  async function submitPublicCoordinatorApplication() {
    if (!isBackendConfigured || !activeCampaign || !publicParticipationSlug || !lastSignedSigner || !lastPublicOtpVerificationToken) {
      setPublicMessage("Verify your phone and complete support before applying.");
      return;
    }
    const policy = buildPublicWebConsentPayload(activeCampaign.consentText ?? "");
    try {
      const application = await mutatePublicParticipation({
        slug: publicParticipationSlug,
        action: "submit_coordinator_application",
        phone: lastSignedSigner.phone,
        otpVerificationToken: lastPublicOtpVerificationToken,
        idempotencyKey: createPublicParticipationIdempotencyKey("coordinator-application"),
        payload: {
          application: {
            requestedLevel: "field_coordinator",
            requestedGeography: {
              country: lastSignedSigner.country ?? "",
              state: lastSignedSigner.state,
              district: lastSignedSigner.district,
              block: lastSignedSigner.block,
              panchayat: lastSignedSigner.panchayat
            },
            experience: "",
            availability: "",
            coordinatorConsent: {
              granted: true,
              version: policy.consentVersion,
              policyId: policy.consentVersion
            }
          }
        }
      });
      if (application.signer) setLastSignedSigner(application.signer);
      setPublicMessage(application.message);
    } catch (error) {
      setPublicMessage(
        error instanceof PublicSignatureSubmissionError
          ? formatPublicSigningBackendError(error)
          : "Coordinator application could not be submitted."
      );
    }
  }

  async function uploadLastSupporterPhoto(file: File) {
    if (!activeCampaign || !lastSignedSigner || lastSignedSigner.campaignId !== activeCampaign.id) {
      throw new Error("Complete signing before adding an optional photo.");
    }
    if (!lastPublicOtpVerificationToken) {
      throw new Error("Verify your phone again before adding a private photo.");
    }
    const result = await uploadPublicSupporterPhoto({
      slug: publicParticipationSlug,
      supporterId: lastSignedSigner.id,
      phone: lastSignedSigner.phone,
      otpVerificationToken: lastPublicOtpVerificationToken,
      file
    });
    setLastSignedSigner(result.signer);
    setPublicMessage(result.message);
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
    const ocrDiagnosticId = metadata?.ocrDiagnosticId || createDocumentDiagnosticId(file.name);
    const sourceBatchId = metadata?.sourceBatchId.trim() || `batch-${capturedAt.slice(0, 10)}`;
    const baseItem = createScanReviewItem(activeCampaign.id, file.name, scanText);
    const workspaceId = secureFieldUploadAccess.workspaceId || getCurrentWorkspaceId();
    const privatePath = buildPrivateScanStoragePath(
      activeCampaign.id,
      sourceBatchId,
      baseItem.id,
      file.name
    );
    setIsScanning(true);
    setScanMessage(`Securely uploading ${file.name}. Handwriting may need manual correction.`);
    try {
      const uploadFingerprint = buildUploadFingerprint({
        workspaceId,
        campaignId: activeCampaign.id,
        fileSha256: await sha256Blob(file),
        fileSize: file.size
      });
      const sourceRowFingerprint = buildSourceRowFingerprint({
        workspaceId,
        campaignId: activeCampaign.id,
        uploadFingerprint,
        sourceReference: "row:0"
      });
      const uploaded = await uploadPrivateFileToStorage("campaign-private", privatePath, file);
      const commonItem = {
        ...baseItem,
        filePath: uploaded.path,
        uploadFingerprint,
        sourceRowFingerprint,
        reviewVersion: 1,
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
        const documentResult = await analyzeBusinessOsDocument(file, ocrDiagnosticId);
        const extractedText = documentResult.rawText.trim() || scanText;
        const legacyParsedSigner = parseSignerFromText(documentResult.normalizedText);
        const parsedSigner = {
          ...legacyParsedSigner,
          name: documentResult.fields.name,
          phone: documentResult.fields.mobile,
          address: documentResult.fields.village,
          panchayat: documentResult.fields.village,
          district: documentResult.fields.district,
          state: documentResult.fields.state
        };
        const item = {
          ...commonItem,
          extractedText,
          parsedSigner
        };
        logFieldCollectionTrace("REVIEW_OBJECT_BEFORE_SAVE", {
          diagnosticId: ocrDiagnosticId,
          ocrTextLength: documentResult.rawText.length,
          extractedName: parsedSigner.name,
          extractedMobile: parsedSigner.phone,
          reviewItemId: item.id,
          reviewItem: item
        });
        logDocumentIntelligenceStage(ocrDiagnosticId, "10. Final object passed to Human Verify", {
          reviewItem: item,
          documentIntelligence: documentResult
        });
        setScanItems((current) => [item, ...current]);
        setScanText(extractedText);
        setScanMessage(
          documentResult.cameraRecommended
            ? DOCUMENT_CAMERA_RECOMMENDATION_MESSAGE
            : "Private upload and OCR completed. Review this signer before approval."
        );
      } catch (ocrError) {
        const failureMessage = ocrError instanceof Error ? ocrError.message : "Unknown OCR execution error";
        logDocumentIntelligenceStage(ocrDiagnosticId, "6. Raw OCR text (first 500 characters)", {
          rawText: "",
          rawTextLength: 0,
          unavailableReason: "OCR_EXECUTION_FAILED",
          error: failureMessage
        });
        logDocumentIntelligenceStage(ocrDiagnosticId, "7. OCR confidence", {
          confidence: null,
          unavailableReason: "OCR_EXECUTION_FAILED"
        });
        logDocumentIntelligenceStage(ocrDiagnosticId, "8-9. Parsed fields and extraction reasons", {
          fields: {
            name: { value: "", reason: "OCR_EXECUTION_FAILED" },
            mobile: { value: "", reason: "OCR_EXECUTION_FAILED" },
            village: { value: "", reason: "OCR_EXECUTION_FAILED" },
            district: { value: "", reason: "OCR_EXECUTION_FAILED" },
            state: { value: "", reason: "OCR_EXECUTION_FAILED" }
          },
          fallbackSource: "Existing scan text template because OCR execution failed"
        });
        logDocumentIntelligenceStage(ocrDiagnosticId, "10. Final object passed to Human Verify", {
          reviewItem: commonItem
        });
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
    const baseItem = createScanReviewItem(activeCampaign.id, "manual-scan-entry.txt", scanText);
    const workspaceId = secureFieldUploadAccess.workspaceId || getCurrentWorkspaceId();
    const uploadFingerprint = buildUploadFingerprint({
      workspaceId,
      campaignId: activeCampaign.id,
      fileSha256: `legacy-review:${baseItem.id}`,
      fileSize: 0
    });
    const item = {
      ...baseItem,
      uploadFingerprint,
      sourceRowFingerprint: buildSourceRowFingerprint({
        workspaceId,
        campaignId: activeCampaign.id,
        uploadFingerprint,
        sourceReference: `review:${baseItem.id}`
      }),
      reviewVersion: 1
    };
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

  async function approveScan(scans: ScanReviewItem | ScanReviewItem[]): Promise<ScanApprovalCounts> {
    const requestedScans = Array.isArray(scans) ? scans : [scans];
    const counts = createScanApprovalCounts();
    if (!activeCampaign) {
      counts.failed = requestedScans.length;
      return counts;
    }

    const campaignId = activeCampaign.id;
    const workspaceId = secureFieldUploadAccess.workspaceId || getCurrentWorkspaceId();
    if (!isBackendConfigured || !workspaceId) {
      counts.failed = requestedScans.length;
      return counts;
    }

    const batchId = `field-approval:${campaignId}:${requestedScans.map((scan) => scan.id).sort().join(",")}`;
    if (requestedScans.length > 1) {
      try {
        await recordScanApprovalBatchAudit({
          workspaceId,
          campaignId,
          batchId,
          resultCode: "batch_started"
        });
      } catch {
        // The per-row transactional contract remains authoritative if batch telemetry fails.
      }
    }

    const completedSupporterIds = new Set<string>();
    for (const scan of requestedScans) {
      const sourceReference = scan.filePath ? "row:0" : `review:${scan.id}`;
      const uploadFingerprint = scan.uploadFingerprint ?? buildUploadFingerprint({
        workspaceId,
        campaignId,
        fileSha256: scan.filePath ? `legacy:${scan.filePath}` : `legacy-review:${scan.id}`,
        fileSize: 0
      });
      const sourceRowFingerprint = scan.sourceRowFingerprint ?? buildSourceRowFingerprint({
        workspaceId,
        campaignId,
        uploadFingerprint,
        sourceReference
      });
      const approvalKey = buildApprovalKey({
        workspaceId,
        campaignId,
        reviewItemId: scan.id,
        sourceRowFingerprint
      });
      const reviewPayload: ScanReviewItem = {
        ...scan,
        uploadFingerprint,
        sourceRowFingerprint,
        approvalKey,
        reviewVersion: scan.reviewVersion ?? 1
      };
      const result = await approveScanReviewItem({
        workspaceId,
        campaignId,
        reviewItemId: scan.id,
        expectedVersion: scan.reviewVersion ?? 1,
        uploadFingerprint,
        sourceReference,
        sourceRowFingerprint,
        approvalKey,
        reviewPayload,
        supporterFields: {
          ...scan.parsedSigner,
          scanFileName: scan.fileName,
          scanFileUrl: scan.fileUrl,
          scanFilePath: scan.filePath,
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
          confirmationStatus: getPaperSupporterConfirmationStatus(scan, false),
          reviewerNote: "Imported from scanned hard copy."
        },
        consent: {
          paperConsentRecorded: scan.paperConsentRecorded === true,
          smsConsent: scan.smsConsent ?? false,
          whatsappConsent: scan.whatsappConsent ?? false,
          noOngoingCommunications: scan.noOngoingCommunications ?? false,
          consentPurpose: scan.consentPurpose,
          consentCapturedAt: scan.consentCapturedAt,
          consentCapturedBy: scan.consentCapturedBy
        }
      });
      countScanApprovalResult(counts, result.code);
      if (requestedScans.length === 1) counts.operatorMessage = result.message;
      if (result.code === "approval_completed" && result.supporterId) {
        completedSupporterIds.add(result.supporterId);
      }
    }

    if (requestedScans.length > 1) {
      const hasPartialFailure = counts.skippedDuplicate > 0
        || counts.validationFailed > 0
        || counts.consentMissing > 0
        || counts.staleConflict > 0
        || counts.failed > 0;
      try {
        await recordScanApprovalBatchAudit({
          workspaceId,
          campaignId,
          batchId,
          resultCode: hasPartialFailure ? "batch_partial_failure" : "batch_completed",
          counts: {
            approved: counts.approved,
            alreadyApproved: counts.skippedAlreadyApproved,
            duplicatesBlocked: counts.skippedDuplicate,
            validationFailed: counts.validationFailed,
            consentMissing: counts.consentMissing,
            staleConflict: counts.staleConflict,
            systemFailed: counts.failed
          }
        });
      } catch {
        // Approval results remain committed independently of batch telemetry.
      }
    }

    try {
      const authoritative = await loadAuthoritativeFieldCollectionState(workspaceId, campaignId);
      const approvedReviews = authoritative.reviewItems.filter((item) => item.status === "Approved");
      const authoritativeReviewIds = new Set(approvedReviews.map((item) => item.id));
      const authoritativeSupporterIds = new Set(authoritative.supporters.map((signer) => signer.id));
      const authoritativeSourceIds = new Set(
        authoritative.supporters
          .map((signer) => signer.sourceScanItemId)
          .filter((id): id is string => Boolean(id))
      );
      const authoritativeAuditIds = new Set(authoritative.auditLogs.map((entry) => entry.id));
      const mergedSigners = [
        ...authoritative.supporters,
        ...signers.filter(
          (signer) => !authoritativeSupporterIds.has(signer.id)
            && (!signer.sourceScanItemId || !authoritativeSourceIds.has(signer.sourceScanItemId))
        )
      ];

      setScanItems((current) => [
        ...approvedReviews,
        ...current.filter((item) => !authoritativeReviewIds.has(item.id))
      ]);
      setSigners((current) => [
        ...authoritative.supporters,
        ...current.filter(
          (signer) => !authoritativeSupporterIds.has(signer.id)
            && (!signer.sourceScanItemId || !authoritativeSourceIds.has(signer.sourceScanItemId))
        )
      ]);
      setAuditLogs((current) => [
        ...authoritative.auditLogs,
        ...current.filter((entry) => !authoritativeAuditIds.has(entry.id))
      ].slice(0, 500));
      setConfirmationQueue((current) => {
        let next = current;
        authoritative.supporters
          .filter((signer) => completedSupporterIds.has(signer.id))
          .forEach((signer) => {
            const additions = createConfirmationQueueItems({
              workspaceId,
              campaign: activeCampaign,
              signer,
              currentQueue: next,
              createId
            });
            if (additions.length > 0) next = [...additions, ...next];
          });
        return next;
      });
      authoritative.supporters
        .filter((signer) => completedSupporterIds.has(signer.id))
        .forEach((signer) => recordGrowthLifecycle("supporter_signed", signer, mergedSigners));
    } catch {
      setScanMessage("Approval was saved securely. Refresh Field Collection to reload the authoritative result.");
    }

    return counts;
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

  // ─── Centralized entitlement lifecycle handlers ──────────────────────────
  // Each of these delegates the actual state transition to a pure function in
  // `./entitlements` and then merges the returned organization + audit entry
  // back into state, keeping the workspace audit trail in sync too.
  function upgradeSubscriptionPlan(planName: BillingPlan) {
    const { organization: next, auditEntry } = applyUpgradePlan(organization, planName, getCurrentActorEmail());
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? `Upgraded to ${planName}`);
  }

  function downgradeSubscriptionPlan(planName: BillingPlan, effective: "immediately" | "period_end" = "period_end") {
    const { organization: next, auditEntry } = applyDowngradePlan(organization, planName, getCurrentActorEmail(), {
      effective
    });
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? `Downgraded to ${planName}`);
  }

  function renewSubscriptionPeriod(periodDays: number) {
    const { organization: next, auditEntry } = applyRenewSubscription(organization, getCurrentActorEmail(), {
      periodDays
    });
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? "Renewed subscription");
  }

  function extendSubscriptionPeriod(extraDays: number) {
    const { organization: next, auditEntry } = applyExtendSubscriptionDuration(
      organization,
      getCurrentActorEmail(),
      extraDays
    );
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? `Extended subscription by ${extraDays} days`);
  }

  function suspendSubscriptionWithReason(reason: string) {
    const { organization: next, auditEntry } = applySuspendSubscription(organization, getCurrentActorEmail(), reason);
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? "Suspended subscription");
  }

  function reactivateSuspendedSubscription() {
    const { organization: next, auditEntry } = applyReactivateSubscription(organization, getCurrentActorEmail());
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? "Reactivated subscription");
  }

  function cancelSubscriptionLifecycle(atPeriodEnd: boolean) {
    const { organization: next, auditEntry } = applyCancelSubscription(organization, getCurrentActorEmail(), {
      atPeriodEnd
    });
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? "Cancelled subscription");
  }

  function changeSubscriptionBillingCycle(cadence: BillingCadence) {
    const { organization: next, auditEntry } = applyChangeBillingCycle(organization, getCurrentActorEmail(), cadence);
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? `Billing cycle changed to ${cadence}`);
  }

  function purchaseEntitlementAddOn(request: AddOnPurchaseRequest) {
    const { organization: next, auditEntry } = applyPurchaseAddOn(organization, getCurrentActorEmail(), request);
    setOrganization(next);
    addAuditLog("integration.updated", auditEntry.reason ?? "Purchased add-on");
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
    if (campaignAdminLoginInFlightRef.current) return;

    const submittedEmail = adminLogin.email.trim();
    const submittedPassword = adminLogin.passcode.trim();
    const expectedEmail = getCampaignAdminEmail(activeCampaign);
    if (!expectedEmail) {
      setAdminLoginMessage(CAMPAIGN_ADMIN_ACCESS_MESSAGES.provisioningIncomplete);
      return;
    }
    if (!submittedEmail || !submittedPassword) {
      setAdminLoginMessage("Enter your Campaign Admin email and password.");
      return;
    }
    // Non-authoritative, defense-in-depth check only: avoids attempting a Supabase sign-in
    // for an obviously wrong email. The REAL authorization is the signInWithPassword() call
    // below plus the database-verified assignment/membership/entitlement checks that follow --
    // campaign.adminEmail/adminPasscode are never treated as the authoritative credential.
    if (submittedEmail.toLowerCase() !== expectedEmail.trim().toLowerCase()) {
      setAdminLoginMessage(CAMPAIGN_ADMIN_ACCESS_MESSAGES.authenticationFailure);
      return;
    }
    if (!isSupabaseAuthAvailable) {
      setAdminLoginMessage("Campaign Admin login requires Supabase Auth to be configured.");
      return;
    }

    campaignAdminLoginInFlightRef.current = true;
    setAdminLoginMessage("");

    const workspaceId = getCurrentWorkspaceId();
    let authenticatedUserId = "";
    let sessionOwnership = readSupabaseSessionOwnership();
    try {
      const existingUser = await getCurrentAuthUser();
      // Always call signInWithPassword() to verify the SUBMITTED credentials -- an existing
      // ambient Supabase session (e.g. left over from a SaaS Admin or a different Campaign
      // Admin) is never reused or trusted as-is for this login attempt. Any Supabase Auth
      // error (wrong password, unknown user, rate limit, etc.) is normalized to the exact
      // safe user-facing message below -- the raw Supabase error text is never surfaced.
      let authenticatedUser: Awaited<ReturnType<typeof signInWithSupabase>>;
      try {
        authenticatedUser = await signInWithSupabase(submittedEmail, submittedPassword);
      } catch {
        throw new Error(CAMPAIGN_ADMIN_ACCESS_MESSAGES.authenticationFailure);
      }
      if (!authenticatedUser) {
        throw new Error(CAMPAIGN_ADMIN_ACCESS_MESSAGES.authenticationFailure);
      }
      authenticatedUserId = authenticatedUser.id;
      // The authenticated identity must match the submitted email -- never trust a session
      // whose Auth-verified email differs from what was submitted.
      if ((authenticatedUser.email ?? "").trim().toLowerCase() !== submittedEmail.toLowerCase()) {
        throw new Error(CAMPAIGN_ADMIN_ACCESS_MESSAGES.authenticationFailure);
      }

      sessionOwnership = resolveSupabaseSessionOwnership(
        existingUser?.id ?? "",
        authenticatedUser.id,
        "campaign_admin",
        sessionOwnership
      );
      if (sessionOwnership) writeSupabaseSessionOwnership(sessionOwnership);

      const [assignmentContext, entitlements] = await Promise.all([
        resolveCampaignAdminAssignmentContext(
          workspaceId,
          activeCampaign.id,
          activeCampaign.slug,
          authenticatedUser.id,
          "voiceup",
          "campaign_admin"
        ),
        Promise.resolve(getCampaignEntitlements(organization))
      ]);

      const loginAccess = evaluateCampaignAdminLoginAccess({
        authenticatedUserId: authenticatedUser.id,
        resourceId: activeCampaign.id,
        resourceSlug: activeCampaign.slug,
        assignment: assignmentContext.assignment,
        workspaceMembershipActive: assignmentContext.workspaceMembershipActive,
        hasValidWorkspaceMembershipRole: assignmentContext.hasValidWorkspaceMembershipRole,
        subscriptionActive: !entitlements.isSuspended && !entitlements.isCancelled && !entitlements.isExpired,
        hasCampaignAdminAccessFeature: entitlements.features.campaign_admin_access === true
      });

      if (!loginAccess.authorized) {
        if (isSupabaseSessionOwnedBy(sessionOwnership, "campaign_admin", authenticatedUser.id)) {
          await signOutSupabase();
          clearSupabaseSessionOwnership("campaign_admin", authenticatedUser.id);
        }
        clearCampaignAdminSupabaseSession(activeCampaign.slug);
        setAdminLoginMessage(loginAccess.message);
        return;
      }

      // Only after every real (DB/Auth-verified) check has passed do we write the session
      // marker and mark this slug as authenticated.
      writeCampaignAdminSupabaseSession({
        slug: activeCampaign.slug,
        userId: authenticatedUser.id,
        workspaceId,
        resourceId: activeCampaign.id,
        email: submittedEmail.toLowerCase(),
        schemaVersion: CAMPAIGN_ADMIN_SESSION_MARKER_SCHEMA_VERSION,
        applicationKey: "voiceup",
        role: "campaign_admin",
        resourceType: "campaign",
        issuedAt: new Date().toISOString()
      });
      const nextAuth = { ...authenticatedAdminSlugs, [activeCampaign.slug]: true };
      setAuthenticatedAdminSlugs(nextAuth);
      writeAuthenticatedAdminSlugs(nextAuth);
      setAdminLogin(blankAdminLogin);
      setAdminLoginMessage("");

      // Secure field-upload access is a separate, additional concern from login itself --
      // evaluated here for the storage/upload UI, but never used to gate the login above.
      const { access, applied } = await verifyAndApplySecureFieldUploadAccess(workspaceId, authenticatedUser, {
        slug: activeCampaign.slug,
        resourceId: activeCampaign.id,
        workspaceId,
        userId: authenticatedUser.id,
        applicationKey: "voiceup",
        role: "campaign_admin"
      });
      if (applied) setCampaignAdminSupabaseSessionOwned(true);
      setScanMessage(access.message);
      setBackendMessage(access.message);
    } catch (error) {
      if (
        authenticatedUserId
        && isSupabaseSessionOwnedBy(sessionOwnership, "campaign_admin", authenticatedUserId)
      ) {
        await signOutSupabase();
        clearSupabaseSessionOwnership("campaign_admin", authenticatedUserId);
      }
      clearCampaignAdminSupabaseSession(activeCampaign.slug);
      resetSecureFieldUploadAccess(
        evaluateSecureFieldUploadAccess({
          supabaseConfigured: true,
          storageProvider: integrations.storageProvider,
          currentWorkspaceId: workspaceId
        })
      );
      setAdminLoginMessage(
        error instanceof Error ? error.message : CAMPAIGN_ADMIN_ACCESS_MESSAGES.authenticationFailure
      );
    } finally {
      campaignAdminLoginInFlightRef.current = false;
    }
  }

  async function logoutCampaignAdmin() {
    if (!activeCampaign) return;
    const nextAuth = { ...authenticatedAdminSlugs, [activeCampaign.slug]: false };
    setAuthenticatedAdminSlugs(nextAuth);
    writeAuthenticatedAdminSlugs(nextAuth);
    clearCampaignAdminSupabaseSession(activeCampaign.slug);
    resetSecureFieldUploadAccess(
      evaluateSecureFieldUploadAccess({
        supabaseConfigured: isBackendConfigured,
        storageProvider: integrations.storageProvider,
        currentWorkspaceId: getCurrentWorkspaceId()
      })
    );
    if (campaignAdminSupabaseSessionOwned) {
      const currentUser = await getCurrentAuthUser();
      const ownership = readSupabaseSessionOwnership();
      if (isSupabaseSessionOwnedBy(ownership, "campaign_admin", currentUser?.id ?? "")) {
        await signOutSupabase();
        clearSupabaseSessionOwnership("campaign_admin", currentUser?.id ?? "");
      }
    }
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

    // The configured VITE_VOICEUP_APP_ADMIN_EMAIL/PASSCODE fallback remains available as
    // development configuration ONLY when Supabase Auth itself is not configured at all
    // (pure local-mvp mode, where there is no protected Edge Function to call). Whenever
    // Supabase Auth IS available, this fallback must never independently authenticate --
    // Campaign Admin provisioning calls a protected Edge Function that requires a real
    // Supabase user JWT, so only a real signInWithPassword() session plus a live
    // platform_owner authorization check may grant SaaS Admin access.
    const allowLocalFallback = !isSupabaseAuthAvailable;

    let supabaseUser = null;
    let platformSessionOwnership = readSupabaseSessionOwnership();
    let platformLoginOwnsSession = false;

    if (isSupabaseAuthAvailable) {
      try {
        const existingUser = await getCurrentAuthUser();
        const signedInUser = await signInWithSupabase(email, passcode);
        // Require a real, locally-held session (session + user + access token) in addition
        // to the user object signInWithPassword() returns -- never trust authentication
        // without all three actually present.
        const session = signedInUser ? await getCurrentAuthSession() : null;
        if (!signedInUser || !session) {
          throw new Error(SAAS_ADMIN_AUTH_FAILURE_MESSAGE);
        }
        supabaseUser = signedInUser;

        platformSessionOwnership = resolveSupabaseSessionOwnership(
          existingUser?.id ?? "",
          supabaseUser.id,
          "platform_admin",
          platformSessionOwnership
        );
        if (platformSessionOwnership) writeSupabaseSessionOwnership(platformSessionOwnership);
        platformLoginOwnsSession = isSupabaseSessionOwnedBy(
          platformSessionOwnership,
          "platform_admin",
          supabaseUser.id
        );
      } catch {
        supabaseUser = null;
      }
    }

    if (supabaseUser) {
      try {
        const context = await getAuthContext();
        if (context.platformAdmin) {
          clearPlatformAdminSession();
          setPlatformAdminSupabaseSessionOwned(platformLoginOwnsSession);
          setIsPlatformAdminAuthenticated(true);
          setIsCustomerWorkspaceAuthenticated(Boolean(context.workspaceMember || context.customerWorkspace));
          setActiveTab("dashboard");
          setAppLogin(blankAppLogin);
          setAppLoginMessage("");
          addAuditLog("auth.login", `SaaS admin logged in with Supabase Auth: ${supabaseUser.email ?? email}`);
          return;
        }

        if (platformLoginOwnsSession) {
          await signOutSupabase();
          clearSupabaseSessionOwnership("platform_admin", supabaseUser.id);
        }
        setPlatformAdminSupabaseSessionOwned(false);
        setIsPlatformAdminAuthenticated(false);
        setAppLoginMessage(
          context.role
            ? `Authenticated Supabase user has ${context.role} access, not platform_owner.`
            : "Authenticated Supabase user does not have a platform_owner membership row."
        );
        return;
      } catch (error) {
        if (platformLoginOwnsSession) {
          await signOutSupabase();
          clearSupabaseSessionOwnership("platform_admin", supabaseUser.id);
        }
        setPlatformAdminSupabaseSessionOwned(false);
        setIsPlatformAdminAuthenticated(false);
        const roleMessage = error instanceof Error ? error.message : "Unable to verify platform role";
        setAppLoginMessage(`Supabase Auth login succeeded, but role verification failed: ${roleMessage}.`);
        return;
      }
    }

    if (allowLocalFallback && matchesConfiguredPlatformAdminCredentials(email, passcode)) {
      writePlatformAdminSession(email);
      setPlatformAdminSupabaseSessionOwned(false);
      setIsPlatformAdminAuthenticated(true);
      setIsCustomerWorkspaceAuthenticated(false);
      setActiveTab("dashboard");
      setAppLogin(blankAppLogin);
      setAppLoginMessage("");
      addAuditLog("auth.login", `SaaS admin logged in with configured fallback credentials: ${email}`);
      return;
    }

    setIsPlatformAdminAuthenticated(false);
    setAppLoginMessage(SAAS_ADMIN_AUTH_FAILURE_MESSAGE);
  }

  async function logoutAppAdmin() {
    if (isSaasAdminRoute) {
      if (isSupabaseAuthAvailable && platformAdminSupabaseSessionOwned) {
        const currentUser = await getCurrentAuthUser();
        const ownership = readSupabaseSessionOwnership();
        if (isSupabaseSessionOwnedBy(ownership, "platform_admin", currentUser?.id ?? "")) {
          await signOutSupabase();
          clearSupabaseSessionOwnership("platform_admin", currentUser?.id ?? "");
        }
      }
      clearPlatformAdminSession();
      clearCustomerSessionToken();
      setPlatformAdminSupabaseSessionOwned(false);
      setIsPlatformAdminAuthenticated(false);
      window.location.assign("/");
      return;
    }
    if (isSupabaseAuthAvailable && platformAdminSupabaseSessionOwned) {
      const currentUser = await getCurrentAuthUser();
      const ownership = readSupabaseSessionOwnership();
      if (isSupabaseSessionOwnedBy(ownership, "platform_admin", currentUser?.id ?? "")) {
        await signOutSupabase();
        clearSupabaseSessionOwnership("platform_admin", currentUser?.id ?? "");
      }
    }
    clearPlatformAdminSession();
    clearCustomerSessionToken();
    setIsCustomerWorkspaceAuthenticated(false);
    setPlatformAdminSupabaseSessionOwned(false);
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
    setLastPublicOtpVerificationToken("");
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
          onStartNewJourney={startNewPublicSigningJourney}
          onSendOtp={sendOtp}
          onVerifyOtp={verifyOtp}
          onGrowthShare={recordPublicShareGrowth}
          onUploadSupporterPhoto={isBackendConfigured ? uploadLastSupporterPhoto : undefined}
          onSaveDraft={isBackendConfigured ? saveVerifiedPublicDraft : undefined}
          onCommunicationConsentChange={isBackendConfigured ? updatePublicCommunicationConsent : undefined}
          onSubmitCoordinatorApplication={isBackendConfigured ? submitPublicCoordinatorApplication : undefined}
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
        campaignAdminSessionEmail={campaignAdminSessionEmail}
        campaignAdminCampaignId={isCampaignAdminRoute ? activeCampaign?.id ?? "" : ""}
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
        onStartPublicSigningJourney={startNewPublicSigningJourney}
        onSendOtp={sendOtp}
        onVerifyOtp={verifyOtp}
        onSavePublicDraft={isBackendConfigured ? saveVerifiedPublicDraft : undefined}
        onPublicCommunicationConsentChange={isBackendConfigured ? updatePublicCommunicationConsent : undefined}
        onSubmitPublicCoordinatorApplication={isBackendConfigured ? submitPublicCoordinatorApplication : undefined}
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
        onProvisionCampaignAdmin={provisionCampaignAdminAccount}
        campaignAdminProvisioningPending={campaignAdminProvisioningPending}
        campaignAdminProvisioningMessage={campaignAdminProvisioningMessage}
        onSelectSubscriptionPlan={selectSubscriptionPlan}
        onStartOneDayTrial={startOneDayTrial}
        onActivateSubscriptionManually={activateSubscriptionManually}
        onMarkSubscriptionPastDue={markSubscriptionPastDue}
        onCancelSubscription={cancelSubscription}
        onApplyCommercialPackage={applyCommercialPackage}
        onUpgradeSubscriptionPlan={upgradeSubscriptionPlan}
        onDowngradeSubscriptionPlan={downgradeSubscriptionPlan}
        onRenewSubscriptionPeriod={renewSubscriptionPeriod}
        onExtendSubscriptionPeriod={extendSubscriptionPeriod}
        onSuspendSubscriptionWithReason={suspendSubscriptionWithReason}
        onReactivateSuspendedSubscription={reactivateSuspendedSubscription}
        onCancelSubscriptionLifecycle={cancelSubscriptionLifecycle}
        onChangeSubscriptionBillingCycle={changeSubscriptionBillingCycle}
        onPurchaseEntitlementAddOn={purchaseEntitlementAddOn}
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
