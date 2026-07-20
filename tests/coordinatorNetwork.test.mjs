import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCoordinatorTree,
  coordinatorMatchesSearch,
  getCoordinatorDashboardMetrics
} from "../src/coordinators/network.ts";
import {
  geographyForRole,
  validateCoordinatorDraft
} from "../src/coordinators/validation.ts";

const migrationSource = readFileSync(
  new URL("../supabase/migrations/20260720020000_coordinator_network_v1.sql", import.meta.url),
  "utf8"
);
const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const otpSource = readFileSync(new URL("../supabase/functions/voiceup-otp/index.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../src/pages/app/CoordinatorNetworkTab.tsx", import.meta.url), "utf8");

function coordinator(id, overrides = {}) {
  return {
    id,
    workspaceId: "workspace-1",
    fullName: `Coordinator ${id}`,
    phone: "+919876543210",
    role: "field_coordinator",
    status: "active",
    geographyId: "geo-1",
    referralCode: `VC-${id}`,
    mobileVerifiedAt: "2026-07-20T00:00:00.000Z",
    notes: "",
    version: 1,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides
  };
}

function draft(overrides = {}) {
  return {
    id: "coordinator-1",
    fullName: "Asha Das",
    phone: "+91 98765 43210",
    email: "asha@example.org",
    photoPath: "",
    role: "district_coordinator",
    status: "active",
    reportsToCoordinatorId: "",
    referredByCode: "",
    notes: "",
    version: 0,
    geography: {
      country: "India",
      state: "Odisha",
      district: "Khordha",
      block: "Bhubaneswar",
      panchayat: "Ward 1",
      ward: "Ward 1",
      postalCode: "751001"
    },
    campaignIds: [],
    ...overrides
  };
}

test("coordinator validation reuses verified identity rules and enforces role geography", () => {
  assert.deepEqual(validateCoordinatorDraft(draft()).errors, {});
  assert.equal(validateCoordinatorDraft(draft({ phone: "123" })).errors.phone,
    "Enter a valid 10-digit Indian mobile number.");
  assert.equal(validateCoordinatorDraft(draft({ email: "invalid" })).errors.email,
    "Enter a valid email address.");
  assert.equal(validateCoordinatorDraft(draft({ geography: { ...draft().geography, district: "" } })).errors.geography,
    "Choose geography that matches the coordinator role.");
});

test("role geography strips lower levels instead of persisting an invalid scope", () => {
  const stateScope = geographyForRole(draft().geography, "state_coordinator");
  assert.equal(stateScope.state, "Odisha");
  assert.equal(stateScope.district, "");
  assert.equal(stateScope.block, "");
  assert.equal(stateScope.panchayat, "");
  assert.equal(stateScope.ward, "");
  const wardScope = geographyForRole(draft().geography, "ward_coordinator");
  assert.equal(wardScope.panchayat, "Ward 1");
  assert.equal(wardScope.ward, "Ward 1");
});

test("reporting tree preserves parent-child hierarchy and deterministic ordering", () => {
  const roots = buildCoordinatorTree([
    coordinator("district", { fullName: "District", role: "district_coordinator", reportsToCoordinatorId: "national" }),
    coordinator("national", { fullName: "National", role: "national_coordinator" }),
    coordinator("state", { fullName: "State", role: "state_coordinator", reportsToCoordinatorId: "national" })
  ]);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].coordinator.id, "national");
  assert.deepEqual(roots[0].children.map((node) => node.coordinator.id), ["district", "state"]);
});

