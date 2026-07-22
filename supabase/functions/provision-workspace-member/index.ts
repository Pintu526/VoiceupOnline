// Generic Supabase Edge Function: provisions (or safely re-provisions) a real
// Supabase Auth user as a member of a workspace, assigned to a specific
// resource (e.g. a VoiceUp campaign). Deliberately contains no
// application-specific hard-coded users, slugs, plans, passwords, or
// workspace IDs -- every future Business OS application can call this same
// function with its own `applicationKey`.
import {
  corsHeaders,
  createAdminClient,
  findAuthUserByEmail,
  getUser,
  getWorkspaceRole,
  isPlatformAdmin,
  jsonResponse,
  parseJson
} from "../_shared/voiceup.ts";
import {
  decideAssignmentTransition,
  decideAuthUserProvisioning,
  isCallerAuthorizedToProvision,
  validateProvisionRequest,
  type ExistingResourceAssignment
} from "./logic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await parseJson(req);
    const validation = validateProvisionRequest(body);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error, code: "invalid_request" }, 400);
    }
    const request = validation.request;

    // ── Authorization: identify the caller from their bearer token and verify,
    // via the database, that they may manage the target workspace. Never trust
    // role/workspace claims sent by the browser. ──────────────────────────────
    const caller = await getUser(req);
    if (!caller) {
      return jsonResponse({ error: "A valid Supabase session is required.", code: "unauthenticated" }, 401);
    }

    const admin = createAdminClient();
    const [callerIsPlatformAdmin, callerWorkspaceRole] = await Promise.all([
      isPlatformAdmin(admin, caller.id),
      getWorkspaceRole(admin, request.workspaceId, caller.id)
    ]);

    if (!isCallerAuthorizedToProvision({ isPlatformAdmin: callerIsPlatformAdmin, callerWorkspaceRole })) {
      return jsonResponse({ error: "You are not authorized to manage this workspace.", code: "unauthorized" }, 403);
    }

    // ── Auth user: create or safely reuse, never overwrite an unrelated
    // user's password. ─────────────────────────────────────────────────────
    let userId: string;
    let authUserAction: "create" | "reuse";
    if (request.selfAssign) {
      userId = caller.id;
      authUserAction = "reuse";
    } else {
      const existingUser = await findAuthUserByEmail(admin, request.email);
      let existingUserIsPlatformOwnerElsewhere = false;
      if (existingUser) {
        const { data: platformRow } = await admin
          .from("voiceup_workspace_members")
          .select("workspace_id")
          .eq("user_id", existingUser.id)
          .eq("role", "platform_owner")
          .neq("workspace_id", request.workspaceId)
          .maybeSingle();
        existingUserIsPlatformOwnerElsewhere = Boolean(platformRow);
      }

      const authDecision = decideAuthUserProvisioning({
        existingUserId: existingUser?.id ?? null,
        existingUserIsPlatformOwnerElsewhere
      });
      if (authDecision.action === "conflict") {
        return jsonResponse({ error: authDecision.reason, code: "identity_conflict" }, 409);
      }

      authUserAction = authDecision.action;
      if (authDecision.action === "create") {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: request.email,
          password: request.password,
          email_confirm: true
        });
        if (createError || !created?.user) {
          return jsonResponse({ error: createError?.message ?? "Unable to create the Auth user." }, 500);
        }
        userId = created.user.id;
      } else {
        // Reuse: identity is linked, but the existing user's password is never
        // touched here (that would allow hijacking an unrelated account).
        userId = authDecision.userId;
      }
    }

    // ── Workspace-level membership (upsert, active). Preserve an existing
    // administrator role: Campaign Admin is a resource assignment, not a
    // replacement for Organization/Workspace Admin privileges. ─────────────
    const { data: existingMembership, error: existingMembershipError } = await admin
      .from("voiceup_workspace_members")
      .select("role")
      .eq("workspace_id", request.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembershipError) {
      return jsonResponse(
        { error: `Workspace membership could not be resolved: ${existingMembershipError.message}`, code: "membership_lookup_failed", userId },
        500
      );
    }
    const membershipRole = ["platform_owner", "workspace_admin"].includes(existingMembership?.role ?? "")
      ? existingMembership!.role
      : request.role;
    const { error: membershipError } = await admin
      .from("voiceup_workspace_members")
      .upsert(
        {
          workspace_id: request.workspaceId,
          user_id: userId,
          role: membershipRole,
          active: true,
          updated_at: new Date().toISOString()
        },
        { onConflict: "workspace_id,user_id" }
      );

    if (membershipError) {
      // Auth user creation already succeeded (or was reused) at this point.
      // We deliberately do NOT delete the Auth user on this failure -- the
      // operation is idempotent: retrying with the same email will find the
      // same Auth user via `findAuthUserByEmail` and continue from here.
      return jsonResponse(
        {
          error: `Workspace membership could not be saved: ${membershipError.message}`,
          code: "membership_failed",
          userId
        },
        500
      );
    }

    // ── Resource assignment: create, no-op if already active for this exact
    // user, or revoke-and-replace when a different administrator previously
    // held this assignment. ────────────────────────────────────────────────
    const { data: existingAssignmentRow, error: existingAssignmentError } = await admin
      .from("workspace_resource_members")
      .select("id,user_id,active")
      .eq("workspace_id", request.workspaceId)
      .eq("application_key", request.applicationKey)
      .eq("role", request.role)
      .eq("resource_type", request.assignment.resourceType)
      .eq("resource_id", request.assignment.resourceId)
      .eq("active", true)
      .maybeSingle();

    if (existingAssignmentError) {
      return jsonResponse(
        { error: `Unable to resolve existing assignment: ${existingAssignmentError.message}`, code: "assignment_lookup_failed", userId },
        500
      );
    }

    const existingAssignment: ExistingResourceAssignment | null = existingAssignmentRow
      ? { id: existingAssignmentRow.id, userId: existingAssignmentRow.user_id, active: existingAssignmentRow.active }
      : null;

    const transition = decideAssignmentTransition(existingAssignment, userId);
    const nowIso = new Date().toISOString();

    if (transition.action === "replace") {
      const { error: revokeError } = await admin
        .from("workspace_resource_members")
        .update({ active: false, revoked_at: nowIso, updated_at: nowIso })
        .eq("id", transition.previousAssignmentId);
      if (revokeError) {
        return jsonResponse(
          { error: `Unable to revoke the previous assignment: ${revokeError.message}`, code: "assignment_revoke_failed", userId },
          500
        );
      }
    }

    let assignmentId = existingAssignment?.id ?? "";
    if (transition.action !== "already_active") {
      const { data: insertedAssignment, error: insertError } = await admin
        .from("workspace_resource_members")
        .insert({
          workspace_id: request.workspaceId,
          user_id: userId,
          application_key: request.applicationKey,
          role: request.role,
          resource_type: request.assignment.resourceType,
          resource_id: request.assignment.resourceId,
          resource_slug: request.assignment.resourceSlug || null,
          active: true,
          assigned_by: caller.id,
          assigned_at: nowIso
        })
        .select("id")
        .single();
      if (insertError || !insertedAssignment) {
        return jsonResponse(
          {
            error: `Assignment could not be saved: ${insertError?.message ?? "unknown error"}`,
            code: "assignment_failed",
            userId
          },
          500
        );
      }
      assignmentId = insertedAssignment.id;
    }

    // Never log or return the plaintext password.
    return jsonResponse({
      userId,
      authUserAction,
      workspaceMembership: { workspaceId: request.workspaceId, role: membershipRole, active: true },
      assignment: {
        id: assignmentId,
        transition: transition.action,
        resourceType: request.assignment.resourceType,
        resourceId: request.assignment.resourceId,
        resourceSlug: request.assignment.resourceSlug,
        active: true
      }
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unable to provision workspace member.", code: "unexpected_error" },
      500
    );
  }
});
