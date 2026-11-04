import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261104010000_existing_supporter_routing.sql", import.meta.url),
  "utf8"
);
const claimMigration = readFileSync(
  new URL("../supabase/migrations/20261025010000_supporter_account_claim_grants.sql", import.meta.url),
  "utf8"
);
const edge = readFileSync(
  new URL("../supabase/functions/voiceup-supporter-routing/index.ts", import.meta.url),
  "utf8"
);
const client = readFileSync(new URL("../src/supporterRouting.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
const inlineAuth = readFileSync(
  new URL("../src/components/CampaignInlineAuthPanel.tsx", import.meta.url),
  "utf8"
);

test("Journey A keeps the established on-screen OTP path", () => {
  assert.match(page, /await onSendOtp\(\)/);
  assert.match(page, /setWizardStep\("otp"\)/);
  assert.match(page, /await onVerifyOtp\(\)/);
  assert.doesNotMatch(edge, /mutate_voiceup_public_participation_screen_safe/);
});

test("public mobile precheck is debounced and never blocks screen OTP", () => {
  assert.match(page, /precheckPublicSupporterRouting\(campaign\.slug, publicForm\.phone\)/);
  assert.match(page, /setTimeout\(\(\) =>[\s\S]*450\)/);
  assert.match(page, /Precheck failure never blocks the established screen-OTP journey/);
  assert.match(page, /await onSendOtp\(\)/);
});

test("anonymous response is route-neutral and exposes only an opaque token", () => {
  const precheckBranch = edge.slice(edge.indexOf('if (action === "precheck")'), edge.indexOf('if (action === "resolve")'));
  assert.match(precheckBranch, /routingToken: data\.routingToken/);
  assert.match(precheckBranch, /expiresAt: data\.expiresAt/);
  assert.doesNotMatch(precheckBranch, /internal_route|matched_supporter_id|accountId|supporterId|claimGrant/);
  assert.match(migration, /-- Deliberately identical for every internal route\./);
});

test("prechecks persist only hashes and are rate limited by phone and client", () => {
  const table = migration.slice(
    migration.indexOf("create table if not exists public.voiceup_supporter_routing_prechecks"),
    migration.indexOf("create table if not exists public.voiceup_supporter_routing_audit")
  );
  assert.match(table, /phone_hash text not null/);
  assert.match(table, /client_hash text not null/);
  assert.doesNotMatch(table, /\bphone text\b|raw_phone/);
  assert.match(migration, /created_at > v_now - interval '10 minutes'\) >= 20/);
  assert.match(migration, /created_at > v_now - interval '10 minutes'\) >= 5/);
  assert.match(migration, /voiceup:routing_rate_limited/);
});

test("authenticated resolution derives identity from auth and confirmed email", () => {
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/);
  assert.match(migration, /users\.email_confirmed_at/);
  assert.match(migration, /voiceup:verified_email_required/);
  assert.doesNotMatch(migration, /p_actor_id|p_actor_email/);
});

test("existing participation is returned only to its mapped account owner", () => {
  assert.match(migration, /v_account\.auth_user_id = v_actor_id[\s\S]*existing_participation/);
  assert.match(migration, /else 'identity_not_linked'/);
  assert.match(inlineAuth, /routing\.route === "existing_participation"|resolveManifest\(await loadVoiceupAccessManifest\(\)\)/);
});

test("historical claim requires verified email equality and reuses claim grants", () => {
  assert.match(migration, /v_signer_email_hash <> encode\(digest\(v_actor_email, 'sha256'\), 'hex'\)/);
  assert.match(migration, /voiceup_supporter_account_claim_grants/);
  assert.match(migration, /'historical:' \|\| p_workspace_id \|\| ':' \|\| p_campaign_id/);
  assert.match(inlineAuth, /claimHistoricalSupporterRoutingGrant\(routing\.claimGrant\)/);
  assert.match(migration, /voiceup_claim_historical_supporter_account/);
});

test("claim links the canonical supporter and never inserts a replacement signer", () => {
  assert.match(migration, /matched_supporter_id/);
  assert.doesNotMatch(migration, /insert into public\.voiceup_workspaces/);
  assert.doesNotMatch(migration, /jsonb_set\(|signers\s*\|\|/);
  assert.match(claimMigration, /unique \(workspace_id, campaign_id, supporter_id\)/);
});

test("verified paper signatures use the historical claim path without changing fresh claims", () => {
  assert.match(migration, /claim_kind in \('fresh_signing', 'historical_verified_email'\)/);
  assert.match(migration, /v_grant\.claim_kind <> 'historical_verified_email'/);
  assert.match(migration, /coalesce\(v_signer ->> 'status', ''\) <> 'verified'/);
  assert.match(migration, /coalesce\(v_signer ->> 'signedAt', ''\) <> ''/);
  assert.doesNotMatch(migration, /create or replace function public\.voiceup_claim_supporter_account\(/);
});

test("campaign and tenant scope are bound in both routing calls", () => {
  assert.match(edge, /p_workspace_id: resolved\.row\.workspace_id/);
  assert.match(edge, /p_campaign_id: resolved\.row\.campaign_id/);
  assert.match(migration, /item\.workspace_id = p_workspace_id/);
  assert.match(migration, /item\.campaign_id = p_campaign_id/);
});

test("RLS and grants keep routing internals inaccessible to browser roles", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.voiceup_supporter_routing_prechecks from public, anon, authenticated/);
  assert.match(migration, /voiceup_create_supporter_routing_precheck[\s\S]*to service_role/);
  assert.match(migration, /voiceup_resolve_authenticated_supporter_routing[\s\S]*to authenticated/);
});

test("registration and sign-in reuse VoiceUp Auth rather than a parallel identity", () => {
  assert.match(inlineAuth, /registerSupporterWithEmailForContext/);
  assert.match(inlineAuth, /loginSupporterWithEmail/);
  assert.match(inlineAuth, /requestSupporterEmailOtp/);
  assert.doesNotMatch(edge, /auth\.admin\.createUser|createUser\(/);
});

test("sequential supporters receive isolated routing state", () => {
  assert.match(page, /clearSupporterRoutingPrecheck\(campaign\.id\)/);
  assert.match(page, /setSupporterRoutingPrecheck\(null\)/);
  assert.match(client, /sessionStorage\.removeItem/);
  assert.match(client, /voiceup-supporter-routing-v1:/);
});

test("routing and claim events are auditable without storing mobile plaintext", () => {
  assert.match(migration, /voiceup_supporter_routing_audit/);
  assert.match(migration, /precheck_created/);
  assert.match(migration, /authenticated_resolution/);
  assert.match(migration, /historical_claim_grant_issued/);
  assert.doesNotMatch(migration, /insert into public\.voiceup_supporter_routing_audit[\s\S]{0,300}v_phone\b/);
});
