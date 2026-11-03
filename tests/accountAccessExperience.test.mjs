import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AccountAccessError,
  consumeUnifiedLoginHandoff,
  getAuthorizedDestinations,
  loadOwnedSupporterDashboard,
  loadVoiceupAccessManifest,
  resolveAutomaticDestination,
  writeUnifiedLoginHandoff
} from "../src/accountAccess.ts";
import {
  getIsVoiceupAccountRoute,
  getIsVoiceupLoginRoute,
  getSupporterAccountDashboardId
} from "../src/utils/routing.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20261029010000_account_access_manifest_and_supporter_dashboard.sql", import.meta.url),
  "utf8"
);

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    user: { id: "user-1", email: "owner@example.com" },
    platformAdmin: false,
    supporterOwnerships: [],
    volunteerAssignments: [],
    coordinatorBindings: [],
    workspaceMemberships: [],
    hasAuthorizedAccess: true,
    ...overrides
  };
}

function rpcClient(data, error = null) {
  const calls = [];
  return {
    calls,
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { data, error };
    }
  };
}

test("access manifest is derived only from auth.uid and accepts no caller scope", () => {
  assert.match(migration, /create or replace function public\.voiceup_get_access_manifest\(\)/u);
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/u);
  assert.doesNotMatch(migration, /voiceup_get_access_manifest\s*\([^)]*p_(?:workspace|campaign|role|email)/u);
  assert.match(migration, /account\.auth_user_id = v_actor_id/u);
  assert.match(migration, /member\.user_id = v_actor_id[\s\S]*member\.active/u);
  assert.match(migration, /assignment\.user_id = v_actor_id[\s\S]*assignment\.active/u);
});

test("manifest returns approved volunteers but never pending requests", () => {
  assert.match(migration, /request\.status in \('approved', 'assigned'\)/u);
  const volunteerQuery = migration.slice(
    migration.indexOf("A pending request is never a role"),
    migration.indexOf("Coordinator identity binding")
  );
  assert.doesNotMatch(volunteerQuery, /request\.status in \([^)]*pending/u);
  assert.match(volunteerQuery, /join public\.voiceup_supporter_accounts account[\s\S]*account\.auth_user_id = v_actor_id/u);
});

test("coordinator bindings never create workspace privilege", () => {
  assert.match(migration, /Coordinator identity binding remains deliberately separate from authorization/u);
  assert.match(migration, /'canOpenBusinessOs', member\.id is not null/u);
  assert.match(migration, /left join public\.voiceup_workspace_members member[\s\S]*member\.user_id = v_actor_id[\s\S]*member\.active/u);
  assert.doesNotMatch(migration, /insert into public\.voiceup_workspace_members/u);
  assert.doesNotMatch(migration, /update public\.voiceup_workspace_members/u);
});

test("supporter dashboard enforces owner mapping before reading canonical profile", () => {
  const dashboardFunction = migration.slice(
    migration.indexOf("create or replace function public.voiceup_read_owned_supporter_dashboard"),
    migration.indexOf("revoke all on function public.voiceup_get_access_manifest")
  );
  assert.match(dashboardFunction, /account\.id = p_account_id[\s\S]*account\.auth_user_id = v_actor_id/u);
  assert.match(dashboardFunction, /voiceup:supporter_dashboard_not_authorized/u);
  assert.doesNotMatch(dashboardFunction, /p_(?:workspace_id|campaign_id|supporter_id|auth_user_id)/u);
  assert.match(migration, /grant execute on function public\.voiceup_read_owned_supporter_dashboard\(uuid\)[\s\S]*to authenticated/u);
  assert.match(migration, /revoke all on function public\.voiceup_read_owned_supporter_dashboard\(uuid\)[\s\S]*from public, anon, service_role/u);
});

