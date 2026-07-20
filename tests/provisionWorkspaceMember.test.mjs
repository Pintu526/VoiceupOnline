import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decideAssignmentTransition,
  decideAuthUserProvisioning,
  isCallerAuthorizedToProvision,
  normalizeProvisioningEmail,
  validateProvisionRequest
} from "../supabase/functions/provision-workspace-member/logic.ts";

function validBody(overrides = {}) {
  return {
    workspaceId: "workspace-pilot",
    applicationKey: "voiceup",
    role: "campaign_admin",
    email: "  Admin@Example.ORG ",
    password: "correct-horse-battery-staple",
    assignment: {
      resourceType: "campaign",
      resourceId: "cmp-1",
      resourceSlug: "enact-prevention-cow-slaughter-act-2024-odisha"
    },
    ...overrides
  };
}

test("validateProvisionRequest normalizes email and accepts a well-formed body", () => {
  const result = validateProvisionRequest(validBody());
  assert.equal(result.valid, true);
  assert.equal(result.valid && result.request.email, "admin@example.org");
});

test("validateProvisionRequest rejects a missing workspaceId", () => {
  const result = validateProvisionRequest(validBody({ workspaceId: "" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /workspaceId/);
});

test("validateProvisionRequest rejects a missing assignment resourceId", () => {
  const result = validateProvisionRequest(
    validBody({ assignment: { resourceType: "campaign", resourceId: "", resourceSlug: "" } })
  );
  assert.equal(result.valid, false);
  assert.match(result.error, /resourceId/);
});

test("validateProvisionRequest rejects a short password", () => {
  const result = validateProvisionRequest(validBody({ password: "short" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /password/);
});

test("normalizeProvisioningEmail trims and lowercases", () => {
  assert.equal(normalizeProvisioningEmail("  Admin@Example.ORG "), "admin@example.org");
});

test("authorized SaaS Admin (platform admin) can provision", () => {
  assert.equal(isCallerAuthorizedToProvision({ isPlatformAdmin: true, callerWorkspaceRole: "" }), true);
});

test("authorized workspace admin can provision", () => {
  assert.equal(
    isCallerAuthorizedToProvision({ isPlatformAdmin: false, callerWorkspaceRole: "workspace_admin" }),
    true
  );
});

test("unauthorized caller (e.g. campaign_admin or field_officer) is rejected", () => {
  assert.equal(
    isCallerAuthorizedToProvision({ isPlatformAdmin: false, callerWorkspaceRole: "campaign_admin" }),
    false
  );
  assert.equal(
    isCallerAuthorizedToProvision({ isPlatformAdmin: false, callerWorkspaceRole: "field_officer" }),
    false
  );
  assert.equal(isCallerAuthorizedToProvision({ isPlatformAdmin: false, callerWorkspaceRole: "" }), false);
});

test("Auth user creation is chosen when no existing user is found", () => {
  const decision = decideAuthUserProvisioning({ existingUserId: null, existingUserIsPlatformOwnerElsewhere: false });
  assert.deepEqual(decision, { action: "create" });
});

test("an existing safe Auth identity is reused without touching its password", () => {
  const decision = decideAuthUserProvisioning({
    existingUserId: "user-123",
    existingUserIsPlatformOwnerElsewhere: false
  });
  assert.deepEqual(decision, { action: "reuse", userId: "user-123" });
});

test("an unrelated identity conflict (existing platform-owner elsewhere) is rejected safely", () => {
  const decision = decideAuthUserProvisioning({
    existingUserId: "user-999",
    existingUserIsPlatformOwnerElsewhere: true
  });
  assert.equal(decision.action, "conflict");
  assert.match(decision.reason, /platform administrator/i);
});

test("resource assignment is created when none exists", () => {
  assert.deepEqual(decideAssignmentTransition(null, "user-1"), { action: "create" });
});

test("retry with the same assigned user is idempotent (already_active)", () => {
  const existing = { id: "assign-1", userId: "user-1", active: true };
  assert.deepEqual(decideAssignmentTransition(existing, "user-1"), { action: "already_active" });
});

test("previous Campaign Admin assignment is revoked and replaced on a different user", () => {
  const existing = { id: "assign-1", userId: "user-1", active: true };
  assert.deepEqual(decideAssignmentTransition(existing, "user-2"), {
    action: "replace",
    previousAssignmentId: "assign-1"
  });
});

test("an inactive previous assignment is treated as create, not replace", () => {
  const existing = { id: "assign-1", userId: "user-1", active: false };
  assert.deepEqual(decideAssignmentTransition(existing, "user-2"), { action: "create" });
});

test("migration prevents duplicate active assignments via a partial unique index and preserves history", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260719_workspace_resource_members_provisioning.sql", import.meta.url),
    "utf8"
  );
  assert.match(
    migration,
    /create unique index if not exists workspace_resource_members_active_unique_idx\s+on public\.workspace_resource_members \(workspace_id, user_id, application_key, role, resource_type, resource_id\)\s+where active/
  );
  // Revoked rows are never deleted -- only marked inactive with `revoked_at` -- so
  // assignment history is preserved and excluded from the active-uniqueness rule.
  assert.match(migration, /revoked_at timestamptz/);
  assert.doesNotMatch(migration, /delete from public\.workspace_resource_members/);
});

test("migration indexes workspace_id, user_id, resource_id and resource_slug", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260719_workspace_resource_members_provisioning.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /workspace_resource_members_user_id_idx\s+on public\.workspace_resource_members \(user_id\)/);
  assert.match(
    migration,
    /workspace_resource_members_workspace_id_idx\s+on public\.workspace_resource_members \(workspace_id\)/
  );
  assert.match(
    migration,
    /workspace_resource_members_resource_id_idx\s+on public\.workspace_resource_members \(resource_id\)/
  );
  assert.match(
    migration,
    /workspace_resource_members_resource_slug_idx\s+on public\.workspace_resource_members \(resource_slug\)/
  );
});

test("migration grants browser clients read-only access; only the service role may write", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260719_workspace_resource_members_provisioning.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /alter table public\.workspace_resource_members enable row level security/);
  assert.match(
    migration,
    /create policy "Workspace resource members read own assignments"\s+on public\.workspace_resource_members\s+for select\s+to authenticated\s+using \(user_id = auth\.uid\(\)\)/
  );
  assert.match(migration, /revoke all on table public\.workspace_resource_members from anon/);
  // No insert/update/delete policy is granted to anon or authenticated -- RLS
  // default-denies those statements for both roles, leaving only the
  // service-role-authenticated Edge Function (which bypasses RLS) able to write.
  assert.doesNotMatch(migration, /for insert[\s\S]*on public\.workspace_resource_members/);
  assert.doesNotMatch(migration, /for update[\s\S]*on public\.workspace_resource_members/);
  assert.doesNotMatch(migration, /for delete[\s\S]*on public\.workspace_resource_members/);
});

test("the Edge Function never logs or returns the plaintext password", () => {
  const source = readFileSync(
    new URL("../supabase/functions/provision-workspace-member/index.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /console\.(log|info|warn|error)\([^)]*password/i);
  assert.doesNotMatch(source, /jsonResponse\(\{[^}]*password/is);
  // The password is used only to create the Auth user; it must never appear as a
  // key in any returned response object.
  const returnStatements = source.match(/return jsonResponse\(\{[\s\S]*?\}[,)]/g) ?? [];
  assert.ok(returnStatements.length > 0, "expected at least one jsonResponse(...) return in the Edge Function");
  for (const statement of returnStatements) {
    assert.doesNotMatch(statement, /\bpassword\b/i);
  }
});
