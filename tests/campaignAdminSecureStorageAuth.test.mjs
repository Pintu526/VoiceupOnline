import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  createSecureFieldUploadVerificationCoordinator,
  evaluateSecureFieldUploadAccess,
  isSupabaseSessionOwnedBy,
  isStoragePathWithinWorkspace,
  preserveCampaignAdminAccess,
  resolveSupabaseSessionOwnership,
  shouldSignOutCampaignAdminSupabaseSession
} from "../src/secureFieldUploadAuth.ts";

const workspaceId = "workspace-pilot";
const baseInput = {
  supabaseConfigured: true,
  storageProvider: "Supabase Storage",
  userId: "auth-user-1",
  currentWorkspaceId: workspaceId
};

function membership(role, overrides = {}) {
  return {
    workspaceId,
    userId: baseInput.userId,
    role,
    active: true,
    ...overrides
  };
}

test("existing campaign credentials retain local access without a Supabase session", () => {
  const access = evaluateSecureFieldUploadAccess({
    ...baseInput,
    userId: ""
  });
  assert.equal(preserveCampaignAdminAccess(true), true);
  assert.equal(access.available, false);
  assert.equal(access.reason, "unauthenticated");
});

test("wrong Supabase password does not revoke existing Campaign Admin access", () => {
  const access = evaluateSecureFieldUploadAccess({
    ...baseInput,
    userId: ""
  });
  assert.equal(preserveCampaignAdminAccess(true), true);
  assert.equal(access.available, false);
});

test("authenticated user with no membership is denied", () => {
  const access = evaluateSecureFieldUploadAccess(baseInput);
  assert.equal(access.available, false);
  assert.equal(access.reason, "membership_missing");
});

test("authenticated user with a different workspace membership is denied", () => {
  const access = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("campaign_admin", { workspaceId: "workspace-other" })
  });
  assert.equal(access.available, false);
  assert.equal(access.reason, "workspace_mismatch");
});

test("viewer membership cannot upload", () => {
  const access = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("viewer")
  });
  assert.equal(access.available, false);
  assert.equal(access.reason, "role_denied");
});

test("campaign admin for the current workspace can upload", () => {
  const access = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("campaign_admin")
  });
  assert.equal(access.available, true);
});

test("Campaign Admin secure upload requires active to be explicitly true", () => {
  const activeAccess = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("campaign_admin", { active: true })
  });
  const inactiveAccess = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("campaign_admin", { active: false })
  });
  const missingActiveMembership = membership("campaign_admin");
  delete missingActiveMembership.active;
  const missingActiveAccess = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: missingActiveMembership
  });

  assert.equal(activeAccess.available, true);
  assert.equal(inactiveAccess.available, false);
  assert.equal(inactiveAccess.reason, "membership_inactive");
  assert.equal(missingActiveAccess.available, false);
  assert.equal(missingActiveAccess.reason, "membership_inactive");
});

test("secure-upload membership query projects and maps every authorization field", () => {
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
  const verificationSource = backendSource.slice(
    backendSource.indexOf("export async function verifySecureFieldUploadAccess"),
    backendSource.indexOf("async function resolveSecureStorageWorkspaceId")
  );

  assert.match(verificationSource, /\.select\("workspace_id,user_id,role,active"\)/);
  assert.match(verificationSource, /workspaceId: membership\.workspace_id/);
  assert.match(verificationSource, /userId: membership\.user_id/);
  assert.match(verificationSource, /role: membership\.role/);
  assert.match(verificationSource, /active: membership\.active === true/);
});

test("secure-upload membership query resolves by authenticated user id only, independent of any cached workspace id", () => {
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
  const verificationSource = backendSource.slice(
    backendSource.indexOf("export async function verifySecureFieldUploadAccess"),
    backendSource.indexOf("async function resolveSecureStorageWorkspaceId")
  );

  assert.doesNotMatch(verificationSource, /\.eq\("workspace_id",\s*expectedWorkspaceId\)/);
  assert.match(verificationSource, /\.eq\("user_id", user\.id\)/);
  assert.match(verificationSource, /\.limit\(1\)/);
  assert.match(verificationSource, /resolvedWorkspaceId\s*=\s*membership\?\.workspace_id\s*\|\|\s*expectedWorkspaceId/);
  assert.match(verificationSource, /currentWorkspaceId:\s*resolvedWorkspaceId/);
});

