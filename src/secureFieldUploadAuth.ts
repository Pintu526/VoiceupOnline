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

  if (!supabaseConfigured) {
    console.debug("DENIAL:\nSUPABASE");
    return unavailable("supabase_unavailable");
  }
  if (storageProvider !== "Supabase Storage") {
    console.debug("DENIAL:\nPROVIDER");
    return unavailable("storage_provider_unavailable");
  }
  if (!userId) {
    console.debug("DENIAL:\nNO_SESSION");
    return unavailable("unauthenticated");
  }
  if (!currentWorkspaceId) {
    console.debug("DENIAL:\nNO_WORKSPACE");
    return unavailable("workspace_unresolved");
  }
  if (!membership) {
    console.debug("DENIAL:\nNO_MEMBERSHIP");
    return unavailable("membership_missing");
  }
  if (!membership.active) {
    console.debug("DENIAL:\nINACTIVE");
    return unavailable("membership_inactive");
  }
  if (membership.workspaceId !== currentWorkspaceId) {
    console.debug("DENIAL:\nWORKSPACE_MISMATCH");
    return unavailable("workspace_mismatch");
  }
  if (!isSecureFieldUploadRole(membership.role)) {
    console.debug("DENIAL:\nROLE_REJECTED");
    return unavailable("role_denied");
  }

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
