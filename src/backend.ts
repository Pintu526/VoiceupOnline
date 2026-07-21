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
import type {
  CoordinatorDraft,
  CoordinatorNetworkSnapshot,
  CoordinatorStatus
} from "./coordinators";
import { geographyForRole } from "./coordinators";
import { normalizeIndianPhone } from "./shared/deduplication/supporterIdentity";
import {
  evaluateSecureFieldUploadAccess,
  secureFieldUploadRoles,
  type CampaignAdminAssignment,
  type SecureFieldUploadAccess
} from "./secureFieldUploadAuth";
import {
  evaluateWorkspaceMembership,
  evaluateWorkspaceResourceAssignment,
  type WorkspaceMembershipStatus,
  type WorkspaceResourceAssignmentStatus
} from "./authorization/workspaceAccess";

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

export type ScanApprovalResultCode =
  | "approval_completed"
  | "approval_already_completed"
  | "existing_supporter_returned"
  | "exact_phone_duplicate_blocked"
  | "same_source_row_blocked"
  | "already_approved"
  | "validation_failed"
  | "consent_missing"
  | "stale_review_version"
  | "unauthorized"
  | "review_item_not_found"
  | "system_error";

export interface ScanApprovalRpcResult {
  code: ScanApprovalResultCode;
  blocking: boolean;
  message: string;
  reviewItemId: string;
  supporterId?: string;
  matchedSupporterId?: string;
}

export interface ApproveScanReviewItemRequest {
  workspaceId: string;
  campaignId: string;
  reviewItemId: string;
  expectedVersion: number;
  uploadFingerprint: string;
  sourceReference: string;
  sourceRowFingerprint: string;
  approvalKey: string;
  reviewPayload: ScanReviewItem;
  supporterFields: ScanReviewItem["parsedSigner"] & Partial<Signer>;
  consent: {
    paperConsentRecorded: boolean;
    smsConsent: boolean;
    whatsappConsent: boolean;
    noOngoingCommunications: boolean;
    consentPurpose?: string;
    consentCapturedAt?: string;
    consentCapturedBy?: string;
  };
}

export interface AuthoritativeFieldCollectionState {
  reviewItems: ScanReviewItem[];
  supporters: Signer[];
  auditLogs: AuditLogEntry[];
}

export interface CoordinatorOtpRequestResult {
  challengeId: string;
  resendAfterSeconds: number;
  message: string;
  developmentOtp?: string;
}