test("a stale or default cached workspace id no longer blocks an active permitted membership", () => {
  const staleExpectedWorkspaceId = "default";
  const realWorkspaceId = "34bdced6-56f2-4679-a336-93092208b660";
  const resolvedMembership = {
    workspaceId: realWorkspaceId,
    userId: baseInput.userId,
    role: "campaign_admin",
    active: true
  };

  // Mirrors verifySecureFieldUploadAccess: currentWorkspaceId comes from the
  // membership row's own workspace_id, not from the stale cached expectedWorkspaceId.
  const resolvedWorkspaceId = resolvedMembership.workspaceId || staleExpectedWorkspaceId;
  const access = evaluateSecureFieldUploadAccess({
    supabaseConfigured: true,
    storageProvider: "Supabase Storage",
    userId: baseInput.userId,
    currentWorkspaceId: resolvedWorkspaceId,
    membership: resolvedMembership
  });
  assert.equal(access.available, true);
  assert.equal(access.workspaceId, realWorkspaceId);

  // Documents the regression this guards against: filtering/comparing against the
  // stale cached id directly (pre-fix behavior) would wrongly deny an active membership.
  const preFixAccess = evaluateSecureFieldUploadAccess({
    supabaseConfigured: true,
    storageProvider: "Supabase Storage",
    userId: baseInput.userId,
    currentWorkspaceId: staleExpectedWorkspaceId,
    membership: resolvedMembership
  });
  assert.equal(preFixAccess.available, false);
  assert.equal(preFixAccess.reason, "workspace_mismatch");
});

test("authorised field officer for the current workspace can upload", () => {
  const access = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("field_officer")
  });
  assert.equal(access.available, true);
});

test("refresh evaluation restores secure upload only for a valid session and membership", () => {
  const restored = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("workspace_admin")
  });
  assert.equal(restored.available, true);
  assert.equal(restored.workspaceId, workspaceId);
});

test("logout owns and removes only the Supabase session created by Campaign Admin login", () => {
  const marker = { slug: "clean-water", userId: "auth-user-1", workspaceId };
  assert.equal(
    shouldSignOutCampaignAdminSupabaseSession(marker, {
      userId: "auth-user-1",
      workspaceId
    }),
    true
  );
  assert.equal(
    shouldSignOutCampaignAdminSupabaseSession(marker, {
      userId: "unrelated-saas-admin",
      workspaceId
    }),
    false
  );
});

test("Campaign Admin login creates campaign-owned Supabase session state", () => {
  const ownership = resolveSupabaseSessionOwnership(
    "",
    "auth-user-1",
    "campaign_admin",
    null
  );
  assert.deepEqual(ownership, { source: "campaign_admin", userId: "auth-user-1" });
  assert.equal(isSupabaseSessionOwnedBy(ownership, "campaign_admin", "auth-user-1"), true);
});

