export const SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE =
  "Campaign Admin access is active, but secure field-upload access has not been provisioned.";

export interface SecureFieldUploadVerificationCoordinator {
  /** Call before starting a new async verification. Returns this request's generation id. */
  beginVerification(): number;
  /** Call after an async verification resolves, before applying its result to state. */
  isCurrent(requestId: number): boolean;
  /** Call for any synchronous, authoritative reset (login guard, logout, error). Invalidates any in-flight request. */
  reset(): void;
}

/**
 * Coordinates ordering between the two independent callers of secure-upload verification
 * (the login handler and the restore/refresh effect) so that only the latest-started
 * verification is ever applied to state, and any synchronous reset (e.g. logout) cannot be
 * overwritten by an older async result resolving afterward.
 */
export function createSecureFieldUploadVerificationCoordinator(): SecureFieldUploadVerificationCoordinator {
  let generation = 0;
  return {
    beginVerification() {
      generation += 1;
      return generation;
    },
    isCurrent(requestId: number) {
      return requestId === generation;
    },
    reset() {
      generation += 1;
    }
  };
}

export const secureFieldUploadRoles = [
  "platform_owner",
  "workspace_admin",
  "campaign_admin",
  "field_officer"
] as const;

export type SecureFieldUploadRole = (typeof secureFieldUploadRoles)[number];

export type SecureFieldUploadReason =
  | "available"
  | "supabase_unavailable"
  | "storage_provider_unavailable"
  | "unauthenticated"
  | "workspace_unresolved"
  | "membership_missing"
  | "membership_inactive"
  | "workspace_mismatch"
  | "role_denied";

export interface SecureFieldUploadMembership {
  workspaceId: string;
  userId: string;
  role: string;
  active: boolean;
}

export interface SecureFieldUploadAccess {
  available: boolean;
  reason: SecureFieldUploadReason;
  message: string;
  userId: string;
  workspaceId: string;
  role: string;
}

export interface SecureFieldUploadAccessInput {
  supabaseConfigured: boolean;
  storageProvider: string;
  userId?: string;
  currentWorkspaceId?: string;
  membership?: SecureFieldUploadMembership | null;
}

export function isSecureFieldUploadRole(role: string): role is SecureFieldUploadRole {
  return secureFieldUploadRoles.includes(role as SecureFieldUploadRole);
}

export function evaluateSecureFieldUploadAccess({
  supabaseConfigured,
  storageProvider,
  userId = "",
  currentWorkspaceId = "",
  membership
}: SecureFieldUploadAccessInput): SecureFieldUploadAccess {
  const unavailable = (reason: SecureFieldUploadReason, role = membership?.role ?? "") => ({
    available: false,
    reason,
    message: SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE,
    userId,
    workspaceId: currentWorkspaceId,
    role
  });

  if (!supabaseConfigured) return unavailable("supabase_unavailable");
  if (storageProvider !== "Supabase Storage") return unavailable("storage_provider_unavailable");
  if (!userId) return unavailable("unauthenticated");
  if (!currentWorkspaceId) return unavailable("workspace_unresolved");
  if (!membership) return unavailable("membership_missing");
  if (!membership.active) return unavailable("membership_inactive");
  if (membership.workspaceId !== currentWorkspaceId) return unavailable("workspace_mismatch");
  if (!isSecureFieldUploadRole(membership.role)) return unavailable("role_denied");

  return {
    available: true,
    reason: "available",
    message: "Secure field-upload access is active.",
    userId,
    workspaceId: currentWorkspaceId,
    role: membership.role
  };
}

export function preserveCampaignAdminAccess(existingCredentialCheckSucceeded: boolean) {
  return existingCredentialCheckSucceeded;
}

export interface CampaignAdminAssignment {
  userId: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  /** The stored resource slug, when this assignment's resource tracks one (e.g. a campaign). */
  resourceSlug?: string;
  active: boolean;
}

export type CampaignAdminLoginReason =
  | "authorized"
  | "assignment_missing"
  | "workspace_membership_missing"
  | "subscription_inactive"
  | "feature_not_included";

export interface CampaignAdminLoginAccess {
  authorized: boolean;
  reason: CampaignAdminLoginReason;
  message: string;
}

/**
 * Exact, safe, user-facing copy for every Campaign Admin authorization state.
 * Never includes a UUID, workspace id, assignment id, SQL error, token, or
 * authorization header.
 */