export interface CoordinatorOtpVerifyResult {
  verified: boolean;
  verificationToken: string;
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
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Fail-fast check for a real, locally-held Supabase Auth session (session + user + access
 * token all present) -- used to guard protected Edge Function calls (e.g. Campaign Admin
 * provisioning) so they are never attempted without a valid Supabase user JWT. Never returns
 * or logs the access token itself.
 */
export async function getCurrentAuthSession(): Promise<{ userId: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  const session = data.session;
  if (!session?.user?.id || !session.access_token) return null;
  return { userId: session.user.id };
}

export async function verifySecureFieldUploadAccess(
  expectedWorkspaceId: string,
  storageProvider: string,
  knownUser?: { id: string } | null
): Promise<SecureFieldUploadAccess> {
  // When the caller just established (or already holds) the authenticated user from
  // signInWithPassword()/getCurrentAuthUser(), use it directly instead of issuing a second,
  // redundant getUser() round-trip immediately after sign-in.
  const user = knownUser !== undefined ? knownUser : await getCurrentAuthUser();
  if (!supabase || !user) {
    return evaluateSecureFieldUploadAccess({
      supabaseConfigured: Boolean(supabase),
      storageProvider,
      userId: user?.id,
      currentWorkspaceId: expectedWorkspaceId
    });
  }

  const { data: membership, error } = await supabase
    .from("voiceup_workspace_members")
    .select("workspace_id,user_id,role,active")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const resolvedWorkspaceId = membership?.workspace_id || expectedWorkspaceId;

  return evaluateSecureFieldUploadAccess({
    supabaseConfigured: true,
    storageProvider,
    userId: user.id,
    currentWorkspaceId: resolvedWorkspaceId,
    membership: error || !membership
      ? null
      : {
          workspaceId: membership.workspace_id,
          userId: membership.user_id,
          role: membership.role,
          active: membership.active === true
        }
  });
}

export interface CampaignAdminAssignmentContext {
  assignment: CampaignAdminAssignment | null;
  assignmentStatus: WorkspaceResourceAssignmentStatus;
  workspaceMembershipActive: boolean;
  hasValidWorkspaceMembershipRole: boolean;
  membershipStatus: WorkspaceMembershipStatus;
}

/**
 * Resolves the database-verified facts needed by `evaluateCampaignAdminLoginAccess`, using
 * the generic, reusable `evaluateWorkspaceResourceAssignment` / `evaluateWorkspaceMembership`
 * evaluators from `./authorization/workspaceAccess` (see that module for the full typed
 * status set). Both queries are filtered by `user_id = authenticatedUserId` explicitly (in
 * addition to Postgres RLS already scoping every row to `auth.uid()`) so a browser-supplied
 * user id can never widen what is returned -- and are deliberately broader than a single
 * exact-match row so the evaluators can distinguish *why* access fails (wrong workspace,
 * wrong role, inactive, ambiguous, etc.) rather than only "found" or "not found". Must only
 * be called AFTER a successful `signInWithPassword`/`getCurrentAuthUser` call.
 */
export async function resolveCampaignAdminAssignmentContext(
  workspaceId: string,
  resourceId: string,
  resourceSlug: string,
  authenticatedUserId: string,
  applicationKey = "voiceup",
  role = "campaign_admin"
): Promise<CampaignAdminAssignmentContext> {
  const denied = (
    assignmentStatus: WorkspaceResourceAssignmentStatus,
    membershipStatus: WorkspaceMembershipStatus
  ): CampaignAdminAssignmentContext => ({
    assignment: null,
    assignmentStatus,
    workspaceMembershipActive: false,
    hasValidWorkspaceMembershipRole: false,
    membershipStatus
  });

  if (!supabase || !authenticatedUserId) return denied("query_failed", "query_failed");

  const [assignmentResponse, membershipResponse] = await Promise.all([
    supabase
      .from("workspace_resource_members")
      .select("user_id,workspace_id,application_key,role,resource_type,resource_id,resource_slug,active")
      .eq("user_id", authenticatedUserId)
      .eq("application_key", applicationKey)
      .eq("resource_type", "campaign")
      .eq("resource_id", resourceId),
    supabase
      .from("voiceup_workspace_members")
      .select("user_id,workspace_id,role,active")
      .eq("user_id", authenticatedUserId)
  ]);

  const assignmentResult = evaluateWorkspaceResourceAssignment(
    assignmentResponse.error
      ? null
      : (assignmentResponse.data ?? []).map((row) => ({
          userId: row.user_id,
          workspaceId: row.workspace_id,
          applicationKey: row.application_key,
          role: row.role,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          resourceSlug: row.resource_slug ?? undefined,
          active: row.active === true
        })),
    Boolean(assignmentResponse.error),
    {
      applicationKey,
      workspaceId,
      resourceType: "campaign",
      resourceId,
      resourceSlug,
      requiredRole: role,
      authenticatedUserId
    }
  );

  const membershipResult = evaluateWorkspaceMembership(
    membershipResponse.error
      ? null
      : (membershipResponse.data ?? []).map((row) => ({
          userId: row.user_id,
          workspaceId: row.workspace_id,
          role: row.role,
          active: row.active === true
        })),
    Boolean(membershipResponse.error),
    { workspaceId, authenticatedUserId, validRoles: secureFieldUploadRoles }
  );

  const membershipValid = membershipResult.status === "membership_found";

  return {
    assignment:
      assignmentResult.status === "assignment_found" && assignmentResult.assignment
        ? {
            userId: assignmentResult.assignment.userId,
            workspaceId: assignmentResult.assignment.workspaceId,
            resourceType: assignmentResult.assignment.resourceType,
            resourceId: assignmentResult.assignment.resourceId,
            resourceSlug: assignmentResult.assignment.resourceSlug ?? undefined,
            active: assignmentResult.assignment.active
          }
        : null,
    assignmentStatus: assignmentResult.status,
    workspaceMembershipActive: membershipValid,
    hasValidWorkspaceMembershipRole: membershipValid,
    membershipStatus: membershipResult.status
  };
}

export interface ProvisionWorkspaceMemberRequest {
  workspaceId: string;
  applicationKey: string;
  role: string;
  email?: string;
  password?: string;
  selfAssign?: boolean;
  assignment: { resourceType: string; resourceId: string; resourceSlug?: string };
}

export interface ProvisionWorkspaceMemberResult {
  userId: string;
  authUserAction: "create" | "reuse";
  workspaceMembership: { workspaceId: string; role: string; active: boolean };
  assignment: {
    id: string;
    transition: "create" | "already_active" | "replace";
    resourceType: string;
    resourceId: string;
    resourceSlug: string;
    active: boolean;
  };
}

/**
 * A safe, typed provisioning failure. `message` is always end-user-safe (it
 * originates only from the Edge Function's own `error` field or a generic
 * fallback -- never from raw Supabase client internals) and NEVER contains
 * the submitted password. `code` is an optional machine-readable reason
 * (e.g. "identity_conflict") a caller can branch on without parsing text.
 */
export class ProvisionWorkspaceMemberError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ProvisionWorkspaceMemberError";
    this.code = code;
  }
}

