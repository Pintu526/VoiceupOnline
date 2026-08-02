import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260802020000_resource_location_paths_v1.sql", import.meta.url),
  "utf8"
);
const edge = readFileSync(
  new URL("../supabase/functions/voiceup-campaign-locations/index.ts", import.meta.url),
  "utf8"
);

test("resource-location schema is resource-neutral, normalized, and append-only", () => {
  for (const table of [
    "vboss_resource_location_configurations",
    "vboss_resource_location_paths",
    "vboss_resource_location_audit"
  ]) assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, /unique \(workspace_id, application_key, resource_type, resource_id, normalized_path\)/);
  assert.match(migration, /version integer not null default 1 check \(version > 0\)/);
  assert.match(migration, /action text not null check \(action in \('created', 'reactivated', 'deactivated'\)\)/);
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.vboss_resource_location_paths/i);
});

test("migration prevents direct browser access and restricts RPC execution to service role", () => {
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on public\.vboss_resource_location_configurations, public\.vboss_resource_location_paths, public\.vboss_resource_location_audit from public, anon, authenticated/);
  for (const name of ["read_resource_locations", "add_resource_location", "deactivate_resource_location"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]* to service_role`));
  }
  assert.match(migration, /if auth\.role\(\) <> 'service_role' then return jsonb_build_object\('code', 'forbidden'\)/);
});

test("SQL authorization validates exact campaign scope and fail-closed Campaign Admin assignment", () => {
  const authorization = migration.slice(
    migration.indexOf("create or replace function public.vboss_resource_location_authorization"),
    migration.indexOf("create or replace function public.read_resource_locations")
  );
  assert.match(authorization, /candidate ->> 'id' = p_resource_id/);
  assert.match(authorization, /candidate ->> 'slug'/);
  assert.match(authorization, /coalesce\(campaign ->> 'archivedAt', ''\) <> ''/);
  assert.match(authorization, /assignment\.role = 'campaign_admin'/);
  assert.match(authorization, /assignment\.active/);
  assert.match(authorization, /assignment\.revoked_at is null/);
  assert.match(authorization, /if assignment_count > 1 then return 'assignment_mismatch'/);
});

test("mutation RPCs provide idempotency, atomic configuration versions, soft deactivation, and audit", () => {
  const add = migration.slice(
    migration.indexOf("create or replace function public.add_resource_location"),
    migration.indexOf("create or replace function public.deactivate_resource_location")
  );
  assert.match(add, /pg_advisory_xact_lock/);
  assert.match(add, /'idempotencyKey', p_idempotency_key/);
  assert.match(add, /'idempotency_conflict'/);
  assert.match(add, /configuration_version = public\.vboss_resource_location_configurations\.configuration_version \+ 1/);
  assert.match(add, /audit_action := 'reactivated'/);
  assert.match(add, /audit_action := 'created'/);
  assert.match(add, /insert into public\.vboss_resource_location_audit/);
  const deactivate = migration.slice(migration.indexOf("create or replace function public.deactivate_resource_location"));
  assert.match(deactivate, /target_path\.version <> p_expected_version/);
  assert.match(deactivate, /child\.active and child\.normalized_path like target_path\.normalized_path \|\| '\|%'/);
  assert.match(deactivate, /set active = false, version = version \+ 1/);
});

test("Edge API exposes only authenticated campaign-location actions with safe stable errors", () => {
  assert.match(edge, /getUser\(req\)/);
  assert.match(edge, /request\.action === "read_campaign_locations"/);
  assert.match(edge, /request\.action === "add_campaign_location"/);
  assert.match(edge, /request\.action === "deactivate_campaign_location"/);
  assert.match(edge, /return error\("unauthorized"\)/);
  assert.match(edge, /return error\("validation_failed"\)/);
  assert.match(edge, /return error\("server_error"\)/);
  assert.doesNotMatch(edge, /error instanceof Error \? error\.message/);
});

test("writes use the immutable India catalog only for master protection and parent validation", () => {
  assert.match(edge, /import \{ INDIA_MASTER_GEOGRAPHY \} from "\.\.\/_shared\/generated\/indiaMasterGeography\.ts"/);
  assert.match(edge, /master_catalog_unavailable/);
  assert.match(edge, /master_value_protected/);
  assert.match(edge, /artifact\.contentSha256/);
  assert.doesNotMatch(edge, /voiceup-public-campaign/);
});
