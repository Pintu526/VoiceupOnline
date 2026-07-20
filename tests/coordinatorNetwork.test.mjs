import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCoordinatorTree,
  coordinatorMatchesSearch,
  getCoordinatorCommandCenter,
  getCoordinatorDashboardMetrics,
  getCoordinatorLifecycle,
  getCoordinatorProfileWorkspace
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
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const englishLocale = JSON.parse(readFileSync(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
const hindiLocale = JSON.parse(readFileSync(new URL("../src/i18n/locales/hi.json", import.meta.url), "utf8"));
const odiaLocale = JSON.parse(readFileSync(new URL("../src/i18n/locales/or.json", import.meta.url), "utf8"));

function translationPaths(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? translationPaths(child, path) : [path];
  });
}

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

test("command center reconciles distributions, hierarchy coverage, and recency from one snapshot", () => {
  const snapshot = {
    workspaceId: "workspace-1",
    canManage: true,
    coordinators: [
      coordinator("one", {
        fullName: "Asha Das",
        role: "district_coordinator",
        geographyId: "district-khordha",
        createdAt: "2026-07-18T09:00:00.000Z"
      }),
      coordinator("two", {
        fullName: "Bimal Roy",
        role: "state_coordinator",
        status: "inactive",
        geographyId: "state-odisha",
        createdAt: "2026-07-20T09:00:00.000Z"
      })
    ],
    geographies: [
      { id: "country-india", workspaceId: "workspace-1", level: "country", name: "India", path: ["India"], depth: 0 },
      { id: "state-odisha", workspaceId: "workspace-1", parentId: "country-india", level: "state", name: "Odisha", path: ["India", "Odisha"], depth: 1 },
      { id: "district-khordha", workspaceId: "workspace-1", parentId: "state-odisha", level: "district", name: "Khordha", path: ["India", "Odisha", "Khordha"], depth: 2 },
      { id: "district-cuttack", workspaceId: "workspace-1", parentId: "state-odisha", level: "district", name: "Cuttack", path: ["India", "Odisha", "Cuttack"], depth: 2 }
    ],
    campaignLinks: [{ coordinatorId: "one", campaignId: "campaign-1", assignedAt: "2026-07-18T00:00:00.000Z" }],
    referrals: [],
    activity: [
      { id: 1, coordinatorId: "one", action: "coordinator.created", metadata: {}, createdAt: "2026-07-18T09:00:00.000Z" },
      { id: 2, coordinatorId: "two", action: "coordinator.status_changed", metadata: { from: "active", to: "inactive" }, createdAt: "2026-07-20T10:00:00.000Z" }
    ]
  };

  const commandCenter = getCoordinatorCommandCenter(snapshot);
  assert.equal(commandCenter.metrics.total, 2);
  assert.deepEqual(commandCenter.statusDistribution.map(({ status, count, percentage }) => ({ status, count, percentage })), [
    { status: "invited", count: 0, percentage: 0 },
    { status: "active", count: 1, percentage: 50 },
    { status: "inactive", count: 1, percentage: 50 },
    { status: "suspended", count: 0, percentage: 0 }
  ]);
  assert.deepEqual(commandCenter.coverage.byLevel.map(({ level, known, covered }) => ({ level, known, covered })), [
    { level: "country", known: 1, covered: 1 },
    { level: "state", known: 1, covered: 1 },
    { level: "district", known: 2, covered: 1 }
  ]);
  assert.deepEqual(commandCenter.coverage.gaps.map((geography) => geography.id), ["district-cuttack"]);
  assert.equal(commandCenter.recentlyAdded[0].id, "two");
  assert.equal(commandCenter.recentActivity[0].id, 2);
  assert.deepEqual(commandCenter.recentStatusChanges.map((activity) => activity.id), [2]);
});