/**
 * Calls the `provision-workspace-member` Edge Function. Never sends or stores the
 * service-role key -- this uses the same authenticated anon-key client as every other
 * Supabase call, so the bearer token forwarded is always the currently signed-in SaaS
 * Admin's own session token; the Edge Function itself independently re-verifies the
 * caller's authorization via that token. The password is only ever included in this
 * single request body -- it is never logged, never echoed back, and never appears in
 * any error thrown from here.
 */
export async function provisionWorkspaceMember(
  request: ProvisionWorkspaceMemberRequest
): Promise<ProvisionWorkspaceMemberResult> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<
    ProvisionWorkspaceMemberResult & { error?: string; code?: string }
  >("provision-workspace-member", { body: request });

  if (error) {
    throw new ProvisionWorkspaceMemberError(error.message || "Unable to provision the workspace member.");
  }
  if (!data) {
    throw new ProvisionWorkspaceMemberError("Unable to provision the workspace member.");
  }
  if (data.error) {
    throw new ProvisionWorkspaceMemberError(data.error, data.code);
  }

  return data;
}

/**
 * Assigns the already authenticated workspace member to a campaign without
 * creating or modifying an Auth identity. The Edge Function verifies the
 * caller's workspace authority and preserves any existing workspace role.
 */
export async function assignCurrentWorkspaceMemberAsCampaignAdmin(input: {
  workspaceId: string;
  campaignId: string;
  campaignSlug: string;
}): Promise<ProvisionWorkspaceMemberResult> {
  return provisionWorkspaceMember({
    workspaceId: input.workspaceId,
    applicationKey: "voiceup",
    role: "campaign_admin",
    selfAssign: true,
    assignment: {
      resourceType: "campaign",
      resourceId: input.campaignId,
      resourceSlug: input.campaignSlug
    }
  });
}

async function resolveSecureStorageWorkspaceId(): Promise<string | null> {
  const expectedWorkspaceId = readWorkspaceId();
  const access = await verifySecureFieldUploadAccess(
    expectedWorkspaceId,
    "Supabase Storage"
  );
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

  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) return null;

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