test("client loads every authoritative role class and routes a single supporter directly", async () => {
  const data = manifest({
    supporterOwnerships: [{
      accountId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "ws-1",
      workspaceName: "Workspace One",
      campaignId: "campaign-1",
      campaignSlug: "save-river",
      campaignTitle: "Save River",
      supporterId: "supporter-1",
      supporterName: "Owner",
      referralCode: "VU-ABC123",
      claimedAt: "2026-10-29T00:00:00.000Z"
    }]
  });
  const client = rpcClient(data);
  const resolved = await loadVoiceupAccessManifest(client);
  assert.deepEqual(client.calls, [{ name: "voiceup_get_access_manifest", parameters: undefined }]);
  assert.equal(resolveAutomaticDestination(resolved)?.path, "/account/supporter/11111111-1111-4111-8111-111111111111");
});

test("multi-role users receive a switcher while single workspace admins route directly", async () => {
  const multi = manifest({
    platformAdmin: true,
    supporterOwnerships: [{
      accountId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "ws-1",
      workspaceName: "Workspace One",
      campaignId: "campaign-1",
      campaignSlug: "save-river",
      campaignTitle: "Save River",
      supporterId: "supporter-1",
      supporterName: "Owner",
      referralCode: "VU-ABC123",
      claimedAt: "2026-10-29T00:00:00.000Z"
    }]
  });
  assert.equal(resolveAutomaticDestination(multi), null);
  assert.equal(getAuthorizedDestinations(multi).length, 2);

  const workspace = manifest({
    workspaceMemberships: [{
      workspaceId: "ws-2",
      workspaceName: "Workspace Two",
      role: "workspace_admin",
      permissions: ["workspace_admin"],
      campaignAssignments: []
    }]
  });
  assert.deepEqual(resolveAutomaticDestination(workspace), {
    id: "workspace:ws-2",
    kind: "workspace",
    path: "/app",
    workspaceId: "ws-2",
    title: "Workspace Two",
    detail: "workspace admin"
  });
});

test("campaign admin destinations require active server-returned resource assignment", () => {
  const withoutAssignment = manifest({
    workspaceMemberships: [{
      workspaceId: "ws-1", workspaceName: "One", role: "campaign_admin",
      permissions: ["campaign_admin"], campaignAssignments: []
    }]
  });
  assert.equal(getAuthorizedDestinations(withoutAssignment).length, 0);

  const withAssignment = manifest({
    workspaceMemberships: [{
      workspaceId: "ws-1", workspaceName: "One", role: "campaign_admin",
      permissions: ["campaign_admin"],
      campaignAssignments: [{
        assignmentId: "assignment-1", applicationKey: "voiceup", role: "campaign_admin",
        resourceType: "campaign", resourceId: "campaign-1", resourceSlug: "save-river"
      }]
    }]
  });
  assert.equal(resolveAutomaticDestination(withAssignment)?.path, "/admin/save-river");
});

test("coordinator identity without workspace membership is visible but never elevated", () => {
  const value = manifest({
    coordinatorBindings: [{
      coordinatorId: "coord-1", workspaceId: "ws-1", fullName: "Coordinator",
      role: "district_coordinator", status: "active", geography: null,
      campaignIds: ["campaign-1"], workspaceRole: "", canOpenBusinessOs: false
    }]
  });
  const [destination] = getAuthorizedDestinations(value);
  assert.equal(destination.kind, "coordinator");
  assert.equal(destination.path, "/account");
  assert.match(destination.detail, /no workspace privilege/u);
});

test("no-role accounts receive no destination", () => {
  const value = manifest({ hasAuthorizedAccess: false });
  assert.deepEqual(getAuthorizedDestinations(value), []);
  assert.equal(resolveAutomaticDestination(value), null);
});

test("expired and unauthenticated sessions fail closed", async () => {
  const client = rpcClient(null, { message: "voiceup:authentication_required" });
  await assert.rejects(
    loadVoiceupAccessManifest(client),
    (error) => error instanceof AccountAccessError && error.code === "authentication_required"
  );
});

