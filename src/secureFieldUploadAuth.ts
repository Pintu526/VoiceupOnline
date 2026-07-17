export const SECURE_FIELD_UPLOAD_UNPROVISIONED_MESSAGE =
  "Campaign Admin access is active, but secure field-upload access has not been provisioned.";

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

export function isStoragePathWithinWorkspace(path: string, workspaceId: string) {
  return Boolean(workspaceId && path.startsWith(`${workspaceId}/`));
}

export interface CampaignAdminSupabaseSessionMarker {
  slug: string;
  userId: string;
  workspaceId: string;
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
