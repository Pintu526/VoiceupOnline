import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name) => fs.readFileSync(`supabase/migrations/${name}`, "utf8");
const foundation = read("20261116008000_gaupoints_foundation.sql");
const configuration = read("20261116009000_gaupoints_campaign_configuration.sql");
const signing = read("20261116010000_gaupoints_verified_signing_award.sql");
const operations = read("20261116011000_gaupoints_referrals_rounds_and_access.sql");

test("migration order creates every relation before dependent functions compile", () => {
  assert.match(foundation, /create table public\.voiceup_gp_wallets/i);
  assert.match(foundation, /create table public\.voiceup_gp_ledger/i);
  assert.match(foundation, /create table public\.voiceup_gp_referral_edges/i);
  assert.match(configuration, /missing_accounting_foundation_dependency/i);
  assert.match(signing, /missing_campaign_configuration_dependency/i);
  assert.match(signing, /v_existing public\.voiceup_gp_ledger%rowtype/i);
  assert.ok("20261116008000" < "20261116009000");
  assert.ok("20261116009000" < "20261116010000");
});

test("wallet and ledger writes are private, atomic and immutable", () => {
  assert.match(foundation, /enable row level security/gi);
  assert.match(foundation, /revoke all on table public\.voiceup_gp_wallets from public, anon, authenticated/i);
  assert.match(foundation, /revoke all on table public\.voiceup_gp_ledger from public, anon, authenticated/i);
  assert.match(foundation, /voiceup_gp_ledger_immutable[\s\S]*before update or delete/i);
  assert.match(signing, /pg_advisory_xact_lock/);
  assert.match(signing, /insert into public\.voiceup_gp_ledger[\s\S]*update public\.voiceup_gp_wallets/i);
});

test("event keys hash trusted scope and never persist raw signing keys", () => {
  assert.match(signing, /voiceup_gp_sha256_hex\([\s\S]*p_workspace_id[\s\S]*p_campaign_id[\s\S]*p_signing_idempotency_key/i);
  assert.doesNotMatch(signing, /reference_key[^\n]*p_signing_idempotency_key/i);
  assert.match(operations, /childEvidence', public\.voiceup_gp_sha256_hex\(p_child_supporter_id\)/i);
});

test("issuance stays disabled by default and Campaign Admin cannot activate it", () => {
  assert.match(configuration, /enabled boolean not null default false/i);
  assert.match(configuration, /check \(redeemable = false\)/i);
  assert.match(operations, /voiceup_gp_save_disabled_campaign_configuration/i);
  assert.match(operations, /activated_configuration_service_role_only/i);
  assert.match(operations, /values \([\s\S]*p_workspace_id, p_campaign_id, false,/i);
  assert.doesNotMatch(operations, /grant execute on function public\.voiceup_gp_award_verified_(?:signing|referral)[\s\S]*to authenticated/i);
});

test("referral awards require verified campaign evidence and immutable parent", () => {
  assert.match(operations, /signer ->> 'campaignId' = p_campaign_id/i);
  assert.match(operations, /referrer_not_verified/i);
  assert.match(operations, /self_referral/i);
  assert.match(operations, /conflicting_referral_parent/i);
  assert.match(foundation, /voiceup_gp_referral_edge_immutable/i);
  assert.match(operations, /supporter_accounts_required/i);
});

test("round settlement is sequential, qualification-backed and conserves contribution", () => {
  assert.match(operations, /round_sequence_violation/i);
  assert.match(operations, /power\(v_config\.branch_factor::numeric, p_round\)/i);
  assert.match(operations, /v_contribution := floor/i);
  assert.match(operations, /v_base := v_contribution \/ p_round/i);
  assert.match(operations, /v_remainder := v_contribution % p_round/i);
  assert.match(operations, /pending_contribution/i);
  assert.match(operations, /completed_round = p_round/i);
});

test("read RPCs enforce owner scope and expose no supporter PII publicly", () => {
  assert.match(operations, /auth_user_id = auth\.uid\(\)[\s\S]*workspace_id = p_workspace_id[\s\S]*campaign_id = p_campaign_id/i);
  assert.match(operations, /voiceup_gp_public_leaderboard/i);
  assert.match(operations, /'alias', 'Supporter ' \|\| upper\(substr\(public\.voiceup_gp_sha256_hex/i);
  assert.doesNotMatch(operations, /jsonb_build_object\([\s\S]{0,300}'(?:phone|email|name)'/i);
});

test("Campaign Admin authorization is exact workspace and campaign scoped", () => {
  assert.match(operations, /assignment\.workspace_id = p_workspace_id/i);
  assert.match(operations, /assignment\.application_key = 'voiceup'/i);
  assert.match(operations, /assignment\.resource_type = 'campaign'/i);
  assert.match(operations, /assignment\.resource_id = p_campaign_id/i);
  assert.match(operations, /assignment\.role = 'campaign_admin'/i);
});

test("GauPoints migrations do not hook or alter the six-step signing RPC", () => {
  const all = `${foundation}\n${configuration}\n${signing}\n${operations}`;
  assert.doesNotMatch(all, /create or replace function public\.voiceup_atomic_public_participation/i);
  assert.doesNotMatch(all, /alter table public\.voiceup_workspaces/i);
  assert.doesNotMatch(all, /voiceup-public-signing/i);
});
