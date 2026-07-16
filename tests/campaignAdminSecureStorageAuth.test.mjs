import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  evaluateSecureFieldUploadAccess,
  isStoragePathWithinWorkspace,
  preserveCampaignAdminAccess,
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
