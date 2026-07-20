// Pure, framework-agnostic decision logic for the `provision-workspace-member`
// Edge Function. This file intentionally has NO imports (not Deno's
// supabase-js client, not Node, not the frontend `src/` tree) so it can be:
//  - imported by the Edge Function (`./index.ts`) at the Deno runtime, and
//  - imported directly by `node --test` for fast, deterministic unit tests
//    of every authorization/provisioning/replacement decision, without a
//    live Supabase project or service-role secret.
//
// Generic across every future Business OS application: nothing here is
// specific to VoiceUp, campaigns, or any particular plan/pricing model.

export interface ProvisionAssignmentInput {
  resourceType: string;
  resourceId: string;
  resourceSlug: string;
}

export interface ProvisionRequestBody {
  workspaceId: string;
  applicationKey: string;
  role: string;
  email: string;
  password: string;
  assignment: ProvisionAssignmentInput;
}

export type ProvisionRequestValidation =
  | { valid: true; request: ProvisionRequestBody }
  | { valid: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validates the wire-shape of a provisioning request before any DB/Auth work happens. */
export function validateProvisionRequest(body: unknown): ProvisionRequestValidation {
  const candidate = (body ?? {}) as Partial<ProvisionRequestBody>;
  if (!isNonEmptyString(candidate.workspaceId)) return { valid: false, error: "workspaceId is required." };
  if (!isNonEmptyString(candidate.applicationKey)) return { valid: false, error: "applicationKey is required." };
  if (!isNonEmptyString(candidate.role)) return { valid: false, error: "role is required." };
  if (!isNonEmptyString(candidate.email)) return { valid: false, error: "email is required." };
  if (!isNonEmptyString(candidate.password) || candidate.password.trim().length < 8) {
    return { valid: false, error: "password must be at least 8 characters." };
  }
  const assignment = candidate.assignment;
  if (!assignment || typeof assignment !== "object") return { valid: false, error: "assignment is required." };
  if (!isNonEmptyString(assignment.resourceType)) return { valid: false, error: "assignment.resourceType is required." };
  if (!isNonEmptyString(assignment.resourceId)) return { valid: false, error: "assignment.resourceId is required." };

  return {
    valid: true,
    request: {
      workspaceId: candidate.workspaceId!.trim(),
      applicationKey: candidate.applicationKey!.trim(),
      role: candidate.role!.trim(),
      email: normalizeProvisioningEmail(candidate.email!),
      password: candidate.password!,
      assignment: {
        resourceType: assignment.resourceType.trim(),
        resourceId: assignment.resourceId.trim(),
        resourceSlug: isNonEmptyString(assignment.resourceSlug) ? assignment.resourceSlug.trim() : ""
      }
    }
  };
}

export function normalizeProvisioningEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Authorization: only an existing platform admin, or an existing
 * `workspace_admin`/`platform_owner` role for the EXACT target workspace, may
 * provision workspace members. Role/workspace claims must always come from a
 * database lookup performed by the caller (never trust values sent by the
 * browser) -- this function only makes the yes/no decision from the already
 * DB-verified booleans.
 */
export function isCallerAuthorizedToProvision(input: {
  isPlatformAdmin: boolean;
  callerWorkspaceRole: string;
}): boolean {
  return input.isPlatformAdmin || input.callerWorkspaceRole === "workspace_admin" || input.callerWorkspaceRole === "platform_owner";
}

export type AuthUserDecision =
  | { action: "create" }
  | { action: "reuse"; userId: string }
  | { action: "conflict"; reason: string };

/**
 * Decides what to do with a resolved Auth user lookup for the normalized
 * email. Never returns a decision that would change an existing user's
 * password -- "reuse" means "link this existing identity", not "overwrite
 * its credentials".
 */
export function decideAuthUserProvisioning(input: {
  existingUserId: string | null;
  existingUserIsPlatformOwnerElsewhere: boolean;
}): AuthUserDecision {
  if (!input.existingUserId) return { action: "create" };
  if (input.existingUserIsPlatformOwnerElsewhere) {
    return {
      action: "conflict",
      reason:
        "This email belongs to an existing platform administrator identity and cannot be safely reused as a resource assignment for a different workspace."
    };
  }
  return { action: "reuse", userId: input.existingUserId };
}

export interface ExistingResourceAssignment {
  id: string;
  userId: string;
  active: boolean;
}

export type AssignmentTransition =
  | { action: "create" }
  | { action: "already_active" }
  | { action: "replace"; previousAssignmentId: string };

/**
 * Decides the transition for the (workspace, applicationKey, role,
 * resourceType, resourceId) assignment slot: create a new one, treat an
 * idempotent retry as a no-op, or revoke the previous administrator's
 * assignment and create a fresh active one for the newly resolved user.
 */
export function decideAssignmentTransition(
  existing: ExistingResourceAssignment | null,
  resolvedUserId: string
): AssignmentTransition {
  if (!existing || !existing.active) return { action: "create" };
  if (existing.userId === resolvedUserId) return { action: "already_active" };
  return { action: "replace", previousAssignmentId: existing.id };
}