test("Coordinator 360 profile derives hierarchy, coverage, assignments, activity, and scorecard from one snapshot", () => {
  const snapshot = {
    workspaceId: "workspace-1",
    canManage: true,
    coordinators: [
      coordinator("manager", { fullName: "Mira Manager", role: "state_coordinator", geographyId: "state-odisha" }),
      coordinator("profile", { fullName: "Asha Das", role: "district_coordinator", geographyId: "district-khordha", reportsToCoordinatorId: "manager" }),
      coordinator("report", { fullName: "Bimal Roy", role: "block_coordinator", geographyId: "district-khordha", reportsToCoordinatorId: "profile" })
    ],
    geographies: [
      { id: "country-india", workspaceId: "workspace-1", level: "country", name: "India", path: ["India"], depth: 0 },
      { id: "state-odisha", workspaceId: "workspace-1", parentId: "country-india", level: "state", name: "Odisha", path: ["India", "Odisha"], depth: 1 },
      { id: "district-khordha", workspaceId: "workspace-1", parentId: "state-odisha", level: "district", name: "Khordha", path: ["India", "Odisha", "Khordha"], depth: 2 }
    ],
    campaignLinks: [
      { coordinatorId: "profile", campaignId: "campaign-1", assignedAt: "2026-07-20T08:00:00.000Z" }
    ],
    referrals: [],
    activity: [
      { id: 9, coordinatorId: "profile", action: "coordinator.status_changed", metadata: { from: "invited", to: "active" }, createdAt: "2026-07-20T09:00:00.000Z" },
      { id: 8, coordinatorId: "manager", action: "coordinator.updated", metadata: {}, createdAt: "2026-07-20T10:00:00.000Z" }
    ]
  };

  const profile = getCoordinatorProfileWorkspace(snapshot, "profile");
  assert.equal(profile.coordinator.fullName, "Asha Das");
  assert.equal(profile.manager.id, "manager");
  assert.deepEqual(profile.reportingChain.map((item) => item.id), ["manager"]);
  assert.deepEqual(profile.directReports.map((item) => item.id), ["report"]);
  assert.deepEqual(profile.geographyChain.map((item) => item.name), ["India", "Odisha", "Khordha"]);
  assert.deepEqual(profile.timeline.map((item) => item.kind), ["audit", "assignment"]);
  assert.equal(profile.lastActivityAt, "2026-07-20T09:00:00.000Z");
  assert.deepEqual(profile.scorecard, {
    assignments: 1,
    activityEvents: 1,
    coverageLevels: 3,
    directReports: 1,
    mobileVerified: true
  });
  assert.equal(getCoordinatorProfileWorkspace(snapshot, "missing"), null);
});

test("Coordinator lifecycle exposes only valid transitions and derives milestones from persisted facts", () => {
  const baseSnapshot = {
    workspaceId: "workspace-1",
    canManage: true,
    coordinators: [],
    geographies: [],
    campaignLinks: [],
    referrals: [],
    activity: []
  };
  const invited = coordinator("invited", { status: "invited", mobileVerifiedAt: undefined });
  const verified = coordinator("verified", { status: "invited" });
  const active = coordinator("active", { status: "active" });
  const suspended = coordinator("suspended", { status: "suspended" });

  assert.deepEqual(getCoordinatorLifecycle({ ...baseSnapshot, coordinators: [invited] }, invited.id).actions, ["verify_mobile", "archive"]);
  assert.equal(getCoordinatorLifecycle({ ...baseSnapshot, coordinators: [invited] }, invited.id).currentStage, "invite_ready");
  assert.deepEqual(getCoordinatorLifecycle({ ...baseSnapshot, coordinators: [verified] }, verified.id).actions, ["activate", "archive"]);
  assert.equal(getCoordinatorLifecycle({ ...baseSnapshot, coordinators: [verified] }, verified.id).currentStage, "mobile_verified");
  assert.deepEqual(getCoordinatorLifecycle({ ...baseSnapshot, coordinators: [active] }, active.id).actions, ["transfer", "suspend", "archive"]);
  assert.deepEqual(getCoordinatorLifecycle({ ...baseSnapshot, coordinators: [suspended] }, suspended.id).actions, ["reactivate", "archive"]);
  assert.deepEqual(getCoordinatorLifecycle({ ...baseSnapshot, canManage: false, coordinators: [active] }, active.id).actions, []);

  const reactivated = getCoordinatorLifecycle({
    ...baseSnapshot,
    coordinators: [active],
    activity: [
      { id: 1, coordinatorId: active.id, action: "coordinator.status_changed", metadata: { from: "active", to: "suspended" }, createdAt: "2026-07-20T08:00:00.000Z" },
      { id: 2, coordinatorId: active.id, action: "coordinator.status_changed", metadata: { from: "suspended", to: "active" }, createdAt: "2026-07-20T09:00:00.000Z" }
    ]
  }, active.id);
  assert.equal(reactivated.currentStage, "reactivated");
  assert.equal(reactivated.previousStage, "suspended");
  assert.equal(reactivated.dates.reactivated, "2026-07-20T09:00:00.000Z");
  assert.equal(reactivated.milestones.find((item) => item.stage === "transferred").completed, false);
  assert.equal(getCoordinatorLifecycle(baseSnapshot, "missing"), null);
});

