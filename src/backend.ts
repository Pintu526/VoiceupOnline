import { createClient } from "@supabase/supabase-js";
import type {
  AuditLogEntry,
  AuthorityRule,
  Campaign,
  CommercialPackage,
  IntegrationSettings,
  Organization,
  ScanReviewItem,
  Signer
} from "./types";
import type { LocationDeletions, LocationOverrides } from "./geography";

export interface VoiceupRemoteState {
  campaigns: Campaign[];
  signers: Signer[];
  authorities: AuthorityRule[];
  organization: Organization;
  scanItems: ScanReviewItem[];
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  auditLogs?: AuditLogEntry[];
  integrations?: IntegrationSettings;
  commercialPackages?: CommercialPackage[];
}

export interface VoiceupAccessContext {
  platformAdmin: boolean;
  workspaceMember: boolean;
  customerWorkspace: boolean;
  role: string;
  email: string;
  workspaceId: string;
}

export interface PublicCampaignPayload {
  campaign: Campaign;
  organization?: Organization;
  authorities: AuthorityRule[];
  metrics: {
    total: number;
    verified: number;
    pending: number;
    duplicates: number;
    online: number;
    scanned: number;
    progress: number;
  };
}

export interface OtpRequestResult {
  challengeId: string;
  resendAfterSeconds: number;
  message: string;
}

export interface OtpVerifyResult {
  verified: boolean;
  verificationToken: string;
  customerSessionToken?: string;
  workspaceId?: string;
  message: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const fallbackWorkspaceId = (import.meta.env.VITE_VOICEUP_WORKSPACE_ID as string | undefined) || "default";
const customerSessionKey = "voiceup-customer-session-v1";
const customerWorkspaceKey = "voiceup-customer-workspace-v1";

export const isBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = isBackendConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export const isSupabaseAuthAvailable = Boolean(supabase);
export const isSupabaseStorageAvailable = Boolean(supabase);

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function createId(prefix: string) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${Date.now()}-${random}`;
}

function createSecureToken(prefix: string) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${random}`;
}

function slugifyValue(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "voice-campaign";
}

function toTitleCase(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "New Voiceup Campaign";
}

function inferGoal(goalText: string) {
  const numberMatch = String(goalText || "").replace(/,/g, "").match(/\d{2,}/);
  if (!numberMatch) return 100;
  const parsed = Number(numberMatch[0]);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 25), 1000000);
}

function inferCategory(text: string): Campaign["category"] {
  const normalized = String(text || "").toLowerCase();
  if (/cow|forest|tree|river|water|pollution|climate|animal|environment/.test(normalized)) return "Environment";
  if (/school|student|college|education|teacher/.test(normalized)) return "Education";
  if (/blood|health|hospital|doctor|medicine|clinic/.test(normalized)) return "Health";
  if (/road|bus|train|traffic|transport|metro/.test(normalized)) return "Transport";
  if (/house|housing|rent|slum|apartment/.test(normalized)) return "Housing";
  return "Civic";
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}

function normalizePhone(value: string) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function hasDuplicateSigner(candidate: unknown, signers: Signer[], campaignId: string) {
  const input = (candidate ?? {}) as Record<string, unknown>;
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(input.phone ?? ""));
  return signers.some((signer) => {
    if (signer.campaignId !== campaignId) return false;
    const signerEmail = String(signer.email ?? "").trim().toLowerCase();
    const signerPhone = normalizePhone(String(signer.phone ?? ""));
    return Boolean((email && signerEmail === email) || (phone && signerPhone === phone));
  });
}

function getCampaignMetrics(campaign: Campaign, signers: Signer[]): PublicCampaignPayload["metrics"] {
  const campaignSigners = signers.filter((signer) => signer.campaignId === campaign.id);
  const verified = campaignSigners.filter((signer) => signer.status === "verified").length;
  const pending = campaignSigners.filter((signer) => signer.status === "pending").length;
  const duplicates = campaignSigners.filter((signer) => signer.status === "duplicate").length;
  const online = campaignSigners.filter((signer) => signer.source === "online").length;
  const scanned = campaignSigners.filter((signer) => signer.source === "scan").length;
  const target = campaign.maxSignersAllowed > 0 ? campaign.maxSignersAllowed : campaign.goal;
  return {
    total: campaignSigners.length,
    verified,
    pending,
    duplicates,
    online,
    scanned,
    progress: target > 0 ? Math.min(Math.round((verified / target) * 100), 100) : 0
  };
}

