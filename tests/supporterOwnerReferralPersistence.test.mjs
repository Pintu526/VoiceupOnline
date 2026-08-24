import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ownerMigration = readFileSync(
  new URL("../supabase/migrations/20260824080000_preserve_signer_owner_referral_code.sql", import.meta.url),
  "utf8"
);
const journeyMigration = readFileSync(
  new URL("../supabase/migrations/20260802010000_public_campaign_journey_lookup.sql", import.meta.url),
  "utf8"
);
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const publicPage = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const referrals = readFileSync(new URL("../src/utils/referrals.ts", import.meta.url), "utf8");

test("A/B new supporter persistence assigns a VU- owner code and returns it on the signer", () => {
  assert.match(ownerMigration, /voiceup_resolve_signer_owner_referral_code/);
  assert.match(ownerMigration, /v_signer := public\.voiceup_resolve_signer_owner_referral_code/);
  assert.match(ownerMigration, /'referralCode', v_signer -> 'referralCode'/);
  assert.match(ownerMigration, /v_candidate := 'VU-' \|\| upper\(substr\(replace\(gen_random_uuid/);
});

test("C/D blank autosave and empty profile patches cannot erase a stored owner code", () => {
  assert.match(
    ownerMigration,
    /if v_key = 'referralCode'[\s\S]*v_value = 'null'::jsonb[\s\S]*continue;/
  );
  assert.match(app, /normalizeReferralCode\(publicForm\.referralCode\)/);
  assert.match(app, /\.\.\.\(normalizeReferralCode\(publicForm\.referralCode\)[\s\S]*referralCode:/);
  assert.doesNotMatch(app, /referralCode: publicForm\.referralCode/);
});

test("E journey lookup still requires one persisted Published campaign match", () => {
  assert.match(journeyMigration, /signer ->> 'referralCode'/);
  assert.match(journeyMigration, /campaign_index\.status = 'Published'/);
  assert.match(journeyMigration, /if v_match_count <> 1 then\s+return null;/);
  assert.doesNotMatch(journeyMigration, /createReferralCode/);
  assert.doesNotMatch(journeyMigration, /phone \|\| email/);
});

test("F two supporters receive different generated owner codes", () => {
  assert.match(ownerMigration, /voiceup_signer_owner_referral_code_taken/);
  assert.match(ownerMigration, /if v_tries > 24 then/);
  assert.match(ownerMigration, /gen_random_uuid/);
});

test("G no supporter referral code is hardcoded", () => {
  assert.doesNotMatch(ownerMigration, /VU-3FK2S6/);
  assert.doesNotMatch(ownerMigration, /VU-41KHER/);
  assert.doesNotMatch(app, /VU-3FK2S6|VU-41KHER/);
  assert.doesNotMatch(publicPage, /VU-3FK2S6|VU-41KHER/);
  assert.doesNotMatch(referrals, /VU-3FK2S6|VU-41KHER/);
});

test("H existing journey uniqueness and security contract is unchanged", () => {
  assert.match(journeyMigration, /security definer/);
  assert.match(journeyMigration, /if coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(journeyMigration, /if v_code !~ '\^VU-\[A-Z0-9\]\{6,64\}\$'/);
  assert.match(journeyMigration, /grant execute on function[\s\S]*to service_role/);
  assert.doesNotMatch(journeyMigration, /\b(insert|update|delete)\s+into\b/i);
});

test("View My Profile uses only a persisted owner referral code", () => {
  assert.match(publicPage, /getPersistedSupporterReferralCode\(lastSignedSigner\)/);
  assert.doesNotMatch(publicPage, /getSupporterReferralCode\(lastSignedSigner\)/);
  assert.match(referrals, /export function getPersistedSupporterReferralCode/);
  assert.match(referrals, /PERSISTED_OWNER_REFERRAL_CODE\.test\(code\) \? code : ""/);
  assert.match(referrals, /\^VU-\[A-Z0-9\]\{6,64\}\$/);
});

test("attribution helpers may still synthesize, but missing persisted codes do not create journey URLs", () => {
  assert.match(referrals, /signer\.referralCode \|\| createReferralCode/);
  assert.match(publicPage, /personalReferralCode\s*\n\s*\? getCampaignReferralUrl/);
  assert.match(publicPage, /: publicUrl/);
});