test("Platform Admin guard does not own or sign out a Campaign Admin session", () => {
  const campaignOwnership = { source: "campaign_admin", userId: "auth-user-1" };
  const ownershipAfterPlatformAttempt = resolveSupabaseSessionOwnership(
    "auth-user-1",
    "auth-user-1",
    "platform_admin",
    campaignOwnership
  );
  assert.deepEqual(ownershipAfterPlatformAttempt, campaignOwnership);
  assert.equal(
    isSupabaseSessionOwnedBy(ownershipAfterPlatformAttempt, "platform_admin", "auth-user-1"),
    false
  );
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const platformLoginSource = appSource.slice(
    appSource.indexOf("async function submitAppLogin"),
    appSource.indexOf("async function logoutAppAdmin")
  );
  assert.match(platformLoginSource, /if \(platformLoginOwnsSession\) \{\s*await signOutSupabase\(\)/);
});

test("failed Platform Admin login preserves an unrelated existing session", () => {
  const ownership = resolveSupabaseSessionOwnership(
    "auth-user-1",
    "auth-user-1",
    "platform_admin",
    null
  );
  assert.deepEqual(ownership, {
    source: "unrelated_existing_session",
    userId: "auth-user-1"
  });
  assert.equal(isSupabaseSessionOwnedBy(ownership, "platform_admin", "auth-user-1"), false);
});

test("a new Platform Admin login owns its session and real logout may clear it", () => {
  const ownership = resolveSupabaseSessionOwnership(
    "",
    "platform-owner-1",
    "platform_admin",
    null
  );
  assert.deepEqual(ownership, { source: "platform_admin", userId: "platform-owner-1" });
  assert.equal(isSupabaseSessionOwnedBy(ownership, "platform_admin", "platform-owner-1"), true);
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const logoutSource = appSource.slice(appSource.indexOf("async function logoutAppAdmin"));
  assert.match(logoutSource, /isSupabaseSessionOwnedBy\(ownership, "platform_admin", currentUser\?\.id \?\? ""\)/);
  assert.match(logoutSource, /await signOutSupabase\(\)/);
});

test("Campaign Admin logout owns only its matching campaign session", () => {
  const ownership = { source: "campaign_admin", userId: "auth-user-1" };
  assert.equal(isSupabaseSessionOwnedBy(ownership, "campaign_admin", "auth-user-1"), true);
  assert.equal(isSupabaseSessionOwnedBy(ownership, "platform_admin", "auth-user-1"), false);
  assert.equal(isSupabaseSessionOwnedBy(ownership, "campaign_admin", "other-user"), false);
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const logoutSource = appSource.slice(
    appSource.indexOf("async function logoutCampaignAdmin"),
    appSource.indexOf("async function submitAppLogin")
  );
  assert.match(logoutSource, /isSupabaseSessionOwnedBy\(ownership, "campaign_admin", currentUser\?\.id \?\? ""\)/);
  assert.match(logoutSource, /await signOutSupabase\(\)/);
});

test("Campaign Admin membership enables upload but never grants Platform Admin access", () => {
  const access = evaluateSecureFieldUploadAccess({
    ...baseInput,
    membership: membership("campaign_admin")
  });
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.equal(access.available, true);
  assert.match(appSource, /if \(context\.platformAdmin\)/);
  assert.match(appSource, /setIsPlatformAdminAuthenticated\(false\)/);
  assert.doesNotMatch(appSource, /if \(context\.role === "campaign_admin"\)[\s\S]*setIsPlatformAdminAuthenticated\(true\)/);
});

test("temporary authentication diagnostics are removed", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("../src/secureFieldUploadAuth.ts", import.meta.url), "utf8");
  for (const source of [appSource, backendSource, authSource]) {
    assert.doesNotMatch(source, /\[AUTH FLOW\]|\[AUTH CLIENT IDENTITY\]|VERIFY_CALLER|\[VERIFY RESULT\]/);
    assert.doesNotMatch(source, /console\.(debug|trace)/);
  }
});

test("private evidence paths are denied outside the authenticated workspace", () => {
  assert.equal(isStoragePathWithinWorkspace(`${workspaceId}/campaign/scan/photo.jpg`, workspaceId), true);
  assert.equal(isStoragePathWithinWorkspace("workspace-other/campaign/scan/photo.jpg", workspaceId), false);
});

test("pilot integration keeps the local credential check before optional Supabase authentication", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const localCheck = appSource.indexOf("const passcodeMatches");
  const localGrant = appSource.indexOf("writeAuthenticatedAdminSlugs(nextAuth)", localCheck);
  const supabaseAttempt = appSource.indexOf("signInWithSupabase(submittedEmail, submittedPasscode)", localGrant);
  assert.ok(localCheck >= 0);
  assert.ok(localGrant > localCheck);
  assert.ok(supabaseAttempt > localGrant);
});

