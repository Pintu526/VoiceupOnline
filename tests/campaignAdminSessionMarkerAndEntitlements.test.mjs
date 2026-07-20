import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CAMPAIGN_ADMIN_ACCESS_MESSAGES,
  CAMPAIGN_ADMIN_SESSION_MARKER_SCHEMA_VERSION,
  evaluateCampaignAdminSecureFieldUploadAccess,
  isCampaignAdminSessionMarkerValid
} from "../src/secureFieldUploadAuth.ts";

const expected = {
  slug: "cmp-slug",
  resourceId: "cmp-1",
  workspaceId: "ws-1",
  userId: "user-1",
  applicationKey: "voiceup",
  role: "campaign_admin"
};

function marker(overrides = {}) {
  return {
    slug: "cmp-slug",
    userId: "user-1",
    workspaceId: "ws-1",
    resourceId: "cmp-1",
    email: "admin@example.com",
    schemaVersion: CAMPAIGN_ADMIN_SESSION_MARKER_SCHEMA_VERSION,
    applicationKey: "voiceup",
    role: "campaign_admin",
    resourceType: "campaign",
    issuedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

// ── SESSION MARKER validation ────────────────────────────────────────────────

test("a fully matching, current-schema marker is valid", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker(), expected), true);
});

test("a null marker is invalid", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(null, expected), false);
});

test("an old/incomplete marker (missing schemaVersion) is never silently trusted", () => {
  const legacyMarker = { slug: "cmp-slug", userId: "user-1", workspaceId: "ws-1", resourceId: "cmp-1" };
  assert.equal(isCampaignAdminSessionMarkerValid(legacyMarker, expected), false);
});

test("a marker on an old schema version is rejected even if every other field matches", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker({ schemaVersion: 1 }), expected), false);
});

test("a marker for a different slug cannot be reused for this campaign", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker({ slug: "different-slug" }), expected), false);
});

test("a marker for a different resourceId cannot be reused for this campaign", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker({ resourceId: "cmp-OTHER" }), expected), false);
});

test("a marker for a different workspaceId cannot be reused for this workspace", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker({ workspaceId: "ws-OTHER" }), expected), false);
});

test("a marker for a different userId cannot be reused by this user", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker({ userId: "user-OTHER" }), expected), false);
});

test("a marker for a different applicationKey is rejected", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker({ applicationKey: "other-app" }), expected), false);
});

test("a marker for a different role is rejected", () => {
  assert.equal(isCampaignAdminSessionMarkerValid(marker({ role: "viewer" }), expected), false);
});

// ── ENTITLEMENTS layered on secure field-upload access ──────────────────────

function baseAccess(overrides = {}) {
  return { available: true, reason: "available", message: "ok", userId: "user-1", workspaceId: "ws-1", role: "campaign_admin", ...overrides };
}

function entitlementInput(overrides = {}) {
  return {
    baseAccess: baseAccess(),
    sessionMarkerValid: true,
    subscriptionActive: true,
    hasCampaignAdminAccessFeature: true,
    hasFieldCollectionFeature: true,
    hasSecureUploadFeature: true,
    ...overrides
  };
}

test("available when every gate (base access, marker, subscription, all three features) passes", () => {
  const result = evaluateCampaignAdminSecureFieldUploadAccess(entitlementInput());
  assert.equal(result.available, true);
  assert.equal(result.message, CAMPAIGN_ADMIN_ACCESS_MESSAGES.secureUploadActive);
});

test("an already-unavailable base access is returned as-is -- no additional gate can widen it", () => {
  const denied = baseAccess({ available: false, reason: "membership_missing", message: "denied" });
  const result = evaluateCampaignAdminSecureFieldUploadAccess(entitlementInput({ baseAccess: denied }));
  assert.equal(result.available, false);
  assert.equal(result.reason, "membership_missing");
});

test("an invalid session marker denies access with the provisioning-incomplete message", () => {
  const result = evaluateCampaignAdminSecureFieldUploadAccess(entitlementInput({ sessionMarkerValid: false }));
  assert.equal(result.available, false);
  assert.equal(result.reason, "session_marker_invalid");
  assert.equal(result.message, CAMPAIGN_ADMIN_ACCESS_MESSAGES.provisioningIncomplete);
});

test("an inactive subscription denies access with the exact required message", () => {
  const result = evaluateCampaignAdminSecureFieldUploadAccess(entitlementInput({ subscriptionActive: false }));
  assert.equal(result.reason, "subscription_inactive");
  assert.equal(result.message, "This campaign subscription is inactive.");
});

test("missing campaign_admin_access denies access with the exact required message", () => {
  const result = evaluateCampaignAdminSecureFieldUploadAccess(
    entitlementInput({ hasCampaignAdminAccessFeature: false })
  );
  assert.equal(result.reason, "campaign_admin_access_missing");
  assert.equal(result.message, "Campaign Admin access is not included in the current plan.");
});

test("missing field_collection denies access with the exact required message", () => {
  const result = evaluateCampaignAdminSecureFieldUploadAccess(
    entitlementInput({ hasFieldCollectionFeature: false })
  );
  assert.equal(result.reason, "field_collection_missing");
  assert.equal(result.message, "Field Collection is not included in the current plan.");
});