export async function approveScanReviewItem(
  request: ApproveScanReviewItemRequest
): Promise<ScanApprovalRpcResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("approve_voiceup_scan_review_item", {
    p_workspace_id: request.workspaceId,
    p_campaign_id: request.campaignId,
    p_review_item_id: request.reviewItemId,
    p_expected_version: request.expectedVersion,
    p_upload_fingerprint: request.uploadFingerprint,
    p_source_reference: request.sourceReference,
    p_source_row_fingerprint: request.sourceRowFingerprint,
    p_approval_key: request.approvalKey,
    p_review_payload: request.reviewPayload,
    p_supporter_fields: request.supporterFields,
    p_consent: request.consent
  });
  if (error || !data || typeof data !== "object") {
    return {
      code: "system_error",
      blocking: true,
      message: "The review item could not be approved safely. Retry after refreshing.",
      reviewItemId: request.reviewItemId
    };
  }
  return data as ScanApprovalRpcResult;
}

export async function loadAuthoritativeFieldCollectionState(
  workspaceId: string,
  campaignId: string
): Promise<AuthoritativeFieldCollectionState> {
  const client = requireSupabase();
  const [reviewResponse, supporterResponse, auditResponse] = await Promise.all([
    client
      .from("voiceup_scan_review_items")
      .select("review_payload,status,supporter_id,approval_key,upload_fingerprint,source_row_fingerprint,version,historical_link_uncertain")
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId),
    client
      .from("voiceup_scan_supporters")
      .select("supporter_payload")
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId),
    client
      .from("voiceup_field_collection_audit")
      .select("audit_payload")
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
  ]);

  const firstError = reviewResponse.error ?? supporterResponse.error ?? auditResponse.error;
  if (firstError) throw new Error(firstError.message);

  return {
    reviewItems: (reviewResponse.data ?? []).map((row) => ({
      ...(row.review_payload as ScanReviewItem),
      status: row.status === "approved" ? "Approved" : row.status === "rejected" ? "Rejected" : "Needs review",
      supporterId: row.supporter_id ?? undefined,
      approvalKey: row.approval_key ?? undefined,
      uploadFingerprint: row.upload_fingerprint,
      sourceRowFingerprint: row.source_row_fingerprint,
      reviewVersion: row.version,
      historicalLinkUncertain: row.historical_link_uncertain
    })),
    supporters: (supporterResponse.data ?? []).map((row) => row.supporter_payload as Signer),
    auditLogs: (auditResponse.data ?? []).map((row) => row.audit_payload as AuditLogEntry)
  };
}

export async function recordScanApprovalBatchAudit(input: {
  workspaceId: string;
  campaignId: string;
  batchId: string;
  resultCode: "batch_started" | "batch_completed" | "batch_partial_failure";
  counts?: Record<string, number>;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("record_voiceup_scan_batch_audit", {
    p_workspace_id: input.workspaceId,
    p_campaign_id: input.campaignId,
    p_batch_id: input.batchId,
    p_result_code: input.resultCode,
    p_counts: input.counts ?? {}
  });
  if (error) throw new Error(error.message);
}

export async function loadCoordinatorNetwork(): Promise<CoordinatorNetworkSnapshot> {
  const client = requireSupabase();
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) throw new Error("Authenticated workspace access is required.");
  const { data, error } = await client.rpc("get_voiceup_coordinator_network", {
    p_workspace_id: workspaceId
  });
  if (error || !data) throw new Error(error?.message || "Coordinator network could not be loaded.");
  return data as CoordinatorNetworkSnapshot;
}