test("command center lifecycle counts current states and only real archived audit events", () => {
  const snapshot = {
    workspaceId: "workspace-1",
    canManage: true,
    coordinators: [
      coordinator("active", { status: "active" }),
      coordinator("pending", { status: "invited", mobileVerifiedAt: undefined }),
      coordinator("suspended", { status: "suspended" })
    ],
    geographies: [],
    campaignLinks: [],
    referrals: [],
    activity: [
      { id: 1, coordinatorId: "archived-1", action: "coordinator.deleted", metadata: {}, createdAt: "2026-07-20T08:00:00.000Z" },
      { id: 2, coordinatorId: "archived-1", action: "coordinator.deleted", metadata: {}, createdAt: "2026-07-20T09:00:00.000Z" },
      { id: 3, coordinatorId: "active", action: "coordinator.updated", metadata: {}, createdAt: "2026-07-20T10:00:00.000Z" }
    ]
  };
  assert.deepEqual(getCoordinatorCommandCenter(snapshot).lifecycle, {
    active: 1,
    suspended: 1,
    verified: 2,
    pending: 1,
    archived: 1
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
    /coordinatorProfile/,
    /Linked campaigns/,
    /Referred by code/,
    /Profile photo/,
    /Coordinator activity log/
  ]) assert.match(uiSource, evidence);
  assert.doesNotMatch(uiSource, /TODO|mock coordinator|placeholder screen/i);
});

test("Phase 1 keeps Coordinator Network mobile-first, accessible, and behavior-neutral", () => {
  for (const evidence of [
    /coordinator-loading-shell/,
    /coordinator-form-actions/,
    /coordinator-fab/,
    /coordinator-search-control/,
    /coordinator-directory-view/,
    /coordinator-state-icon/,
    /role="tablist"/,
    /role="tabpanel"/,
    /aria-selected=\{view === item \|\| \(view === "profile" && item === "directory"\)\}/,
    /tabIndex=\{view === item \|\| \(view === "profile" && item === "directory"\) \? 0 : -1\}/,
    /handleViewKeyDown\(event, item\)/,
    /aria-busy=\{loading\}/,
    /aria-label="Coordinator reporting hierarchy"/,
    /aria-invalid=\{Boolean\(formErrors\.phone\)\}/
  ]) assert.match(uiSource, evidence);

  for (const evidence of [
    /\.coordinator-view-tabs button[\s\S]*?min-height: 44px/,
    /\.coordinator-form-actions[\s\S]*?position: sticky/,
    /\.coordinator-fab[\s\S]*?position: fixed/,
    /@media \(max-width: 700px\)/,
    /@media \(max-width: 390px\)/,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.coordinator-view-panel/,
    /\.coordinator-directory-view[\s\S]*?grid-template-columns/,
    /\.coordinator-tree-card[\s\S]*?--coordinator-tree-depth/
  ]) assert.match(stylesSource, evidence);
});

test("Phase 2 command center uses the existing snapshot and drills into the authoritative directory", () => {
  for (const evidence of [
    /getCoordinatorCommandCenter\(snapshot\)/,
    /Operational command center/,
    /Status distribution/,
    /Role distribution/,
    /Geographic coverage/,
    /Recent activity/,
    /Recently added/,
    /Recent status changes/,
    /Create coordinator/,
    /Search directory/,
    /Filter network/,
    /Refresh data/,
    /showStatusDirectory\(item\.status\)/,
    /showRoleDirectory\(item\.role\)/,
    /showGeographyDirectory\(geography\.id\)/,
    /coordinatorById = useMemo/,
    /campaignIdsByCoordinator = useMemo/
  ]) assert.match(uiSource, evidence);

  for (const evidence of [
    /\.coordinator-quick-actions[\s\S]*?grid-template-columns/,
    /\.coordinator-coverage-layout[\s\S]*?grid-template-columns/,
    /\.coordinator-command-activity-grid[\s\S]*?grid-template-columns/,
    /\.coordinator-quick-action:focus-visible/,
    /\.coordinator-distribution-list button[\s\S]*?min-height: 52px/,
    /@media \(max-width: 700px\)[\s\S]*?\.coordinator-quick-actions/,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.coordinator-quick-action/
  ]) assert.match(stylesSource, evidence);
});

