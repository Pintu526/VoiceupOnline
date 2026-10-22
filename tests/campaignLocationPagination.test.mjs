import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edge = readFileSync(
  new URL("../supabase/functions/voiceup-campaign-locations/index.ts", import.meta.url),
  "utf8"
);
const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const manager = readFileSync(
  new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url),
  "utf8"
);
const hierarchyHook = readFileSync(
  new URL("../src/components/useCampaignLocationCatalog.ts", import.meta.url),
  "utf8"
);

test("read contract uses a default 500-row page, caps at 1000, and rejects invalid offsets", () => {
  assert.match(edge, /pagination\(request\.limit, 500\)/);
  assert.match(edge, /pagination\(request\.offset, 0\)/);
  assert.match(edge, /requestedLimit === null \|\| requestedLimit < 1 \|\| offset === null/);
  assert.match(edge, /const limit = Math\.min\(requestedLimit, 1000\)/);
  assert.match(edge, /Number\.isInteger\(value\) && Number\(value\) >= 0/);
});

test("paged reads preserve exact campaign authorization, scope, active filter, and stable ordering", () => {
  assert.match(edge, /vboss_resource_location_authorization/);
  assert.match(edge, /if \(authorization !== "authorized"\) return error/);
  for (const predicate of [
    /\.eq\("workspace_id", scope\.workspaceId\)/,
    /\.eq\("application_key", applicationKey\)/,
    /\.eq\("resource_type", resourceType\)/,
    /\.eq\("resource_id", scope\.campaignId\)/,
    /\.eq\("active", active\)/
  ]) assert.match(edge, predicate);
  assert.match(edge, /\.order\("normalized_path"\)\s*\.order\("id"\)\s*\.range\(offset, offset \+ limit - 1\)/);
});

test("read response returns complete page metadata without removing location fields", () => {
  for (const field of [
    "locations", "total", "limit", "offset", "hasMore", "nextOffset", "configurationVersion",
    "country", "state", "district", "block", "panchayat", "village", "postalCode", "leafLevel",
    "source", "active", "version", "createdAt", "updatedAt"
  ]) assert.match(edge, new RegExp(field));
  assert.match(edge, /const hasMore = offset \+ page\.length < total/);
  assert.match(edge, /nextOffset: hasMore \? offset \+ page\.length : null/);
});

test("typed wrapper exposes pagination requests and response metadata", () => {
  const wrapper = backend.slice(
    backend.indexOf("export async function readCampaignLocations"),
    backend.indexOf("export async function addCampaignLocation")
  );
  assert.match(wrapper, /limit\?: number; offset\?: number/);
  for (const field of ["total", "limit", "offset", "hasMore", "nextOffset"]) {
    assert.match(wrapper, new RegExp(field));
  }
});

test("manager fetches exactly one 50-row administration page", () => {
  const refresh = manager.slice(manager.indexOf("const refreshLocationsPage"), manager.indexOf("useEffect(() =>"));
  assert.match(refresh, /readCampaignLocations\(scope/);
  assert.match(refresh, /limit: locationPageSize/);
  assert.match(refresh, /offset/);
  assert.match(manager, /const locationPageSize = 50/);
  assert.doesNotMatch(refresh, /while \(true\)|accumulated|result\.nextOffset/);
});

test("manager ignores stale summary and list requests independently", () => {
  assert.match(manager, /summaryRequestSequence/);
  assert.match(manager, /locationsRequestSequence/);
  assert.match(manager, /if \(sequence !== summaryRequestSequence\.current\) return/);
  assert.match(manager, /if \(sequence !== locationsRequestSequence\.current\) return/);
});

test("lazy hierarchy loads only direct branches and never paginates the full catalog", () => {
  assert.match(hierarchyHook, /readCampaignLocationHierarchy/);
  assert.match(hierarchyHook, /parentPaths: Partial<CampaignLocationPath>\[\] = \[\{ country: "India" \}\]/);
  assert.match(hierarchyHook, /Promise\.all\(parentPaths\.map/);
  assert.doesNotMatch(hierarchyHook, /readCampaignLocations|while \(true\)|limit: 500|nextOffset/);
  assert.match(manager, /setPageOffset\(0\)/);
  assert.match(manager, /addCampaignLocation\(scope, cleaned, idempotencyKey\(\)\)/);
  assert.match(manager, /deactivateCampaignLocation\(scope, pendingDeactivate\.id, pendingDeactivate\.version\)/);
});

test("summary counts transfer no rows and hierarchy is direct-child bounded", () => {
  const summary = edge.slice(
    edge.indexOf('request.action === "read_campaign_location_summary"'),
    edge.indexOf('request.action === "read_campaign_locations"')
  );
  assert.match(summary, /read_campaign_location_summary_v2/);
  assert.doesNotMatch(summary, /\.from\("vboss_resource_location_paths"\)|head: true|Promise\.all/);
  const hierarchy = edge.slice(
    edge.indexOf('request.action === "read_campaign_location_hierarchy"'),
    edge.indexOf('request.action === "read_campaign_location_summary"')
  );
  assert.match(hierarchy, /read_campaign_location_hierarchy_v2/);
  assert.match(hierarchy, /p_limit: 1000/);
  assert.doesNotMatch(hierarchy, /\.from\("vboss_resource_location_paths"\)|\.eq\("leaf_level"/);
});
