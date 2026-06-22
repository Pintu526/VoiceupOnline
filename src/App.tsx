import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileScan,
  FileText,
  Globe2,
  Landmark,
  Megaphone,
  Plus,
  QrCode,
  Rocket,
  Save,
  SearchCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  MessageCircle,
  Share2,
  Image as ImageIcon,
  Trash2,
  WalletCards
} from "lucide-react";
import Tesseract from "tesseract.js";
import {
  initialAuthorities,
  initialCampaigns,
  initialIntegrationSettings,
  initialOrganization,
  initialSigners,
  subscriptionPlans,
  suggestedFeatures
} from "./data";
import {
  getCurrentAuthUser,
  isBackendConfigured,
  isSupabaseAuthAvailable,
  loadRemoteState,
  saveRemoteState,
  signInWithSupabase,
  signOutSupabase,
  type VoiceupRemoteState
} from "./backend";
import {
  createId,
  createScanReviewItem,
  detectDuplicate,
  exportCsv,
  exportPdf,
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
  findLocationByPin,
  findPinCode,
  getBlockOptions,
  getDistrictOptions,
  getPinOptions,
  getPanchayatOptions,
  indianStatesAndUnionTerritories,
  removeLocationOption,
  type LocationDeletionLevel,
  type LocationDeletions,
  type LocationOverrides,
  type LocationWithPin
} from "./geography";
import type {
  AuthorityRule,
  AuthorityTargetLevel,
  AuditLogEntry,
  BillingPlan,
  Campaign,
  CampaignCategory,
  Organization,
  ScanReviewItem,
  Signer,
  IntegrationSettings
} from "./types";

type Tab = "dashboard" | "campaigns" | "public" | "scans" | "reports" | "engagement" | "activity" | "saas" | "ideas";

const categories: CampaignCategory[] = ["Civic", "Environment", "Education", "Health", "Transport", "Housing", "Other"];
const storagePrefix = "voiceup-world-class-campaigns-v4";
const emptyMetrics = {
  total: 0,
  verified: 0,
  pending: 0,
  duplicates: 0,
  online: 0,
  scanned: 0,
  progress: 0
};

const blankSigner = {
  name: "",
  email: "",
  phone: "",
  state: "",
  district: "",
  block: "",
  panchayat: "",
  address: "",
  postalCode: "",
  comment: ""
};

const blankAdminLogin = {
  email: "",
  passcode: ""
};

const blankAppLogin = {
  email: "",
  passcode: ""
};