test("Phase 3 renders an operational profile with existing actions and memoized snapshot derivation", () => {
  for (const evidence of [
    /getCoordinatorProfileWorkspace\(snapshot, selectedCoordinatorId\)/,
    /const selectedProfile = useMemo/,
    /view === "profile" && selectedProfile/,
    /coordinator-profile-hero/,
    /coordinator-profile-sticky/,
    /coordinator-profile-campaigns/,
    /coordinator-profile-hierarchy/,
    /coordinator-profile-timeline/,
    /coordinator-profile-scorecard/,
    /openEditForm\(selectedProfile\.coordinator\)/,
    /openLifecycleWizard\(action, selectedProfile\.coordinator\)/,
    /showProfilePhoto\(selectedProfile\.manager!\)/,
    /scrollProfileSection\("hierarchy"\)/,
    /scrollProfileSection\("activity"\)/
  ]) assert.match(uiSource, evidence);

  for (const evidence of [
    /\.coordinator-profile-sticky[\s\S]*?position: sticky/,
    /\.coordinator-profile-hero[\s\S]*?grid-template-columns/,
    /\.coordinator-profile-hierarchy[\s\S]*?grid-template-columns/,
    /\.coordinator-profile-quick-actions > button[\s\S]*?min-height: 44px/,
    /@media \(max-width: 700px\)[\s\S]*?\.coordinator-profile-hero/,
    /@media \(max-width: 390px\)[\s\S]*?\.coordinator-profile-scorecard/,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.coordinator-profile-hero/
  ]) assert.match(stylesSource, evidence);

  assert.doesNotMatch(uiSource, />Coordinator 360° Profile<|>Coordinator summary<|>Assigned campaigns<|>Activity timeline</);
});

test("Coordinator profile translations have exact English, Hindi, and Odia key parity", () => {
  const englishPaths = translationPaths(englishLocale.coordinatorProfile).sort();
  assert.deepEqual(translationPaths(hindiLocale.coordinatorProfile).sort(), englishPaths);
  assert.deepEqual(translationPaths(odiaLocale.coordinatorProfile).sort(), englishPaths);
  assert.ok(englishPaths.length >= 70);
  for (const locale of [englishLocale, hindiLocale, odiaLocale]) {
    for (const path of englishPaths) {
      const value = path.split(".").reduce((current, key) => current[key], locale.coordinatorProfile);
      assert.equal(typeof value, "string");
      assert.ok(value.trim().length > 0, `${path} must be translated`);
    }
  }
});

test("Phase 4 lifecycle uses guided, permissioned server mutations without invalid status jumps", () => {
  for (const evidence of [
    /getCoordinatorLifecycle\(snapshot, selectedCoordinatorId\)/,
    /coordinator-lifecycle-timeline/,
    /coordinator-lifecycle-card-grid/,
    /coordinator-lifecycle-actions/,
    /coordinator-lifecycle-dialog/,
    /coordinator-lifecycle-progress/,
    /lifecycleWizard\.action === "transfer"/,
    /lifecycleWizard\.action === "suspend"/,
    /lifecycleWizard\.action === "archive"/,
    /if \(!snapshot\?\.canManage\) return/,
    /snapshot\.canManage \? \(/,
    /changeCoordinatorStatus\(\{/,
    /saveCoordinator\(snapshot\.workspaceId/,
    /removeCoordinator\(\{/,
    /expectedVersion: coordinator\.version/,
    /await refreshNetwork\(\)/
  ]) assert.match(uiSource, evidence);

  assert.doesNotMatch(uiSource, /onChange=\{\(event\) => void updateStatus|function deleteCoordinator/);
  assert.doesNotMatch(uiSource, />Lifecycle timeline<|>Status transitions<|>Activation wizard<|>Transfer wizard<|>Suspend coordinator<|>Archive coordinator</);

  for (const evidence of [
    /\.coordinator-lifecycle-actions button[\s\S]*?min-height: 58px/,
    /\.coordinator-lifecycle-dialog-actions[\s\S]*?position: sticky/,
    /\.coordinator-lifecycle-dialog-actions button[\s\S]*?min-height: 44px/,
    /@media \(max-width: 700px\)[\s\S]*?\.coordinator-lifecycle-dialog/,
    /@media \(max-width: 390px\)[\s\S]*?\.coordinator-lifecycle-card-grid/,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.coordinator-lifecycle-dialog/
  ]) assert.match(stylesSource, evidence);
});

test("Coordinator lifecycle translations have exact English, Hindi, and Odia key parity", () => {
  const englishPaths = translationPaths(englishLocale.coordinatorLifecycle).sort();
  assert.deepEqual(translationPaths(hindiLocale.coordinatorLifecycle).sort(), englishPaths);
  assert.deepEqual(translationPaths(odiaLocale.coordinatorLifecycle).sort(), englishPaths);
  assert.ok(englishPaths.length >= 95);
  for (const locale of [englishLocale, hindiLocale, odiaLocale]) {
    for (const path of englishPaths) {
      const value = path.split(".").reduce((current, key) => current[key], locale.coordinatorLifecycle);
      assert.equal(typeof value, "string");
      assert.ok(value.trim().length > 0, `${path} must be translated`);
    }
  }
});
