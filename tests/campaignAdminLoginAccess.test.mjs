import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { evaluateCampaignAdminLoginAccess } from "../src/secureFieldUploadAuth.ts";

const appSource = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

function baseInput(overrides = {}) {
  return {
    authenticatedUserId: "user-1",
    resourceId: "cmp-1",
    resourceSlug: "cmp-slug",
    assignment: {
      userId: "user-1",
      workspaceId: "ws-1",
      resourceType: "campaign",
      resourceId: "cmp-1",
      resourceSlug: "cmp-slug",
      active: true
    },
    workspaceMembershipActive: true,
    hasValidWorkspaceMembershipRole: true,
    subscriptionActive: true,
    hasCampaignAdminAccessFeature: true,
    ...overrides
  };
}

test("authorizes when assignment, membership, subscription and feature all check out", () => {
  const access = evaluateCampaignAdminLoginAccess(baseInput());
  assert.equal(access.authorized, true);
  assert.equal(access.reason, "authorized");
});

test("authorizes resource slugs that differ only by case or surrounding whitespace", () => {
  for (const [stored, expected] of [
    ["gsaa", "GSAA"],
    ["GSAA", "gsaa"],
    ["  gsaa  ", " GSAA "]
  ]) {
    const access = evaluateCampaignAdminLoginAccess(
      baseInput({
        resourceSlug: expected,
        assignment: { ...baseInput().assignment, resourceSlug: stored }
      })
    );
    assert.equal(access.authorized, true);
  }
});

test("denies when there is no assignment at all", () => {
  const access = evaluateCampaignAdminLoginAccess(baseInput({ assignment: null }));
  assert.equal(access.authorized, false);
  assert.equal(access.reason, "assignment_missing");
});

test("denies when the assignment belongs to a different user", () => {
  const access = evaluateCampaignAdminLoginAccess(
    baseInput({ assignment: { userId: "user-2", workspaceId: "ws-1", resourceType: "campaign", resourceId: "cmp-1", active: true } })
  );
  assert.equal(access.reason, "assignment_missing");
});

test("denies when the assignment is for a different campaign (resourceId mismatch)", () => {
  const access = evaluateCampaignAdminLoginAccess(
    baseInput({ assignment: { userId: "user-1", workspaceId: "ws-1", resourceType: "campaign", resourceId: "cmp-OTHER", active: true } })
  );
  assert.equal(access.reason, "assignment_missing");
});

test("denies when the assignment has been revoked (active: false)", () => {
  const access = evaluateCampaignAdminLoginAccess(
    baseInput({ assignment: { userId: "user-1", workspaceId: "ws-1", resourceType: "campaign", resourceId: "cmp-1", active: false } })
  );
  assert.equal(access.reason, "assignment_missing");
});

test("denies when workspace membership is not active", () => {
  const access = evaluateCampaignAdminLoginAccess(baseInput({ workspaceMembershipActive: false }));
  assert.equal(access.reason, "workspace_membership_missing");
});

test("denies when the subscription is inactive", () => {
  const access = evaluateCampaignAdminLoginAccess(baseInput({ subscriptionActive: false }));
  assert.equal(access.reason, "subscription_inactive");
});

test("denies when campaign_admin_access is not included in the plan", () => {
  const access = evaluateCampaignAdminLoginAccess(baseInput({ hasCampaignAdminAccessFeature: false }));
  assert.equal(access.reason, "feature_not_included");
});

test("checks are evaluated in order: assignment before membership before subscription before feature", () => {
  const access = evaluateCampaignAdminLoginAccess(
    baseInput({ assignment: null, workspaceMembershipActive: false, subscriptionActive: false, hasCampaignAdminAccessFeature: false })
  );
  assert.equal(access.reason, "assignment_missing");
});

test("denies when the assignment's stored resource slug does not match the requested slug", () => {
  const access = evaluateCampaignAdminLoginAccess(
    baseInput({
      assignment: {
        userId: "user-1",
        workspaceId: "ws-1",
        resourceType: "campaign",
        resourceId: "cmp-1",
        resourceSlug: "different-slug",
        active: true
      }
    })
  );
  assert.equal(access.reason, "assignment_missing");
});

test("authorizes when the assignment has no stored resource slug (slug check skipped, not required)", () => {
  const access = evaluateCampaignAdminLoginAccess(
    baseInput({
      assignment: { userId: "user-1", workspaceId: "ws-1", resourceType: "campaign", resourceId: "cmp-1", active: true }
    })
  );
  assert.equal(access.authorized, true);
});

test("denies when workspace membership is active but the role is not Campaign-Admin-compatible", () => {
  const access = evaluateCampaignAdminLoginAccess(baseInput({ hasValidWorkspaceMembershipRole: false }));
  assert.equal(access.authorized, false);
  assert.equal(access.reason, "workspace_membership_missing");
  assert.equal(access.message, "Your workspace access has not been activated.");
});

test("exact required user-facing messages are used for every denial reason", () => {
  assert.equal(
    evaluateCampaignAdminLoginAccess(baseInput({ assignment: null })).message,
    "You are not assigned to administer this campaign."
  );
  assert.equal(
    evaluateCampaignAdminLoginAccess(baseInput({ workspaceMembershipActive: false })).message,
    "Your workspace access has not been activated."
  );
  assert.equal(
    evaluateCampaignAdminLoginAccess(baseInput({ subscriptionActive: false })).message,
    "This campaign subscription is inactive."
  );
  assert.equal(
    evaluateCampaignAdminLoginAccess(baseInput({ hasCampaignAdminAccessFeature: false })).message,
    "Campaign Admin access is not included in the current plan."
  );
});

test("Campaign Admin login writes route-scoped session state without loading workspace supporters", () => {
  const loginStart = appSource.indexOf("async function submitCampaignAdminLogin(event: FormEvent)");
  const loginEnd = appSource.indexOf("\n  async function logoutCampaignAdmin", loginStart);
  const loginSource = appSource.slice(loginStart, loginEnd);
  const authorizationGuard = loginSource.indexOf("if (!loginAccess.authorized)");
  const unauthorizedReturn = loginSource.indexOf("return;", authorizationGuard);
  const sessionMarkerWrite = loginSource.indexOf("writeCampaignAdminSupabaseSession({");
  const authenticatedSlugWrite = loginSource.indexOf("writeAuthenticatedAdminSlugs(nextAuth);");

  assert.ok(authorizationGuard >= 0);
  assert.ok(unauthorizedReturn > authorizationGuard);
  assert.ok(sessionMarkerWrite > unauthorizedReturn);
  assert.ok(authenticatedSlugWrite > sessionMarkerWrite);
  assert.doesNotMatch(loginSource, /loadRemoteState\(\)/);
  assert.doesNotMatch(loginSource, /setSigners\(/);
});