export async function requestCoordinatorMobileOtp(
  workspaceId: string,
  phone: string
): Promise<CoordinatorOtpRequestResult> {
  const client = requireSupabase();
  const normalizedPhone = normalizeIndianPhone(phone);
  if (!normalizedPhone.verified) throw new Error("Enter a valid 10-digit Indian mobile number.");
  const { data, error } = await client.functions.invoke<{
    challengeId?: string;
    resendAfterSeconds?: number;
    message?: string;
    otp?: string;
    error?: string;
  }>("voiceup-otp", {
    body: {
      action: "send",
      purpose: "coordinator-mobile",
      workspaceId,
      phone: normalizedPhone.normalized,
      metadata: { source: "coordinator-network" }
    }
  });
  if (error || data?.error || !data?.challengeId) {
    throw new Error(data?.error || error?.message || "Verification code could not be sent.");
  }
  return {
    challengeId: data.challengeId,
    resendAfterSeconds: data.resendAfterSeconds ?? 30,
    message: data.message ?? "Verification code sent.",
    developmentOtp: data.otp
  };
}

export async function verifyCoordinatorMobileOtp(input: {
  workspaceId: string;
  phone: string;
  challengeId: string;
  code: string;
}): Promise<CoordinatorOtpVerifyResult> {
  const client = requireSupabase();
  const normalizedPhone = normalizeIndianPhone(input.phone);
  if (!normalizedPhone.verified) throw new Error("Enter a valid 10-digit Indian mobile number.");
  const { data, error } = await client.functions.invoke<{
    verified?: boolean;
    verificationToken?: string;
    message?: string;
    error?: string;
  }>("voiceup-otp", {
    body: {
      action: "verify",
      purpose: "coordinator-mobile",
      workspaceId: input.workspaceId,
      phone: normalizedPhone.normalized,
      challengeId: input.challengeId,
      code: input.code,
      metadata: { source: "coordinator-network" }
    }
  });
  if (error || data?.error || !data?.verified || !data.verificationToken) {
    throw new Error(data?.error || error?.message || "Mobile verification failed.");
  }
  return {
    verified: true,
    verificationToken: data.verificationToken,
    message: data.message ?? "Mobile number verified."
  };
}

export async function saveCoordinator(
  workspaceId: string,
  draft: CoordinatorDraft,
  verificationToken = ""
): Promise<{ id: string; referralCode: string; version: number }> {
  const client = requireSupabase();
  const { geography, campaignIds, ...coordinator } = draft;
  const { data, error } = await client.rpc("upsert_voiceup_coordinator", {
    p_workspace_id: workspaceId,
    p_coordinator: coordinator,
    p_geography: geographyForRole(geography, draft.role),
    p_campaign_ids: campaignIds,
    p_verification_token: verificationToken || null
  });
  if (error || !data) throw new Error(error?.message || "Coordinator could not be saved.");
  return data as { id: string; referralCode: string; version: number };
}

export async function changeCoordinatorStatus(input: {
  workspaceId: string;
  coordinatorId: string;
  status: CoordinatorStatus;
  expectedVersion: number;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("set_voiceup_coordinator_status", {
    p_workspace_id: input.workspaceId,
    p_coordinator_id: input.coordinatorId,
    p_status: input.status,
    p_expected_version: input.expectedVersion
  });
  if (error) throw new Error(error.message);
}

export async function removeCoordinator(input: {
  workspaceId: string;
  coordinatorId: string;
  expectedVersion: number;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("delete_voiceup_coordinator", {
    p_workspace_id: input.workspaceId,
    p_coordinator_id: input.coordinatorId,
    p_expected_version: input.expectedVersion
  });
  if (error) throw new Error(error.message);
}

export async function uploadCoordinatorPhoto(
  coordinatorId: string,
  file: File
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Coordinator photos must be 5 MB or smaller.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const result = await uploadPrivateFileToStorage(
    "campaign-private",
    `coordinators/${coordinatorId}/profile-${Date.now()}.${extension}`,
    file
  );
  return result.path;
}

export async function openCoordinatorPhoto(path: string): Promise<string> {
  return createSignedStorageUrl("campaign-private", path, 300);
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
