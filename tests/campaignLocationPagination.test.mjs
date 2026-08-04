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

test("manager loads pages sequentially at 500 rows and deduplicates by ID", () => {
  const refresh = manager.slice(manager.indexOf("const refresh"), manager.indexOf("useEffect(() =>"));
  assert.match(refresh, /let offset = 0/);
  assert.match(refresh, /while \(true\)/);
  assert.match(refresh, /limit: 500,\s*offset/);
  assert.match(refresh, /new Map<string, CampaignLocationRecord>\(\)/);
  assert.match(refresh, /accumulated\.set\(location\.id, location\)/);
  assert.match(refresh, /if \(!result\.hasMore\) break/);
  assert.match(refresh, /offset = result\.nextOffset/);
  assert.doesNotMatch(refresh, /Promise\.all/);
});

test("manager retains loaded pages after a failure and ignores stale requests", () => {
  const refresh = manager.slice(manager.indexOf("const refresh"), manager.indexOf("useEffect(() =>"));
  assert.match(refresh, /Location refresh paused after \$\{accumulated\.size\} loaded rows\. Retry refresh to continue\./);
  assert.match(refresh, /if \(sequence !== requestSequence\.current\) return/);
  assert.match(manager, /return \(\) => \{\s*requestSequence\.current \+= 1;/);
});

test("refresh restarts from zero while existing mutation and public synchronization paths remain intact", () => {
  assert.match(manager, /const sequence = \+\+requestSequence\.current/);
  assert.match(manager, /let offset = 0/);
  assert.match(manager, /await refresh\(\);/);
  assert.match(manager, /\.filter\(\(location\) => location\.active\)\s*\.map\(toPublicCampaignCustomLocation\)/);
  assert.match(manager, /addCampaignLocation\(scope, cleaned, idempotencyKey\(\)\)/);
  assert.match(manager, /deactivateCampaignLocation\(scope, pendingDeactivate\.id, pendingDeactivate\.version\)/);
});