export const CAMPAIGN_ADMIN_ACCESS_MESSAGES = {
  authenticationFailure: "Campaign Admin email or password is incorrect.",
  provisioningIncomplete:
    "Campaign Admin provisioning is incomplete. Ask the SaaS administrator to re-provision this account.",
  assignmentMissing: "You are not assigned to administer this campaign.",
  workspaceMembershipMissing: "Your workspace access has not been activated.",
  subscriptionInactive: "This campaign subscription is inactive.",
  campaignAdminFeatureMissing: "Campaign Admin access is not included in the current plan.",
  fieldCollectionMissing: "Field Collection is not included in the current plan.",
  secureUploadMissing: "Secure field upload is not included in the current plan.",
  secureUploadActive: "Secure field-upload access is active."
} as const;

/**
 * Pure authorization gate for the FINAL steps of Campaign Admin login, run only
 * AFTER a real `signInWithPassword` call has already succeeded (i.e. after the
 * submitted email+password have been verified against Supabase Auth). This
 * function never trusts `campaign.adminEmail` / `campaign.adminPasscode` as
 * authoritative -- it only evaluates database-verified facts that the caller
 * must have already fetched (the resource assignment row, scoped by RLS to
 * `user_id = auth.uid()`; the workspace membership row; and the computed
 * subscription/entitlement state):
 *  - an active resource assignment must exist for this exact authenticated
 *    user, this exact resource (campaign), and -- where a slug is stored --
 *    this exact resource slug
 *  - an active `voiceup_workspace_members` row with a valid Campaign
 *    Admin-compatible role must exist for that workspace
 *  - the workspace's subscription must be active and include the
 *    `campaign_admin_access` feature
 */
export function evaluateCampaignAdminLoginAccess(input: {
  authenticatedUserId: string;
  resourceId: string;
  resourceSlug?: string;
  assignment: CampaignAdminAssignment | null;
  workspaceMembershipActive: boolean;
  hasValidWorkspaceMembershipRole: boolean;
  subscriptionActive: boolean;
  hasCampaignAdminAccessFeature: boolean;
}): CampaignAdminLoginAccess {
  const denied = (reason: CampaignAdminLoginReason, message: string): CampaignAdminLoginAccess => ({
    authorized: false,
    reason,
    message
  });

  if (
    !input.assignment ||
    !input.assignment.active ||
    input.assignment.userId !== input.authenticatedUserId ||
    input.assignment.resourceId !== input.resourceId ||
    (input.resourceSlug !== undefined &&
      input.assignment.resourceSlug !== undefined &&
      input.assignment.resourceSlug.trim().toLowerCase() !== input.resourceSlug.trim().toLowerCase())
  ) {
    return denied("assignment_missing", CAMPAIGN_ADMIN_ACCESS_MESSAGES.assignmentMissing);
  }
  if (!input.workspaceMembershipActive || !input.hasValidWorkspaceMembershipRole) {
    return denied("workspace_membership_missing", CAMPAIGN_ADMIN_ACCESS_MESSAGES.workspaceMembershipMissing);
  }
  if (!input.subscriptionActive) {
    return denied("subscription_inactive", CAMPAIGN_ADMIN_ACCESS_MESSAGES.subscriptionInactive);
  }
  if (!input.hasCampaignAdminAccessFeature) {
    return denied("feature_not_included", CAMPAIGN_ADMIN_ACCESS_MESSAGES.campaignAdminFeatureMissing);
  }

  return { authorized: true, reason: "authorized", message: "Campaign Admin access verified." };
}

export function isStoragePathWithinWorkspace(path: string, workspaceId: string) {
  return Boolean(workspaceId && path.startsWith(`${workspaceId}/`));
}

/** Bumped whenever the marker's required field set changes. Any marker not on this exact
 * version is treated as an old/incomplete marker and must never silently grant access -- it
 * is discarded and access is re-derived only from a fresh, live Supabase revalidation. */
export const CAMPAIGN_ADMIN_SESSION_MARKER_SCHEMA_VERSION = 2;

export interface CampaignAdminSupabaseSessionMarker {
  slug: string;
  userId: string;
  workspaceId: string;
  /** The exact resource (e.g. campaign id) this Campaign Admin session was authorized for. */
  resourceId?: string;
  /** The authenticated email, kept only for display/audit -- never a credential. */
  email?: string;
  schemaVersion?: number;
  applicationKey?: string;
  role?: string;
  resourceType?: string;
  issuedAt?: string;
  validatedAt?: string;
}

export interface CampaignAdminSessionMarkerExpectation {
  slug: string;
  resourceId: string;
  workspaceId: string;
  userId: string;
  applicationKey: string;
  role: string;
}

