import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const migration = read("../supabase/migrations/20261030010000_participation_email_receipts.sql");
const activation = read("../supabase/activation/development/20261030010000_participation_email_receipts.DEVELOPMENT.sql");
const deploy = read("../supabase/activation/development/deploy-voiceup-customer-journey.DEVELOPMENT.ps1");
const worker = read("../supabase/functions/voiceup-participation-receipts/index.ts");
const signing = read("../supabase/functions/voiceup-public-signing/index.ts");

test("activation embeds the reviewed migration body without changing migration history", () => {
  const embedded = activation
    .split("-- BEGIN reviewed migration body (source hash above)\n")[1]
    .split("\n-- END reviewed migration body")[0]
    .trim();
  const expected = migration
    .replace(/^begin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "")
    .trim();
  assert.equal(embedded, expected);
  assert.match(activation, /This file is intentionally outside supabase\/migrations/);
  assert.doesNotMatch(activation, /schema_migrations|migration history[^.]*insert/iu);
});

test("SQL activation is atomically fenced to Development and verifies every queue boundary", () => {
  assert.match(activation, /Target project: ravweavcfrpiykfgtmbf/);
  assert.match(activation, /Prohibited project: seseeabxmnsrhghthemd/);
  assert.match(activation, /voiceup_development_project_ref/);
  assert.match(activation, /configured_project_ref is distinct from 'ravweavcfrpiykfgtmbf'/);
  assert.equal((activation.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((activation.match(/^commit;$/gm) ?? []).length, 1);
  assert.match(activation, /enable row level security/i);
  assert.match(activation, /revoke all on table[\s\S]*from public, anon, authenticated/i);
  assert.match(activation, /has_function_privilege\('service_role'/);
  assert.match(activation, /has_function_privilege\('anon'/);
  assert.match(activation, /has_function_privilege\('authenticated'/);
  assert.match(activation, /voiceup:service_role_required/);
  assert.match(activation, /UNIQUE \(workspace_id, campaign_id, supporter_id\)/);
  assert.match(activation, /UNIQUE \(workspace_id, signing_idempotency_key\)/);
  assert.match(activation, /v_signer ->> ''email''/);
  assert.match(activation, /campaign\.value ->> ''status'' = ''Published''/);
  assert.match(activation, /'PASS'::text as activation_status/);
});

test("retry schedule uses one Development URL and only a dedicated trigger secret", () => {
  assert.match(activation, /cron\.schedule\(/);
  assert.match(activation, /'voiceup-development-participation-email-receipts'/);
  assert.match(activation, /'\*\/5 \* \* \* \*'/);
  assert.match(activation, /https:\/\/ravweavcfrpiykfgtmbf\.supabase\.co\/functions\/v1\/voiceup-participation-receipts/);
  assert.match(activation, /voiceup_receipt_worker_secret/);
  assert.match(activation, /'Authorization', 'Bearer '/);
  assert.doesNotMatch(activation, /SUPABASE_SERVICE_ROLE_KEY|service_role_key[^']*'\s*\|\|/i);
  assert.match(activation, /another active receipt-worker schedule already exists/);
  assert.match(activation, /exactly one named retry schedule is required/);
});

test("deployment script refuses non-Development targets and preserves per-function JWT policy", () => {
  assert.match(deploy, /\$DevelopmentProjectRef = "ravweavcfrpiykfgtmbf"/);
  assert.match(deploy, /\$ProhibitedProductionProjectRef = "seseeabxmnsrhghthemd"/);
  assert.match(deploy, /if \(\$LinkedProjectRef -eq \$ProhibitedProductionProjectRef\)/);
  assert.match(deploy, /if \(\$LinkedProjectRef -ne \$DevelopmentProjectRef\)/);
  assert.match(deploy, /\[switch\]\$Execute/);
  assert.match(deploy, /if \(-not \$Execute\)/);
  assert.equal((deploy.match(/--no-verify-jwt/g) ?? []).length, 1);
  assert.match(deploy, /functions deploy voiceup-participation-receipts[\s\S]*--no-verify-jwt/);
  assert.match(deploy, /functions deploy voiceup-public-signing[\s\S]*--use-api/);
  assert.match(deploy, /\$ReceiptWorker\.verify_jwt -ne \$false/);
  assert.match(deploy, /\$PublicSigning\.verify_jwt -ne \$true/);
  assert.doesNotMatch(deploy, /--project-ref\s+\$ProhibitedProductionProjectRef/);
});

test("all exact custom secrets are gated without embedding a credential value", () => {
  for (const name of [
    "RESEND_API_KEY",
    "VOICEUP_RECEIPT_FROM_EMAIL",
    "VOICEUP_RECEIPT_FROM_NAME",
    "VOICEUP_PUBLIC_ORIGIN",
    "VOICEUP_RECEIPT_WORKER_SECRET"
  ]) {
    assert.match(deploy, new RegExp(`"${name}"`));
  }
  assert.doesNotMatch(deploy, /xkeysib-|service_role\s*=|Bearer\s+[A-Za-z0-9._-]{32,}/i);
  assert.doesNotMatch(deploy, /BREVO_API_KEY/);
});

test("worker trigger authentication is constant-time and separate from database service authority", () => {
  assert.match(worker, /Deno\.env\.get\("VOICEUP_RECEIPT_WORKER_SECRET"\)/);
  assert.match(worker, /expected\.length < 32/);
  assert.match(worker, /difference \|= left\[index\] \^ right\[index\]/);
  assert.doesNotMatch(worker, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(signing, /Deno\.env\.get\("VOICEUP_RECEIPT_WORKER_SECRET"\)/);
  assert.match(worker, /"Idempotency-Key": job\.receiptId/);
  assert.match(worker, /https:\/\/api\.resend\.com\/emails/);
  assert.match(worker, /dev-mail\.voiceup\.live/);
  assert.doesNotMatch(worker, /BREVO_API_KEY|api\.brevo\.com/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /attempt_count < 5/i);
});