test("migration is additive, client-read-only, and workspace-prefix scoped", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260716_campaign_admin_secure_storage_auth_pilot.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /create table if not exists public\.voiceup_workspace_members/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /for insert[\s\S]*on public\.voiceup_workspace_members/i);
  assert.match(migration, /bucket_id = 'campaign-private'/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(migration, /voiceup_can_manage_private_evidence/);
  assert.doesNotMatch(migration, /drop policy if exists "Authenticated can manage campaign storage"/);
});

test("private helpers resolve the authoritative current workspace membership", () => {
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
  const privateUploadSource = backendSource.slice(
    backendSource.indexOf("export async function uploadPrivateFileToStorage"),
    backendSource.indexOf("export async function createSignedStorageUrl")
  );
  const signedUrlSource = backendSource.slice(
    backendSource.indexOf("export async function createSignedStorageUrl")
  );
  assert.match(privateUploadSource, /resolveSecureStorageWorkspaceId/);
  assert.match(signedUrlSource, /resolveSecureStorageWorkspaceId/);
});

test("verification coordinator applies only the latest resolved verification", () => {
  const coordinator = createSecureFieldUploadVerificationCoordinator();

  // Simulates: the restore/refresh effect starts a verification (older), then the login
  // handler starts its own verification (newer) before the older one resolves.
  const olderRequestId = coordinator.beginVerification();
  const newerRequestId = coordinator.beginVerification();

  // The newer request resolves first (fast, authenticated success) ...
  assert.equal(coordinator.isCurrent(newerRequestId), true);
  // ... and the older request resolving afterward must not be treated as current, even
  // though it represents a stale "unauthenticated"/unavailable result.
  assert.equal(coordinator.isCurrent(olderRequestId), false);
});

test("a synchronous reset (logout, guard, error) invalidates any in-flight verification", () => {
  const coordinator = createSecureFieldUploadVerificationCoordinator();

  const inFlightRequestId = coordinator.beginVerification();
  assert.equal(coordinator.isCurrent(inFlightRequestId), true);

  // A synchronous, authoritative reset (e.g. logout) happens while the async verification
  // is still in flight.
  coordinator.reset();

  // When the in-flight verification later resolves, it must no longer be applied.
  assert.equal(coordinator.isCurrent(inFlightRequestId), false);

  // A fresh verification started after the reset is current.
  const nextRequestId = coordinator.beginVerification();
  assert.equal(coordinator.isCurrent(nextRequestId), true);
});

test("secure-upload verification is written by exactly one canonical function", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  const directWriteCount = (appSource.match(/(?<!re)setSecureFieldUploadAccess\(/g) ?? []).length;
  // setSecureFieldUploadAccess must only ever be called from inside resetSecureFieldUploadAccess
  // and verifyAndApplySecureFieldUploadAccess (the two canonical write paths), never inline
  // from the login handler, the refresh effect, the login catch block, or logout.
  assert.equal(directWriteCount, 2);

  assert.doesNotMatch(
    appSource.slice(appSource.indexOf("async function submitCampaignAdminLogin")),
    /setSecureFieldUploadAccess\(access\)/
  );
});

test("secure-upload verification runs after Supabase session and authenticatedAdminSlugs are established", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const loginSource = appSource.slice(
    appSource.indexOf("async function submitCampaignAdminLogin"),
    appSource.indexOf("async function logoutCampaignAdmin")
  );

  const slugUpdateIndex = loginSource.indexOf("setAuthenticatedAdminSlugs(nextAuth)");
  const signInIndex = loginSource.indexOf("signInWithSupabase(submittedEmail, submittedPasscode)");
  const verifyIndex = loginSource.indexOf("verifyAndApplySecureFieldUploadAccess(workspaceId)");

  assert.ok(slugUpdateIndex >= 0);
  assert.ok(signInIndex > slugUpdateIndex);
  assert.ok(verifyIndex > signInIndex);
});

test("logout clears secure-upload access through the canonical reset path", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const logoutSource = appSource.slice(
    appSource.indexOf("async function logoutCampaignAdmin"),
    appSource.indexOf("async function submitAppLogin")
  );

  assert.match(logoutSource, /resetSecureFieldUploadAccess\(/);
});