/**
 * Strict, exact-context validation for a Campaign Admin session marker, layered ON TOP of
 * `isCampaignAdminSlugSecurelyAuthenticated`'s coarser orphan check. Every field must match
 * the CURRENT context exactly (slug, resource id, workspace id, user id, application key,
 * role) and the marker must be on the current schema version. Rejects the marker when any
 * of these differ from the current context, so another slug, another campaign, another
 * workspace, or another user can never reuse it, and an old/incomplete marker (written
 * before this field set existed) can never silently grant access.
 */
export function isCampaignAdminSessionMarkerValid(
  marker: CampaignAdminSupabaseSessionMarker | null,
  expected: CampaignAdminSessionMarkerExpectation
): boolean {
  if (!marker) return false;
  if (marker.schemaVersion !== CAMPAIGN_ADMIN_SESSION_MARKER_SCHEMA_VERSION) return false;
  if (marker.slug !== expected.slug) return false;
  if (marker.resourceId !== expected.resourceId) return false;
  if (marker.workspaceId !== expected.workspaceId) return false;
  if (marker.userId !== expected.userId) return false;
  if (marker.applicationKey !== expected.applicationKey) return false;
  if (marker.role !== expected.role) return false;
  return true;
}

export type CampaignAdminSecureFieldUploadReason =
  | SecureFieldUploadReason
  | "session_marker_invalid"
  | "subscription_inactive"
  | "campaign_admin_access_missing"
  | "field_collection_missing"
  | "secure_upload_missing";

export interface CampaignAdminSecureFieldUploadAccess {
  available: boolean;
  reason: CampaignAdminSecureFieldUploadReason;
  message: string;
  userId: string;
  workspaceId: string;
  role: string;
}

type CampaignAdminSecureFieldUploadDenialReason = Exclude<
  CampaignAdminSecureFieldUploadReason,
  SecureFieldUploadReason | "available"
>;

const CAMPAIGN_ADMIN_SECURE_FIELD_UPLOAD_MESSAGES: Record<CampaignAdminSecureFieldUploadDenialReason, string> = {
  session_marker_invalid: CAMPAIGN_ADMIN_ACCESS_MESSAGES.provisioningIncomplete,
  subscription_inactive: CAMPAIGN_ADMIN_ACCESS_MESSAGES.subscriptionInactive,
  campaign_admin_access_missing: CAMPAIGN_ADMIN_ACCESS_MESSAGES.campaignAdminFeatureMissing,
  field_collection_missing: CAMPAIGN_ADMIN_ACCESS_MESSAGES.fieldCollectionMissing,
  secure_upload_missing: CAMPAIGN_ADMIN_ACCESS_MESSAGES.secureUploadMissing
};

/**
 * Layers the Campaign-Admin-specific gates (exact session marker validity, active
 * subscription, `campaign_admin_access`, `field_collection`, `secure_upload`) on top of
 * the generic `SecureFieldUploadAccess` membership check. Used ONLY for the Campaign
 * Admin secure field-upload path -- the SaaS Admin's own storage access continues to use
 * the base `evaluateSecureFieldUploadAccess` result unchanged. Fails closed: if the base
 * access is already unavailable, that result is returned as-is (no additional gate can
 * ever widen access, only narrow it further).
 */
export function evaluateCampaignAdminSecureFieldUploadAccess(input: {
  baseAccess: SecureFieldUploadAccess;
  sessionMarkerValid: boolean;
  subscriptionActive: boolean;
  hasCampaignAdminAccessFeature: boolean;
  hasFieldCollectionFeature: boolean;
  hasSecureUploadFeature: boolean;
}): CampaignAdminSecureFieldUploadAccess {
  if (!input.baseAccess.available) return { ...input.baseAccess };

  const denied = (reason: CampaignAdminSecureFieldUploadDenialReason): CampaignAdminSecureFieldUploadAccess => ({
    available: false,
    reason,
    message: CAMPAIGN_ADMIN_SECURE_FIELD_UPLOAD_MESSAGES[reason],
    userId: input.baseAccess.userId,
    workspaceId: input.baseAccess.workspaceId,
    role: input.baseAccess.role
  });

  if (!input.sessionMarkerValid) return denied("session_marker_invalid");
  if (!input.subscriptionActive) return denied("subscription_inactive");
  if (!input.hasCampaignAdminAccessFeature) return denied("campaign_admin_access_missing");
  if (!input.hasFieldCollectionFeature) return denied("field_collection_missing");
  if (!input.hasSecureUploadFeature) return denied("secure_upload_missing");

  return {
    ...input.baseAccess,
    reason: "available",
    message: CAMPAIGN_ADMIN_ACCESS_MESSAGES.secureUploadActive
  };
}

