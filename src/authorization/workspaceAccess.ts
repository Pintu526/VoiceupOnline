// ─────────────────────────────────────────────────────────────────────────
// Generic, reusable Business OS authorization primitives.
//
// These evaluators know nothing about VoiceUp, campaigns, or Supabase. They
// operate purely on already-fetched candidate rows (plain data, no network,
// no framework) and a small set of generic concepts shared by every Business
// OS application built on this pattern:
//   - authenticated user
//   - workspace membership
//   - resource assignment (application key / role / resource type / id)
//
// Every VoiceUp-specific concern (campaign slug resolution, the
// `campaign_admin` role literal, `field_collection` / `secure_upload`
// feature keys, Campaign Admin UI copy) belongs in the calling code
// (`src/backend.ts`, `src/secureFieldUploadAuth.ts`, `src/App.tsx`), never
// in this file.
//
// Both evaluators fail closed: a database query failure, a missing row, or
// more than one row matching every expected field (an inconsistent/ambiguous
// data state) are all treated as "not authorized" -- never silently granted.
// ─────────────────────────────────────────────────────────────────────────

export type WorkspaceResourceAssignmentStatus =
  | "assignment_found"
  | "assignment_missing"
  | "assignment_inactive"
  | "assignment_wrong_workspace"
  | "assignment_wrong_resource"
  | "assignment_wrong_role"
  | "assignment_ambiguous"
  | "query_failed";

export interface WorkspaceResourceAssignmentRow {
  userId: string;
  workspaceId: string;
  applicationKey: string;
  role: string;
  resourceType: string;
  resourceId: string;
  resourceSlug?: string | null;
  active: boolean;
}

export interface WorkspaceResourceAssignmentExpectation {
  applicationKey: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  /** Only checked when the candidate row itself has a stored resource slug. */
  resourceSlug?: string;
  requiredRole: string;
  authenticatedUserId: string;
}

export interface WorkspaceResourceAssignmentResult {
  status: WorkspaceResourceAssignmentStatus;
  assignment: WorkspaceResourceAssignmentRow | null;
}

/**
 * Reusable Business OS evaluator: does this authenticated user hold exactly
 * one active assignment to this exact resource, in this exact workspace,
 * with this exact role (and, where a slug is stored, this exact slug)?
 *
 * `rows` should already be scoped to the authenticated user, application
 * key, resource type, and resource id (the caller's query narrows this far
 * so the evaluator only needs to distinguish *why* a match fails, never to
 * re-derive identity). Every remaining expected field (workspace, slug,
 * role, active) is checked here, in order, so the returned status is the
 * most specific true reason -- never a guess.
 */
export function evaluateWorkspaceResourceAssignment(
  rows: WorkspaceResourceAssignmentRow[] | null,
  queryFailed: boolean,
  expected: WorkspaceResourceAssignmentExpectation
): WorkspaceResourceAssignmentResult {
  if (queryFailed) return { status: "query_failed", assignment: null };

  const candidates = (rows ?? []).filter(
    (row) =>
      row.userId === expected.authenticatedUserId &&
      row.applicationKey === expected.applicationKey &&
      row.resourceType === expected.resourceType &&
      row.resourceId === expected.resourceId
  );
  if (candidates.length === 0) return { status: "assignment_missing", assignment: null };

  const workspaceMatches = candidates.filter((row) => row.workspaceId === expected.workspaceId);
  if (workspaceMatches.length === 0) return { status: "assignment_wrong_workspace", assignment: null };

  const slugMatches = expected.resourceSlug
    ? workspaceMatches.filter((row) => !row.resourceSlug || row.resourceSlug === expected.resourceSlug)
    : workspaceMatches;
  if (slugMatches.length === 0) return { status: "assignment_wrong_resource", assignment: null };

  const roleMatches = slugMatches.filter((row) => row.role === expected.requiredRole);
  if (roleMatches.length === 0) return { status: "assignment_wrong_role", assignment: null };

  const activeMatches = roleMatches.filter((row) => row.active === true);
  if (activeMatches.length === 0) return { status: "assignment_inactive", assignment: null };

  if (activeMatches.length > 1) return { status: "assignment_ambiguous", assignment: null };

  return { status: "assignment_found", assignment: activeMatches[0] };
}

export type WorkspaceMembershipStatus =
  | "membership_found"
  | "membership_missing"
  | "membership_inactive"
  | "membership_wrong_workspace"
  | "membership_role_invalid"
  | "membership_ambiguous"
  | "query_failed";

export interface WorkspaceMembershipRow {
  userId: string;
  workspaceId: string;
  role: string;
  active: boolean;
}

export interface WorkspaceMembershipExpectation {
  workspaceId: string;
  authenticatedUserId: string;
  /** The caller-defined set of roles considered valid for this check (never a plan name). */
  validRoles: readonly string[];
}

export interface WorkspaceMembershipResult {
  status: WorkspaceMembershipStatus;
  membership: WorkspaceMembershipRow | null;
}

/**
 * Reusable Business OS evaluator: does this authenticated user hold an
 * active membership in this exact workspace, with a role from the caller's
 * allowed set? Never trusts a role value that wasn't read from `rows`
 * (i.e. never a browser-supplied role) -- `rows` must always come from a
 * server-verified query scoped to the authenticated user.
 */
export function evaluateWorkspaceMembership(
  rows: WorkspaceMembershipRow[] | null,
  queryFailed: boolean,
  expected: WorkspaceMembershipExpectation
): WorkspaceMembershipResult {
  if (queryFailed) return { status: "query_failed", membership: null };

  const candidates = (rows ?? []).filter((row) => row.userId === expected.authenticatedUserId);
  if (candidates.length === 0) return { status: "membership_missing", membership: null };

  const workspaceMatches = candidates.filter((row) => row.workspaceId === expected.workspaceId);
  if (workspaceMatches.length === 0) return { status: "membership_wrong_workspace", membership: null };

  const activeMatches = workspaceMatches.filter((row) => row.active === true);
  if (activeMatches.length === 0) return { status: "membership_inactive", membership: null };

  const roleMatches = activeMatches.filter((row) => expected.validRoles.includes(row.role));
  if (roleMatches.length === 0) return { status: "membership_role_invalid", membership: null };

  if (roleMatches.length > 1) return { status: "membership_ambiguous", membership: null };

  return { status: "membership_found", membership: roleMatches[0] };
}