function sanitizePublicOrganization(organization: Organization) {
  return {
    id: organization.id,
    name: organization.name,
    plan: organization.plan,
    subscriptionStatus: organization.subscriptionStatus,
    trialEndsAt: organization.trialEndsAt,
    monthlySignatureLimit: organization.monthlySignatureLimit,
    monthlyScanLimit: organization.monthlyScanLimit,
    monthlyMessageLimit: organization.monthlyMessageLimit,
    bonusSignatureCredits: organization.bonusSignatureCredits ?? 0,
    bonusScanCredits: organization.bonusScanCredits ?? 0,
    bonusMessageCredits: organization.bonusMessageCredits ?? 0,
    customBranding: Boolean(organization.customBranding),
    customDomain: organization.customDomain ?? "",
    ownerEmail: "",
    billingEmail: "",
    seats: organization.seats ?? 1,
    paymentReference: "",
    enabledFeatureKeys: organization.enabledFeatureKeys ?? []
  };
}

function publicAuthoritiesForCampaign(state: VoiceupRemoteState, campaign: Campaign) {
  return Array.isArray(state.authorities)
    ? state.authorities.filter((authority) => {
        if (authority.category && authority.category !== "Any" && authority.category !== campaign.category) return false;
        if (authority.state && campaign.state && authority.state !== campaign.state) return false;
        if (authority.district && campaign.district && authority.district !== campaign.district) return false;
        return true;
      })
    : [];
}

async function loadWorkspaceStateById(workspaceId: string): Promise<VoiceupRemoteState | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("voiceup_workspaces")
    .select("data")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data as VoiceupRemoteState | null) ?? null;
}

async function saveWorkspaceState(workspaceId: string, state: VoiceupRemoteState): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("voiceup_workspaces")
    .upsert({ id: workspaceId, data: state, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

async function upsertPublicCampaignIndex(workspaceId: string, state: VoiceupRemoteState): Promise<void> {
  const client = requireSupabase();
  const publishedRows = (state.campaigns ?? [])
    .filter((campaign) => campaign.slug && campaign.status === "Published")
    .map((campaign) => ({
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      slug: campaign.slug,
      status: campaign.status,
      campaign,
      organization: sanitizePublicOrganization(state.organization),
      authorities: publicAuthoritiesForCampaign(state, campaign),
      metrics: getCampaignMetrics(campaign, state.signers ?? []),
      updated_at: new Date().toISOString()
    }));

  if (publishedRows.length === 0) return;
  const { error } = await client
    .from("voiceup_public_campaign_index")
    .upsert(publishedRows, { onConflict: "workspace_id,campaign_id" });
  if (error) throw new Error(error.message);
}

function readCustomerSessionToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(customerSessionKey) ?? "";
}

function readWorkspaceId(): string {
  if (typeof window === "undefined") return fallbackWorkspaceId;
  return window.localStorage.getItem(customerWorkspaceKey) || fallbackWorkspaceId;
}

export function clearCustomerSessionToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(customerSessionKey);
  window.localStorage.removeItem(customerWorkspaceKey);
}

function writeCustomerSessionToken(token: string, workspaceId?: string): void {
  if (typeof window === "undefined" || !token) return;
  window.localStorage.setItem(customerSessionKey, token);
  if (workspaceId) window.localStorage.setItem(customerWorkspaceKey, workspaceId);
}