test("missing secure_upload denies access with the exact required message", () => {
  const result = evaluateCampaignAdminSecureFieldUploadAccess(
    entitlementInput({ hasSecureUploadFeature: false })
  );
  assert.equal(result.reason, "secure_upload_missing");
  assert.equal(result.message, "Secure field upload is not included in the current plan.");
});

test("gates are evaluated in order: marker before subscription before campaign_admin_access before field_collection before secure_upload", () => {
  const result = evaluateCampaignAdminSecureFieldUploadAccess(
    entitlementInput({
      sessionMarkerValid: false,
      subscriptionActive: false,
      hasCampaignAdminAccessFeature: false,
      hasFieldCollectionFeature: false,
      hasSecureUploadFeature: false
    })
  );
  assert.equal(result.reason, "session_marker_invalid");
});

// ── Exact required user-facing messages (verbatim) ──────────────────────────

test("every exact required Campaign Admin user-facing message matches the specification verbatim", () => {
  assert.equal(CAMPAIGN_ADMIN_ACCESS_MESSAGES.authenticationFailure, "Campaign Admin email or password is incorrect.");
  assert.equal(
    CAMPAIGN_ADMIN_ACCESS_MESSAGES.provisioningIncomplete,
    "Campaign Admin provisioning is incomplete. Ask the SaaS administrator to re-provision this account."
  );
  assert.equal(CAMPAIGN_ADMIN_ACCESS_MESSAGES.assignmentMissing, "You are not assigned to administer this campaign.");
  assert.equal(CAMPAIGN_ADMIN_ACCESS_MESSAGES.workspaceMembershipMissing, "Your workspace access has not been activated.");
  assert.equal(CAMPAIGN_ADMIN_ACCESS_MESSAGES.subscriptionInactive, "This campaign subscription is inactive.");
  assert.equal(
    CAMPAIGN_ADMIN_ACCESS_MESSAGES.campaignAdminFeatureMissing,
    "Campaign Admin access is not included in the current plan."
  );
  assert.equal(CAMPAIGN_ADMIN_ACCESS_MESSAGES.fieldCollectionMissing, "Field Collection is not included in the current plan.");
  assert.equal(CAMPAIGN_ADMIN_ACCESS_MESSAGES.secureUploadMissing, "Secure field upload is not included in the current plan.");
  assert.equal(CAMPAIGN_ADMIN_ACCESS_MESSAGES.secureUploadActive, "Secure field-upload access is active.");
});

// ── AUTHENTICATION source-pattern checks (no live Supabase backend available in this sandbox) ──

function loginSource() {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  return appSource.slice(
    appSource.indexOf("async function submitCampaignAdminLogin"),
    appSource.indexOf("async function logoutCampaignAdmin")
  );
}

test("submitCampaignAdminLogin always calls signInWithSupabase regardless of any existing ambient session", () => {
  const source = loginSource();
  // getCurrentAuthUser() is only used to compute session ownership -- it never short-circuits
  // or replaces the real signInWithPassword() call below it.
  const existingUserIndex = source.indexOf("getCurrentAuthUser()");
  const signInIndex = source.indexOf("signInWithSupabase(submittedEmail, submittedPassword)");
  assert.ok(existingUserIndex >= 0);
  assert.ok(signInIndex > existingUserIndex);
  assert.doesNotMatch(source, /if\s*\(existingUser\)\s*{\s*return/);
});

test("any Supabase Auth sign-in failure is normalized to the exact required message, never the raw Supabase error", () => {
  const source = loginSource();
  assert.match(source, /catch\s*{\s*throw new Error\(CAMPAIGN_ADMIN_ACCESS_MESSAGES\.authenticationFailure\);\s*}/);
});

test("the authenticated user's email must match the submitted email exactly", () => {
  const source = loginSource();
  assert.match(
    source,
    /authenticatedUser\.email.*trim\(\)\.toLowerCase\(\) !== submittedEmail\.toLowerCase\(\)/
  );
});

test("submitCampaignAdminLogin never compares the submitted password against a locally stored value", () => {
  const source = loginSource();
  assert.doesNotMatch(source, /submittedPassword\s*===/);
  assert.doesNotMatch(source, /passcodeMatches/);
  assert.doesNotMatch(source, /getCampaignAdminPasscode/);
});

// ── REGRESSION: exact message strings replace the old, less specific copy ──

test("the old, pre-Step-3 message strings no longer appear anywhere in the source", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("../src/secureFieldUploadAuth.ts", import.meta.url), "utf8");
  for (const oldMessage of [
    "Invalid campaign admin email or password.",
    "This account is not currently assigned as the Campaign Admin for this campaign.",
    "This account no longer has active workspace access.",
    "Campaign Admin access is unavailable while the workspace subscription is inactive.",
    "Campaign Admin access is not included in the current subscription plan.",
    "Campaign admin login is disabled because this campaign has not been provisioned. Ask a workspace admin to provision Campaign Admin access."
  ]) {
    assert.ok(!appSource.includes(oldMessage), `old message should be gone from App.tsx: ${oldMessage}`);
    assert.ok(!authSource.includes(oldMessage), `old message should be gone from secureFieldUploadAuth.ts: ${oldMessage}`);
  }
});
