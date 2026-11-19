import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
const edge = readFileSync(
  new URL("../supabase/functions/voiceup-public-signing/index.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL("../supabase/migrations/20261114010000_secure_public_referral_attribution.sql", import.meta.url),
  "utf8"
);

function functionSource(name, nextMarker) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(nextMarker, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${name} must have a closing boundary`);
  return migration.slice(start, end);
}

test("public routes defer referral decisions to persisted server state", () => {
  assert.match(app, /const localReferrer = isBackendConfigured\s*\? undefined\s*:\s*findReferrer/);
  assert.match(app, /if \(!isBackendConfigured && referralInput && !localReferrer\)/);
  assert.doesNotMatch(page, /findReferrer|getSafeReferrerLabel|Referring supporter:/);
});

test("shared-link referral codes are canonical, unique, restored, and locked", () => {
  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.getAll\("ref"\)/);
  assert.match(page, /referralValues\.length !== 1/);
  assert.match(page, /\^VU-\[A-Z0-9\]\{6,64\}\$/);
  assert.match(page, /referredByPhoneOrCode: incomingReferralCode, referralSource: "url"/);
  assert.match(page, /\.\.\.saved\.form,[\s\S]*referredByPhoneOrCode: incomingReferralCode/);
  assert.match(page, /publicForm\.referredByPhoneOrCode,[\s\S]*publicForm\.referralSource/);
  assert.match(page, /readOnly=\{Boolean\(incomingReferralCode\)\}/);
});

test("manual mobile or code input reaches the existing signing RPC without public lookup", () => {
  assert.match(page, /referralSource: event\.target\.value\.trim\(\) \? "manual" : undefined/);
  assert.match(app, /referredByPhoneOrCode: referralInput/);
  assert.match(edge, /admin\.rpc\("mutate_voiceup_public_participation_screen_safe"/);
});

test("referral resolver locks persisted records and accepts only completed same-campaign supporters", () => {
  const resolver = functionSource(
    "voiceup_resolve_public_referral_attribution",
    "revoke all on function public.voiceup_resolve_public_referral_attribution"
  );
  assert.match(resolver, /returns text/);
  assert.match(resolver, /from public\.voiceup_workspaces workspace[\s\S]*for update/);
  assert.match(resolver, /signer ->> 'campaignId' = p_campaign_id/);
  assert.match(resolver, /supportSubmittedAt[\s\S]*signer ->> 'status' = 'verified'/);
  assert.match(resolver, /referralCode[\s\S]*\^VU-\[A-Z0-9\]\{6,64\}\$/);
  assert.match(resolver, /voiceup_normalize_public_phone\(v_input\)/);
  assert.match(resolver, /return v_referrer_code/);
  assert.doesNotMatch(resolver, /return v_referrer\b|jsonb_build_object\([^)]*phone/);
});

test("invalid and self referrals fail before the atomic persistence call", () => {
  const wrapper = functionSource(
    "mutate_voiceup_public_participation_with_location",
    "revoke all on function public.mutate_voiceup_public_participation_with_location"
  );
  const resolution = wrapper.indexOf("voiceup_resolve_public_referral_attribution");
  const persistence = wrapper.indexOf("mutation_result := public.mutate_voiceup_public_participation");
  assert.ok(resolution > -1 && persistence > resolution);
  assert.match(migration, /voiceup:invalid_referral/);
  assert.match(migration, /voiceup:self_referral/);
  assert.match(edge, /invalid_referral: \{ status: 400/);
  assert.match(edge, /self_referral: \{ status: 400/);
});

test("only canonical codes are persisted for draft, submit, and profile flows", () => {
  const wrapper = functionSource(
    "mutate_voiceup_public_participation_with_location",
    "revoke all on function public.mutate_voiceup_public_participation_with_location"
  );
  assert.match(wrapper, /p_action in \('save_draft', 'submit_support', 'update_profile'\)/);
  assert.match(wrapper, /referral_profile := referral_profile[\s\S]*- 'referredByPhoneOrCode'/);
  assert.match(wrapper, /'referredBy', canonical_referral_code/);
  assert.match(wrapper, /'referredByPhoneOrCode', canonical_referral_code/);
  assert.match(wrapper, /referral_source not in \('url', 'manual'\)/);
});

test("existing attribution is resolved under the workspace lock using the atomic supporter identity", () => {
  const wrapper = functionSource(
    "mutate_voiceup_public_participation_with_location",
    "revoke all on function public.mutate_voiceup_public_participation_with_location"
  );
  const lock = wrapper.indexOf("from public.voiceup_workspaces workspace");
  const existingLookup = wrapper.indexOf("into existing_supporter");
  const persistence = wrapper.indexOf("mutation_result := public.mutate_voiceup_public_participation");

  assert.ok(lock > -1 && existingLookup > lock && persistence > existingLookup);
  assert.match(wrapper, /where workspace\.id = p_workspace_id\s+for update/);
  assert.match(wrapper, /signer ->> 'campaignId' = p_campaign_id/);
  assert.match(
    wrapper,
    /nullif\(signer ->> 'canonicalPhone', ''\),\s*public\.voiceup_normalize_public_phone\(signer ->> 'phone'\)[\s\S]*= supporter_phone/
  );
  assert.match(wrapper, /supportSubmittedAt[\s\S]*signer ->> 'source' = 'online'/);
});

test("persisted attribution is immutable while same-referrer retries remain idempotent", () => {
  const wrapper = functionSource(
    "mutate_voiceup_public_participation_with_location",
    "revoke all on function public.mutate_voiceup_public_participation_with_location"
  );

  assert.match(wrapper, /if existing_referral_input <> '' then/);
  assert.match(
    wrapper,
    /existing_canonical_referral_code := public\.voiceup_resolve_public_referral_attribution\([\s\S]*if referral_input <> '' then[\s\S]*canonical_referral_code := public\.voiceup_resolve_public_referral_attribution/
  );
  assert.match(
    wrapper,
    /if canonical_referral_code <> existing_canonical_referral_code then\s+raise exception using errcode = '22023', message = 'voiceup:invalid_referral'/
  );
  assert.match(wrapper, /existing_supporter -> 'referredBy'/);
  assert.match(wrapper, /existing_supporter -> 'referredByPhoneOrCode'/);
  assert.match(
    wrapper,
    /nullif\(btrim\(existing_supporter ->> 'referredBy'\), ''\) is not null[\s\S]*else to_jsonb\(existing_canonical_referral_code\)/
  );
  assert.match(
    wrapper,
    /nullif\(btrim\(existing_supporter ->> 'referredByPhoneOrCode'\), ''\) is not null[\s\S]*else to_jsonb\(existing_canonical_referral_code\)/
  );
  assert.match(wrapper, /existing_supporter \? 'referralSource'/);
  assert.match(wrapper, /'referralSource', existing_supporter -> 'referralSource'/);
  assert.match(wrapper, /referral_profile := referral_profile \|\| existing_referral_profile/);
});

test("blank referral patches cannot erase attribution and first attribution remains optional", () => {
  const wrapper = functionSource(
    "mutate_voiceup_public_participation_with_location",
    "revoke all on function public.mutate_voiceup_public_participation_with_location"
  );

  assert.match(
    wrapper,
    /referral_input := coalesce\([\s\S]*nullif\(btrim\(referral_profile ->> 'referredByPhoneOrCode'\), ''\)[\s\S]*''\s*\)/
  );
  assert.match(
    wrapper,
    /referral_profile := referral_profile[\s\S]*- 'referredBy'[\s\S]*- 'referredByPhoneOrCode'[\s\S]*- 'referralSource'/
  );
  assert.match(wrapper, /if existing_referral_input <> '' then[\s\S]*elsif referral_input <> '' then/);
  assert.match(
    wrapper,
    /elsif referral_input <> '' then[\s\S]*'referredBy', canonical_referral_code[\s\S]*'referralSource', referral_source/
  );
});

test("conflicting concurrent referral requests serialize before comparison and persistence", () => {
  const wrapper = functionSource(
    "mutate_voiceup_public_participation_with_location",
    "revoke all on function public.mutate_voiceup_public_participation_with_location"
  );
  const lock = wrapper.indexOf("for update;");
  const existingLookup = wrapper.indexOf("into existing_supporter");
  const conflictCheck = wrapper.indexOf("canonical_referral_code <> existing_canonical_referral_code");
  const persistence = wrapper.indexOf("mutation_result := public.mutate_voiceup_public_participation");

  assert.ok(lock > -1 && existingLookup > lock);
  assert.ok(conflictCheck > existingLookup && persistence > conflictCheck);
});

test("referral resolver is service-role only and exposes no public execute grant", () => {
  assert.match(
    migration,
    /revoke all on function public\.voiceup_resolve_public_referral_attribution[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.voiceup_resolve_public_referral_attribution[\s\S]*to service_role/
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.voiceup_resolve_public_referral_attribution[\s\S]*to (anon|authenticated)/
  );
});
