import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const otpEdge = read("../supabase/functions/voiceup-otp/index.ts");
const signingEdge = read("../supabase/functions/voiceup-public-signing/index.ts");
const migration = read("../supabase/migrations/20261019010000_screen_otp_public_signing.sql");
const app = read("../src/App.tsx");
const page = read("../src/pages/PublicCampaignPage.tsx");
const blueprint = read("../src/config/goudhanCampaignBlueprint.ts");
const backend = read("../src/backend.ts");

test("screen OTP is limited to flagged GSAA public signing and does not change other OTP purposes", () => {
  assert.match(otpEdge, /purpose === "public-signing" &&\s*SHOW_GSAA_OTP &&\s*SCREEN_OTP_SLUGS\.has\(canonicalPublicSlug\)/);
  assert.match(otpEdge, /if \(isScreenOtp\)[\s\S]*else if \(DEV_MODE\)[\s\S]*await sendWithProvider/);
  assert.match(otpEdge, /if \(purpose === "coordinator-mobile"\)[\s\S]*getUser\(req\)/);
  assert.match(blueprint, /verificationMethod:\s*"screen_otp"/);
  assert.doesNotMatch(`${otpEdge}\n${app}\n${page}`, /turnstile|captcha/i);
  assert.match(backend, /if \(purpose === "public-signing"\)[\s\S]*Verification service is temporarily unavailable/);
});

test("server retains six-digit generation, expiry, send limits, and attempt limits", () => {
  assert.match(otpEdge, /String\(100000 \+ \(value % 900000\)\)/);
  assert.match(otpEdge, /OTP_EXPIRY_MINUTES = 10/);
  assert.match(otpEdge, /OTP_MAX_SENDS = 4/);
  assert.match(otpEdge, /OTP_MAX_ATTEMPTS = 5/);
  assert.match(otpEdge, /codeHash = await sha256Hex\(`\$\{workspaceId\}:\$\{phone\}:\$\{code\}`\)/);
  assert.match(otpEdge, /verificationTokenHash = await sha256Hex\(verificationToken\)/);
  assert.match(otpEdge, /admin\.rpc\(\s*"voiceup_record_otp_failure"/);
  assert.match(migration, /set attempt_count = least\(attempt_count \+ 1, p_max_attempts\)/);
});

test("challenge verification is single-consumer under concurrent correct submissions", () => {
  const consume = otpEdge.slice(otpEdge.indexOf("const { data: consumedChallenge"));
  assert.match(consume, /\.is\("verified_at", null\)/);
  assert.match(consume, /\.eq\("attempt_count", challenge\.attempt_count\)/);
  assert.match(consume, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(consume, /if \(!consumedChallenge\)/);
  assert.match(consume, /otp_already_used/);
});

test("screen proof is recorded without claiming phone or email ownership", () => {
  assert.match(otpEdge, /verificationMethod: isScreenOtp \? "screen_otp" : "phone_otp"/);
  assert.match(otpEdge, /phoneOwnershipVerified: !isScreenOtp/);
  assert.match(migration, /'otpVerified', false/);
  assert.match(migration, /'verificationMethod', 'screen_otp'/);
  assert.match(migration, /'phoneOwnershipVerified', false/);
  assert.match(migration, /'emailOwnershipVerified', false/);
  assert.match(app, /otpVerified: result\.phoneOwnershipVerified === true/);
  assert.match(page, /Mobile number and email ownership were not verified/);
});

test("unbound screen proof cannot resume or modify an existing phone-bound supporter", () => {
  assert.match(migration, /select challenge\.\*[\s\S]*for update/);
  assert.match(migration, /select workspace\.data[\s\S]*for update/);
  assert.match(migration, /if v_bound_supporter_id is null then[\s\S]*if p_action <> 'submit_support'/);
  assert.match(migration, /if v_existing_signer is not null then[\s\S]*screen_verification_existing_supporter/);
  assert.match(migration, /'supporterId', v_result_supporter_id/);
  assert.match(migration, /'submitIdempotencyKey', p_idempotency_key/);
  assert.match(migration, /v_existing_signer ->> 'id' <> v_bound_supporter_id/);
  assert.match(app, /result\.verificationMethod !== "screen_otp"[\s\S]*resume_verified_supporter/);
});

test("post-sign reads and writes require the screen challenge to be bound to its new supporter", () => {
  assert.match(signingEdge, /admin\.rpc\("mutate_voiceup_public_participation_screen_safe"/);
  assert.match(signingEdge, /admin\.rpc\("voiceup_public_verification_context"/);
  assert.ok((signingEdge.match(/authorizeParticipationRequest\(/g) ?? []).length >= 3);
  assert.match(migration, /v_supporter_id is null[\s\S]*screen_verification_submit_required/);
  assert.match(migration, /signer ->> 'id' = v_supporter_id/);
});

test("migration is forward-only and adds no database structure", () => {
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/);
  assert.doesNotMatch(migration, /\b(create|alter|drop)\s+table\b|\bdrop\s+column\b/i);
  assert.match(migration, /revoke all on function public\.mutate_voiceup_public_participation_screen_safe[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.mutate_voiceup_public_participation_screen_safe[\s\S]*to service_role/);
});

test("screen verification remains a six-step journey with truthful multilingual copy", () => {
  for (const step of ["phone", "otp", "profile", "address", "review", "done"]) {
    assert.match(page, new RegExp(`${step}:`));
  }
  assert.match(page, /otp:\s*"Verify"/);
  assert.match(page, /otp:\s*"सत्यापन"/);
  assert.match(page, /otp:\s*"ଯାଞ୍ଚ"/);
  assert.match(page, /not ownership of the mobile number/);
  assert.match(page, /मोबाइल नंबर के स्वामित्व को नहीं/);
  assert.match(page, /ମୋବାଇଲ ନମ୍ବର ମାଲିକାନାକୁ ନୁହେଁ/);
});
