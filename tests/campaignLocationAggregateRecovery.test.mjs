import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getIndiaLocationOptions, normalizeIndiaLocationOptionKey } from "../src/components/indiaLocationOptions.ts";
import { emptyLocationDeletions } from "../src/geography.ts";
import { selectAuthorizedLocationCatalogWorkspace } from "../src/businessOs/location/browser/WorkspaceCatalogAuthorization.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260918010000_campaign_location_aggregate_reads_v2.sql", import.meta.url),
  "utf8"
);
const edge = readFileSync(
  new URL("../supabase/functions/voiceup-campaign-locations/index.ts", import.meta.url),
  "utf8"
);

function options(overrides = {}) {
  return getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: "",
    ...overrides
  });
}

test("hierarchy v2 derives direct children from populated ancestry rather than terminal leaf rows", () => {
  const hierarchy = migration.slice(
    migration.indexOf("create or replace function public.read_campaign_location_hierarchy_v2"),
    migration.indexOf("create or replace function public.read_campaign_location_summary_v2")
  );
  assert.match(hierarchy, /split_part\(path\.normalized_path, '\|', child_depth\)/u);
  assert.match(hierarchy, /array_length\(string_to_array\(path\.normalized_path, '\|'/u);
  assert.doesNotMatch(hierarchy, /path\.leaf_level\s*=/u);
  assert.match(hierarchy, /jsonb_strip_nulls[\s\S]*\|\| jsonb_build_object\([\s\S]*'canonicalNodeId', null[\s\S]*'officialCode', null/u);
  assert.match(edge, /rpc\(admin, "read_campaign_location_hierarchy_v2"/u);
  assert.doesNotMatch(
    edge.slice(
      edge.indexOf('request.action === "read_campaign_location_hierarchy"'),
      edge.indexOf('request.action === "read_campaign_location_summary"')
    ),
    /\.from\("vboss_resource_location_paths"\)|\.eq\("leaf_level"/u
  );
});

test("summary v2 counts configured rows separately from distinct populated ancestry paths", () => {
  const summary = migration.slice(migration.indexOf("create or replace function public.read_campaign_location_summary_v2"));
  assert.match(summary, /count\(\*\) filter \(where path\.active\)/u);
  assert.match(summary, /distinct_normalized_ancestry_paths/u);
  assert.match(summary, /string_to_array\(path\.normalized_path, '\|'\)\)\[1:3\]/u);
  assert.match(summary, /'configuredRows'/u);
  assert.match(summary, /'distinctValues'/u);
  assert.doesNotMatch(summary, /path\.leaf_level\s*=/u);
  assert.match(edge, /rpc\(admin, "read_campaign_location_summary_v2", base\)/u);
});

test("ready empty campaign overlay cannot suppress canonical Odisha districts", () => {
  const result = options({ catalogStatus: "ready", customLocations: [] });
  const keys = result.districtOptions.map(normalizeIndiaLocationOptionKey);
  assert.equal(result.districtOptions.length, 30);
  assert.ok(keys.includes("khordha"));
});

test("campaign overlay augments canonical choices without duplicates or canonical identity promotion", () => {
  const result = options({
    catalogStatus: "ready",
    customLocations: [
      { country: "India", state: "Odisha", district: "  KHORDHA  " },
      { country: "India", state: "Odisha", district: "Custom District" }
    ]
  });
  const keys = result.districtOptions.map(normalizeIndiaLocationOptionKey);
  assert.equal(keys.filter((value) => value === "khordha").length, 1);
  assert.ok(keys.includes("custom district"));
  assert.equal(result.districtOptions.length, 31);
});

test("workspace catalog scope supports platform owner and fails closed for ordinary cross-workspace access", () => {
  assert.equal(selectAuthorizedLocationCatalogWorkspace("workspace-b", {
    workspaceId: "",
    workspaceMember: false,
    platformAdmin: true
  }), "workspace-b");
  assert.equal(selectAuthorizedLocationCatalogWorkspace("workspace-a", {
    workspaceId: "workspace-a",
    workspaceMember: true,
    platformAdmin: false
  }), "workspace-a");
  assert.equal(selectAuthorizedLocationCatalogWorkspace("workspace-b", {
    workspaceId: "workspace-a",
    workspaceMember: true,
    platformAdmin: false
  }), null);
  assert.equal(selectAuthorizedLocationCatalogWorkspace("workspace-a", {
    workspaceId: "",
    workspaceMember: false,
    platformAdmin: false
  }), null);
});

test("aggregate RPCs are service-role-only and retain the established campaign authorization boundary", () => {
  for (const name of [
    "read_campaign_location_hierarchy_v2",
    "read_campaign_location_summary_v2",
    "read_public_campaign_location_hierarchy_v2"
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}[\\s\\S]* from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]* to service_role`));
  }
  assert.match(migration, /auth\.role\(\) <> 'service_role'/u);
  assert.match(migration, /vboss_resource_location_authorization/u);
  assert.doesNotMatch(migration, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\.vboss_resource_location_paths\b/iu);
});