export type SupabaseSessionSource =
  | "campaign_admin"
  | "platform_admin"
  | "unrelated_existing_session";

export interface SupabaseSessionOwnership {
  source: SupabaseSessionSource;
  userId: string;
}

export function resolveSupabaseSessionOwnership(
  existingUserId: string,
  authenticatedUserId: string,
  requestedSource: Exclude<SupabaseSessionSource, "unrelated_existing_session">,
  existingOwnership: SupabaseSessionOwnership | null
): SupabaseSessionOwnership | null {
  if (!authenticatedUserId) return null;
  if (!existingUserId || existingUserId !== authenticatedUserId) {
    return { source: requestedSource, userId: authenticatedUserId };
  }
  if (existingOwnership?.userId === authenticatedUserId) return existingOwnership;
  return { source: "unrelated_existing_session", userId: authenticatedUserId };
}

export function isSupabaseSessionOwnedBy(
  ownership: SupabaseSessionOwnership | null,
  source: Exclude<SupabaseSessionSource, "unrelated_existing_session">,
  userId: string
) {
  return Boolean(
    ownership
      && userId
      && ownership.source === source
      && ownership.userId === userId
  );
}

export function shouldSignOutCampaignAdminSupabaseSession(
  marker: CampaignAdminSupabaseSessionMarker | null,
  access: Pick<SecureFieldUploadAccess, "userId" | "workspaceId">
) {
  return Boolean(
    marker &&
      marker.userId === access.userId &&
      marker.workspaceId === access.workspaceId
  );
}

/**
 * A campaign slug is only *securely* authenticated (i.e. safe to trust for running secure
 * field-upload verification against the current ambient Supabase session) when all of the
 * following hold:
 *  - the slug's local "logged in" flag is true
 *  - a campaignAdminSupabaseSession marker exists for that exact slug
 *  - the marker's userId matches the currently authenticated Supabase user
 *  - the marker's workspaceId is a non-empty value
 *
 * Without this check, an orphaned authenticatedAdminSlugs[slug]=true entry (e.g. left over
 * from a stale/QA browser session, or created for a slug whose Supabase sign-in never
 * completed or later failed) would cause the app to silently reuse whatever unrelated
 * Supabase session happens to be active in the browser and misreport secure field-upload
 * access for that slug.
 */
export function isCampaignAdminSlugSecurelyAuthenticated(
  slug: string,
  authenticatedAdminSlugs: Record<string, boolean>,
  marker: CampaignAdminSupabaseSessionMarker | null,
  currentUserId: string
): boolean {
  if (!slug) return false;
  if (!authenticatedAdminSlugs[slug]) return false;
  if (!marker) return false;
  if (marker.slug !== slug) return false;
  if (!currentUserId || marker.userId !== currentUserId) return false;
  if (!marker.workspaceId || !marker.workspaceId.trim()) return false;
  return true;
}

/**
 * Reconciles the persisted authenticatedAdminSlugs map against the campaignAdminSupabaseSession
 * marker for a single slug (the one currently being restored/reloaded). If that slug is not
 * securely authenticated per isCampaignAdminSlugSecurelyAuthenticated, its orphaned "true" entry
 * is removed so it can no longer be used to gate or trust secure field-upload verification.
 * Slugs other than the one being reconciled are left untouched.
 */
export function reconcileAuthenticatedAdminSlugs(
  slug: string,
  authenticatedAdminSlugs: Record<string, boolean>,
  marker: CampaignAdminSupabaseSessionMarker | null,
  currentUserId: string
): { authenticated: boolean; nextAuthenticatedAdminSlugs: Record<string, boolean> } {
  if (!slug || !authenticatedAdminSlugs[slug]) {
    return { authenticated: false, nextAuthenticatedAdminSlugs: authenticatedAdminSlugs };
  }
  if (isCampaignAdminSlugSecurelyAuthenticated(slug, authenticatedAdminSlugs, marker, currentUserId)) {
    return { authenticated: true, nextAuthenticatedAdminSlugs: authenticatedAdminSlugs };
  }
  const nextAuthenticatedAdminSlugs = { ...authenticatedAdminSlugs };
  delete nextAuthenticatedAdminSlugs[slug];
  return { authenticated: false, nextAuthenticatedAdminSlugs };
}