function App() {
  const [campaigns, setCampaigns] = usePersistentState<Campaign[]>(`${storagePrefix}-campaigns`, initialCampaigns);
  const [signers, setSigners] = usePersistentState<Signer[]>(`${storagePrefix}-signers`, initialSigners);
  const [authorities, setAuthorities] = usePersistentState<AuthorityRule[]>(`${storagePrefix}-authorities`, initialAuthorities);
  const [organization, setOrganization] = usePersistentState<Organization>(`${storagePrefix}-organization`, initialOrganization);
  const [scanItems, setScanItems] = usePersistentState<ScanReviewItem[]>(`${storagePrefix}-scan-items`, []);
  const [auditLogs, setAuditLogs] = usePersistentState<AuditLogEntry[]>(`${storagePrefix}-audit-logs`, []);
  const [integrations, setIntegrations] = usePersistentState<IntegrationSettings>(
    `${storagePrefix}-integrations`,
    initialIntegrationSettings
  );
  const [locationOverrides, setLocationOverrides] = usePersistentState<LocationOverrides>(
    `${storagePrefix}-location-overrides`,
    {}
  );
  const [locationDeletions, setLocationDeletions] = usePersistentState<LocationDeletions>(
    `${storagePrefix}-location-deletions`,
    emptyLocationDeletions
  );
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [activeCampaignId, setActiveCampaignId] = useState(initialCampaigns[0]?.id ?? "");
  const [campaignDraft, setCampaignDraft] = useState<Campaign | null>(campaigns[0] ?? null);
  const [publicForm, setPublicForm] = useState(blankSigner);
  const [publicMessage, setPublicMessage] = useState("");
  const [lastSignedSigner, setLastSignedSigner] = useState<Signer | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState("");
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
  const publicCampaignSlug = getPublicCampaignSlug();
  const adminCampaignSlug = getCampaignAdminSlug();
  const isAppRoute = getIsAppRoute();
  const legalPage = getLegalPage();
  const isPublicCampaignRoute = Boolean(publicCampaignSlug);
  const isCampaignAdminRoute = Boolean(adminCampaignSlug);
  const [adminLogin, setAdminLogin] = useState(blankAdminLogin);
  const [adminLoginMessage, setAdminLoginMessage] = useState("");
  const [appLogin, setAppLogin] = useState(blankAppLogin);
  const [appLoginMessage, setAppLoginMessage] = useState("");
  const [isAppAuthenticated, setIsAppAuthenticated] = useState(() => readAppAuth());
  const [authenticatedAdminSlugs, setAuthenticatedAdminSlugs] = useState<Record<string, boolean>>(() =>
    readAuthenticatedAdminSlugs()
  );

  const activeCampaign = useMemo(
    () =>
      publicCampaignSlug
        ? campaigns.find((campaign) => campaign.slug === publicCampaignSlug)
        : adminCampaignSlug
          ? campaigns.find((campaign) => campaign.slug === adminCampaignSlug)
        : campaigns.find((campaign) => campaign.id === activeCampaignId) ?? campaigns[0],
    [activeCampaignId, adminCampaignSlug, campaigns, publicCampaignSlug]
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
        ? { authority: getAppealAuthority(activeCampaign), score: 100 }
        : undefined,
    [activeCampaign]
  );
  const dailyTotals = useMemo(() => groupSignersByDay(campaignSigners), [campaignSigners]);
  const weeklyTotals = useMemo(() => groupSignersByWeek(campaignSigners), [campaignSigners]);
  const stateTotals = useMemo(() => groupSignersByLocation(campaignSigners, "state"), [campaignSigners]);
  const districtTotals = useMemo(() => groupSignersByLocation(campaignSigners, "district"), [campaignSigners]);
  const blockTotals = useMemo(() => groupSignersByLocation(campaignSigners, "block"), [campaignSigners]);
  const panchayatTotals = useMemo(() => groupSignersByLocation(campaignSigners, "panchayat"), [campaignSigners]);

  useEffect(() => {
    updateSeoMetadata(activeCampaign, legalPage, isPublicCampaignRoute);
  }, [activeCampaign, isPublicCampaignRoute, legalPage]);

  useEffect(() => {
    if (!campaigns.some((campaign) => campaign.id === activeCampaignId)) {
      setActiveCampaignId(campaigns[0]?.id ?? "");
    }
  }, [activeCampaignId, campaigns]);

  useEffect(() => {
    if (!isSupabaseAuthAvailable || !isAppRoute) return;

    async function hydrateAuth() {
      const user = await getCurrentAuthUser();
      if (user) {
        setIsAppAuthenticated(true);
        writeAppAuth(true);
      }
    }

    void hydrateAuth();
  }, [isAppRoute]);

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
              campaigns,
              signers,
              authorities,
              organization,
              scanItems,
              locationOverrides,
              locationDeletions,
              auditLogs,
              integrations
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
          setLocationOverrides(remoteState.locationOverrides ?? {});
          setLocationDeletions(remoteState.locationDeletions ?? emptyLocationDeletions);
          setAuditLogs(remoteState.auditLogs ?? []);
          setIntegrations(remoteState.integrations ?? initialIntegrationSettings);
          setBackendMessage(`Shared campaign database connected (${remoteCampaigns.length} campaign(s)).`);
        } else {
          if (campaigns.length > 0) {
            const localState = createRemoteState({
              campaigns,
              signers,
              authorities,
              organization,
              scanItems,
              locationOverrides,
              locationDeletions,
              auditLogs,
              integrations
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

    return () => {
      isCancelled = true;
    };
  }, [
    setAuthorities,
    setAuditLogs,
    setCampaigns,
    setIntegrations,
    setLocationDeletions,
    setLocationOverrides,
    setOrganization,
    setScanItems,
    setSigners
  ]);

  useEffect(() => {
    if (!isBackendConfigured || !remoteStateLoaded) return;

    const timeoutId = window.setTimeout(() => {
      const state = createRemoteState({
        campaigns,
        signers,
        authorities,
        organization,
        scanItems,
        locationOverrides,
        locationDeletions,
        auditLogs,
        integrations
      });

      void saveRemoteState(state)
        .then(() => setBackendMessage("Saved to shared campaign database."))
        .catch((error) =>
          setBackendMessage(`Shared database save error: ${error instanceof Error ? error.message : "Unable to save"}`)
        );
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [
    authorities,
    auditLogs,
    campaigns,
    integrations,
    locationDeletions,
    locationOverrides,
    organization,
    remoteStateLoaded,
    scanItems,
    signers
  ]);

  useEffect(() => {
    setCampaignDraft(activeCampaign ?? null);
  }, [activeCampaign]);

  useEffect(() => {
    const slugFromPath = window.location.pathname.match(/^\/c\/([^/]+)/)?.[1];
    if (!slugFromPath) return;
    const campaignFromPath = campaigns.find((campaign) => campaign.slug === slugFromPath);
    if (campaignFromPath) {
      setActiveCampaignId(campaignFromPath.id);
      setActiveTab("public");
    }
  }, [campaigns]);

  useEffect(() => {
    if (!adminCampaignSlug) return;
    const campaignFromPath = campaigns.find((campaign) => campaign.slug === adminCampaignSlug);
    if (campaignFromPath) {
      setActiveCampaignId(campaignFromPath.id);
      setActiveTab((currentTab) => (currentTab === "saas" || currentTab === "ideas" ? "dashboard" : currentTab));
    }
  }, [adminCampaignSlug, campaigns]);

  function saveCampaign(event: FormEvent) {
    event.preventDefault();
    if (!campaignDraft) return;
    setCampaigns((currentCampaigns) =>
      currentCampaigns.map((campaign) => (campaign.id === campaignDraft.id ? campaignDraft : campaign))
    );
    addAuditLog("campaign.saved", `Saved campaign "${campaignDraft.title}"`, campaignDraft.id);
  }

  function createCampaign() {
    const campaign: Campaign = {
      id: createId("cmp"),
      title: "New Public Campaign",
      slug: `new-campaign-${Date.now()}`,
      category: "Civic",
      description: "Describe the public issue, requested action, and why citizens should support it.",
      appealContent:
        "I support this appeal and request the selected authority to take appropriate action for the public cause described in this campaign.",
      authorityTargetLevel: "district",
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
      requiredFields: ["name", "email", "phone", "state", "district", "block", "panchayat", "address", "postalCode"],
      shareUrl: `${getCampaignBaseUrl(organization)}/c/new-campaign`,
      adminUrl: `${getCampaignBaseUrl(organization)}/admin/new-campaign`,
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
        "{{campaign}} update: {{verified}} verified supporters have joined so far. Share this campaign: {{url}}"
    };
    setCampaigns((currentCampaigns) => [...currentCampaigns, campaign]);
    addAuditLog("campaign.created", `Created campaign "${campaign.title}"`, campaign.id);
    setActiveCampaignId(campaign.id);
    setCampaignDraft(campaign);
    setActiveTab("campaigns");
  }

  function publishCampaign() {
    if (!campaignDraft) return;
    const publishedCampaign = {
      ...campaignDraft,
      status: "Published" as const,
      shareUrl: `${getCampaignBaseUrl(organization)}/c/${campaignDraft.slug}`,
      adminUrl: `${getCampaignBaseUrl(organization)}/admin/${campaignDraft.slug}`
    };
    setCampaignDraft(publishedCampaign);
    setCampaigns((currentCampaigns) =>
      currentCampaigns.map((campaign) => (campaign.id === publishedCampaign.id ? publishedCampaign : campaign))
    );
    addAuditLog("campaign.published", `Published campaign "${publishedCampaign.title}"`, publishedCampaign.id);
  }

  function submitPublicSignature(event: FormEvent) {
    event.preventDefault();
    if (!activeCampaign) {
      setPublicMessage("Create and publish a campaign before collecting signatures.");
      return;
    }
    if (!publicForm.name || !publicForm.phone) {
      setPublicMessage("Name and phone are required to sign this campaign.");
      return;
    }
    const missingRequiredField = activeCampaign.requiredFields.find((field) => !publicForm[field]?.trim());
    if (missingRequiredField) {
      setPublicMessage(`${signerFieldLabel(missingRequiredField)} is required to sign this campaign.`);
      return;
    }
    const signer = makePublicSigner(
      activeCampaign.id,
      {
        ...publicForm,
        comment: `Accepted published appeal to ${getAppealAuthority(activeCampaign).name}: ${
          activeCampaign.appealContent || activeCampaign.description
        }`
      },
      campaignSigners
    );
    setSigners((currentSigners) => [signer, ...currentSigners]);
    addAuditLog("campaign.signed", `${signer.name} signed "${activeCampaign.title}"`, activeCampaign.id);
    setPublicForm(blankSigner);
    setLastSignedSigner(signer);
    setPublicMessage(
      signer.status === "duplicate"
        ? "Thanks. This looks like a duplicate, so it was sent to review."
        : "Thank you. Your signature has been recorded."
    );
  }

  async function uploadScan(file: File) {
    if (!activeCampaign) {
      setScanMessage("Create a campaign before uploading scanned signatures.");
      return;
    }
    setIsScanning(true);
    setScanMessage(`Reading ${file.name} with OCR. Handwriting may need manual correction.`);
    try {
      const result = await Tesseract.recognize(file, "eng");
      const extractedText = result.data.text.trim() || scanText;
      const item = createScanReviewItem(activeCampaign.id, file.name, extractedText);
      setScanItems((currentItems) => [item, ...currentItems]);
      setScanText(extractedText);
      setScanMessage("OCR completed. Review the extracted signer details before approval.");
    } catch (error) {
      const item = createScanReviewItem(activeCampaign.id, file.name, scanText);
      setScanItems((currentItems) => [item, ...currentItems]);
      setScanMessage("OCR could not read the file, so a manual review item was created from the text box.");
    } finally {
      setIsScanning(false);
    }
  }

  function createManualScanItem() {
    if (!activeCampaign) {
      setScanMessage("Create a campaign before adding scanned signatures.");
      return;
    }
    const item = createScanReviewItem(activeCampaign.id, "manual-scan-entry.txt", scanText);
    setScanItems((currentItems) => [item, ...currentItems]);
    setScanMessage("Manual scan review item created.");
  }

  function updateScanParsedSigner(scanId: string, field: keyof ScanReviewItem["parsedSigner"], value: string) {
    setScanItems((currentItems) =>
      currentItems.map((item) =>
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
      reviewerNote: duplicate ? `Possible duplicate of ${duplicate.name}` : "Imported from scanned hard copy."
    };
    setSigners((currentSigners) => [signer, ...currentSigners]);
    addAuditLog("scan.approved", `Approved scanned signer "${signer.name}"`, activeCampaign.id);
    setScanItems((currentItems) =>
      currentItems.map((item) => (item.id === scan.id ? { ...item, status: "Approved" } : item))
    );
  }

  function updateSignerStatus(signerId: string, status: Signer["status"]) {
    setSigners((currentSigners) =>
      currentSigners.map((signer) => (signer.id === signerId ? { ...signer, status } : signer))
    );
    addAuditLog("signer.status_updated", `Updated signer status to ${status}`, activeCampaign?.id);
  }

  function addAuthorityRule() {
    if (!activeCampaign) {
      setActiveTab("campaigns");
      return;
    }
    const rule: AuthorityRule = {
      id: createId("auth"),
      name: "New Authority",
      department: "Department name",
      category: activeCampaign.category,
      locationKeyword: activeCampaign.location.split(" ")[0] ?? "",
      postalPrefix: activeCampaign.postalCode.slice(0, 3),
      email: "authority@example.gov",
      submissionMethod: "Email",
      confidence: 70
    };
    setAuthorities((currentAuthorities) => [rule, ...currentAuthorities]);
  }

  function addAdminLocationOption(values: LocationWithPin) {
    const level = getLocationLevel(values);
    setLocationOverrides((currentOverrides) => addLocationOverride(currentOverrides, values));
    setLocationDeletions((currentDeletions) => clearLocationDeletion(currentDeletions, values, level));
    addAuditLog("location.added", `Added ${level} dropdown value`, activeCampaign?.id);
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
    const plan = subscriptionPlans.find((candidate) => candidate.name === planName);
    if (!plan) return;
    setOrganization((currentOrganization) => ({
      ...currentOrganization,
      plan: plan.name,
      monthlySignatureLimit: plan.monthlySignatureLimit,
      monthlyScanLimit: plan.monthlyScanLimit,
      subscriptionStatus: currentOrganization.subscriptionStatus === "Cancelled" ? "Trial" : currentOrganization.subscriptionStatus,
      customBranding: plan.name !== "Starter" ? currentOrganization.customBranding : false
    }));
  }

  function updateCampaignMedia(file: File) {
    if (!campaignDraft) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCampaignDraft({ ...campaignDraft, heroImage: String(reader.result ?? "") });
    };
    reader.readAsDataURL(file);
  }

  function campaignReportMessage(campaign: Campaign) {
    return renderCampaignMessage(campaign.participantUpdateMessage, campaign, metrics);
  }

  function addAuditLog(action: AuditLogEntry["action"], description: string, campaignId?: string) {
    setAuditLogs((currentLogs) => [
      {
        id: createId("audit"),
        action,
        actor: getCurrentActorEmail(),
        campaignId,
        description,
        createdAt: new Date().toISOString()
      },
      ...currentLogs
    ].slice(0, 500));
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedMessage("Copied message to clipboard.");
    window.setTimeout(() => setCopiedMessage(""), 2500);
  }

  function submitCampaignAdminLogin(event: FormEvent) {
    event.preventDefault();
    if (!activeCampaign) return;

    const expectedEmail = getCampaignAdminEmail(activeCampaign);
    const expectedPasscode = getCampaignAdminPasscode(activeCampaign);
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
        setAppLoginMessage(
          `Supabase Auth login failed: ${error instanceof Error ? error.message : "Unable to login"}`
        );
        return;
      }
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
    if (isSupabaseAuthAvailable) {
      await signOutSupabase();
    }
    setIsAppAuthenticated(false);
    writeAppAuth(false);
  }

  if (isPublicCampaignRoute) {
    if (backendLoading) {
      return <PublicLoading message={backendMessage} />;
    }

    return activeCampaign ? (
      <div className="public-only-shell">
        <PublicCampaignSection
          campaign={activeCampaign}
          metrics={metrics}
          publicForm={publicForm}
          setPublicForm={setPublicForm}
          publicMessage={publicMessage}
          lastSignedSigner={lastSignedSigner}
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
    if (backendLoading) {
      return <PublicLoading message={backendMessage} />;
    }

    if (!activeCampaign) {
      return <CampaignAdminNotFound />;
    }

    if (!authenticatedAdminSlugs[activeCampaign.slug]) {
      return (
        <CampaignAdminLogin
          campaign={activeCampaign}
          adminLogin={adminLogin}
          setAdminLogin={setAdminLogin}
          message={adminLoginMessage}
          onSubmit={submitCampaignAdminLogin}
        />
      );
    }
  }

  if (legalPage) {
    return <LegalPage page={legalPage} />;
  }

  if (!isAppRoute) {
    return <MarketingHome />;
  }

  if (!isAppAuthenticated) {
    return <SaasAppLogin appLogin={appLogin} setAppLogin={setAppLogin} message={appLoginMessage} onSubmit={submitAppLogin} />;
  }

  return (
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
          <NavButton icon={<BarChart3 />} label="Dashboard" tab="dashboard" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Megaphone />} label="Campaign admin" tab="campaigns" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Globe2 />} label="Public signing" tab="public" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FileScan />} label="Scan hard copies" tab="scans" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FileText />} label="Reports" tab="reports" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<MessageCircle />} label="Engagement" tab="engagement" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<ShieldCheck />} label="Activity" tab="activity" activeTab={activeTab} onClick={setActiveTab} />
          {!isCampaignAdminRoute && (
            <>
              <NavButton icon={<WalletCards />} label="SaaS admin" tab="saas" activeTab={activeTab} onClick={setActiveTab} />
              <NavButton icon={<Sparkles />} label="Feature ideas" tab="ideas" activeTab={activeTab} onClick={setActiveTab} />
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

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">{isCampaignAdminRoute ? "Campaign admin page" : "Selected campaign"}</span>
            {isCampaignAdminRoute ? (
              <strong>{activeCampaign?.title}</strong>
            ) : (
              <select
                value={activeCampaignId}
                onChange={(event) => setActiveCampaignId(event.target.value)}
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
            <button className="secondary-button" type="button" onClick={logoutCampaignAdmin}>
              Logout campaign admin
            </button>
          ) : (
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={createCampaign}>
                <Plus size={18} /> New campaign
              </button>
              {isAppRoute && (
                <button className="secondary-button" type="button" onClick={logoutAppAdmin}>
                  Logout
                </button>
              )}
            </div>
          )}
        </header>

        {activeTab === "dashboard" && (
          <section className="page-stack">
            {activeCampaign ? (
              <>
                <Hero campaign={activeCampaign} metrics={metrics} authority={authorityMatch?.authority} />
                <div className="metric-grid">
                  <MetricCard icon={<Users />} label="Total signers" value={metrics.total} detail={`${metrics.verified} verified`} />
                  <MetricCard icon={<Globe2 />} label="Online signatures" value={metrics.online} detail="Collected from public page" />
                  <MetricCard icon={<FileScan />} label="Scanned records" value={metrics.scanned} detail={`${metrics.pending} awaiting review`} />
                  <MetricCard icon={<SearchCheck />} label="Duplicates" value={metrics.duplicates} detail="Flagged automatically" />
                </div>
              </>
            ) : (
              <EmptyWorkspace
                organization={organization}
                onCreateCampaign={createCampaign}
                onOpenSubscription={() => setActiveTab("saas")}
              />
            )}

            <div className="two-column">
              <Panel title="Daily campaign status" icon={<CalendarDays />}>
                <BarList data={dailyTotals} emptyLabel="No signer activity yet." />
              </Panel>
              <Panel title="Authority routing" icon={<Landmark />}>
                {authorityMatch ? (
                  <div className="authority-card">
                    <strong>{authorityMatch.authority.name}</strong>
                    <span>{authorityMatch.authority.department}</span>
                    <span>{authorityMatch.authority.email}</span>
                    <div className="progress">
                      <div style={{ width: `${authorityMatch.score}%` }} />
                    </div>
                    <small>{authorityMatch.score}% routing confidence by category, location, and PIN code.</small>
                  </div>
                ) : (
                  <p>No matching authority rule has been configured.</p>
                )}
              </Panel>
            </div>
          </section>
        )}

        {activeTab === "campaigns" && (
          <section className="page-stack">
            <Panel title="Campaign configuration" icon={<Settings />}>
              {campaignDraft ? (
                <form className="form-grid" onSubmit={saveCampaign}>
                <Field label="Campaign name">
                  <input
                    value={campaignDraft.title}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, title: event.target.value })}
                  />
                </Field>
                  <Field label="Public slug">
                  <input
                    value={campaignDraft.slug}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, slug: event.target.value })}
                  />
                </Field>
                  <Field label="Category">
                  <select
                    value={campaignDraft.category}
                    onChange={(event) =>
                      setCampaignDraft({ ...campaignDraft, category: event.target.value as CampaignCategory })
                    }
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                  <Field label="Status">
                  <select
                    value={campaignDraft.status}
                    onChange={(event) =>
                      setCampaignDraft({ ...campaignDraft, status: event.target.value as Campaign["status"] })
                    }
                  >
                    <option>Draft</option>
                    <option>Published</option>
                    <option>Paused</option>
                    <option>Closed</option>
                  </select>
                </Field>
                  <Field label="Target signatures">
                  <input
                    type="number"
                    min="1"
                    value={campaignDraft.goal}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, goal: Number(event.target.value) })}
                  />
                </Field>
                  <Field label="Location">
                  <input
                    value={campaignDraft.location}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, location: event.target.value })}
                  />
                </Field>
                  <IndiaLocationFields
                    idPrefix="campaign-location"
                    values={campaignDraft}
                    onChange={(values) => setCampaignDraft({ ...campaignDraft, ...values })}
                    locationOverrides={locationOverrides}
                    locationDeletions={locationDeletions}
                    allowInlineAdd
                    onAddLocation={addAdminLocationOption}
                    onRemoveLocation={removeAdminLocationOption}
                  />
                  <Field label="Start date">
                  <input
                    type="date"
                    value={campaignDraft.startDate}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, startDate: event.target.value })}
                  />
                </Field>
                  <Field label="End date">
                  <input
                    type="date"
                    value={campaignDraft.endDate}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, endDate: event.target.value })}
                  />
                </Field>
                  <Field label="Public share URL">
                  <input
                    value={campaignDraft.shareUrl}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, shareUrl: event.target.value })}
                  />
                </Field>
                  <Field label="Campaign admin URL">
                    <input
                      value={campaignDraft.adminUrl ?? `${getCampaignBaseUrl(organization)}/admin/${campaignDraft.slug}`}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, adminUrl: event.target.value })}
                    />
                  </Field>
                  <Field label="Campaign admin email">
                    <input
                      type="email"
                      value={campaignDraft.adminEmail ?? ""}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, adminEmail: event.target.value })}
                    />
                  </Field>
                  <Field label="Campaign admin passcode">
                    <input
                      value={campaignDraft.adminPasscode ?? ""}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, adminPasscode: event.target.value })}
                    />
                  </Field>
                  <Field label="QR / WhatsApp campaign label">
                  <input
                    value={campaignDraft.qrLabel}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, qrLabel: event.target.value })}
                  />
                </Field>
                  <Field label="Campaign description" wide>
                  <textarea
                    rows={5}
                    value={campaignDraft.description}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, description: event.target.value })}
                  />
                </Field>
                  <Field label="Appeal / cause text shown on public signing page" wide>
                    <textarea
                      rows={5}
                      value={campaignDraft.appealContent ?? ""}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, appealContent: event.target.value })}
                    />
                  </Field>
                  <Field label="Appeal should go to authority">
                    <select
                      value={campaignDraft.authorityTargetLevel ?? "district"}
                      onChange={(event) =>
                        setCampaignDraft({
                          ...campaignDraft,
                          authorityTargetLevel: event.target.value as AuthorityTargetLevel
                        })
                      }
                    >
                      <option value="district">District level - District Collector</option>
                      <option value="state">State level - Chief Minister</option>
                      <option value="country">Country level - Prime Minister of India</option>
                    </select>
                  </Field>
                  <Field label="Selected appeal authority">
                    <input value={getAppealAuthority(campaignDraft).name} readOnly />
                  </Field>
                  <Field label="Consent text" wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.consentText}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, consentText: event.target.value })}
                  />
                </Field>
                  <div className="wide media-editor">
                    <div>
                      <span className="label">Campaign banner image</span>
                      <label className="drop-zone compact-drop">
                        <ImageIcon size={28} />
                        <strong>Upload banner / background image</strong>
                        <span>Use a campaign poster or field photo. Crop is controlled below.</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) updateCampaignMedia(file);
                          }}
                        />
                      </label>
                    </div>
                    <div
                      className="media-preview"
                      style={{
                        backgroundImage: campaignDraft.heroImage ? `url(${campaignDraft.heroImage})` : undefined,
                        backgroundPosition: campaignDraft.heroImagePosition,
                        backgroundSize: `${campaignDraft.heroImageZoom}%`
                      }}
                    >
                      {!campaignDraft.heroImage && <span>Banner preview</span>}
                    </div>
                    <Field label="Image crop / zoom">
                      <input
                        type="range"
                        min="100"
                        max="220"
                        value={campaignDraft.heroImageZoom}
                        onChange={(event) =>
                          setCampaignDraft({ ...campaignDraft, heroImageZoom: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Image focus">
                      <select
                        value={campaignDraft.heroImagePosition}
                        onChange={(event) =>
                          setCampaignDraft({ ...campaignDraft, heroImagePosition: event.target.value })
                        }
                      >
                        <option value="center center">Center</option>
                        <option value="center top">Top</option>
                        <option value="center bottom">Bottom</option>
                        <option value="left center">Left</option>
                        <option value="right center">Right</option>
                      </select>
                    </Field>
                    <Field label="Campaign video URL">
                      <input
                        placeholder="YouTube, Instagram, or hosted video link"
                        value={campaignDraft.campaignVideoUrl}
                        onChange={(event) => setCampaignDraft({ ...campaignDraft, campaignVideoUrl: event.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Social share text" wide>
                    <textarea
                      rows={3}
                      value={campaignDraft.socialShareText}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, socialShareText: event.target.value })}
                    />
                  </Field>
                  <Field label="Thank-you WhatsApp/SMS message" wide>
                    <textarea
                      rows={3}
                      value={campaignDraft.thankYouMessage}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, thankYouMessage: event.target.value })}
                    />
                  </Field>
                  <Field label="Participant update message" wide>
                    <textarea
                      rows={3}
                      value={campaignDraft.participantUpdateMessage}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, participantUpdateMessage: event.target.value })}
                    />
                  </Field>
                  <div className="wide required-fields">
                  <span className="label">Required signer details</span>
                  {([
                    "name",
                    "email",
                    "phone",
                    "state",
                    "district",
                    "block",
                    "panchayat",
                    "address",
                    "postalCode"
                  ] as Campaign["requiredFields"]).map((field) => (
                    <label key={field} className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.requiredFields.includes(field)}
                        onChange={(event) => {
                          const requiredFields = event.target.checked
                            ? [...campaignDraft.requiredFields, field]
                            : campaignDraft.requiredFields.filter((requiredField) => requiredField !== field);
                          setCampaignDraft({ ...campaignDraft, requiredFields });
                        }}
                      />
                      {signerFieldLabel(field)}
                    </label>
                  ))}
                </div>
                  <div className="button-row wide">
                  <button className="primary-button" type="submit">
                    <Save size={18} /> Save campaign
                  </button>
                  <button className="secondary-button" type="button" onClick={publishCampaign}>
                    <Rocket size={18} /> Publish campaign
                  </button>
                </div>
                </form>
              ) : (
                <NoCampaignPanel
                  title="Create the first Indian campaign"
                  description="This workspace is clean and has no sample data. Start by creating a real campaign for an NGO, RWA, association, union, or campaign agency."
                  onCreateCampaign={createCampaign}
                />
              )}
            </Panel>

            <Panel title="Authority rules" icon={<Landmark />}>
              <button className="secondary-button" type="button" onClick={addAuthorityRule}>
                <Plus size={18} /> Add authority rule
              </button>
              <div className="authority-list">
                {authorities.map((authority) => (
                  <div className="authority-editor" key={authority.id}>
                    <input
                      value={authority.name}
                      onChange={(event) =>
                        setAuthorities((currentAuthorities) =>
                          currentAuthorities.map((currentAuthority) =>
                            currentAuthority.id === authority.id
                              ? { ...currentAuthority, name: event.target.value }
                              : currentAuthority
                          )
                        )
                      }
                    />
                    <input
                      value={authority.department}
                      onChange={(event) =>
                        setAuthorities((currentAuthorities) =>
                          currentAuthorities.map((currentAuthority) =>
                            currentAuthority.id === authority.id
                              ? { ...currentAuthority, department: event.target.value }
                              : currentAuthority
                          )
                        )
                      }
                    />
                    <input
                      value={authority.email}
                      onChange={(event) =>
                        setAuthorities((currentAuthorities) =>
                          currentAuthorities.map((currentAuthority) =>
                            currentAuthority.id === authority.id
                              ? { ...currentAuthority, email: event.target.value }
                              : currentAuthority
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === "public" && (
          activeCampaign ? (
            <PublicCampaignSection
              campaign={activeCampaign}
              metrics={metrics}
              publicForm={publicForm}
              setPublicForm={setPublicForm}
              publicMessage={publicMessage}
              lastSignedSigner={lastSignedSigner}
              locationOverrides={locationOverrides}
              locationDeletions={locationDeletions}
              onSubmit={submitPublicSignature}
            />
          ) : (
            <NoCampaignPanel
              title="No public campaign yet"
              description="Create and publish a campaign before collecting signatures from the public page."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "scans" && (
          activeCampaign ? (
            <section className="page-stack">
              <Panel title="Scan hard-copy signatures" icon={<Upload />}>
                <div className="scan-grid">
                  <label className="drop-zone">
                    <FileScan size={34} />
                    <strong>Upload scanned image</strong>
                    <span>PNG, JPG, WEBP, or scanned image files work best for OCR.</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadScan(file);
                      }}
                    />
                  </label>
                  <div>
                    <span className="label">Manual OCR correction or paste</span>
                    <textarea rows={8} value={scanText} onChange={(event) => setScanText(event.target.value)} />
                    <button className="secondary-button" type="button" onClick={createManualScanItem}>
                      <Plus size={18} /> Create review item
                    </button>
                  </div>
                </div>
                {isScanning && <p className="info-message">OCR processing is running...</p>}
                {scanMessage && <p className="success-message">{scanMessage}</p>}
              </Panel>

              <Panel title="Scan review queue" icon={<SearchCheck />}>
                <div className="review-list">
                  {scanItems.filter((item) => item.campaignId === activeCampaign.id).length === 0 && (
                    <p>No scans are waiting for review.</p>
                  )}
                  {scanItems
                    .filter((item) => item.campaignId === activeCampaign.id)
                    .map((item) => (
                      <div className="review-card" key={item.id}>
                        <div>
                          <strong>{item.fileName}</strong>
                          <span className="status-pill">{item.status}</span>
                        </div>
                        <div className="form-grid compact">
                          {([
                            "name",
                            "email",
                            "phone",
                            "state",
                            "district",
                            "block",
                            "panchayat",
                            "address",
                            "postalCode",
                            "comment"
                          ] as const).map((field) => (
                          <Field key={field} label={signerFieldLabel(field)}>
                              <input
                                value={item.parsedSigner[field]}
                                onChange={(event) => updateScanParsedSigner(item.id, field, event.target.value)}
                              />
                            </Field>
                          ))}
                        </div>
                        <details>
                          <summary>Extracted text</summary>
                          <pre>{item.extractedText}</pre>
                        </details>
                        <div className="button-row">
                          <button className="primary-button" type="button" onClick={() => approveScan(item)}>
                            <CheckCircle2 size={18} /> Approve into signer list
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setScanItems((currentItems) =>
                                currentItems.map((currentItem) =>
                                  currentItem.id === item.id ? { ...currentItem, status: "Rejected" } : currentItem
                                )
                              )
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </Panel>
            </section>
          ) : (
            <NoCampaignPanel
              title="No campaign for scans"
              description="Create a campaign before importing hard-copy signatures or OCR scan batches."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "reports" && (
          activeCampaign ? (
            <section className="page-stack">
              <Panel title="Reports and exports" icon={<Download />}>
                <div className="button-row">
                  <button className="primary-button" type="button" onClick={() => exportPdf(activeCampaign, campaignSigners, authorityMatch?.authority)}>
                    <FileText size={18} /> Download PDF report
                  </button>
                  <button className="secondary-button" type="button" onClick={() => exportCsv(activeCampaign, campaignSigners)}>
                    <Download size={18} /> Download CSV
                  </button>
                </div>
                <div className="report-grid">
                  <ReportBlock title="Daily status" data={dailyTotals} />
                  <ReportBlock title="Weekly status" data={weeklyTotals} />
                  <ReportBlock title="State-wise count" data={stateTotals} />
                  <ReportBlock title="District-wise count" data={districtTotals} />
                  <ReportBlock title="Block-wise count" data={blockTotals} />
                  <ReportBlock title="Panchayat / ward count" data={panchayatTotals} />
                </div>
              </Panel>
              <Panel title="Signer register" icon={<Users />}>
                {campaignSigners.length === 0 ? (
                  <p>No signers have been collected for this campaign yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>State</th>
                          <th>District</th>
                          <th>Block</th>
                          <th>Panchayat / Ward</th>
                          <th>Source</th>
                          <th>Status</th>
                          <th>Signed at</th>
                          <th>Review</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignSigners.map((signer) => (
                          <tr key={signer.id}>
                            <td>
                              <strong>{signer.name}</strong>
                              <span>{signer.email}</span>
                            </td>
                            <td>{signer.phone}</td>
                            <td>{signer.state || "Not captured"}</td>
                            <td>{signer.district || "Not captured"}</td>
                            <td>{signer.block || "Not captured"}</td>
                            <td>{signer.panchayat || "Not captured"}</td>
                            <td>{signer.source}</td>
                            <td>
                              <select
                                value={signer.status}
                                onChange={(event) => updateSignerStatus(signer.id, event.target.value as Signer["status"])}
                              >
                                <option value="verified">verified</option>
                                <option value="pending">pending</option>
                                <option value="duplicate">duplicate</option>
                                <option value="rejected">rejected</option>
                              </select>
                            </td>
                            <td>{new Date(signer.signedAt).toLocaleString()}</td>
                            <td>{signer.reviewerNote ?? "Ready"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </section>
          ) : (
            <NoCampaignPanel
              title="Reports will appear after campaign setup"
              description="Create a campaign and collect signatures before downloading PDF or CSV reports."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "engagement" && (
          activeCampaign ? (
            <section className="page-stack">
              <Panel title="Social publishing and participant engagement" icon={<MessageCircle />}>
                <div className="engagement-grid">
                  <div className="engagement-card">
                    <Share2 size={24} />
                    <h3>Publish campaign to social networks</h3>
                    <p>Share the same campaign URL. The campaign is published as a slug under your main domain.</p>
                    <div className="button-row">
                      <a
                        className="secondary-link-button"
                        href={whatsAppLink("", `${activeCampaign.socialShareText} ${activeCampaign.shareUrl}`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp share
                      </a>
                      <a
                        className="secondary-link-button"
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(activeCampaign.shareUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Facebook
                      </a>
                      <a
                        className="secondary-link-button"
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${activeCampaign.socialShareText} ${activeCampaign.shareUrl}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        X / Twitter
                      </a>
                    </div>
                  </div>
                  <div className="engagement-card">
                    <MessageCircle size={24} />
                    <h3>Participant report message</h3>
                    <p>Send a current progress update to keep supporters engaged after signup.</p>
                    <textarea
                      rows={5}
                      value={broadcastMessage || campaignReportMessage(activeCampaign)}
                      onChange={(event) => setBroadcastMessage(event.target.value)}
                    />
                    <div className="button-row">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void copyText(broadcastMessage || campaignReportMessage(activeCampaign))}
                      >
                        Copy update
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setBroadcastMessage(campaignReportMessage(activeCampaign))}
                      >
                        Refresh report
                      </button>
                    </div>
                    {copiedMessage && <p className="success-message">{copiedMessage}</p>}
                  </div>
                </div>
              </Panel>

              <Panel title="Send message to participants" icon={<Users />}>
                {campaignSigners.length === 0 ? (
                  <p>No participants yet. Once people sign, WhatsApp and SMS actions appear here.</p>
                ) : (
                  <div className="participant-message-list">
                    {campaignSigners.map((signer) => {
                      const message = broadcastMessage || campaignReportMessage(activeCampaign);
                      return (
                        <div className="participant-message-card" key={signer.id}>
                          <div>
                            <strong>{signer.name}</strong>
                            <span>{signer.phone}</span>
                            <small>{[signer.panchayat, signer.block, signer.district, signer.state].filter(Boolean).join(", ")}</small>
                          </div>
                          <div className="button-row">
                            <a
                              className="secondary-link-button"
                              href={whatsAppLink(signer.phone, message)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                            <a className="secondary-link-button" href={smsLink(signer.phone, message)}>
                              SMS
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="info-message">
                  Production bulk delivery should connect WhatsApp Business API and an Indian SMS provider such as
                  MSG91, Gupshup, Twilio, or Airtel IQ.
                </p>
              </Panel>
            </section>
          ) : (
            <NoCampaignPanel
              title="Engagement tools need a campaign"
              description="Create and publish a campaign before sending WhatsApp, SMS, or social updates."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "activity" && (
          <section className="page-stack">
            <Panel title="Admin activity and audit log" icon={<ShieldCheck />}>
              {auditLogs.length === 0 ? (
                <p>No admin activity has been recorded yet.</p>
              ) : (
                <div className="activity-list">
                  {auditLogs.map((entry) => (
                    <div className="activity-card" key={entry.id}>
                      <div>
                        <strong>{entry.description}</strong>
                        <span>{entry.action}</span>
                      </div>
                      <small>
                        {entry.actor} - {new Date(entry.createdAt).toLocaleString()}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </section>
        )}

        {activeTab === "saas" && (
          <section className="page-stack">
            <Panel title="Customer organization subscription" icon={<Building2 />}>
              <form className="form-grid">
                <Field label="Organization name">
                  <input
                    placeholder="Organization or customer name"
                    value={organization.name}
                    onChange={(event) => setOrganization({ ...organization, name: event.target.value })}
                  />
                </Field>
                <Field label="Owner email">
                  <input
                    type="email"
                    placeholder="owner@example.org"
                    value={organization.ownerEmail}
                    onChange={(event) => setOrganization({ ...organization, ownerEmail: event.target.value })}
                  />
                </Field>
                <Field label="Billing email">
                  <input
                    type="email"
                    placeholder="billing@example.org"
                    value={organization.billingEmail}
                    onChange={(event) => setOrganization({ ...organization, billingEmail: event.target.value })}
                  />
                </Field>
                <Field label="Subscription plan">
                  <select
                    value={organization.plan}
                    onChange={(event) => selectSubscriptionPlan(event.target.value as BillingPlan)}
                  >
                    {subscriptionPlans.map((plan) => (
                      <option key={plan.name}>{plan.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Subscription status">
                  <select
                    value={organization.subscriptionStatus}
                    onChange={(event) =>
                      setOrganization({
                        ...organization,
                        subscriptionStatus: event.target.value as Organization["subscriptionStatus"]
                      })
                    }
                  >
                    <option>Trial</option>
                    <option>Active</option>
                    <option>Past due</option>
                    <option>Cancelled</option>
                  </select>
                </Field>
                <Field label="Trial ends">
                  <input
                    type="date"
                    value={organization.trialEndsAt}
                    onChange={(event) => setOrganization({ ...organization, trialEndsAt: event.target.value })}
                  />
                </Field>
                <Field label="Team seats">
                  <input
                    type="number"
                    min="1"
                    value={organization.seats}
                    onChange={(event) => setOrganization({ ...organization, seats: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Monthly signature limit">
                  <input
                    type="number"
                    min="0"
                    value={organization.monthlySignatureLimit}
                    onChange={(event) =>
                      setOrganization({ ...organization, monthlySignatureLimit: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Monthly scan limit">
                  <input
                    type="number"
                    min="0"
                    value={organization.monthlyScanLimit}
                    onChange={(event) => setOrganization({ ...organization, monthlyScanLimit: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Custom domain">
                  <input
                    placeholder="campaigns.customer.in"
                    value={organization.customDomain}
                    onChange={(event) => setOrganization({ ...organization, customDomain: event.target.value })}
                  />
                </Field>
                <Field label="Payment reference">
                  <input
                    placeholder="Stripe/customer reference"
                    value={organization.paymentReference}
                    onChange={(event) => setOrganization({ ...organization, paymentReference: event.target.value })}
                  />
                </Field>
                <label className="check-row wide">
                  <input
                    type="checkbox"
                    checked={organization.customBranding}
                    onChange={(event) => setOrganization({ ...organization, customBranding: event.target.checked })}
                  />
                  Enable custom branding for this organization
                </label>
              </form>
            </Panel>

            <Panel title="Production integrations" icon={<Settings />}>
              <form className="form-grid">
                <Field label="Razorpay key ID">
                  <input
                    placeholder="rzp_live_xxxxx"
                    value={integrations.razorpayKeyId}
                    onChange={(event) => setIntegrations({ ...integrations, razorpayKeyId: event.target.value })}
                    onBlur={() => addAuditLog("integration.updated", "Updated Razorpay key reference")}
                  />
                </Field>
                <Field label="Razorpay plan/reference">
                  <input
                    value={integrations.razorpayPlanReference}
                    onChange={(event) => setIntegrations({ ...integrations, razorpayPlanReference: event.target.value })}
                  />
                </Field>
                <Field label="WhatsApp provider">
                  <select
                    value={integrations.whatsappProvider}
                    onChange={(event) =>
                      setIntegrations({
                        ...integrations,
                        whatsappProvider: event.target.value as IntegrationSettings["whatsappProvider"]
                      })
                    }
                  >
                    {["Not configured", "Gupshup", "MSG91", "Interakt", "AiSensy", "Twilio", "Airtel IQ"].map((provider) => (
                      <option key={provider}>{provider}</option>
                    ))}
                  </select>
                </Field>
                <Field label="WhatsApp sender ID">
                  <input
                    value={integrations.whatsappSenderId}
                    onChange={(event) => setIntegrations({ ...integrations, whatsappSenderId: event.target.value })}
                  />
                </Field>
                <Field label="SMS provider">
                  <select
                    value={integrations.smsProvider}
                    onChange={(event) =>
                      setIntegrations({ ...integrations, smsProvider: event.target.value as IntegrationSettings["smsProvider"] })
                    }
                  >
                    {["Not configured", "MSG91", "Gupshup", "Twilio", "Airtel IQ"].map((provider) => (
                      <option key={provider}>{provider}</option>
                    ))}
                  </select>
                </Field>
                <Field label="SMS sender ID">
                  <input
                    value={integrations.smsSenderId}
                    onChange={(event) => setIntegrations({ ...integrations, smsSenderId: event.target.value })}
                  />
                </Field>
                <Field label="Email provider">
                  <select
                    value={integrations.emailProvider}
                    onChange={(event) =>
                      setIntegrations({
                        ...integrations,
                        emailProvider: event.target.value as IntegrationSettings["emailProvider"]
                      })
                    }
                  >
                    {["Not configured", "Resend", "SendGrid", "Amazon SES"].map((provider) => (
                      <option key={provider}>{provider}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Sender email">
                  <input
                    value={integrations.emailSender}
                    onChange={(event) => setIntegrations({ ...integrations, emailSender: event.target.value })}
                  />
                </Field>
                <Field label="Storage provider">
                  <select
                    value={integrations.storageProvider}
                    onChange={(event) =>
                      setIntegrations({
                        ...integrations,
                        storageProvider: event.target.value as IntegrationSettings["storageProvider"]
                      })
                    }
                  >
                    {["Supabase Storage", "AWS S3", "Not configured"].map((provider) => (
                      <option key={provider}>{provider}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Storage bucket">
                  <input
                    value={integrations.storageBucket}
                    onChange={(event) => setIntegrations({ ...integrations, storageBucket: event.target.value })}
                  />
                </Field>
                <Field label="Analytics provider">
                  <select
                    value={integrations.analyticsProvider}
                    onChange={(event) =>
                      setIntegrations({
                        ...integrations,
                        analyticsProvider: event.target.value as IntegrationSettings["analyticsProvider"]
                      })
                    }
                  >
                    {["Not configured", "Vercel Analytics", "PostHog", "Plausible"].map((provider) => (
                      <option key={provider}>{provider}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Analytics key">
                  <input
                    value={integrations.analyticsKey}
                    onChange={(event) => setIntegrations({ ...integrations, analyticsKey: event.target.value })}
                  />
                </Field>
              </form>
              <p className="info-message">
                Store provider secrets in Vercel server-side environment variables. These fields are operational
                references for admins, not a place for private API secrets.
              </p>
            </Panel>

            <div className="plan-grid">
              {subscriptionPlans.map((plan) => (
                <PlanCard
                  key={plan.name}
                  title={plan.name}
                  price={plan.price}
                  features={[
                    `${plan.campaignLimit} campaign${plan.campaignLimit === 1 ? "" : "s"}`,
                    `${plan.monthlySignatureLimit.toLocaleString()} signatures/month`,
                    `${plan.monthlyScanLimit.toLocaleString()} scans/month`,
                    ...plan.features
                  ]}
                  highlighted={organization.plan === plan.name}
                  actionLabel={organization.plan === plan.name ? "Selected" : `Select ${plan.name}`}
                  onSelect={() => selectSubscriptionPlan(plan.name)}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === "ideas" && (
          <section className="page-stack">
            <Panel title="Suggested next features" icon={<Sparkles />}>
              <div className="idea-grid">
                {suggestedFeatures.map((feature) => (
                  <div className="idea-card" key={feature.title}>
                    <span className="status-pill">{feature.tier}</span>
                    <h3>{feature.title}</h3>
                    <p>{feature.benefit}</p>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Production readiness checklist" icon={<ShieldCheck />}>
              <ul className="checklist">
                <li>Connect a backend database such as Postgres before real customer use.</li>
                <li>Add secure login, roles, tenant isolation, and audit logs for SaaS customers.</li>
                <li>Use a payment processor such as Stripe for subscriptions and invoices.</li>
                <li>Review local laws for consent, privacy, scanned signatures, and official submissions.</li>
                <li>Add server-side OCR processing for large PDF batches and handwritten forms.</li>
              </ul>
            </Panel>
          </section>
        )}
      </main>
    </div>
  );
}

function NavButton({
  icon,
  label,
  tab,
  activeTab,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  tab: Tab;
  activeTab: Tab;
  onClick: (tab: Tab) => void;
}) {
  return (
    <button className={activeTab === tab ? "active" : ""} type="button" onClick={() => onClick(tab)}>
      {icon}
      {label}
    </button>
  );
}

function MarketingHome() {
  return (
    <main className="marketing-home">
      <header className="marketing-nav">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>Campaigns that move people</span>
          </div>
        </div>
        <div className="button-row">
          <a className="secondary-link-button" href="/app">
            SaaS admin login
          </a>
        </div>
      </header>

      <section className="marketing-hero">
        <div>
          <span className="eyebrow">Voice Up to make your campaign successful</span>
          <h1>Launch public appeals, collect verified support, and keep every participant engaged.</h1>
          <p>
            Voiceup Bharat helps NGOs, RWAs, associations, unions, and campaign agencies publish public campaigns,
            collect signups, scan hard-copy support, route appeals to the right authority, and report campaign progress.
          </p>
          <div className="button-row">
            <a className="primary-link-button" href="/app">
              Start campaign workspace
            </a>
            <a className="secondary-link-button" href="#features">
              View features
            </a>
          </div>
        </div>
        <div className="marketing-hero-card">
          <span className="status-pill">India-ready SaaS</span>
          <h2>Public link stays public. Admin stays protected.</h2>
          <ul>
            <li>Public campaign pages at /c/campaign-slug</li>
            <li>Protected campaign admin at /admin/campaign-slug</li>
            <li>Global SaaS workspace at /app</li>
            <li>Supabase shared storage for WhatsApp/mobile links</li>
          </ul>
        </div>
      </section>

      <section className="marketing-section" id="features">
        <span className="eyebrow">Platform modules</span>
        <div className="marketing-grid">
          <MarketingFeature title="Campaign publishing" text="Create branded appeal pages with images, video, authority target, and public signup forms." />
          <MarketingFeature title="India location hierarchy" text="State, district, block, panchayat/ward, and PIN-code based reporting for local campaigns." />
          <MarketingFeature title="Participant engagement" text="Thank-you flows, WhatsApp/SMS links, social sharing, and participant progress updates." />
          <MarketingFeature title="Reports and exports" text="Daily, weekly, state, district, block, and panchayat counts with PDF/CSV exports." />
          <MarketingFeature title="Hard-copy scanning" text="OCR-assisted import for scanned forms and review queue for paper signups." />
          <MarketingFeature title="SaaS subscriptions" text="Plans, limits, custom branding, custom domain, and organization-level setup." />
        </div>
      </section>

      <section className="marketing-section marketing-cta">
        <h2>Ready to run a campaign on Voiceup Bharat?</h2>
        <p>Login to the protected SaaS workspace to create campaigns and publish public links.</p>
        <a className="primary-link-button" href="/app">
          Login to SaaS admin
        </a>
      </section>
      <footer className="marketing-footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refund">Refund policy</a>
        <a href="/data-deletion">Data deletion</a>
      </footer>
    </main>
  );
}

function MarketingFeature({ title, text }: { title: string; text: string }) {
  return (
    <div className="marketing-feature">
      <Sparkles size={22} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function SaasAppLogin({
  appLogin,
  setAppLogin,
  message,
  onSubmit
}: {
  appLogin: typeof blankAppLogin;
  setAppLogin: React.Dispatch<React.SetStateAction<typeof blankAppLogin>>;
  message: string;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className="public-only-shell">
      <section className="campaign-admin-login">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>SaaS admin access</span>
          </div>
        </div>
        <span className="eyebrow">Protected SaaS workspace</span>
        <h1>Login to manage campaign organizations.</h1>
        <p>Use this protected workspace to create campaigns, configure subscriptions, manage public links, and view reports.</p>
        <form className="form-stack" onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="SaaS admin email"
            value={appLogin.email}
            onChange={(event) => setAppLogin({ ...appLogin, email: event.target.value })}
          />
          <input
            type="password"
            placeholder="SaaS admin passcode"
            value={appLogin.passcode}
            onChange={(event) => setAppLogin({ ...appLogin, passcode: event.target.value })}
          />
          <button className="primary-button" type="submit">
            Login to SaaS admin
          </button>
          {message && <p className="info-message">{message}</p>}
          <p className="helper-text">
            Configure production credentials with Vercel environment variables VITE_VOICEUP_APP_ADMIN_EMAIL and
            VITE_VOICEUP_APP_ADMIN_PASSCODE. For real production, replace this with Supabase Auth.
          </p>
        </form>
      </section>
    </main>
  );
}

function LegalPage({ page }: { page: "privacy" | "terms" | "refund" | "data-deletion" }) {
  const content = {
    privacy: {
      title: "Privacy Policy",
      body: [
        "Voiceup Bharat helps campaign organizations collect supporter information for public campaigns.",
        "Campaign organizers are responsible for collecting valid consent and using supporter data only for the stated campaign purpose.",
        "Production deployments should configure secure authentication, tenant isolation, audit logs, and data deletion workflows before collecting sensitive data."
      ]
    },
    terms: {
      title: "Terms of Service",
      body: [
        "Organizations must use Voiceup Bharat only for lawful campaigns and public-interest engagement.",
        "Campaign owners are responsible for the accuracy of campaign content, authority targeting, consent language, and legal compliance.",
        "The current MVP requires production hardening before high-volume or legally sensitive campaigns."
      ]
    },
    refund: {
      title: "Refund and Cancellation Policy",
      body: [
        "Subscription billing should be connected through Razorpay or another approved provider before paid launch.",
        "Refund windows, cancellation terms, and invoice handling must be configured by the SaaS operator.",
        "Enterprise plans may use custom contracts and custom support terms."
      ]
    },
    "data-deletion": {
      title: "Data Deletion Request",
      body: [
        "Supporters may request export or deletion of their personal data through the campaign organizer.",
        "Production deployments should include authenticated data export, delete, and retention controls.",
        "Campaign organizations should maintain an audit trail for consent, submissions, and deletion requests."
      ]
    }
  }[page];

  return (
    <main className="marketing-home">
      <header className="marketing-nav">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>{content.title}</span>
          </div>
        </div>
        <a className="secondary-link-button" href="/">
          Back home
        </a>
      </header>
      <section className="empty-state public-not-found">
        <span className="eyebrow">Legal</span>
        <h1>{content.title}</h1>
        {content.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
    </main>
  );
}

function PublicCampaignSection({
  campaign,
  metrics,
  publicForm,
  setPublicForm,
  publicMessage,
  lastSignedSigner,
  locationOverrides,
  locationDeletions,
  onSubmit
}: {
  campaign: Campaign;
  metrics: ReturnType<typeof getCampaignMetrics>;
  publicForm: typeof blankSigner;
  setPublicForm: React.Dispatch<React.SetStateAction<typeof blankSigner>>;
  publicMessage: string;
  lastSignedSigner: Signer | null;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="public-layout">
      <div
        className={campaign.heroImage ? "campaign-page campaign-page-with-media" : "campaign-page"}
        style={{
          backgroundImage: campaign.heroImage
            ? `linear-gradient(135deg, rgba(15, 23, 42, 0.74), rgba(15, 23, 42, 0.34)), url(${campaign.heroImage})`
            : undefined,
          backgroundPosition: campaign.heroImagePosition,
          backgroundSize: `${campaign.heroImageZoom}%`
        }}
      >
        <span className="status-pill">{campaign.status}</span>
        <h1>{campaign.title}</h1>
        <p>{campaign.description}</p>
        <div className="appeal-card">
          <span className="eyebrow">Appeal to {getAppealAuthority(campaign).name}</span>
          <p>{campaign.appealContent || campaign.description}</p>
        </div>
        <div className="public-progress">
          <div className="progress">
            <div style={{ width: `${metrics.progress}%` }} />
          </div>
          <strong>{metrics.verified.toLocaleString()}</strong> of {campaign.goal.toLocaleString()} verified signatures
        </div>
        <div className="qr-box">
          <QrCode size={40} />
          <div>
            <strong>{campaign.qrLabel}</strong>
            <span>{campaign.shareUrl}</span>
          </div>
        </div>
        {campaign.campaignVideoUrl && (
          <a className="video-link" href={campaign.campaignVideoUrl} target="_blank" rel="noreferrer">
            Watch campaign video
          </a>
        )}
      </div>

      <Panel title="Support this campaign" icon={<ClipboardList />}>
        <form className="form-stack" onSubmit={onSubmit}>
          <input
            placeholder="Full name"
            value={publicForm.name}
            onChange={(event) => setPublicForm({ ...publicForm, name: event.target.value })}
          />
          <input
            placeholder="Email"
            type="email"
            value={publicForm.email}
            onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
          />
          <input
            placeholder="Phone"
            value={publicForm.phone}
            onChange={(event) => setPublicForm({ ...publicForm, phone: event.target.value })}
          />
          <IndiaLocationFields
            idPrefix="public-signer-location"
            values={publicForm}
            onChange={(values) => setPublicForm({ ...publicForm, ...values })}
            locationOverrides={locationOverrides}
            locationDeletions={locationDeletions}
          />
          <input
            placeholder="Address"
            value={publicForm.address}
            onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
          />
          <label className="check-row">
            <input required type="checkbox" /> I have read and support the campaign appeal/cause shown above.
          </label>
          <label className="check-row">
            <input required type="checkbox" /> {campaign.consentText}
          </label>
          <button className="primary-button" type="submit">
            <CheckCircle2 size={18} /> Sign campaign
          </button>
          {publicMessage && <p className="success-message">{publicMessage}</p>}
          {lastSignedSigner?.campaignId === campaign.id && (
            <div className="participant-actions">
              <strong>Send thank-you message</strong>
              <div className="button-row">
                <a
                  className="secondary-link-button"
                  href={whatsAppLink(lastSignedSigner.phone, renderCampaignMessage(campaign.thankYouMessage, campaign, metrics))}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                <a
                  className="secondary-link-button"
                  href={smsLink(lastSignedSigner.phone, renderCampaignMessage(campaign.thankYouMessage, campaign, metrics))}
                >
                  SMS
                </a>
              </div>
            </div>
          )}
        </form>
      </Panel>
    </section>
  );
}

function PublicCampaignNotFound() {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Campaign link</span>
        <h1>This campaign is not available.</h1>
        <p>
          Please check the campaign link or ask the campaign organizer to publish the campaign again. The public signing
          page shows only campaign content when a published campaign is available.
        </p>
      </section>
    </main>
  );
}

function PublicLoading({ message }: { message: string }) {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Loading campaign</span>
        <h1>Loading campaign details...</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function CampaignAdminLogin({
  campaign,
  adminLogin,
  setAdminLogin,
  message,
  onSubmit
}: {
  campaign: Campaign;
  adminLogin: typeof blankAdminLogin;
  setAdminLogin: React.Dispatch<React.SetStateAction<typeof blankAdminLogin>>;
  message: string;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className="public-only-shell">
      <section className="campaign-admin-login">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>Campaign admin access</span>
          </div>
        </div>
        <span className="eyebrow">Protected campaign admin</span>
        <h1>{campaign.title}</h1>
        <p>Login to manage this campaign, review signers, scan hard copies, send updates, and view reports.</p>
        <form className="form-stack" onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="Campaign admin email"
            value={adminLogin.email}
            onChange={(event) => setAdminLogin({ ...adminLogin, email: event.target.value })}
          />
          <input
            type="password"
            placeholder="Campaign admin passcode"
            value={adminLogin.passcode}
            onChange={(event) => setAdminLogin({ ...adminLogin, passcode: event.target.value })}
          />
          <button className="primary-button" type="submit">
            Login to campaign admin
          </button>
          {message && <p className="info-message">{message}</p>}
        </form>
      </section>
    </main>
  );
}

function CampaignAdminNotFound() {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Campaign admin</span>
        <h1>Campaign admin page not found.</h1>
        <p>Please check the admin link or ask the campaign owner to share the correct campaign admin URL.</p>
      </section>
    </main>
  );
}

function Hero({
  campaign,
  metrics,
  authority
}: {
  campaign: Campaign;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authority?: AuthorityRule;
}) {
  return (
    <div className="hero">
      <div>
        <span className="eyebrow">{campaign.status} campaign</span>
        <h1>{campaign.title}</h1>
        <p>{campaign.description}</p>
        <div className="button-row">
          <span className="status-pill">{campaign.category}</span>
          <span className="status-pill">{campaign.location}</span>
          {authority && <span className="status-pill">{authority.name}</span>}
        </div>
      </div>
      <div className="hero-progress">
        <strong>{metrics.progress}%</strong>
        <span>{metrics.verified.toLocaleString()} verified signatures</span>
        <div className="progress">
          <div style={{ width: `${metrics.progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? "wide field" : "field"}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function IndiaLocationFields({
  idPrefix,
  values,
  onChange,
  locationOverrides,
  locationDeletions,
  allowInlineAdd = false,
  onAddLocation,
  onRemoveLocation
}: {
  idPrefix: string;
  values: LocationWithPin;
  onChange: (values: LocationWithPin) => void;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  allowInlineAdd?: boolean;
  onAddLocation?: (values: LocationWithPin) => void;
  onRemoveLocation?: (values: LocationWithPin, level: LocationDeletionLevel) => void;
}) {
  const [newDistrict, setNewDistrict] = useState("");
  const [newBlock, setNewBlock] = useState("");
  const [newPanchayat, setNewPanchayat] = useState("");
  const districtOptions = getDistrictOptions(values.state, locationOverrides, locationDeletions);
  const blockOptions = getBlockOptions(values.state, values.district, locationOverrides, locationDeletions);
  const panchayatOptions = getPanchayatOptions(
    values.state,
    values.district,
    values.block,
    locationOverrides,
    locationDeletions
  );
  const pinOptions = getPinOptions(values);
  const canDeleteDistrict = Boolean(allowInlineAdd && values.state && values.district);
  const canDeleteBlock = Boolean(allowInlineAdd && values.state && values.district && values.block);
  const canDeletePanchayat = Boolean(
    allowInlineAdd && values.state && values.district && values.block && values.panchayat
  );

  function updateLocation(nextValues: LocationWithPin) {
    const matchedPin = findPinCode(nextValues);
    onChange({ ...nextValues, postalCode: matchedPin ?? nextValues.postalCode });
  }

  function selectState(state: string) {
    const districts = getDistrictOptions(state, locationOverrides, locationDeletions);
    const district = districts[0] ?? "";
    const blocks = getBlockOptions(state, district, locationOverrides, locationDeletions);
    const block = blocks[0] ?? "";
    const panchayats = getPanchayatOptions(state, district, block, locationOverrides, locationDeletions);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ state, district, block, panchayat, postalCode: "" });
  }

  function selectDistrict(district: string) {
    const blocks = getBlockOptions(values.state, district, locationOverrides, locationDeletions);
    const block = blocks[0] ?? "";
    const panchayats = getPanchayatOptions(values.state, district, block, locationOverrides, locationDeletions);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ ...values, district, block, panchayat, postalCode: "" });
  }

  function selectBlock(block: string) {
    const panchayats = getPanchayatOptions(values.state, values.district, block, locationOverrides, locationDeletions);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ ...values, block, panchayat, postalCode: "" });
  }

  function updatePin(postalCode: string) {
    const normalizedPin = postalCode.replace(/\D/g, "").slice(0, 6);
    const matchedLocation = findLocationByPin(normalizedPin);
    onChange(matchedLocation ? { ...matchedLocation } : { ...values, postalCode: normalizedPin });
  }

  function addDistrict() {
    const district = newDistrict.trim();
    if (!values.state || !district || optionExists(districtOptions, district)) return;
    const nextValues = { ...values, district, block: "", panchayat: "", postalCode: "" };
    onAddLocation?.(nextValues);
    updateLocation(nextValues);
    setNewDistrict("");
  }

  function addBlock() {
    const block = newBlock.trim();
    if (!values.state || !values.district || !block || optionExists(blockOptions, block)) return;
    const nextValues = { ...values, block, panchayat: "", postalCode: "" };
    onAddLocation?.(nextValues);
    updateLocation(nextValues);
    setNewBlock("");
  }

  function addPanchayat() {
    const panchayat = newPanchayat.trim();
    if (!values.state || !values.district || !values.block || !panchayat || optionExists(panchayatOptions, panchayat)) {
      return;
    }
    const nextValues = { ...values, panchayat };
    onAddLocation?.(nextValues);
    updateLocation(nextValues);
    setNewPanchayat("");
  }

  function deleteDistrict() {
    onRemoveLocation?.(values, "district");
    updateLocation({ ...values, district: "", block: "", panchayat: "", postalCode: "" });
  }

  function deleteBlock() {
    onRemoveLocation?.(values, "block");
    updateLocation({ ...values, block: "", panchayat: "", postalCode: "" });
  }

  function deletePanchayat() {
    onRemoveLocation?.(values, "panchayat");
    updateLocation({ ...values, panchayat: "", postalCode: "" });
  }

  return (
    <>
      <Field label="State / Union Territory">
        <select
          value={values.state}
          onChange={(event) => selectState(event.target.value)}
        >
          <option value="">Select state</option>
          {indianStatesAndUnionTerritories.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </Field>
      <Field label="District">
        <select
          value={values.district}
          onChange={(event) => selectDistrict(event.target.value)}
          disabled={!values.state || districtOptions.length === 0}
        >
          <option value="">{districtOptions.length ? "Select district" : "Select state first"}</option>
          {districtOptions.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
        {allowInlineAdd && (
          <>
            <InlineAddOption
              placeholder="Add missing district"
              value={newDistrict}
              onChange={setNewDistrict}
              onAdd={addDistrict}
              disabled={!values.state || !newDistrict.trim() || optionExists(districtOptions, newDistrict)}
              duplicate={Boolean(newDistrict.trim() && optionExists(districtOptions, newDistrict))}
            />
            {canDeleteDistrict && (
              <InlineDeleteOption label={`Delete district "${values.district}"`} onDelete={deleteDistrict} />
            )}
          </>
        )}
      </Field>
      <Field label="Block / Tehsil / Taluk">
        <select
          value={values.block}
          onChange={(event) => selectBlock(event.target.value)}
          disabled={!values.district || blockOptions.length === 0}
        >
          <option value="">{blockOptions.length ? "Select block / ward group" : "Select district first"}</option>
          {blockOptions.map((block) => (
            <option key={block} value={block}>
              {block}
            </option>
          ))}
        </select>
        {allowInlineAdd && (
          <>
            <InlineAddOption
              placeholder="Add missing block"
              value={newBlock}
              onChange={setNewBlock}
              onAdd={addBlock}
              disabled={!values.district || !newBlock.trim() || optionExists(blockOptions, newBlock)}
              duplicate={Boolean(newBlock.trim() && optionExists(blockOptions, newBlock))}
            />
            {canDeleteBlock && (
              <InlineDeleteOption label={`Delete block "${values.block}"`} onDelete={deleteBlock} />
            )}
          </>
        )}
      </Field>
      <Field label="Gram Panchayat / Ward">
        <select
          value={values.panchayat}
          onChange={(event) => updateLocation({ ...values, panchayat: event.target.value })}
          disabled={!values.block || panchayatOptions.length === 0}
        >
          <option value="">{panchayatOptions.length ? "Select panchayat / ward" : "Select block first"}</option>
          {panchayatOptions.map((panchayat) => (
            <option key={panchayat} value={panchayat}>
              {panchayat}
            </option>
          ))}
        </select>
        {allowInlineAdd && (
          <>
            <InlineAddOption
              placeholder="Add missing panchayat/ward"
              value={newPanchayat}
              onChange={setNewPanchayat}
              onAdd={addPanchayat}
              disabled={!values.block || !newPanchayat.trim() || optionExists(panchayatOptions, newPanchayat)}
              duplicate={Boolean(newPanchayat.trim() && optionExists(panchayatOptions, newPanchayat))}
            />
            {canDeletePanchayat && (
              <InlineDeleteOption label={`Delete panchayat/ward "${values.panchayat}"`} onDelete={deletePanchayat} />
            )}
          </>
        )}
      </Field>
      <Field label="PIN code">
        <input
          inputMode="numeric"
          list={`${idPrefix}-pins`}
          maxLength={6}
          placeholder="Auto-filled or enter 6-digit PIN"
          value={values.postalCode}
          onChange={(event) => updatePin(event.target.value)}
        />
        <datalist id={`${idPrefix}-pins`}>
          {pinOptions.map((pinCode) => (
            <option key={pinCode} value={pinCode} />
          ))}
        </datalist>
      </Field>
    </>
  );
}

function InlineAddOption({
  placeholder,
  value,
  onChange,
  onAdd,
  disabled,
  duplicate
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  disabled: boolean;
  duplicate: boolean;
}) {
  return (
    <div className="inline-add-option">
      <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      <button className="inline-add-button" type="button" onClick={onAdd} disabled={disabled} title="Add to dropdown">
        <Plus size={16} />
      </button>
      {duplicate && <small>Already in dropdown</small>}
    </div>
  );
}

function InlineDeleteOption({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <button
      className="inline-delete-option"
      type="button"
      onClick={() => {
        if (window.confirm(`${label}?`)) {
          onDelete();
        }
      }}
    >
      <Trash2 size={16} />
      {label}
    </button>
  );
}

function optionExists(options: string[], value: string) {
  const normalizedValue = value.trim().toLowerCase();
  return options.some((option) => option.trim().toLowerCase() === normalizedValue);
}

function getLocationLevel(values: LocationWithPin): LocationDeletionLevel {
  if (values.panchayat.trim()) return "panchayat";
  if (values.block.trim()) return "block";
  return "district";
}

function signerFieldLabel(field: string) {
  const labels: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    state: "State",
    district: "District",
    block: "Block / Tehsil / Taluk",
    panchayat: "Gram Panchayat / Ward",
    address: "Street address / house details",
    postalCode: "PIN code",
    comment: "Comment"
  };

  return labels[field] ?? field;
}

function getCampaignBaseUrl(organization: Organization) {
  if (organization.customDomain.trim()) {
    return `https://${organization.customDomain.trim().replace(/^https?:\/\//, "")}`;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "https://voiceup.in";
}

function getPublicCampaignSlug() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.match(/^\/c\/([^/]+)/)?.[1] ?? "";
}

function getCampaignAdminSlug() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.match(/^\/admin\/([^/]+)/)?.[1] ?? "";
}

function getIsAppRoute() {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");
}

function getLegalPage() {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/^\//, "");
  if (path === "privacy" || path === "terms" || path === "refund" || path === "data-deletion") return path;
  return null;
}

function updateSeoMetadata(campaign: Campaign | undefined, legalPage: ReturnType<typeof getLegalPage>, isPublicCampaignRoute: boolean) {
  if (typeof document === "undefined") return;

  const title = isPublicCampaignRoute && campaign ? `${campaign.title} | Voiceup Bharat` : "Voiceup Bharat";
  const description =
    isPublicCampaignRoute && campaign
      ? campaign.description || campaign.appealContent
      : legalPage
        ? `${legalPage} | Voiceup Bharat`
        : "Voiceup Bharat helps Indian organizations create public campaigns, collect support, and engage participants.";

  document.title = title;
  setMetaTag("description", description);
  setMetaProperty("og:title", title);
  setMetaProperty("og:description", description);
  setMetaProperty("og:type", isPublicCampaignRoute ? "article" : "website");
}

function setMetaTag(name: string, content: string) {
  let element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setMetaProperty(property: string, content: string) {
  let element = document.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function createAdminPasscode() {
  return `voiceup-${Math.random().toString(36).slice(2, 8)}`;
}

function getAppAdminEmail() {
  return (import.meta.env.VITE_VOICEUP_APP_ADMIN_EMAIL as string | undefined) || "admin@voiceup.live";
}

function getAppAdminPasscode() {
  return (import.meta.env.VITE_VOICEUP_APP_ADMIN_PASSCODE as string | undefined) || "voiceup-admin";
}

function getCurrentActorEmail() {
  if (typeof window !== "undefined" && window.sessionStorage.getItem("voiceup-saas-admin-auth") === "true") {
    return getAppAdminEmail();
  }
  return "system";
}

function getCampaignAdminEmail(campaign: Campaign) {
  return campaign.adminEmail || "admin@voiceup.in";
}

function getCampaignAdminPasscode(campaign: Campaign) {
  return campaign.adminPasscode || "voiceup-admin";
}

function createRemoteState(state: VoiceupRemoteState): VoiceupRemoteState {
  return {
    campaigns: state.campaigns,
    signers: state.signers,
    authorities: state.authorities,
    organization: state.organization,
    scanItems: state.scanItems,
    locationOverrides: state.locationOverrides,
    locationDeletions: state.locationDeletions,
    auditLogs: state.auditLogs ?? [],
    integrations: state.integrations ?? initialIntegrationSettings
  };
}

function getAppealAuthority(campaign: Campaign): AuthorityRule {
  const level = campaign.authorityTargetLevel ?? "district";

  if (level === "country") {
    return {
      id: "authority-prime-minister-india",
      name: "Prime Minister of India",
      department: "Government of India",
      category: "Any",
      locationKeyword: "india",
      postalPrefix: "",
      email: "pmopg@gov.in",
      submissionMethod: "Portal",
      confidence: 100
    };
  }

  if (level === "state") {
    return {
      id: `authority-chief-minister-${campaign.state || "state"}`,
      name: campaign.state ? `Chief Minister of ${campaign.state}` : "Chief Minister of the selected state",
      department: "State Government",
      category: "Any",
      locationKeyword: campaign.state,
      postalPrefix: "",
      email: "Configure official CMO contact",
      submissionMethod: "Portal",
      confidence: 100
    };
  }

  return {
    id: `authority-district-collector-${campaign.district || "district"}`,
    name: campaign.district ? `District Collector, ${campaign.district}` : "District Collector of the selected district",
    department: "District Administration",
    category: "Any",
    locationKeyword: campaign.district,
    postalPrefix: campaign.postalCode.slice(0, 3),
    email: "Configure official district collector contact",
    submissionMethod: "Email",
    confidence: 100
  };
}

function readAuthenticatedAdminSlugs() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem("voiceup-campaign-admin-auth") ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeAuthenticatedAdminSlugs(values: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("voiceup-campaign-admin-auth", JSON.stringify(values));
}

function readAppAuth() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem("voiceup-saas-admin-auth") === "true";
}

function writeAppAuth(value: boolean) {
  if (typeof window === "undefined") return;
  if (value) {
    window.sessionStorage.setItem("voiceup-saas-admin-auth", "true");
  } else {
    window.sessionStorage.removeItem("voiceup-saas-admin-auth");
  }
}

function renderCampaignMessage(
  template: string,
  campaign: Campaign,
  metrics: ReturnType<typeof getCampaignMetrics>
) {
  return template
    .split("{{campaign}}").join(campaign.title)
    .split("{{url}}").join(campaign.shareUrl)
    .split("{{verified}}").join(metrics.verified.toLocaleString())
    .split("{{total}}").join(metrics.total.toLocaleString())
    .split("{{goal}}").join(campaign.goal.toLocaleString())
    .split("{{progress}}").join(`${metrics.progress}%`);
}

function whatsAppLink(phone: string, message: string) {
  const normalizedPhone = phone.replace(/\D/g, "");
  const baseUrl = normalizedPhone ? `https://wa.me/${normalizedPhone}` : "https://wa.me/";
  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

function smsLink(phone: string, message: string) {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  return `sms:${normalizedPhone}?&body=${encodeURIComponent(message)}`;
}

function BarList({ data, emptyLabel }: { data: Record<string, number>; emptyLabel: string }) {
  const max = Math.max(...Object.values(data), 1);
  const entries = Object.entries(data).sort(([first], [second]) => first.localeCompare(second));
  if (entries.length === 0) return <p>{emptyLabel}</p>;
  return (
    <div className="bar-list">
      {entries.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <span>{label}</span>
          <div>
            <i style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ReportBlock({ title, data }: { title: string; data: Record<string, number> }) {
  return (
    <div className="report-block">
      <h3>{title}</h3>
      <BarList data={data} emptyLabel="No report data yet." />
    </div>
  );
}

function PlanCard({
  title,
  price,
  features,
  highlighted,
  actionLabel,
  onSelect
}: {
  title: string;
  price: string;
  features: string[];
  highlighted?: boolean;
  actionLabel?: string;
  onSelect?: () => void;
}) {
  return (
    <div className={highlighted ? "plan-card highlighted" : "plan-card"}>
      <h3>{title}</h3>
      <strong>{price}</strong>
      <ul>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {onSelect && (
        <button className={actionLabel === "Selected" ? "primary-button" : "secondary-button"} type="button" onClick={onSelect}>
          {actionLabel ?? "Select plan"}
        </button>
      )}
    </div>
  );
}

function EmptyWorkspace({
  organization,
  onCreateCampaign,
  onOpenSubscription
}: {
  organization: Organization;
  onCreateCampaign: () => void;
  onOpenSubscription: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="marketing-banner">
        <span>Voice Up</span>
        <strong>Voice Up to make your campaign successful</strong>
        <small>Launch, promote, collect support, report progress, and keep every participant engaged.</small>
      </div>
      <span className="eyebrow">Clean workspace</span>
      <h1>Start with your Indian organization and first public campaign.</h1>
      <p>
        No demo campaigns, fake signers, or sample authority records are loaded. Configure the NGO, RWA, association,
        union, or campaign agency, choose an INR subscription, then create the first campaign.
      </p>
      <div className="onboarding-grid">
        <div>
          <strong>1. Configure organization</strong>
          <span>{organization.name || "Organization details are not set yet."}</span>
        </div>
        <div>
          <strong>2. Select subscription</strong>
          <span>
            {organization.plan} plan, {organization.subscriptionStatus.toLowerCase()} status
          </span>
        </div>
        <div>
          <strong>3. Create campaign</strong>
          <span>Set goal, public page, authority rules, PIN code routing, and required signer fields.</span>
        </div>
      </div>
      <div className="button-row">
        <button className="primary-button" type="button" onClick={onCreateCampaign}>
          <Plus size={18} /> Create first campaign
        </button>
        <button className="secondary-button" type="button" onClick={onOpenSubscription}>
          <WalletCards size={18} /> Configure subscription
        </button>
      </div>
    </div>
  );
}

function NoCampaignPanel({
  title,
  description,
  onCreateCampaign
}: {
  title: string;
  description: string;
  onCreateCampaign: () => void;
}) {
  return (
    <div className="empty-state compact-empty">
      <span className="eyebrow">No campaign data</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="primary-button" type="button" onClick={onCreateCampaign}>
        <Plus size={18} /> Create campaign
      </button>
    </div>
  );
}

function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = window.localStorage.getItem(key);
    if (!stored) return initialValue;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

const blankScanTemplate = `Name:
Email:
Phone:
State:
District:
Block:
Gram Panchayat:
Address:
PIN Code:
Comment:`;

export default App;
