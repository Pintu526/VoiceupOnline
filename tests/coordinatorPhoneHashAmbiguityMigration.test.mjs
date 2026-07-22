import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const coordinatorFile = "20260720020000_coordinator_network_v1.sql";
const pgcryptoFixFile = "20260720025000_coordinator_pgcrypto_search_path.sql";
const ambiguityFixFile = "20260720030000_coordinator_phone_hash_ambiguity.sql";
const readMigration = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");

const coordinatorSource = readMigration(coordinatorFile);
const ambiguityFixSource = readMigration(ambiguityFixFile);

test("Coordinator phone hash fix is a forward migration after the pgcrypto fix", () => {
  assert.ok(coordinatorFile.localeCompare(pgcryptoFixFile) < 0);
  assert.ok(pgcryptoFixFile.localeCompare(ambiguityFixFile) < 0);
});

test("frozen SQL contains the exact ambiguous phone_hash comparison", () => {
  assert.match(coordinatorSource, /phone_hash text := encode\(digest\(/);
  assert.match(coordinatorSource, /and challenge\.phone_hash = phone_hash/);
});

test("replacement function uses an unambiguous local identifier", () => {
  assert.match(ambiguityFixSource, /expected_phone_hash text := encode\(digest\(/);
  assert.match(
    ambiguityFixSource,
    /and challenge\.phone_hash = expected_phone_hash/
  );
  assert.doesNotMatch(ambiguityFixSource, /and challenge\.phone_hash = phone_hash/);
});

test("migration replaces only the verification-consumption function contract", () => {
  const replacedFunctions = [
    ...ambiguityFixSource.matchAll(/create or replace function public\.([a-z0-9_]+)\(/gi)
  ].map((match) => match[1]);

  assert.deepEqual(replacedFunctions, [
    "voiceup_consume_coordinator_mobile_verification"
  ]);
  assert.match(
    ambiguityFixSource,
    /voiceup_consume_coordinator_mobile_verification\(\s*target_workspace_id text,\s*normalized_phone text,\s*verification_token text\s*\)/
  );
  assert.match(ambiguityFixSource, /returns boolean\s+language plpgsql\s+security definer/);
  assert.doesNotMatch(ambiguityFixSource, /create or replace function public\.upsert_voiceup_coordinator/i);
});

test("replacement preserves the installed pgcrypto schema and fails closed", () => {
  assert.match(ambiguityFixSource, /extension_info\.extname = 'pgcrypto'/);
  assert.match(ambiguityFixSource, /to_regprocedure\(format\('%I\.digest\(text,text\)'/);
  assert.match(ambiguityFixSource, /digest_return_type <> 'bytea'::regtype/);
  assert.match(
    ambiguityFixSource,
    /to_regprocedure\(\s*'public\.voiceup_consume_coordinator_mobile_verification\(text,text,text\)'/
  );
  assert.match(ambiguityFixSource, /verification_return_type <> 'boolean'::regtype/);
  assert.match(ambiguityFixSource, /set search_path = public, %I, pg_temp/);
});

test("migration is transactional, idempotent, and non-destructive", () => {
  assert.match(ambiguityFixSource, /^BEGIN;\s+/);
  assert.match(ambiguityFixSource, /COMMIT;\s*$/);
  assert.match(ambiguityFixSource, /create or replace function/i);
  assert.doesNotMatch(
    ambiguityFixSource,
    /drop\s+(?:table|column|function)|truncate(?:\s+table)?\s+|delete\s+from/i
  );
});

test("frozen Coordinator migration remains byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(coordinatorSource).digest("hex"),
    "6491976f7bed72938b2f164dc160a8a40388fc89b83157a8cca5dff97741fc43"
  );
});
