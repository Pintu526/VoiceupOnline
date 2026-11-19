import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const participationContract = readSource(
  "../supabase/migrations/20260728010000_participation_requests.sql"
);
const publicReadContract = readSource(
  "../supabase/migrations/20260728020000_participation_request_public_read.sql"
);
const historicalLocationMigration = readSource(
  "../supabase/migrations/20260917010000_location_consolidated_persistence.sql"
);
const correctiveMigration = readSource(
  "../supabase/migrations/20261028010000_participation_location_resource_scope_fix.sql"
);

function tableDefinition(source) {
  const match = source.match(
    /create table if not exists public\.voiceup_participation_requests\s*\(([\s\S]*?)\n\);/u
  );
  assert.ok(match, "participation request table definition must exist");
  return match[1];
}

function functionDefinition(source) {
  const match = source.match(
    /create(?: or replace)? function public\.voiceup_submit_participation_request_with_location\([\s\S]*?\n\$function\$;/u
  );
  assert.ok(match, "corrective wrapper definition must exist");
  return match[0];
}

test("participation requests use the generic resource contract and have no campaign_id column", () => {
  const definition = tableDefinition(participationContract);
  assert.match(definition, /resource_type text not null/u);
  assert.match(definition, /resource_id text not null/u);
  assert.doesNotMatch(definition, /\bcampaign_id\b/u);
  assert.match(
    participationContract,
    /request_row\.resource_type = 'campaign'[\s\S]*request_row\.resource_id = p_campaign_id/u
  );
  assert.match(
    publicReadContract,
    /request_row\.resource_type = 'campaign'[\s\S]*request_row\.resource_id = p_campaign_id/u
  );
});

test("corrective wrapper scopes the location update to the returned campaign resource", () => {
  const definition = functionDefinition(correctiveMigration);
  const update = definition.match(
    /update public\.voiceup_participation_requests[\s\S]*?resource_id = p_campaign_id;/u
  )?.[0] ?? "";
  assert.match(update, /where id = request_id/u);
  assert.match(update, /workspace_id = p_workspace_id/u);
  assert.match(update, /resource_type = 'campaign'/u);
  assert.match(update, /resource_id = p_campaign_id/u);
  assert.doesNotMatch(update, /\bcampaign_id\s*=\s*p_campaign_id/u);
});

test("corrective wrapper changes only the invalid campaign-column predicate", () => {
  const expected = functionDefinition(historicalLocationMigration)
    .replace("create function", "create or replace function")
    .replace(
      "    and campaign_id = p_campaign_id;",
      "    and resource_type = 'campaign'\n    and resource_id = p_campaign_id;"
    );
  assert.equal(functionDefinition(correctiveMigration), expected);
});

test("corrective wrapper preserves validation, delegation, and least privilege", () => {
  const definition = functionDefinition(correctiveMigration);
  assert.match(definition, /security definer/u);
  assert.match(definition, /set search_path = public, pg_catalog, pg_temp/u);
  assert.match(definition, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/u);
  assert.match(definition, /voiceup_prepare_location_reference_v1\(/u);
  assert.match(definition, /voiceup_submit_participation_request\(/u);
  assert.match(definition, /if not p_has_location_reference then return result/u);
  assert.match(
    correctiveMigration,
    /revoke all on function public\.voiceup_submit_participation_request_with_location\([\s\S]*?from public, anon, authenticated;/u
  );
  assert.match(
    correctiveMigration,
    /grant execute on function public\.voiceup_submit_participation_request_with_location\([\s\S]*?to service_role;/u
  );
  assert.doesNotMatch(correctiveMigration, /\b(?:create|alter|drop) table\b/iu);
});
