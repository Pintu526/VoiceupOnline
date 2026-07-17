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
import {
  evaluateSecureFieldUploadAccess,
  type SecureFieldUploadAccess
} from "./secureFieldUploadAuth";

export interface VoiceupRemoteState {
  campaigns: Campaign[];
  signers: Signer[];
  authorities: AuthorityRule[];
  organization: Organization;
  activeCampaignId?: string;
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
const supabaseClientIdentityIds = new WeakMap<object, number>();
let nextSupabaseClientIdentityId = 1;
let signInSupabaseClientReference: typeof supabase = null;
let verifySupabaseClientReference: typeof supabase = null;

function getSupabaseClientIdentityId(client: typeof supabase): number | null {
  if (!client) return null;
  const existingIdentityId = supabaseClientIdentityIds.get(client);
  if (existingIdentityId) return existingIdentityId;
  const identityId = nextSupabaseClientIdentityId;
  nextSupabaseClientIdentityId += 1;
  supabaseClientIdentityIds.set(client, identityId);
  return identityId;
}

function logSupabaseClientIdentity(context: "signInWithSupabase" | "verifySecureFieldUploadAccess") {
  const client = supabase;
  if (context === "signInWithSupabase") signInSupabaseClientReference = client;
  if (context === "verifySecureFieldUploadAccess") verifySupabaseClientReference = client;

  const identityId = getSupabaseClientIdentityId(client);
  console.debug("[AUTH CLIENT IDENTITY]", {
    context,
    clientIdentity: identityId === null ? "null" : `SupabaseClient#${identityId}`,
    memoryReference: identityId === null ? "null" : `WeakMapReference#${identityId}`,
    constructor: client?.constructor?.name ?? "null",
    signInClientIdentity: getSupabaseClientIdentityId(signInSupabaseClientReference),
    verifyClientIdentity: getSupabaseClientIdentityId(verifySupabaseClientReference),
    objectIsComparison: Object.is(signInSupabaseClientReference, verifySupabaseClientReference),
    strictEqualityComparison: signInSupabaseClientReference === verifySupabaseClientReference
  });
}

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

async function inspectWorkspaceStateById(workspaceId: string): Promise<{
  rowFound: boolean;
  campaignCount: number;
  campaignIds: string[];
}> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("voiceup_workspaces")
    .select("data")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const state = (data?.data as VoiceupRemoteState | null) ?? null;
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns : [];

  return {
    rowFound: Boolean(data),
    campaignCount: campaigns.length,
    campaignIds: campaigns.map((campaign) => campaign.id)
  };
}

async function saveWorkspaceState(workspaceId: string, state: VoiceupRemoteState): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("voiceup_workspaces")
    .upsert({ id: workspaceId, data: state, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

async function listWorkspaceStates(): Promise<Array<{ id: string; data: VoiceupRemoteState | null }>> {
  const client = requireSupabase();
  const { data, error } = await client.from("voiceup_workspaces").select("id,data");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; data: VoiceupRemoteState | null }>;
}

async function findPublishedCampaignBySlug(
  slug: string
): Promise<{ workspaceId: string; state: VoiceupRemoteState; campaign: Campaign } | null> {
  const rows = await listWorkspaceStates();
  for (const row of rows) {
    const state = row.data;
    if (!state || !Array.isArray(state.campaigns)) continue;
    const campaign = state.campaigns.find((item) => item.slug === slug && item.status === "Published");
    if (campaign) return { workspaceId: row.id, state, campaign };
  }
  return null;
}

function readCustomerSessionToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(customerSessionKey) ?? "";
}

function readWorkspaceId(): string {
  if (typeof window === "undefined") return fallbackWorkspaceId;
  return window.localStorage.getItem(customerWorkspaceKey) || fallbackWorkspaceId;
}

export function getCurrentWorkspaceId(): string {
  return readWorkspaceId();
}

