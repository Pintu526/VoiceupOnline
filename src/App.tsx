import { FormEvent, useEffect, useMemo, useState } from "react";
import * as Toast from "@radix-ui/react-toast";
import { LandingPage } from "./components/LandingPage";
import {
  initialAuthorities,
  initialCampaigns,
  initialCommercialPackages,
  initialIntegrationSettings,
  initialOrganization,
  initialSigners,
  subscriptionPlans
} from "./data";
import {
  isBackendConfigured,
  isSupabaseAuthAvailable,
  isSupabaseStorageAvailable,
  loadRemoteState,
  saveRemoteState,
  signInWithSupabase,
  signOutSupabase,
  uploadFileToStorage
} from "./backend";
import {
  createId,
  createScanReviewItem,
  detectDuplicate,
  getCampaignMetrics,
  getCampaignSigners,
  groupSignersByLocation,
  groupSignersByDay,
  groupSignersByWeek,
  makePublicSigner
} from "./lib";
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
  IntegrationSettings,
  Organization,
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
  getIsSaasAdminRoute,
  getLegalPage,
  getPublicCampaignSlug
} from "./utils/routing";
import { updateSeoMetadata } from "./utils/seo";
import {
  createAdminPasscode,
  getCampaignAdminEmail,
  getCampaignAdminPasscode,
  getCurrentActorEmail,
  areAppAdminCredentialsConfigured,
  getAppAdminEmail,
  getAppAdminPasscode,
  readAppAuth,
  readAuthenticatedAdminSlugs,
  writeAppAuth,
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
  getSubscriptionPlan
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

// Pages
import { MarketingHomePage } from "./pages/MarketingHomePage";
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
const adminCampaignSlug = getCampaignAdminSlug();
const isAppRoute = getIsAppRoute();
const isSaasAdminRoute = getIsSaasAdminRoute();
const legalPage = getLegalPage();
const isLandingPageRoute = getIsLandingPageRoute();
const isPublicCampaignRoute = Boolean(publicCampaignSlug);
const isCampaignAdminRoute = Boolean(adminCampaignSlug);

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
  const [auditLogs, setAuditLogs] = usePersistentState<AuditLogEntry[]>(
    `${storagePrefix}-audit-logs`,
    []
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
    "dashboard" | "command" | "campaigns" | "public" | "movement" | "scans" | "reports" | "engagement" | "activity" | "saas" | "ideas"
  >(isSaasAdminRoute ? "saas" : "dashboard");
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
  const [adminLogin, setAdminLogin] = useState(blankAdminLogin);
  const [adminLoginMessage, setAdminLoginMessage] = useState("");
  const [appLogin, setAppLogin] = useState(blankAppLogin);
  const [appLoginMessage, setAppLoginMessage] = useState("");
  const [isAppAuthenticated, setIsAppAuthenticated] = useState(() => readAppAuth());
  const [saasSection, setSaasSection] = useState<
    "organization" | "usage" | "packages" | "integrations" | "plans"
  >("organization");
  const [authenticatedAdminSlugs, setAuthenticatedAdminSlugs] = useState<
    Record<string, boolean>
  >(() => readAuthenticatedAdminSlugs());

  // ─── Derived / memoised ──────────────────────────────────────────────────
  const activeCampaign = useMemo(
    () =>
      publicCampaignSlug
        ? campaigns.find((c) => c.slug === publicCampaignSlug)
        : adminCampaignSlug
          ? campaigns.find((c) => c.slug === adminCampaignSlug)
          : campaigns.find((c) => c.id === activeCampaignId) ?? campaigns[0],
    [activeCampaignId, campaigns]
  );
  const campaignSigners = useMemo(
    () => (activeCampaign ? getCampaignSigners(activeCampaign.id, signers) : []),
    [activeCampaign, signers]
  );
  const metrics = useMemo(
    () => (activeCampaign ? getCampaignMetrics(activeCampaign, signers) : emptyMetrics),
    [activeCampaign, signers]
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
    const campaignAdminItems = [
      { label: "Dashboard", detail: "Open campaign overview", action: () => setActiveTab("dashboard") },
      { label: "Campaign admin", detail: "Edit campaign settings", action: () => setActiveTab("campaigns") },
      { label: "Public signing", detail: "Preview signup page", action: () => setActiveTab("public") },
      { label: "Movement CRM", detail: "Open supporter and volunteer graph", action: () => setActiveTab("movement") },
      { label: "Reports", detail: "Open analytics and exports", action: () => setActiveTab("reports") },
      { label: "Engagement", detail: "Message participants", action: () => setActiveTab("engagement") },
      { label: "Activity", detail: "Review admin activity", action: () => setActiveTab("activity") }
    ];
    if (isCampaignAdminRoute) return campaignAdminItems;
    return [
      ...campaignAdminItems,
      { label: "SaaS admin", detail: "Subscription and integrations", action: () => setActiveTab("saas") },
      { label: "Create campaign", detail: "Start a new campaign", action: createCampaign },
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
  }, [campaigns, isCampaignAdminRoute]);

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
    updateSeoMetadata(activeCampaign, legalPage, isPublicCampaignRoute);
  }, [activeCampaign]);

  useEffect(() => {
    if (!campaigns.some((c) => c.id === activeCampaignId)) {
      setActiveCampaignId(campaigns[0]?.id ?? "");
    }
  }, [activeCampaignId, campaigns]);

  useEffect(() => {
    if (!isBackendConfigured) return;
    let isCancelled = false;

    async function loadSharedState() {
      try {
        const remoteState = await loadRemoteState();
        if (isCancelled) return;

        if (remoteState) {
          const remoteCampaigns = remoteState.campaigns ?? [];
          if (remoteCampaigns.length === 0 && campaigns.length > 0) {
            const localState = createRemoteState({
              campaigns, signers, authorities, organization, scanItems,
              locationOverrides, locationDeletions, auditLogs, integrations, commercialPackages
            });
            await saveRemoteState(localState);
            if (isCancelled) return;
            setBackendMessage(`Uploaded ${campaigns.length} local campaign(s) to shared database.`);
            return;
          }
          setCampaigns(remoteState.campaigns ?? []);
          setSigners(remoteState.signers ?? []);
          setAuthorities(remoteState.authorities ?? initialAuthorities);
          setOrganization(remoteState.organization ?? initialOrganization);
          setScanItems(remoteState.scanItems ?? []);
          setLocationOverrides((current) =>
            mergeLocationOverrides(remoteState.locationOverrides ?? {}, current)
          );
          setLocationDeletions(remoteState.locationDeletions ?? emptyLocationDeletions);
          setAuditLogs(remoteState.auditLogs ?? []);
          setIntegrations(remoteState.integrations ?? initialIntegrationSettings);
          setCommercialPackages(remoteState.commercialPackages ?? initialCommercialPackages);
          setBackendMessage(`Shared campaign database connected (${remoteCampaigns.length} campaign(s)).`);
        } else {
          if (campaigns.length > 0) {
            const localState = createRemoteState({
              campaigns, signers, authorities, organization, scanItems,
              locationOverrides, locationDeletions, auditLogs, integrations, commercialPackages
            });
            await saveRemoteState(localState);
            if (isCancelled) return;
            setBackendMessage(`Created shared database workspace with ${campaigns.length} campaign(s).`);
          } else {
            setBackendMessage("Shared campaign database ready. Create or save a campaign to publish it.");
          }
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
    setAuthorities, setAuditLogs, setCampaigns, setCommercialPackages,
    setIntegrations, setLocationDeletions, setLocationOverrides,
    setOrganization, setScanItems, setSigners
  ]);

  useEffect(() => {
    if (!isBackendConfigured || !remoteStateLoaded) return;
    const timeoutId = window.setTimeout(() => {
      const state = createRemoteState({
        campaigns, signers, authorities, organization, scanItems,
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
    authorities, auditLogs, campaigns, commercialPackages, integrations,
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
    setCampaigns((current) => {
      if (campaignFormMode === "create" || !isExistingCampaign) {
        return [...current, governedCampaignDraft];
      }
      return current.map((c) => (c.id === governedCampaignDraft.id ? governedCampaignDraft : c));
    });
    setActiveCampaignId(governedCampaignDraft.id);
    setCampaignDraft(governedCampaignDraft);
    setCampaignFormMode("edit");
    addAuditLog(
      campaignFormMode === "create" || !isExistingCampaign ? "campaign.created" : "campaign.saved",
      `${campaignFormMode === "create" || !isExistingCampaign ? "Created" : "Saved"} campaign "${governedCampaignDraft.title}"`,
      governedCampaignDraft.id
    );
  }

  function createCampaign() {
    const blockReason = getCreateCampaignBlockReason(organization, campaigns);
    if (blockReason) {
      setBackendMessage(blockReason);
      setActiveTab("saas");
      return;
    }
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
        "I consent to this organization storing my details and using them only for this campaign submission in India.",
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
      qrLabel: "VOICEUP-INDIA-CAMPAIGN",
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

  function publishCampaign() {
    if (!campaignDraft) return;
    if (campaignDraft.publishingLockedBySaas && isCampaignAdminRoute) {
      setBackendMessage("Publishing is locked by SaaS admin for this campaign.");
      return;
    }
    const blockReason = getPublishCampaignBlockReason(campaignDraft, organization, campaigns);
    if (blockReason) {
      setBackendMessage(blockReason);
      setActiveTab("saas");
      return;
    }
    if (organization.subscriptionStatus === "Trial" && !organization.trialEndsAt) {
      setOrganization({ ...organization, trialEndsAt: getTomorrowDate() });
    }
    const publishedCampaign = applyLocationGovernanceToCampaign({
      ...campaignDraft,
      status: "Published" as const,
      shareUrl: getCampaignPublicUrl(organization, campaignDraft),
      adminUrl: getCampaignAdminUrl(organization, campaignDraft)
    }, organization);
    const isExistingCampaign = campaigns.some((campaign) => campaign.id === publishedCampaign.id);
    setCampaignDraft(publishedCampaign);
    setCampaigns((current) => {
      if (campaignFormMode === "create" || !isExistingCampaign) {
        return [...current, publishedCampaign];
      }
      return current.map((c) => (c.id === publishedCampaign.id ? publishedCampaign : c));
    });
    setActiveCampaignId(publishedCampaign.id);
    setCampaignFormMode("edit");
    addAuditLog("campaign.published", `Published campaign "${publishedCampaign.title}"`, publishedCampaign.id);
  }

  function submitPublicSignature(event: FormEvent) {
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
    const signer = makePublicSigner(
      activeCampaign.id,
      {
        ...restrictedPublicForm,
        selectedAuthorityId: signerAuthority.id,
        selectedAuthorityName: signerAuthority.name,
        comment: `Accepted published appeal to ${signerAuthority.name}: ${activeCampaign.appealContent || activeCampaign.description}`
      },
      campaignSigners
    );
    setSigners((current) => [signer, ...current]);
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
      `OTP generated: ${nextOtp}. For production, connect SMS/WhatsApp provider to send this automatically.`
    );
  }

  function verifyOtp() {
    if (!otpCode) { setOtpMessage("Generate OTP first."); return; }
    if (otpInput.trim() !== otpCode) { setOtpMessage("Invalid OTP."); return; }
    setPublicForm({ ...publicForm, otpVerified: true });
    setOtpMessage("Phone number verified.");
  }

  async function uploadScan(file: File) {
    if (!activeCampaign) { setScanMessage("Create a campaign before uploading scanned signatures."); return; }
    if (
      activeCampaign.maxScansAllowed > 0 &&
      scanItems.filter((item) => item.campaignId === activeCampaign.id).length >= activeCampaign.maxScansAllowed
    ) {
      setScanMessage("This campaign has reached its scan upload limit.");
      return;
    }
    if (getMonthlyScanCount(scanItems) >= getEffectiveScanLimit(organization)) {
      setScanMessage("This organization has reached available scan credits. Upgrade or recharge from SaaS admin.");
      return;
    }
    setIsScanning(true);
    setScanMessage(`Reading ${file.name} with OCR. Handwriting may need manual correction.`);
    const scanFileUrl = await uploadCampaignAsset(file, "scan", false);
    try {
      const { recognize } = await import("tesseract.js");
      const result = await recognize(file, "eng");
      const extractedText = result.data.text.trim() || scanText;
      const item = { ...createScanReviewItem(activeCampaign.id, file.name, extractedText), fileUrl: scanFileUrl };
      setScanItems((current) => [item, ...current]);
      setScanText(extractedText);
      setScanMessage("OCR completed. Review the extracted signer details before approval.");
    } catch {
      const item = { ...createScanReviewItem(activeCampaign.id, file.name, scanText), fileUrl: scanFileUrl };
      setScanItems((current) => [item, ...current]);
      setScanMessage("OCR could not read the file, so a manual review item was created from the text box.");
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

  function approveScan(scan: ScanReviewItem) {
    if (!activeCampaign) return;
    const duplicate = detectDuplicate(scan.parsedSigner, campaignSigners);
    const signer: Signer = {
      id: createId("sig"),
      campaignId: activeCampaign.id,
      ...scan.parsedSigner,
      source: "scan",
      status: duplicate ? "duplicate" : "pending",
      signedAt: new Date().toISOString(),
      scanFileName: scan.fileName,
      scanFileUrl: scan.fileUrl,
      reviewerNote: duplicate ? `Possible duplicate of ${duplicate.name}` : "Imported from scanned hard copy."
    };
    setSigners((current) => [signer, ...current]);
    addAuditLog("scan.approved", `Approved scanned signer "${signer.name}"`, activeCampaign.id);
    setScanItems((current) =>
      current.map((item) => (item.id === scan.id ? { ...item, status: "Approved" } : item))
    );
  }

  function updateSignerStatus(signerId: string, status: Signer["status"]) {
    setSigners((current) =>
      current.map((s) => (s.id === signerId ? { ...s, status } : s))
    );
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

    if (isBackendConfigured && remoteStateLoaded) {
      void saveRemoteState(createRemoteState({
          campaigns,
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
    const plan = subscriptionPlans.find((p) => p.name === planName);
    if (!plan) return;
    setOrganization((current) => ({
      ...current,
      plan: plan.name,
      monthlySignatureLimit: plan.monthlySignatureLimit,
      monthlyScanLimit: plan.monthlyScanLimit,
      monthlyMessageLimit: getDefaultMessageLimit(plan.name),
      subscriptionStatus:
        current.subscriptionStatus === "Cancelled" ? "Trial" : current.subscriptionStatus,
      customBranding: plan.name !== "Starter" ? current.customBranding : false
    }));
  }

  function startOneDayTrial() {
    setOrganization({ ...organization, subscriptionStatus: "Trial", trialEndsAt: getTomorrowDate() });
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
      `Granted package "${pkg.name}" (₹${pkg.priceInr}) with ${pkg.signatureCredits} signatures, ${pkg.scanCredits} scans, ${pkg.messageCredits} messages`
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

  function submitCampaignAdminLogin(event: FormEvent) {
    event.preventDefault();
    if (!activeCampaign) return;
    const expectedEmail = getCampaignAdminEmail(activeCampaign);
    const expectedPasscode = getCampaignAdminPasscode(activeCampaign);
    if (!expectedEmail || !expectedPasscode) {
      setAdminLoginMessage(
        "Campaign admin login is disabled because this campaign does not have admin credentials configured."
      );
      return;
    }
    const emailMatches = adminLogin.email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
    const passcodeMatches = adminLogin.passcode.trim() === expectedPasscode.trim();
    if (!emailMatches || !passcodeMatches) {
      setAdminLoginMessage("Invalid campaign admin email or passcode.");
      return;
    }
    const nextAuth = { ...authenticatedAdminSlugs, [activeCampaign.slug]: true };
    setAuthenticatedAdminSlugs(nextAuth);
    writeAuthenticatedAdminSlugs(nextAuth);
    setAdminLogin(blankAdminLogin);
    setAdminLoginMessage("");
  }

  function logoutCampaignAdmin() {
    if (!activeCampaign) return;
    const nextAuth = { ...authenticatedAdminSlugs, [activeCampaign.slug]: false };
    setAuthenticatedAdminSlugs(nextAuth);
    writeAuthenticatedAdminSlugs(nextAuth);
  }

  async function submitAppLogin(event: FormEvent) {
    event.preventDefault();
    if (isSupabaseAuthAvailable) {
      try {
        const user = await signInWithSupabase(appLogin.email, appLogin.passcode);
        setIsAppAuthenticated(true);
        writeAppAuth(true);
        setAppLogin(blankAppLogin);
        setAppLoginMessage("");
        addAuditLog("auth.login", `SaaS admin logged in with Supabase Auth: ${user.email ?? appLogin.email}`);
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unable to login with Supabase Auth";
        setAppLoginMessage(`Supabase Auth login failed: ${errorMessage}. Please verify your email and password.`);
        return;
      }
    }
    if (!areAppAdminCredentialsConfigured()) {
      setAppLoginMessage(
        "SaaS admin login is disabled because VITE_VOICEUP_APP_ADMIN_EMAIL and VITE_VOICEUP_APP_ADMIN_PASSCODE are not configured."
      );
      return;
    }
    const expectedEmail = getAppAdminEmail();
    const expectedPasscode = getAppAdminPasscode();
    const emailMatches = appLogin.email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
    const passcodeMatches = appLogin.passcode.trim() === expectedPasscode.trim();
    if (!emailMatches || !passcodeMatches) {
      setAppLoginMessage("Invalid SaaS admin email or passcode.");
      return;
    }
    setIsAppAuthenticated(true);
    writeAppAuth(true);
    setAppLogin(blankAppLogin);
    setAppLoginMessage("");
    addAuditLog("auth.login", `SaaS admin logged in with MVP passcode: ${appLogin.email}`);
  }

  async function logoutAppAdmin() {
    if (isSupabaseAuthAvailable) await signOutSupabase();
    setIsAppAuthenticated(false);
    writeAppAuth(false);
  }

  // ─── Route rendering ──────────────────────────────────────────────────────
  if (isPublicCampaignRoute) {
    if (backendLoading) return <PublicCampaignLoading message={backendMessage} />;
    return activeCampaign ? (
      <div className="public-only-shell">
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
          onSendOtp={sendOtp}
          onVerifyOtp={verifyOtp}
          locationOverrides={locationOverrides}
          locationDeletions={locationDeletions}
          onSubmit={submitPublicSignature}
        />
      </div>
    ) : (
      <PublicCampaignNotFound />
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
  if (isLandingPageRoute) return <LandingPage onGetStarted={() => (window.location.href = "/app")} />;
  if (!isAppRoute && !isSaasAdminRoute && !isCampaignAdminRoute) {
    return <MarketingHomePage theme={theme} setTheme={setTheme} />;
  }
  if ((isAppRoute || isSaasAdminRoute) && backendLoading) {
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

  if ((isAppRoute || isSaasAdminRoute) && !isAppAuthenticated) {
    return (
      <SaasAppLoginPage
        appLogin={appLogin}
        setAppLogin={setAppLogin}
        message={appLoginMessage}
        onSubmit={submitAppLogin}
      />
    );
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
        signers={signers}
        authorities={authorities}
        setAuthorities={setAuthorities}
        organization={organization}
        setOrganization={setOrganization}
        scanItems={scanItems}
        setScanItems={setScanItems}
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
        otpInput={otpInput}
        setOtpInput={setOtpInput}
        otpMessage={otpMessage}
        scanText={scanText}
        setScanText={setScanText}
        isScanning={isScanning}
        scanMessage={scanMessage}
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
        onSaveCampaign={saveCampaign}
        onPublishCampaign={publishCampaign}
        onSubmitPublicSignature={submitPublicSignature}
        onSendOtp={sendOtp}
        onVerifyOtp={verifyOtp}
        onUploadScan={uploadScan}
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