test("search and dashboard metrics operate on persisted network rows", () => {
  const rows = [
    coordinator("one", { fullName: "Asha Das", email: "asha@example.org" }),
    coordinator("two", { fullName: "Bimal Roy", status: "inactive", mobileVerifiedAt: undefined, geographyId: "geo-2" })
  ];
  assert.equal(coordinatorMatchesSearch(rows[0], "Khordha, Odisha", "khordha"), true);
  assert.equal(coordinatorMatchesSearch(rows[1], "Cuttack, Odisha", "asha"), false);
  assert.deepEqual(getCoordinatorDashboardMetrics(
    rows,
    [{ coordinatorId: "one", campaignId: "campaign-1", assignedAt: "2026-07-20T00:00:00.000Z" }],
    [{ id: "ref-1", inviterCoordinatorId: "one", referredCoordinatorId: "two", referralCode: "VC-one", status: "accepted" }]
  ), {
    total: 2,
    active: 1,
    mobileVerified: 1,
    linkedToCampaign: 1,
    geographyCoverage: 2,
    referralLinks: 1
  });
});

test("migration creates the complete network model, indexes, read RLS, and RPC-only writes", () => {
  for (const table of [
    "voiceup_coordinator_geographies",
    "voiceup_coordinators",
    "voiceup_coordinator_campaigns",
    "voiceup_coordinator_referrals",
    "voiceup_coordinator_audit"
  ]) {
    assert.match(migrationSource, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migrationSource, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migrationSource, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.match(migrationSource, /create index if not exists voiceup_coordinators_search_idx/);
  assert.match(migrationSource, /member\.role in \('platform_owner', 'workspace_admin', 'campaign_admin'\)/);
  assert.doesNotMatch(migrationSource, /for (insert|update|delete) to authenticated/i);
  assert.match(migrationSource, /create or replace function public\.upsert_voiceup_coordinator/);
  assert.match(migrationSource, /create or replace function public\.get_voiceup_coordinator_network/);
  assert.match(migrationSource, /Coordinator changed since it was opened/);
  assert.match(migrationSource, /Reporting hierarchy cannot contain a cycle/);
  assert.match(migrationSource, /Linked campaign does not belong to this workspace/);
});

test("mobile verification is authenticated, purpose-bound, expiring, and single-use", () => {
  assert.match(migrationSource, /'coordinator-mobile'/);
  assert.match(migrationSource, /challenge\.expires_at > now\(\)/);
  assert.match(migrationSource, /verificationTokenHash/);
  assert.match(migrationSource, /coordinatorConsumedAt/);
  assert.match(otpSource, /if \(purpose === "coordinator-mobile"\)/);
  assert.match(otpSource, /const caller = await getUser\(req\)/);
  assert.match(otpSource, /\.eq\("active", true\)/);
  assert.match(otpSource, /"platform_owner", "workspace_admin", "campaign_admin"/);
});

test("backend adapters use workspace RPCs, private photos, and the existing OTP function", () => {
  assert.match(backendSource, /rpc\("get_voiceup_coordinator_network"/);
  assert.match(backendSource, /rpc\("upsert_voiceup_coordinator"/);
  assert.match(backendSource, /rpc\("set_voiceup_coordinator_status"/);
  assert.match(backendSource, /rpc\("delete_voiceup_coordinator"/);
  assert.match(backendSource, /purpose: "coordinator-mobile"/);
  assert.match(backendSource, /uploadPrivateFileToStorage\(\s*"campaign-private"/);
  assert.match(backendSource, /`coordinators\/\$\{coordinatorId\}\/profile-/);
});

test("React feature provides real CRUD, filters, hierarchy, profile, campaign, referral, photo, and activity views", () => {
  for (const evidence of [
    /loadCoordinatorNetwork\(/,
    /saveCoordinator\(/,
    /changeCoordinatorStatus\(/,
    /removeCoordinator\(/,
    /Search and filters/,
    /Reporting hierarchy/,
    /Coordinator profile/,
    /Linked campaigns/,
    /Referred by code/,
    /Profile photo/,
    /Coordinator activity log/
  ]) assert.match(uiSource, evidence);
  assert.doesNotMatch(uiSource, /TODO|mock coordinator|placeholder screen/i);
});
