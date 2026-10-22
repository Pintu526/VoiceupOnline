import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260916010000_persisted_location_reference_contract.sql", import.meta.url);
const sql = readFileSync(migrationPath, "utf8");

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

test("11B migration is an additive, inert structural foundation", () => {
  assert.match(sql, /create function public\.voiceup_is_persisted_location_reference_v1_shape\(candidate jsonb\)/iu);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function/iu);
  assert.doesNotMatch(sql, /\balter\s+table\b/iu);
  assert.doesNotMatch(sql, /\bcreate\s+trigger\b/iu);
  assert.doesNotMatch(sql, /\b(insert\s+into|update|delete\s+from|truncate|copy)\b/iu);
  assert.doesNotMatch(sql, /\b(backfill|enable\s+row\s+level\s+security|disable\s+row\s+level\s+security|create\s+policy|alter\s+policy|drop\s+policy)\b/iu);
  assert.doesNotMatch(sql, /\bvoiceup_workspaces\b|\bvoiceup_public_campaign_index\b|\bvoiceup_signers\b|\bvoiceup_coordinators\b|\bvboss_resource_location_/iu);
});

test("11B helper has a fixed search path and minimal execute permissions", () => {
  assert.match(sql, /security invoker\s+set search_path = pg_catalog/iu);
  assert.match(sql, /revoke all on function public\.voiceup_is_persisted_location_reference_v1_shape\(jsonb\) from public/iu);
  assert.match(sql, /revoke all on function public\.voiceup_is_persisted_location_reference_v1_shape\(jsonb\) from anon/iu);
  assert.match(sql, /revoke all on function public\.voiceup_is_persisted_location_reference_v1_shape\(jsonb\) from authenticated/iu);
  assert.match(sql, /grant execute on function public\.voiceup_is_persisted_location_reference_v1_shape\(jsonb\) to service_role/iu);
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(?:anon|authenticated)\b/iu);
  assert.doesNotMatch(sql, /\bexecute\s+format\b|\bexecute\s+candidate\b/iu);
  assert.doesNotMatch(sql, /\blocation\.(?:datasets|nodes|relationships|lineage|dataset_releases)\b/iu);
});

test("11B migration neither replaces existing RPCs nor validates by label", () => {
  assert.doesNotMatch(sql, /create\s+or\s+replace/iu);
  assert.doesNotMatch(sql, /\blower\s*\(|\bunaccent\s*\(|\bsimilarity\s*\(|\bilike\b/iu);
  assert.match(sql, /structural precheck only/iu);
  assert.match(sql, /canonical trust validation belongs to Step 11C/iu);
});

test("only authorized Location closure consumers import the persistence contract", () => {
  const sourceRoot = new URL("../src", import.meta.url);
  const persistenceRoot = join(sourceRoot.pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)), "businessOs", "location", "persistence");
  const imports = sourceFiles(sourceRoot.pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)))
    .filter((path) => !path.startsWith(persistenceRoot))
    .filter((path) => /PersistedLocationReference|businessOs\/location\/persistence/u.test(readFileSync(path, "utf8")));
  assert.deepEqual(imports.map((path) => path.replaceAll("\\", "/")).map((path) => path.slice(path.indexOf("/src/") + 1)).sort(), [
    "src/App.tsx",
    "src/backend.ts",
    "src/businessOs/location/server/PersistedLocationReferenceValidator.ts",
    "src/businessOs/location/ui/CanonicalLocationLegacyAdapter.ts",
    "src/businessOs/location/ui/PublicCampaignCanonicalLocationDisplay.tsx",
    "src/businessOs/location/ui/SaasLocationGovernancePicker.tsx",
    "src/businessOs/location/ui/WorkspaceCanonicalLocationPicker.tsx",
    "src/constants/index.ts",
    "src/coordinators/types.ts",
    "src/geography.ts",
    "src/lib.ts",
    "src/pages/PublicCampaignPage.tsx",
    "src/pages/app/CampaignsTab.tsx",
    "src/pages/app/CoordinatorNetworkTab.tsx",
    "src/pages/app/EngagementTab.tsx",
    "src/pages/app/MovementCrmTab.tsx",
    "src/pages/app/ReportsTab.tsx",
    "src/pages/app/SaasTab.tsx",
    "src/pdfExports.ts",
    "src/types.ts",
    "src/utils/authority.ts",
    "src/utils/campaign.ts",
    "src/utils/referrals.ts"
  ]);
});