export async function getCurrentAuthUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getAuthContext(): Promise<VoiceupAccessContext> {
  const client = supabase;
  if (!client) {
    return {
      platformAdmin: false,
      workspaceMember: false,
      customerWorkspace: false,
      role: "",
      email: "",
      workspaceId: fallbackWorkspaceId
    };
  }

  const workspaceId = readWorkspaceId();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userError ? null : userData.user;
  if (!user) {
    return {
      platformAdmin: false,
      workspaceMember: false,
      customerWorkspace: Boolean(readCustomerSessionToken()),
      role: "",
      email: "",
      workspaceId
    };
  }

  const { data: membership } = await client
    .from("voiceup_workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: platformMembership } = await client
    .from("voiceup_workspace_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "platform_owner")
    .limit(1)
    .maybeSingle();

  const platformAdmin = Boolean(platformMembership);
  const workspaceMember = Boolean(membership);
  const role = platformAdmin ? "platform_owner" : (membership?.role ?? "");

  return {
    platformAdmin,
    workspaceMember,
    customerWorkspace: Boolean(readCustomerSessionToken()),
    role,
    email: user.email ?? "",
    workspaceId
  };
}

export async function signInWithSupabase(email: string, password: string) {
  if (!supabase) {
    throw new Error("Supabase Auth is required for platform administration.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return data.user;
}

export async function signOutSupabase() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function loadRemoteState() {
  if (!supabase) return null;
  return loadWorkspaceStateById(readWorkspaceId());
}

export async function saveRemoteState(state: VoiceupRemoteState) {
  if (!supabase) return;
  await saveWorkspaceState(readWorkspaceId(), state);
  await upsertPublicCampaignIndex(readWorkspaceId(), state);
}

export async function loadPublicCampaign(slug: string): Promise<PublicCampaignPayload | null> {
  const client = supabase;
  if (!client) return null;

  const { data, error } = await client
    .from("voiceup_public_campaign_index")
    .select("campaign, organization, authorities, metrics")
    .eq("slug", slug)
    .eq("status", "Published")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.campaign) return null;

  return {
    campaign: data.campaign as Campaign,
    organization: (data.organization as Organization | null) ?? undefined,
    authorities: (data.authorities as AuthorityRule[] | null) ?? [],
    metrics: (data.metrics as PublicCampaignPayload["metrics"] | null) ?? {
      total: 0,
      verified: 0,
      pending: 0,
      duplicates: 0,
      online: 0,
      scanned: 0,
      progress: 0
    }
  };
}

export async function createTrialWorkspace(payload: unknown): Promise<{
  result: {
    campaign: Campaign;
    organization: Organization;
    userId: string;
    tenantId: string;
    workspaceId: string;
    shareUrl: string;
    shortUrl: string;
    qrValue: string;
    trialEndsAt: string;
    restored: boolean;
  };
  state: VoiceupRemoteState;
  customerSessionToken: string;
}> {
  const body = (payload ?? {}) as Record<string, unknown>;
  const workspaceId = createId("ws");
  const userId = createId("guest");
  const tenantId = createId("tenant");
  const campaignId = createId("cmp");
  const campaignName = String(body.campaignName ?? "");
  const campaignGoal = String(body.campaignGoal ?? "");
  const businessName = String(body.businessName ?? "Voiceup campaign").trim() || "Voiceup campaign";
  const country = String(body.country ?? "India").trim() || "India";
  const email = String(body.email ?? "").trim();
  const title = toTitleCase(campaignName || campaignGoal || "New Voiceup Campaign");
  const slug = slugifyValue(campaignName || campaignGoal || `voice-campaign-${Date.now()}`);
  const goal = inferGoal(campaignGoal);
  const trialEndsAt = addDaysIso(1);

  const organization: Organization = {
    id: tenantId,
    name: businessName,
    plan: "Free Trial",
    subscriptionStatus: "Trial",
    trialEndsAt,
    monthlySignatureLimit: 100,
    monthlyScanLimit: 10,
    monthlyMessageLimit: 0,
    bonusSignatureCredits: 0,
    bonusScanCredits: 0,
    bonusMessageCredits: 0,
    customBranding: false,
    customDomain: "",
    ownerEmail: email,
    billingEmail: email,
    seats: 1,
    paymentReference: "",
    billingCadence: "monthly",
    campaignDurationDays: 30,
    supporterCountEstimate: Math.min(goal, 100),
    enabledFeatureKeys: ["public_signing", "basic_reports"],
    prepaidWalletEnabled: false,
    prepaidWalletMode: "online_payment",
    signaturePriceInr: 0,
    signatureWalletBalanceInr: 0,
    signaturePinPrefix: "VUP"
  };

  const campaign: Campaign = {
    id: campaignId,
    title,
    slug,
    category: inferCategory(`${campaignName} ${campaignGoal}`),
    description: `${businessName} is launching a public campaign in ${country} to ${campaignGoal} Add your voice and help build visible support.`,
    appealContent: `I support "${title}" and request the relevant authority, community leaders, and stakeholders to take timely action. ${campaignGoal}`,
    authorityTargetLevel: "country",
    authoritySelectionMode: "admin_enforced",
    selectedAuthorityId: "",
    geographyMode: "global",
    campaignScope: country === "Other" ? "global" : "national",
    country,
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
    location: country,
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
    maxSignersAllowed: Math.min(goal, 100),
    maxScansAllowed: 10,
    shareUrl: `${window.location.origin.replace(/\/$/, "")}/c/${slug}`,
    adminUrl: `${window.location.origin.replace(/\/$/, "")}/admin/${slug}`,
    adminEmail: email,
    adminPasscode: createSecureToken("camp").slice(0, 18),
    qrLabel: "VOICEUP-GLOBAL-TRIAL",
    heroImage: "",
    heroImagePosition: "center center",
    heroImageZoom: 120,
    campaignVideoUrl: "",
    socialShareText: `Add your voice to ${title}.`,
    thankYouMessage: `Thank you for signing ${title}. Share this campaign: {{url}}`,
    participantUpdateMessage: `{{campaign}} update: {{verified}} verified supporters have joined. Share this campaign: {{url}}`,
    signerLocationRestrictionLevel: "none"
  };

  const state: VoiceupRemoteState = {
    campaigns: [campaign],
    signers: [],
    authorities: [],
    organization,
    scanItems: [],
    locationOverrides: {},
    locationDeletions: { districts: [], blocks: [], panchayats: [] },
    auditLogs: [
      {
        id: createId("audit"),
        action: "campaign.created",
        actor: email || String(body.mobileNumber ?? ""),
        campaignId,
        description: `Created public onboarding campaign "${title}"`,
        createdAt: new Date().toISOString(),
        metadata: {
          userId,
          tenantId,
          workspaceId,
          source: String((body.tracking as Record<string, unknown> | undefined)?.utmSource ?? "direct"),
          deviceId: String((body.tracking as Record<string, unknown> | undefined)?.deviceId ?? "")
        }
      },
      {
        id: createId("audit"),
        action: "campaign.published",
        actor: email || String(body.mobileNumber ?? ""),
        campaignId,
        description: "Published campaign from 60-second onboarding",
        createdAt: new Date().toISOString(),
        metadata: { shareUrl: campaign.shareUrl, trialEndsAt }
      }
    ],
    integrations: {
      razorpayKeyId: "",
      razorpayPlanReference: "",
      whatsappProvider: "Not configured",
      whatsappSenderId: "",
      smsProvider: "Not configured",
      smsSenderId: "",
      emailProvider: "Not configured",
      emailSender: "",
      storageProvider: "Supabase Storage",
      storageBucket: "voiceup-campaign-media",
      analyticsProvider: "Vercel Analytics",
      analyticsKey: ""
    },
    commercialPackages: []
  };

  await saveWorkspaceState(workspaceId, state);
  await upsertPublicCampaignIndex(workspaceId, state);

  const customerSessionToken = createSecureToken("cust");
  writeCustomerSessionToken(customerSessionToken, workspaceId);

  return {
    result: {
      campaign,
      organization,
      userId,
      tenantId,
      workspaceId,
      shareUrl: campaign.shareUrl,
      shortUrl: campaign.shareUrl,
      qrValue: campaign.shareUrl,
      trialEndsAt,
      restored: false
    },
    state,
    customerSessionToken
  };
}

export async function submitPublicSignatureSecure(
  slug: string,
  signer: unknown
): Promise<{ signer: Signer; message: string; metrics: PublicCampaignPayload["metrics"] }> {
  const client = requireSupabase();
  const signerInput = (signer ?? {}) as Record<string, unknown>;

  const { data: indexRow, error: indexError } = await client
    .from("voiceup_public_campaign_index")
    .select("workspace_id, campaign_id, campaign")
    .eq("slug", slug)
    .eq("status", "Published")
    .limit(1)
    .maybeSingle();
  if (indexError) throw new Error(indexError.message);
  if (!indexRow?.workspace_id || !indexRow?.campaign_id) {
    throw new Error("Campaign is not available for signing.");
  }

  const state = await loadWorkspaceStateById(indexRow.workspace_id);
  if (!state) throw new Error("Campaign workspace is not available.");

  const campaign = (state.campaigns ?? []).find((item) => item.id === indexRow.campaign_id && item.slug === slug);
  if (!campaign || campaign.status !== "Published") {
    throw new Error("Campaign is not available for signing.");
  }

  const requiredFields = Array.isArray(campaign.requiredFields) ? campaign.requiredFields : ["name", "phone"];
  const missingField = requiredFields.find((field) => !String(signerInput[field] ?? "").trim());
  if (missingField) throw new Error(`${missingField} is required.`);

  const signers = Array.isArray(state.signers) ? state.signers : [];
  if (campaign.maxSignersAllowed > 0 && signers.filter((item) => item.campaignId === campaign.id).length >= campaign.maxSignersAllowed) {
    throw new Error("This campaign has reached its signer limit.");
  }
  const monthlyKey = new Date().toISOString().slice(0, 7);
  const monthlySigners = signers.filter((item) => String(item.signedAt ?? "").slice(0, 7) === monthlyKey);
  const monthlyLimit = Number(state.organization?.monthlySignatureLimit ?? 0) + Number(state.organization?.bonusSignatureCredits ?? 0);
  if (monthlyLimit > 0 && monthlySigners.length >= monthlyLimit) {
    throw new Error("This campaign owner has reached the monthly signer limit.");
  }

  const authority =
    (Array.isArray(state.authorities)
      ? state.authorities.find((item) => item.id === signerInput.selectedAuthorityId || item.id === campaign.selectedAuthorityId)
      : null) ?? {
      id: campaign.selectedAuthorityId ?? "",
      name: String(signerInput.selectedAuthorityName ?? "") || "Selected authority"
    };

  const duplicate = hasDuplicateSigner(signerInput, signers, campaign.id);
  const phone = normalizePhone(String(signerInput.phone ?? ""));
  const createdSigner: Signer = {
    id: createId("sig"),
    campaignId: campaign.id,
    name: String(signerInput.name ?? "").trim(),
    email: String(signerInput.email ?? "").trim(),
    phone,
    whatsappNumber: String(signerInput.whatsappNumber ?? "").trim(),
    telegramHandle: String(signerInput.telegramHandle ?? "").trim(),
    otpVerified: true,
    selectedAuthorityId: String(authority.id ?? ""),
    selectedAuthorityName: String(authority.name ?? ""),
    country: String(signerInput.country ?? "").trim(),
    state: String(signerInput.state ?? "").trim(),
    district: String(signerInput.district ?? "").trim(),
    block: String(signerInput.block ?? "").trim(),
    panchayat: String(signerInput.panchayat ?? "").trim(),
    address: String(signerInput.address ?? "").trim(),
    postalCode: String(signerInput.postalCode ?? "").trim(),
    comment: String(signerInput.comment ?? "").trim() || `Accepted published appeal: ${campaign.appealContent || campaign.description}`,
    referralCode: String(signerInput.referralCode ?? "").trim() || createId("ref").slice(-10).toUpperCase(),
    referredBy: String(signerInput.referredBy ?? "").trim(),
    referredByPhoneOrCode: String(signerInput.referredByPhoneOrCode ?? "").trim(),
    referralSource: (signerInput.referralSource as Signer["referralSource"] | undefined) || undefined,
    source: "online",
    status: duplicate ? "duplicate" : "verified",
    signedAt: new Date().toISOString(),
    reviewerNote: duplicate ? "Possible duplicate signature." : undefined
  };

  const signedAuditLog: AuditLogEntry = {
    id: createId("audit"),
    action: "campaign.signed",
    actor: createdSigner.name || createdSigner.phone,
    campaignId: campaign.id,
    description: `${createdSigner.name || "Supporter"} signed "${campaign.title}"`,
    createdAt: new Date().toISOString(),
    metadata: { source: "public-client" }
  };

  const nextState: VoiceupRemoteState = {
    ...state,
    signers: [createdSigner, ...signers],
    auditLogs: [
      signedAuditLog,
      ...(Array.isArray(state.auditLogs) ? state.auditLogs : [])
    ].slice(0, 500)
  };

  await saveWorkspaceState(indexRow.workspace_id, nextState);
  await upsertPublicCampaignIndex(indexRow.workspace_id, nextState);

  return {
    signer: createdSigner,
    message: duplicate
      ? "Thanks. This looks like a duplicate, so it was sent to review."
      : "Thank you. Your signature has been recorded.",
    metrics: getCampaignMetrics(campaign, nextState.signers)
  };
}

export async function uploadFileToStorage(bucket: string, path: string, file: File) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    throw new Error("Authenticated workspace access is required before uploading files.");
  }

  const workspaceScopedPath = path.startsWith(`${readWorkspaceId()}/`)
    ? path
    : `${readWorkspaceId()}/${path}`;

  const { error } = await supabase.storage.from(bucket).upload(workspaceScopedPath, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: false
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(workspaceScopedPath);

  return {
    path: workspaceScopedPath,
    publicUrl: data.publicUrl
  };
}
