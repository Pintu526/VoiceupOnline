import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const prerequisiteFile = "20260720015000_voiceup_otp_challenges_prerequisite.sql";
const fieldCollectionFile = "20260720010000_field_collection_atomic_approval.sql";
const coordinatorFile = "20260720020000_coordinator_network_v1.sql";
const prerequisiteSource = readFileSync(
  new URL(`../supabase/migrations/${prerequisiteFile}`, import.meta.url),
  "utf8"
);
const coordinatorSource = readFileSync(
  new URL(`../supabase/migrations/${coordinatorFile}`, import.meta.url),
  "utf8"
);
const otpFunctionSource = readFileSync(
  new URL("../supabase/functions/voiceup-otp/index.ts", import.meta.url),
  "utf8"
);

test("OTP prerequisite migration sorts between Field Collection and Coordinator Network", () => {
  assert.ok(fieldCollectionFile.localeCompare(prerequisiteFile) < 0);
  assert.ok(prerequisiteFile.localeCompare(coordinatorFile) < 0);
});

test("OTP prerequisite migration is transactional and provisions pgcrypto", () => {
  assert.match(prerequisiteSource, /^BEGIN;\s+/);
  assert.match(prerequisiteSource, /create extension if not exists pgcrypto;/i);
  assert.match(prerequisiteSource, /COMMIT;\s*$/);
});

test("OTP prerequisite fails closed when authoritative workspace dependencies are absent", () => {
  for (const dependency of [
    "public.voiceup_workspaces",
    "public.voiceup_workspace_members",
    "public.voiceup_is_platform_admin()",
    "public.voiceup_normalize_indian_phone(text)",
    "public.voiceup_normalize_email(text)",
    "public.voiceup_normalize_person_name(text)"
  ]) {
    assert.match(prerequisiteSource, new RegExp(dependency.replace(/[().]/g, "\\$&")));
  }
  for (const column of ["id", "data", "workspace_id", "user_id", "role", "active"]) {
    assert.match(prerequisiteSource, new RegExp(`'${column}'`));
  }
  assert.match(prerequisiteSource, /raise exception 'OTP prerequisite failed:/);
  assert.match(prerequisiteSource, /information_schema\.columns/);
});

test("OTP table contract includes every Edge Function and coordinator RPC column", () => {
  assert.match(otpFunctionSource, /\.from\("voiceup_otp_challenges"\)/);
  assert.match(coordinatorSource, /from public\.voiceup_otp_challenges challenge/);
  for (const column of [
    "id",
    "workspace_id",
    "phone_hash",
    "code_hash",
    "purpose",
    "metadata",
    "sent_count",
    "attempt_count",
    "expires_at",
    "verified_at",
    "created_at"
  ]) {
    assert.match(prerequisiteSource, new RegExp(`\\b${column}\\b`));
  }
  assert.match(prerequisiteSource, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(prerequisiteSource, /metadata jsonb not null default '\{\}'::jsonb/);
  assert.match(prerequisiteSource, /sent_count integer not null default 1/);
  assert.match(prerequisiteSource, /attempt_count integer not null default 0/);
});

test("coordinator-mobile is permitted with the existing public-signing and onboarding purposes", () => {
  assert.match(
    prerequisiteSource,
    /check \(purpose in \('public-signing', 'onboarding', 'coordinator-mobile'\)\)/
  );
});

test("existing incompatible OTP schemas abort without destructive repair", () => {
  assert.match(prerequisiteSource, /if to_regclass\('public\.voiceup_otp_challenges'\) is null then\s+return;/);
  assert.match(prerequisiteSource, /has incompatible type or nullability/);
  assert.match(prerequisiteSource, /contains unsupported purpose values/);
  assert.match(prerequisiteSource, /lookup_idx has an incompatible definition/);
  assert.doesNotMatch(
    prerequisiteSource,
    /drop\s+table|truncate(?:\s+table)?|delete\s+from|drop\s+column|create\s+or\s+replace\s+table/i
  );
});

test("OTP table keeps browser writes disabled and service-role access explicit", () => {
  assert.match(prerequisiteSource, /alter table public\.voiceup_otp_challenges enable row level security/);
  assert.match(prerequisiteSource, /revoke all on table public\.voiceup_otp_challenges from anon, authenticated/);
  assert.match(prerequisiteSource, /grant all on table public\.voiceup_otp_challenges to service_role/);
  assert.doesNotMatch(prerequisiteSource, /grant\s+(insert|update|delete|all).*\s+to\s+(anon|authenticated)/i);
});

test("frozen Coordinator Network migration remains byte-for-byte unchanged", () => {
  const hash = createHash("sha256").update(coordinatorSource).digest("hex");
  assert.equal(hash, "6491976f7bed72938b2f164dc160a8a40388fc89b83157a8cca5dff97741fc43");
});