interface WorkspaceMembershipContext {
  workspaceId: string;
  workspaceMember: boolean;
  platformAdmin: boolean;
  role: string;
}

async function resolveWorkspaceMembershipContext(userId: string): Promise<WorkspaceMembershipContext> {
  const { data: orgMembership } = await requireSupabase()
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const { data: workspaceMembership } = await requireSupabase()
    .from("voiceup_workspace_members")
    .select("workspace_id,role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const orgRole = orgMembership?.role ?? "";
  const workspaceRole = workspaceMembership?.role ?? "";
  const role = workspaceRole || orgRole;

  return {
    workspaceId: workspaceMembership?.workspace_id ?? "",
    workspaceMember: Boolean(workspaceMembership?.workspace_id),
    platformAdmin: role === "platform_owner",
    role
  };
}

async function resolveWorkspaceId(): Promise<string | null> {
  if (!supabase) return readWorkspaceId();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userError ? null : userData.user;
  if (user) {
    const membership = await resolveWorkspaceMembershipContext(user.id);
    return membership.workspaceId || null;
  }

  return readWorkspaceId();
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

const otpChallengeStoreKey = "voiceup-otp-challenges-v1";

type LocalOtpChallenge = {
  challengeId: string;
  phone: string;
  purpose: "public-signing" | "onboarding";
  code: string;
  expiresAt: number;
  attempts: number;
};

function readLocalOtpChallenges(): LocalOtpChallenge[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(otpChallengeStoreKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalOtpChallenges(challenges: LocalOtpChallenge[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(otpChallengeStoreKey, JSON.stringify(challenges));
}

export async function getCurrentAuthUser() {
  if (!supabase) {
    console.debug("[auth diagnostics] getCurrentAuthUser", {
      sessionExists: false,
      userId: "",
      email: ""
    });
    return null;
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const { data, error } = await supabase.auth.getUser();
  console.debug("[auth diagnostics] getCurrentAuthUser", {
    sessionExists: Boolean(sessionData.session),
    userId: data.user?.id ?? "",
    email: data.user?.email ?? "",
    sessionError: sessionError?.message ?? "",
    userError: error?.message ?? ""
  });
  if (error) return null;
  return data.user;
}

export interface VerifyCallerDiagnosticInput {
  callerLabel: string;
  callerName: string;
  sourceFile: string;
  sourceLine: number;
  campaignAdminLoginState?: string;
  workspaceId: string;
}

export interface VerifyCallerTrace {
  traceId: string;
  callerLabel: string;
  callerName: string;
  startedAt: string;
  signInCompletedAtCall: string;
}

let nextVerifyCallerTraceId = 1;

function readCampaignAdminLoginStateForDiagnostics(): string {
  if (typeof window === "undefined") return "non-browser";
  try {
    const states = JSON.parse(
      window.sessionStorage.getItem("voiceup-campaign-admin-auth") ?? "{}"
    ) as Record<string, boolean>;
    const activeSlugs = Object.entries(states)
      .filter(([, active]) => active)
      .map(([slug]) => slug);
    return activeSlugs.length > 0 ? `active:${activeSlugs.join(",")}` : "inactive";
  } catch {
    return "unreadable";
  }
}

export async function debugSupabaseAuthBeforeVerification(
  input: VerifyCallerDiagnosticInput
): Promise<VerifyCallerTrace> {
  const startedAt = new Date().toISOString();
  const traceId = `verify-${nextVerifyCallerTraceId}`;
  nextVerifyCallerTraceId += 1;
  const currentRoute = typeof window === "undefined"
    ? "non-browser"
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const callStack = new Error("verifySecureFieldUploadAccess caller").stack ?? "unavailable";
  const signInCompletedAtCall = latestSignInResult.completedAt;
  const campaignAdminLoginState = input.campaignAdminLoginState
    ?? readCampaignAdminLoginStateForDiagnostics();
  const trace: VerifyCallerTrace = {
    traceId,
    callerLabel: input.callerLabel,
    callerName: input.callerName,
    startedAt,
    signInCompletedAtCall
  };
  if (!supabase) {
    console.debug(`--------------------------------
${input.callerLabel}
TRACE ID: ${traceId}
CALLER NAME: ${input.callerName}
SOURCE FILE AND LINE: ${input.sourceFile}:${input.sourceLine}
CALL STACK:
${callStack}
TIMESTAMP: ${startedAt}
CURRENT ROUTE: ${currentRoute}
CURRENT CAMPAIGN-ADMIN LOGIN STATE: ${campaignAdminLoginState}
CURRENT AUTH USER: none
SESSION EXISTS: false
CURRENT WORKSPACE ID: ${input.workspaceId}
SIGN-IN COMPLETION STATE: ${signInCompletedAtCall ? `after:${signInCompletedAtCall}` : "before"}
--------------------------------`);
    return trace;
  }

  try {
    const sessionResult = await supabase.auth.getSession();
    const userResult = await supabase.auth.getUser();
    const currentUser = userResult.data.user
      ? `${userResult.data.user.id} ${userResult.data.user.email ?? ""}`.trim()
      : "none";
    console.debug(`--------------------------------
${input.callerLabel}
TRACE ID: ${traceId}
CALLER NAME: ${input.callerName}
SOURCE FILE AND LINE: ${input.sourceFile}:${input.sourceLine}
CALL STACK:
${callStack}
TIMESTAMP: ${startedAt}
CURRENT ROUTE: ${currentRoute}
CURRENT CAMPAIGN-ADMIN LOGIN STATE: ${campaignAdminLoginState}
CURRENT AUTH USER: ${currentUser}
SESSION EXISTS: ${Boolean(sessionResult.data.session)}
CURRENT WORKSPACE ID: ${input.workspaceId}
SIGN-IN COMPLETION STATE: ${signInCompletedAtCall ? `after:${signInCompletedAtCall}` : "before"}
--------------------------------`, {
      sessionError: sessionResult.error?.message ?? "",
      userError: userResult.error?.message ?? ""
    });
  } catch (error) {
    console.debug(`--------------------------------
${input.callerLabel}
TRACE ID: ${traceId}
CALLER NAME: ${input.callerName}
SOURCE FILE AND LINE: ${input.sourceFile}:${input.sourceLine}
CALL STACK:
${callStack}
TIMESTAMP: ${startedAt}
CURRENT ROUTE: ${currentRoute}
CURRENT CAMPAIGN-ADMIN LOGIN STATE: ${campaignAdminLoginState}
CURRENT AUTH USER: unavailable
SESSION EXISTS: unavailable
CURRENT WORKSPACE ID: ${input.workspaceId}
SIGN-IN COMPLETION STATE: ${signInCompletedAtCall ? `after:${signInCompletedAtCall}` : "before"}
--------------------------------`, {
      diagnosticError: error instanceof Error ? error.message : String(error)
    });
  }
  return trace;
}

export function debugSecureFieldUploadVerificationResult(
  trace: VerifyCallerTrace,
  access: SecureFieldUploadAccess
) {
  const completedAt = new Date().toISOString();
  const latestSignInCompletedAt = latestSignInResult.completedAt;
  const staleAsyncCompletion = Boolean(
    !trace.signInCompletedAtCall
      && latestSignInCompletedAt
      && Date.parse(latestSignInCompletedAt) >= Date.parse(trace.startedAt)
  );
  console.debug("[VERIFY RESULT]", {
    traceId: trace.traceId,
    callerLabel: trace.callerLabel,
    callerName: trace.callerName,
    startedAt: trace.startedAt,
    completedAt,
    signInCompletedAtCall: trace.signInCompletedAtCall,
    latestSignInCompletedAt,
    staleAsyncCompletion,
    accessAvailable: access.available,
    denialReason: access.available ? "" : access.reason,
    userId: access.userId,
    workspaceId: access.workspaceId,
    role: access.role
  });
}

export async function debugSupabaseSessionTiming(label: string) {
  if (!supabase) {
    console.debug(label, {
      sessionExists: false,
      userId: "",
      email: "",
      error: "Supabase unavailable"
    });
    return;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    console.debug(label, {
      sessionExists: Boolean(data.session),
      userId: data.session?.user.id ?? "",
      email: data.session?.user.email ?? "",
      error: error?.message ?? ""
    });
  } catch (error) {
    console.debug(label, {
      sessionExists: false,
      userId: "",
      email: "",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function verifySecureFieldUploadAccess(
  expectedWorkspaceId: string,
  storageProvider: string
): Promise<SecureFieldUploadAccess> {
  logSupabaseClientIdentity("verifySecureFieldUploadAccess");
  const user = await getCurrentAuthUser();
  console.debug("[auth diagnostics] verifySecureFieldUploadAccess input", {
    userId: user?.id ?? "",
    workspaceId: expectedWorkspaceId,
    membershipQueryInput: {
      workspace_id: expectedWorkspaceId,
      user_id: user?.id ?? ""
    }
  });
  if (!supabase || !user) {
    console.debug("[auth diagnostics] verifySecureFieldUploadAccess membership", {
      membership: null,
      membershipError: "Membership query skipped because Supabase or the authenticated user is unavailable."
    });
    return evaluateSecureFieldUploadAccess({
      supabaseConfigured: Boolean(supabase),
      storageProvider,
      userId: user?.id,
      currentWorkspaceId: expectedWorkspaceId
    });
  }

  const { data: membership, error } = await supabase
    .from("voiceup_workspace_members")
    .select("workspace_id,role,active")
    .eq("workspace_id", expectedWorkspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  console.debug("[auth diagnostics] verifySecureFieldUploadAccess membership", {
    userId: user.id,
    workspaceId: expectedWorkspaceId,
    membershipQueryInput: {
      workspace_id: expectedWorkspaceId,
      user_id: user.id
    },
    membership,
    membershipError: error?.message ?? ""
  });

  return evaluateSecureFieldUploadAccess({
    supabaseConfigured: true,
    storageProvider,
    userId: user.id,
    currentWorkspaceId: expectedWorkspaceId,
    membership: error || !membership
      ? null
      : {
          workspaceId: membership.workspace_id,
          role: membership.role,
          active: membership.active !== false
        }
  });
}

async function resolveSecureStorageWorkspaceId(): Promise<string | null> {
  const expectedWorkspaceId = readWorkspaceId();
  const verificationTrace = await debugSupabaseAuthBeforeVerification({
    callerLabel: "VERIFY_CALLER: FIELD_UPLOAD_GATE",
    callerName: "backend.resolveSecureStorageWorkspaceId",
    sourceFile: "src/backend.ts",
    sourceLine: 648,
    workspaceId: expectedWorkspaceId
  });
  const access = await verifySecureFieldUploadAccess(
    expectedWorkspaceId,
    "Supabase Storage"
  );
  debugSecureFieldUploadVerificationResult(verificationTrace, access);
  return access.available ? access.workspaceId : null;
}

export async function getAuthContext(): Promise<VoiceupAccessContext> {
  if (!supabase) {
    return {
      platformAdmin: false,
      workspaceMember: false,
      customerWorkspace: false,
      role: "",
      email: "",
      workspaceId: fallbackWorkspaceId
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userError ? null : userData.user;

  if (!user) {
    return {
      platformAdmin: false,
      workspaceMember: false,
      customerWorkspace: false,
      role: "",
      email: "",
      workspaceId: fallbackWorkspaceId
    };
  }

  const membership = await resolveWorkspaceMembershipContext(user.id);

  return {
    platformAdmin: membership.platformAdmin,
    workspaceMember: membership.workspaceMember,
    customerWorkspace: false,
    role: membership.role,
    email: user.email ?? "",
    workspaceId: membership.workspaceId || ""
  };
}

let latestSignInResult = {
  sessionExists: false,
  userId: "",
  email: "",
  completedAt: ""
};

export function getLatestSignInResult() {
  return { ...latestSignInResult };
}

export async function signInWithSupabase(email: string, password: string) {
  logSupabaseClientIdentity("signInWithSupabase");
  if (!supabase) {
    throw new Error("Supabase Auth is required for platform administration.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  latestSignInResult = {
    sessionExists: Boolean(data.session),
    userId: data.user?.id ?? "",
    email: data.user?.email ?? "",
    completedAt: new Date().toISOString()
  };
  console.debug("[auth diagnostics] signInWithPassword", {
    sessionUserId: data.session?.user.id ?? "",
    sessionUserEmail: data.session?.user.email ?? ""
  });
  if (error) {
    throw new Error(error.message);
  }
  return data.user;
}

export async function signOutSupabase(callerLabel = "SIGN_OUT_CALLER: UNKNOWN", reason = "unspecified") {
  if (!supabase) return;
  const { data, error } = await supabase.auth.getSession();
  console.debug("[AUTH FLOW] SIGN OUT CALLED", {
    callerLabel,
    reason,
    timestamp: new Date().toISOString(),
    currentRoute: typeof window === "undefined"
      ? "non-browser"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
    sessionExistsBeforeSignOut: Boolean(data.session),
    userIdBeforeSignOut: data.session?.user.id ?? "",
    sessionError: error?.message ?? ""
  });
  console.trace("[AUTH FLOW] SIGN OUT CALLED", { callerLabel, reason });
  await supabase.auth.signOut();
}

export async function loadRemoteState() {
  if (!supabase) {
    console.info("[loadRemoteState]", {
      authenticatedUserId: "",
      authenticatedEmail: "",
      organizationId: "",
      workspaceIdRequested: "",
      workspaceRowFound: false,
      campaignCount: 0,
      campaignIds: [],
      nullReason: "supabase-not-configured"
    });
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userError ? null : userData.user;
  const authenticatedUserId = user?.id ?? "";
  const authenticatedEmail = user?.email ?? "";

  const workspaceId = await resolveWorkspaceId();
  let organizationId = "";

  if (user) {
    const { data: orgMembership, error: orgError } = await requireSupabase()
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (orgError) throw new Error(orgError.message);
    organizationId = orgMembership?.organization_id ?? "";
  }

  if (!workspaceId) {
    console.info("[loadRemoteState]", {
      authenticatedUserId,
      authenticatedEmail,
      organizationId,
      workspaceIdRequested: "",
      workspaceRowFound: false,
      campaignCount: 0,
      campaignIds: [],
      nullReason: user ? "workspace-membership-missing" : "workspace-id-unresolved"
    });
    return null;
  }

  const workspaceTrace = await inspectWorkspaceStateById(workspaceId);
  console.info("[loadRemoteState]", {
    authenticatedUserId,
    authenticatedEmail,
    organizationId,
    workspaceIdRequested: workspaceId,
    workspaceRowFound: workspaceTrace.rowFound,
    campaignCount: workspaceTrace.campaignCount,
    campaignIds: workspaceTrace.campaignIds,
    nullReason: workspaceTrace.rowFound ? "" : "workspace-row-not-found"
  });

  return loadWorkspaceStateById(workspaceId);
}

export async function saveRemoteState(state: VoiceupRemoteState) {
  if (!supabase) return;
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    throw new Error("Authenticated user does not have a workspace membership.");
  }
  await saveWorkspaceState(workspaceId, state);
}

export async function loadPublicCampaign(slug: string): Promise<PublicCampaignPayload | null> {
  if (!supabase) return null;
  const found = await findPublishedCampaignBySlug(slug);
  if (!found) return null;
  return {
    campaign: found.campaign,
    organization: found.state.organization,
    authorities: publicAuthoritiesForCampaign(found.state, found.campaign),
    metrics: getCampaignMetrics(found.campaign, found.state.signers ?? [])
  };
}

export async function requestOtp(
  phone: string,
  purpose: "public-signing" | "onboarding",
  metadata: Record<string, unknown> = {}
): Promise<OtpRequestResult> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error("Phone and purpose are required.");
  }
  const challenges = readLocalOtpChallenges().filter((item) => item.expiresAt > Date.now());
  const challengeId = createId("otp");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  challenges.push({
    challengeId,
    phone: normalizedPhone,
    purpose,
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0
  });
  writeLocalOtpChallenges(challenges);
  return {
    challengeId,
    resendAfterSeconds: 30,
    message: metadata && Object.keys(metadata).length >= 0 ? "Development OTP generated." : "Development OTP generated."
  };
}

export async function verifyOtp(
  challengeId: string,
  phone: string,
  code: string,
  purpose: "public-signing" | "onboarding",
  metadata: Record<string, unknown> = {}
): Promise<OtpVerifyResult> {
  const normalizedPhone = normalizePhone(phone);
  const challenges = readLocalOtpChallenges().filter((item) => item.expiresAt > Date.now());
  const challenge = challenges.find(
    (item) => item.challengeId === challengeId && item.phone === normalizedPhone && item.purpose === purpose
  );

  if (!challenge) {
    throw new Error("OTP challenge not found.");
  }

  if (challenge.code !== String(code).trim()) {
    challenge.attempts += 1;
    writeLocalOtpChallenges(challenges);
    throw new Error("Invalid OTP.");
  }

  const nextChallenges = challenges.filter((item) => item.challengeId !== challengeId);
  writeLocalOtpChallenges(nextChallenges);

  const result: OtpVerifyResult = {
    verified: true,
    verificationToken: createSecureToken("otpv"),
    message: metadata && Object.keys(metadata).length >= 0 ? "Phone number verified." : "Phone number verified."
  };
  return result;
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
  const workspaceId = createId("workspace");
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
    activeCampaignId: campaignId,
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
  const { data, error } = await client.functions.invoke<{
    signer: Signer;
    message: string;
    metrics: PublicCampaignPayload["metrics"];
    error?: string;
  }>("voiceup-public-signing", {
    body: { slug, signer }
  });

  if (error) {
    throw new Error(error.message || "Signature submission failed.");
  }
  if (!data) {
    throw new Error("Signature submission failed.");
  }
  if (data.error) {
    throw new Error(data.error);
  }

  return {
    signer: data.signer,
    message: data.message,
    metrics: data.metrics
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

  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    throw new Error("Authenticated user does not have a workspace membership.");
  }
  const workspaceScopedPath = path.startsWith(`${workspaceId}/`)
    ? path
    : `${workspaceId}/${path}`;

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

export async function uploadPrivateFileToStorage(bucket: string, path: string, file: File) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    throw new Error("Authenticated workspace access is required before uploading files.");
  }

  const workspaceId = await resolveSecureStorageWorkspaceId();
  if (!workspaceId) {
    throw new Error("Authenticated user does not have a workspace membership.");
  }
  const workspaceScopedPath = path.startsWith(`${workspaceId}/`)
    ? path
    : `${workspaceId}/${path}`;

  const { error } = await supabase.storage.from(bucket).upload(workspaceScopedPath, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (error) throw new Error(error.message);

  return { path: workspaceScopedPath };
}

export async function createSignedStorageUrl(bucket: string, path: string, expiresInSeconds = 300) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const user = await getCurrentAuthUser();
  if (!user) throw new Error("Authenticated workspace access is required before opening files.");
  const workspaceId = await resolveSecureStorageWorkspaceId();
  if (!workspaceId || !path.startsWith(`${workspaceId}/`)) {
    throw new Error("The requested file is outside the authenticated workspace.");
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, Math.max(60, Math.min(expiresInSeconds, 600)));
  if (error || !data?.signedUrl) throw new Error(error?.message || "Unable to create signed file URL.");
  return data.signedUrl;
}