test("owner dashboard RPC receives only the opaque account id and rejects malformed routes", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const data = {
    schemaVersion: 1,
    account: { accountId, workspaceId: "ws-1", campaignId: "campaign-1", supporterId: "supporter-1", claimedAt: "now" },
    workspace: { name: "One" },
    campaign: { id: "campaign-1", slug: "save-river", title: "Save River", status: "Published" },
    supporter: { id: "supporter-1", name: "Owner", email: "owner@example.com", phone: "9999999999", status: "verified", signedAt: "now", languagePreference: "en", referralCode: "VU-ABC123", location: {} },
    participationRequests: [], referralPath: "/r/VU-ABC123", campaignPath: "/c/save-river"
  };
  const client = rpcClient(data);
  const dashboard = await loadOwnedSupporterDashboard(accountId, client);
  assert.equal(dashboard.supporter.referralCode, "VU-ABC123");
  assert.deepEqual(client.calls, [{
    name: "voiceup_read_owned_supporter_dashboard",
    parameters: { p_account_id: accountId }
  }]);

  const unused = rpcClient(data);
  await assert.rejects(
    loadOwnedSupporterDashboard("../../admin", unused),
    (error) => error instanceof AccountAccessError && error.code === "supporter_dashboard_not_authorized"
  );
  assert.equal(unused.calls.length, 0);
});

test("campaign handoff is short-lived, exact-context, token-free, and single-use", () => {
  const storage = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    }
  };
  const value = manifest({
    workspaceMemberships: [{
      workspaceId: "ws-1", workspaceName: "One", role: "campaign_admin", permissions: ["campaign_admin"],
      campaignAssignments: [{ assignmentId: "a-1", applicationKey: "voiceup", role: "campaign_admin", resourceType: "campaign", resourceId: "campaign-1", resourceSlug: "save-river" }]
    }]
  });
  const destination = resolveAutomaticDestination(value);
  writeUnifiedLoginHandoff(value, destination);
  const stored = [...storage.values()][0];
  assert.doesNotMatch(stored, /access_token|refresh_token|claim|password/iu);
  assert.equal(consumeUnifiedLoginHandoff({ userId: "user-1", workspaceId: "ws-1", resourceId: "campaign-1", resourceSlug: "save-river" }), true);
  assert.equal(storage.size, 0);
  assert.equal(consumeUnifiedLoginHandoff({ userId: "user-1", workspaceId: "ws-1", resourceId: "campaign-1", resourceSlug: "save-river" }), false);
  delete globalThis.window;
});

test("login and account routes are exact and do not trust role URL parameters", () => {
  globalThis.window = { location: { pathname: "/login" } };
  assert.equal(getIsVoiceupLoginRoute(), true);
  globalThis.window.location.pathname = "/account";
  assert.equal(getIsVoiceupAccountRoute(), true);
  globalThis.window.location.pathname = "/account/supporter/11111111-1111-4111-8111-111111111111";
  assert.equal(getSupporterAccountDashboardId(), "11111111-1111-4111-8111-111111111111");
  globalThis.window.location.pathname = "/account/supporter/not-a-uuid?role=platform_owner";
  assert.equal(getIsVoiceupAccountRoute(), false);
  delete globalThis.window;
});

test("claim UI keeps signing and account email separate and redirects only after confirmed link", () => {
  const source = readFileSync(new URL("../src/components/SupporterAccountClaimPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setEmail\(currentIdentity\.email\)/u);
  assert.match(source, /normalizedEmail\(currentIdentity\.email\) !== signingEmail/u);
  assert.match(source, /copy\.signingEmail/u);
  assert.match(source, /copy\.accountEmail/u);
  assert.match(source, /finishLink\(await claimSupporterAccount\(grant\), true\)/u);
  assert.match(source, /window\.location\.assign\(`\/account\/supporter\//u);
  assert.doesNotMatch(source, /claim.*(?:localStorage|sessionStorage|URLSearchParams)/isu);
});
