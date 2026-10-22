import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20260916020000_persisted_location_reference_trusted_validator.sql", import.meta.url),
  "utf8"
);

test("11C migration creates one additive trusted validator without application mutations", () => {
  assert.match(sql, /create function public\.voiceup_validate_persisted_location_reference_v1\(candidate jsonb\)/iu);
  assert.doesNotMatch(sql, /create\s+or\s+replace/iu);
  assert.doesNotMatch(sql, /\balter\s+table\b|\bcreate\s+trigger\b/iu);
  assert.doesNotMatch(sql, /\b(insert\s+into|update|delete\s+from|truncate|copy)\b/iu);
  assert.doesNotMatch(sql, /\bvoiceup_workspaces\b|\bvoiceup_public_campaign_index\b|\bvoiceup_coordinators\b|\bvboss_resource_location_/iu);
  assert.doesNotMatch(sql, /\b(backfill|create\s+policy|alter\s+policy|drop\s+policy)\b/iu);
});

test("11C validator uses exact active canonical identity and never resolves by label", () => {
  assert.match(sql, /d\.authority = candidate ->> 'authority'/iu);
  assert.match(sql, /d\.source_dataset = candidate ->> 'sourceDataset'/iu);
  assert.match(sql, /d\.dataset_version = candidate ->> 'datasetVersion'/iu);
  assert.match(sql, /r\.is_active/iu);
  assert.match(sql, /n\.node_id = candidate ->> 'canonicalNodeId'/iu);
  assert.match(sql, /location\.relationships/iu);
  assert.match(sql, /location\.lineage/iu);
  assert.doesNotMatch(sql, /where[^;]*(?:display_name|labelSnapshot)\s*=/isu);
  assert.doesNotMatch(sql, /\bilike\b|\blower\s*\(|\bunaccent\s*\(|\bsimilarity\s*\(/iu);
});

test("11C validator rebuilds bounded snapshots and validation metadata", () => {
  for (const field of [
    "canonicalNodeId", "officialCode", "labelSnapshot", "level", "entityKind",
    "authority", "sourceDataset", "datasetVersion", "parents", "lineageSnapshot", "validation"
  ]) assert.match(sql, new RegExp(`'${field}'`, "u"));
  assert.match(sql, /ACTIVE_DATASET_MISMATCH/u);
  assert.match(sql, /PARENTS_MISMATCH/u);
  assert.match(sql, /LINEAGE_MISMATCH/u);
});

test("11C validator is fixed-path and service-role only", () => {
  assert.match(sql, /security invoker\s+set search_path = pg_catalog/iu);
  assert.match(sql, /revoke all on function public\.voiceup_validate_persisted_location_reference_v1\(jsonb\) from public/iu);
  assert.match(sql, /revoke all on function public\.voiceup_validate_persisted_location_reference_v1\(jsonb\) from anon/iu);
  assert.match(sql, /revoke all on function public\.voiceup_validate_persisted_location_reference_v1\(jsonb\) from authenticated/iu);
  assert.match(sql, /grant execute on function public\.voiceup_validate_persisted_location_reference_v1\(jsonb\) to service_role/iu);
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(?:anon|authenticated)\b/iu);
  assert.doesNotMatch(sql, /\bexecute\s+format\b|\bexecute\s+candidate\b/iu);
});

