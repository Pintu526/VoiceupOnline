import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261025010000_supporter_account_claim_grants.sql", import.meta.url),
  "utf8"
);
const signingEdge = readFileSync(
  new URL("../supabase/functions/voiceup-public-signing/index.ts", import.meta.url),
  "utf8"
);

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

const issueFunction = slice(
  migration,
  "create or replace function public.voiceup_issue_supporter_account_claim_grant",
  "create or replace function public.voiceup_claim_supporter_account"
);
const claimFunction = slice(
  migration,
  "create or replace function public.voiceup_claim_supporter_account",
  "revoke all on function public.voiceup_issue_supporter_account_claim_grant"
);

test("legacy signatures are ineligible and grant issuance is service-role-only", () => {
  assert.match(migration, /enabled_at timestamptz not null default now\(\)/);
  assert.match(issueFunction, /v_signing_completed_at < v_enabled_at/);
  assert.match(issueFunction, /voiceup:legacy_supporter_unclaimable/);
  assert.match(issueFunction, /auth\.role\(\)[\s\S]*<> 'service_role'/);
  assert.match(migration, /grant execute on function public\.voiceup_issue_supporter_account_claim_grant[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /insert into public\.voiceup_supporter_accounts[\s\S]*select[\s\S]*voiceup_workspaces/i);
});

test("grant is bound to an authoritative completed signing result, not client identity fields", () => {
  assert.match(issueFunction, /publicParticipationIdempotency/);
  assert.match(issueFunction, /history ->> 'action' = 'submit_support'/);
  assert.match(issueFunction, /history #>> '\{result,signer,id\}' = p_supporter_id/);
  assert.match(issueFunction, /v_signer_count <> 1/);
  assert.match(issueFunction, /signing_proof_hash/);
  assert.match(issueFunction, /gen_random_bytes\(32\)/);
  assert.match(issueFunction, /digest\(v_token, 'sha256'\)/);
});

test("claim derives ownership only from auth uid, confirmed Auth email, and the opaque token", () => {
  assert.match(claimFunction, /v_actor_id uuid := auth\.uid\(\)/);
  assert.match(claimFunction, /from auth\.users users/);
  assert.match(claimFunction, /users\.email_confirmed_at/);
  assert.match(claimFunction, /v_grant\.email_hash <> encode\(digest\(v_auth_email, 'sha256'\)/);
  assert.match(claimFunction, /where grant_row\.token_hash = v_token_hash[\s\S]*for update/);
  assert.doesNotMatch(claimFunction, /p_(email|mobile|phone|supporter_id|workspace_id|campaign_id)/);
  assert.doesNotMatch(claimFunction, /otp/i);
});

test("ownership is unique, single-use, and owner-readable only", () => {
  const canonicalOwnershipConstraints = migration.match(/unique \(workspace_id, campaign_id, supporter_id\)/g) ?? [];
  assert.equal(canonicalOwnershipConstraints.length, 2);
  assert.match(migration, /claim_grant_id uuid not null unique/);
  assert.match(issueFunction, /where grant_row\.workspace_id = p_workspace_id[\s\S]*grant_row\.supporter_id = p_supporter_id[\s\S]*for update/);
  assert.match(issueFunction, /set signing_proof_hash = v_signing_proof_hash,[\s\S]*token_hash = v_token_hash/);
  assert.match(claimFunction, /set consumed_at = v_now,[\s\S]*consumed_by = v_actor_id/);
  assert.match(migration, /using \(auth_user_id = auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on table public\.voiceup_supporter_account_claim_grants from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.voiceup_supporter_accounts to authenticated/);
});

test("public signing issues the grant from server-derived mutation output and remains fail-open for signing", () => {
  assert.match(signingEdge, /action === "submit_support" && data\?\.signer\?\.id/);
  assert.match(signingEdge, /p_supporter_id: data\.signer\.id/);
  assert.match(signingEdge, /p_signing_idempotency_key: idempotencyKey/);
  assert.match(signingEdge, /supporterAccountClaimGrant/);
  assert.match(signingEdge, /A grant failure must never roll back or[\s\S]*already-completed public signing transaction/);
  assert.doesNotMatch(signingEdge, /p_supporter_id: body\./);
});
