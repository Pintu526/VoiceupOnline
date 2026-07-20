import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateWorkspaceMembership,
  evaluateWorkspaceResourceAssignment
} from "../src/authorization/workspaceAccess.ts";

const expectedAssignment = {
  applicationKey: "voiceup",
  workspaceId: "ws-1",
  resourceType: "campaign",
  resourceId: "cmp-1",
  resourceSlug: "cmp-slug",
  requiredRole: "campaign_admin",
  authenticatedUserId: "user-1"
};

function assignmentRow(overrides = {}) {
  return {
    userId: "user-1",
    workspaceId: "ws-1",
    applicationKey: "voiceup",
    role: "campaign_admin",
    resourceType: "campaign",
    resourceId: "cmp-1",
    resourceSlug: "cmp-slug",
    active: true,
    ...overrides
  };
}

// ── ASSIGNMENT (generic, reusable evaluator) ────────────────────────────────

test("assignment_found: exact active assignment succeeds", () => {
  const result = evaluateWorkspaceResourceAssignment([assignmentRow()], false, expectedAssignment);
  assert.equal(result.status, "assignment_found");
  assert.ok(result.assignment);
});

test("assignment_missing: no candidate rows for this user/application/resource", () => {
  const result = evaluateWorkspaceResourceAssignment([], false, expectedAssignment);
  assert.equal(result.status, "assignment_missing");
  assert.equal(result.assignment, null);
});

test("assignment_missing: rows exist but for a different resourceId (query pre-filters would already exclude, but defends anyway)", () => {
  const result = evaluateWorkspaceResourceAssignment(
    [assignmentRow({ resourceId: "cmp-OTHER" })],
    false,
    expectedAssignment
  );
  assert.equal(result.status, "assignment_missing");
});

test("assignment_inactive: matching row but active is false", () => {
  const result = evaluateWorkspaceResourceAssignment([assignmentRow({ active: false })], false, expectedAssignment);
  assert.equal(result.status, "assignment_inactive");
});

test("assignment_wrong_workspace: row belongs to a different workspace", () => {
  const result = evaluateWorkspaceResourceAssignment(
    [assignmentRow({ workspaceId: "ws-OTHER" })],
    false,
    expectedAssignment
  );
  assert.equal(result.status, "assignment_wrong_workspace");
});

test("assignment_wrong_resource: row has a stored slug that does not match the expected slug", () => {
  const result = evaluateWorkspaceResourceAssignment(
    [assignmentRow({ resourceSlug: "different-slug" })],
    false,
    expectedAssignment
  );
  assert.equal(result.status, "assignment_wrong_resource");
});

test("assignment_wrong_role: row is active for the right resource/workspace but the wrong role", () => {
  const result = evaluateWorkspaceResourceAssignment(
    [assignmentRow({ role: "viewer" })],
    false,
    expectedAssignment
  );
  assert.equal(result.status, "assignment_wrong_role");
});

test("assignment_ambiguous: two active rows both otherwise match every expected field", () => {
  const result = evaluateWorkspaceResourceAssignment(
    [assignmentRow(), assignmentRow()],
    false,
    expectedAssignment
  );
  assert.equal(result.status, "assignment_ambiguous");
  assert.equal(result.assignment, null);
});

test("query_failed: a database error fails closed regardless of any rows passed", () => {
  const result = evaluateWorkspaceResourceAssignment([assignmentRow()], true, expectedAssignment);
  assert.equal(result.status, "query_failed");
  assert.equal(result.assignment, null);
});

test("a row without a stored resource slug is not rejected on slug grounds (slug check only applies when stored)", () => {
  const result = evaluateWorkspaceResourceAssignment(
    [assignmentRow({ resourceSlug: null })],
    false,
    expectedAssignment
  );
  assert.equal(result.status, "assignment_found");
});

test("browser-supplied applicationKey/resourceType cannot widen matches beyond the caller's expectation", () => {
  const result = evaluateWorkspaceResourceAssignment(
    [assignmentRow({ applicationKey: "other-app" }), assignmentRow({ resourceType: "other-resource" })],
    false,
    expectedAssignment
  );
  assert.equal(result.status, "assignment_missing");
});

// ── MEMBERSHIP (generic, reusable evaluator) ────────────────────────────────

const expectedMembership = {
  workspaceId: "ws-1",
  authenticatedUserId: "user-1",
  validRoles: ["platform_owner", "workspace_admin", "campaign_admin", "field_officer"]
};

function membershipRow(overrides = {}) {
  return { userId: "user-1", workspaceId: "ws-1", role: "campaign_admin", active: true, ...overrides };
}

test("membership_found: exact active membership with a valid role succeeds", () => {
  const result = evaluateWorkspaceMembership([membershipRow()], false, expectedMembership);
  assert.equal(result.status, "membership_found");
  assert.ok(result.membership);
});

test("membership_missing: no rows for this user at all", () => {
  const result = evaluateWorkspaceMembership([], false, expectedMembership);
  assert.equal(result.status, "membership_missing");
});

test("membership_wrong_workspace: row belongs to a different workspace", () => {
  const result = evaluateWorkspaceMembership(
    [membershipRow({ workspaceId: "ws-OTHER" })],
    false,
    expectedMembership
  );
  assert.equal(result.status, "membership_wrong_workspace");
});

test("membership_inactive: row matches workspace but active is false", () => {
  const result = evaluateWorkspaceMembership([membershipRow({ active: false })], false, expectedMembership);
  assert.equal(result.status, "membership_inactive");
});

test("membership_role_invalid: active membership but role is not in the caller's allowed set", () => {
  const result = evaluateWorkspaceMembership(
    [membershipRow({ role: "unknown_role" })],
    false,
    expectedMembership
  );
  assert.equal(result.status, "membership_role_invalid");
});

test("browser-supplied role is never trusted -- only rows returned from the (RLS-scoped) query are evaluated", () => {
  // Simulates a caller attempting to widen access by passing a validRoles set including a
  // role no stored row actually has; the evaluator only ever inspects `rows`, so this can
  // only narrow, never grant, unearned access.
  const result = evaluateWorkspaceMembership(
    [membershipRow({ role: "viewer" })],
    false,
    { ...expectedMembership, validRoles: ["campaign_admin"] }
  );
  assert.equal(result.status, "membership_role_invalid");
});

test("query_failed: a database error fails closed regardless of any rows passed", () => {
  const result = evaluateWorkspaceMembership([membershipRow()], true, expectedMembership);
  assert.equal(result.status, "query_failed");
});

test("membership_ambiguous: two distinct active valid-role rows for the same workspace fail closed", () => {
  const result = evaluateWorkspaceMembership(
    [membershipRow({ role: "campaign_admin" }), membershipRow({ role: "field_officer" })],
    false,
    expectedMembership
  );
  assert.equal(result.status, "membership_ambiguous");
});
