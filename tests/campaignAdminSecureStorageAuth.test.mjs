import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
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
