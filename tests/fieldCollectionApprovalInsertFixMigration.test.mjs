import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const baselineFile = "20260720010000_field_collection_atomic_approval.sql";
const fixFile = "20260720040000_field_collection_approval_insert_fix.sql";
const postgresTestFile = "../supabase/tests/field_collection_approval_insert_fix_test.sql";
const readMigration = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");

const baselineSource = readMigration(baselineFile);
const fixSource = readMigration(fixFile);
const postgresTestSource = readFileSync(new URL(postgresTestFile, import.meta.url), "utf8");
const functionStart = "create or replace function public.approve_voiceup_scan_review_item(";
const nextFunction = "create or replace function public.record_voiceup_scan_batch_audit(";
const extractApprovalFunction = (source) => {
  const start = source.indexOf(functionStart);
  const next = source.indexOf(nextFunction, start);
  const end = next >= 0 ? next : source.indexOf("\n$$;", start) + 4;
  assert.ok(start >= 0, "approval function must exist");
  assert.ok(end > start, "approval function must have a complete body");
  return source.slice(start, end);
};

const brokenInsert = `  insert into public.voiceup_scan_supporters (
    supporter_id, workspace_id, campaign_id, review_item_id, source_row_fingerprint,
    v_supporter_identity_key, v_normalized_name, v_normalized_email, v_normalized_phone,
    raw_fields, supporter_payload
  ) values (
    v_supporter_id, p_workspace_id, p_campaign_id, p_review_item_id, p_source_row_fingerprint,
    supporter_identity_key, normalized_name, normalized_email, normalized_phone,
    coalesce(p_supporter_fields, '{}'::jsonb), v_supporter_payload
  );`;

const correctedInsert = `  insert into public.voiceup_scan_supporters (
    supporter_id, workspace_id, campaign_id, review_item_id, source_row_fingerprint,
    supporter_identity_key, normalized_name, normalized_email, normalized_phone,
    raw_fields, supporter_payload
  ) values (
    v_supporter_id, p_workspace_id, p_campaign_id, p_review_item_id, p_source_row_fingerprint,
    v_supporter_identity_key, v_normalized_name, v_normalized_email, v_normalized_phone,
    coalesce(p_supporter_fields, '{}'::jsonb), v_supporter_payload
  );`;

test("FC-01 is an ordered forward-only migration", () => {
  assert.ok(baselineFile.localeCompare(fixFile) < 0);
  assert.match(fixSource, /^begin;\s+/i);
  assert.match(fixSource, /commit;\s*$/i);
  assert.doesNotMatch(
    fixSource,
    /drop\s+(?:table|column|function)|truncate(?:\s+table)?\s+|delete\s+from/i
  );
});

test("FC-01 replaces only approve_voiceup_scan_review_item", () => {
  const replacedFunctions = [
    ...fixSource.matchAll(/create or replace function public\.([a-z0-9_]+)\(/gi)
  ].map((match) => match[1]);

  assert.deepEqual(replacedFunctions, ["approve_voiceup_scan_review_item"]);
  assert.doesNotMatch(fixSource, /create\s+(?:or\s+replace\s+)?trigger/i);
  assert.doesNotMatch(fixSource, /alter\s+table|create\s+table/i);
});

test("FC-01 changes only the supporter INSERT column/value mapping", () => {
  const baselineFunction = extractApprovalFunction(baselineSource).replace(/\r\n/g, "\n");
  const replacementFunction = extractApprovalFunction(fixSource).replace(/\r\n/g, "\n");

  assert.ok(baselineFunction.includes(brokenInsert));
  assert.ok(replacementFunction.includes(correctedInsert));
  assert.equal(
    replacementFunction.trim(),
    baselineFunction.replace(brokenInsert, correctedInsert).trim()
  );
});

test("replacement preserves signature, SECURITY DEFINER and hardened search path", () => {
  assert.match(
    fixSource,
    /approve_voiceup_scan_review_item\(\s*p_workspace_id text,\s*p_campaign_id text,\s*p_review_item_id text,\s*p_expected_version integer,\s*p_upload_fingerprint text,\s*p_source_reference text,\s*p_source_row_fingerprint text,\s*p_approval_key text,\s*p_review_payload jsonb,\s*p_supporter_fields jsonb,\s*p_consent jsonb\s*\)\s*returns jsonb\s*language plpgsql\s*security definer\s*set search_path = public, pg_temp/i
  );
});

test("replacement preserves locks, idempotency and compatibility-trigger handoff", () => {
  const replacementFunction = extractApprovalFunction(fixSource);

  assert.match(replacementFunction, /from public\.voiceup_workspaces\s+where id = p_workspace_id\s+for update/i);
  assert.match(replacementFunction, /from public\.voiceup_scan_review_items item[\s\S]*for update/i);
  assert.match(replacementFunction, /where ledger\.approval_key = p_approval_key/);
  assert.match(replacementFunction, /'code', 'approval_already_completed'/);
  assert.match(replacementFunction, /update public\.voiceup_workspaces\s+set data = data, updated_at = now\(\)/i);
});

test("CREATE OR REPLACE preserves existing ownership and grants", () => {
  assert.doesNotMatch(fixSource, /alter\s+function[\s\S]*owner\s+to/i);
  assert.doesNotMatch(fixSource, /\b(?:grant|revoke)\b/i);
  assert.doesNotMatch(fixSource, /drop\s+function/i);
});

test("the frozen Field Collection migration remains byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(baselineSource).digest("hex"),
    "40c9e30e5a82cc6bef10d47d5ed920ee0752427f5f9d24c5712b7acc590b11b4"
  );
});

test("PostgreSQL regression executes approval, mapping and idempotent retry assertions", () => {
  assert.match(postgresTestSource, /^begin;\s+/i);
  assert.match(postgresTestSource, /select plan\(17\)/i);
  assert.match(postgresTestSource, /public\.approve_voiceup_scan_review_item\(/i);
  assert.match(postgresTestSource, /supporter_identity_key/i);
  assert.match(postgresTestSource, /normalized_name/i);
  assert.match(postgresTestSource, /normalized_email/i);
  assert.match(postgresTestSource, /normalized_phone/i);
  assert.match(postgresTestSource, /approval_already_completed/i);
  assert.match(postgresTestSource, /select \* from finish\(\)/i);
  assert.match(postgresTestSource, /rollback;\s*$/i);
});
