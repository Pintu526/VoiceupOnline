import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = readSource(
  "../supabase/migrations/20261028020000_coordinator_account_binding_foundation.sql"
);
const coordinatorContract = readSource(
  "../supabase/migrations/20260720020000_coordinator_network_v1.sql"
);
const supporterOwnership = readSource(
  "../supabase/migrations/20261025010000_supporter_account_claim_grants.sql"
);
const supporterAuth = readSource("../src/supporterAuth.ts");

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} must exist`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

const issueFunction = slice(
  migration,
  "create or replace function public.voiceup_issue_coordinator_account_binding",
  "create or replace function public.voiceup_claim_coordinator_account_binding"
);
const claimFunction = slice(
  migration,
  "create or replace function public.voiceup_claim_coordinator_account_binding",
  "do $coordinator_binding_pgcrypto_search_path$"
);

test("existing coordinator identity and status contracts remain the source of truth", () => {
  assert.match(coordinatorContract, /auth_user_id uuid references auth\.users\(id\) on delete set null/u);
  assert.match(coordinatorContract, /status text not null check \(status in \('invited', 'active', 'inactive', 'suspended'\)\)/u);
  assert.match(coordinatorContract, /if p_status = 'active' and coordinator_record\.mobile_verified_at is null/u);
  assert.match(coordinatorContract, /member\.role in \('platform_owner', 'workspace_admin', 'campaign_admin'\)/u);
  assert.doesNotMatch(
    slice(coordinatorContract, "create or replace function public.upsert_voiceup_coordinator", "create or replace function public.set_voiceup_coordinator_status"),
    /auth_user_id/u
  );
});

test("supporter auth and account ownership provide independent verified identity", () => {
  assert.match(supporterAuth, /SUPPORTER_AUTH_STORAGE_KEY = VOICEUP_AUTH_STORAGE_KEY/u);
  assert.match(supporterAuth, /detectSessionInUrl: false/u);
  assert.match(supporterAuth, /flowType: "pkce"/u);
  assert.match(supporterAuth, /if \(!data\.user\.email_confirmed_at\)/u);
  assert.match(supporterOwnership, /publicParticipationIdempotency/u);
  assert.match(supporterOwnership, /history ->> 'action' = 'submit_support'/u);
  assert.match(supporterOwnership, /using \(auth_user_id = auth\.uid\(\)\)/u);
});

test("only an existing coordinator-network manager can issue a short-lived grant", () => {
  assert.match(issueFunction, /v_actor_id uuid := auth\.uid\(\)/u);
  assert.match(issueFunction, /voiceup_can_manage_coordinator_network\(p_workspace_id\)/u);
  assert.match(issueFunction, /coordinator\.id = p_coordinator_id[\s\S]*coordinator\.workspace_id = p_workspace_id[\s\S]*for update/u);
  assert.match(issueFunction, /v_coordinator\.status <> 'active'/u);
  assert.match(issueFunction, /v_coordinator\.mobile_verified_at is null/u);
  assert.match(issueFunction, /v_coordinator\.auth_user_id is not null/u);
  assert.match(issueFunction, /v_now \+ interval '30 minutes'/u);
});

test("binding uses only a confirmed verified owner session and an opaque single-use grant", () => {
  assert.match(claimFunction, /voiceup_claim_coordinator_account_binding\(\s*p_binding_token text/u);
  assert.match(claimFunction, /v_actor_id uuid := auth\.uid\(\)/u);
  assert.match(claimFunction, /from auth\.users users/u);
  assert.match(claimFunction, /users\.email_confirmed_at/u);
  assert.match(claimFunction, /from public\.voiceup_supporter_accounts supporter_account/u);
  assert.match(claimFunction, /supporter_account\.auth_user_id = v_actor_id/u);
  assert.match(claimFunction, /supporter_account\.workspace_id = v_grant\.workspace_id/u);
  assert.match(claimFunction, /where binding_grant\.token_hash = v_token_hash[\s\S]*for update/u);
  assert.match(claimFunction, /v_coordinator\.version <> v_grant\.coordinator_version/u);
  assert.match(claimFunction, /set auth_user_id = v_actor_id/u);
  assert.match(claimFunction, /set consumed_at = v_now,[\s\S]*consumed_by_user_id = v_actor_id/u);
  const claimSignature = claimFunction.slice(0, claimFunction.indexOf("returns jsonb"));
  assert.doesNotMatch(
    claimSignature,
    /p_(?:workspace|coordinator|email|phone|mobile|supporter)/u,
  );
  assert.doesNotMatch(claimFunction, /coordinator\.(?:email|phone|normalized_email|normalized_phone)/u);
});

test("raw tokens and binding internals are closed, expiring, and auditable", () => {
  assert.match(migration, /token_hash text not null unique/u);
  assert.match(issueFunction, /'vucb_' \|\| encode\(gen_random_bytes\(32\), 'hex'\)/u);
  assert.match(issueFunction, /digest\(v_token, 'sha256'\)/u);
  assert.doesNotMatch(migration, /\btoken text\b/u);
  assert.match(migration, /revoke all on table public\.voiceup_coordinator_account_binding_grants[\s\S]*from public, anon, authenticated/u);
  assert.match(claimFunction, /insert into public\.voiceup_coordinator_audit/u);
  assert.match(claimFunction, /'change', 'auth_account_bound'/u);
  assert.match(migration, /voiceup_coordinator_binding_grants_open_unique_idx/u);
  assert.match(migration, /not \(consumed_at is not null and revoked_at is not null\)/u);
});

test("binding creates no coordinator permission or admin-auth path", () => {
  assert.doesNotMatch(migration, /insert into public\.(?:voiceup_workspace_members|workspace_resource_members)/u);
  assert.doesNotMatch(migration, /update public\.(?:voiceup_workspace_members|workspace_resource_members)/u);
  assert.doesNotMatch(migration, /create or replace function public\.voiceup_can_(?:read|manage)_coordinator_network/u);
  assert.doesNotMatch(migration, /create policy[\s\S]*voiceup_coordinators/iu);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all) on table[\s\S]*to authenticated/iu);
  assert.match(migration, /grants no coordinator permissions/u);
});

test("pgcrypto lookup is schema-safe and RPC execution remains narrowly granted", () => {
  assert.match(migration, /where extension_info\.extname = 'pgcrypto'/u);
  assert.match(migration, /digest\(text,text\)/u);
  assert.match(migration, /gen_random_bytes\(integer\)/u);
  assert.match(migration, /grant execute on function public\.voiceup_issue_coordinator_account_binding\(text, uuid\)[\s\S]*to authenticated/u);
  assert.match(migration, /grant execute on function public\.voiceup_claim_coordinator_account_binding\(text\)[\s\S]*to authenticated/u);
  assert.match(migration, /revoke all on function public\.voiceup_issue_coordinator_account_binding\(text, uuid\)[\s\S]*from public, anon, service_role/u);
  assert.match(migration, /revoke all on function public\.voiceup_claim_coordinator_account_binding\(text\)[\s\S]*from public, anon, service_role/u);
});
