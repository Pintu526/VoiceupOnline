import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const coordinatorFile = "20260720020000_coordinator_network_v1.sql";
const firstAmbiguityFixFile = "20260720030000_coordinator_phone_hash_ambiguity.sql";
const cleanupFile = "20260720035000_coordinator_plpgsql_ambiguity_cleanup.sql";
const readMigration = (file) =>
  readFileSync(new URL(file, migrationsDirectory), "utf8");

const coordinatorSource = readMigration(coordinatorFile);
const firstAmbiguityFixSource = readMigration(firstAmbiguityFixFile);
const cleanupSource = readMigration(cleanupFile);

const functionNames = (source) => [
  ...source.matchAll(/create or replace function public\.([a-z0-9_]+)\(/gi)
].map((match) => match[1]);

const functionBody = (source, name) => {
  const declaration = `create or replace function public.${name}(`;
  const declarationStart = source.indexOf(declaration);
  assert.notEqual(declarationStart, -1, `Missing function ${name}`);
  const bodyStartMarker = source.indexOf("as $$", declarationStart);
  assert.notEqual(bodyStartMarker, -1, `Missing body for ${name}`);
  const bodyStart = bodyStartMarker + "as $$".length;
  const bodyEnd = source.indexOf("\n$$;", bodyStart);
  assert.notEqual(bodyEnd, -1, `Missing body terminator for ${name}`);
  return source.slice(bodyStart, bodyEnd).trim();
};

test("audit covers every function introduced by the frozen Coordinator migration", () => {
  assert.deepEqual(functionNames(coordinatorSource), [
    "voiceup_can_read_coordinator_network",
    "voiceup_can_manage_coordinator_network",
    "voiceup_coordinator_role_rank",
    "voiceup_coordinator_role_level",
    "voiceup_ensure_coordinator_geography",
    "voiceup_consume_coordinator_mobile_verification",
    "upsert_voiceup_coordinator",
    "set_voiceup_coordinator_status",
    "delete_voiceup_coordinator",
    "archive_voiceup_coordinator_geography",
    "get_voiceup_coordinator_network"
  ]);
});

test("the complete audit isolates both executable PL/pgSQL ambiguities", () => {
  assert.match(
    coordinatorSource,
    /phone_hash text := encode\(digest\([\s\S]*?challenge\.phone_hash = phone_hash/
  );
  assert.match(
    coordinatorSource,
    /coordinator_id uuid :=[\s\S]*?on conflict \(coordinator_id, campaign_id\)/
  );

  const declaredCollisionExamples = [
    "workspace_id",
    "campaign_id",
    "user_id",
    "geography_id",
    "status",
    "role",
    "id",
    "phone",
    "email",
    "reports_to"
  ];
  const coordinatorFunctionBodies = functionNames(coordinatorSource)
    .map((name) => functionBody(coordinatorSource, name))
    .join("\n");
  for (const identifier of declaredCollisionExamples) {
    assert.doesNotMatch(
      coordinatorFunctionBodies,
      new RegExp(
        `(?:^|\\n)\\s*(?:declare\\s+)?${identifier}\\s+(?:uuid|text|integer|boolean|timestamptz|jsonb|public\\.)`,
        "i"
      )
    );
  }
});

test("cleanup replaces exactly the two affected function bodies", () => {
  assert.deepEqual(functionNames(cleanupSource), [
    "voiceup_consume_coordinator_mobile_verification",
    "upsert_voiceup_coordinator"
  ]);
  assert.ok(coordinatorFile.localeCompare(firstAmbiguityFixFile) < 0);
  assert.ok(firstAmbiguityFixFile.localeCompare(cleanupFile) < 0);
});

test("phone_hash and coordinator_id locals are renamed without changing behavior", () => {
  const originalVerificationBody = functionBody(
    coordinatorSource,
    "voiceup_consume_coordinator_mobile_verification"
  );
  const cleanedVerificationBody = functionBody(
    cleanupSource,
    "voiceup_consume_coordinator_mobile_verification"
  );
  assert.equal(
    cleanedVerificationBody.replaceAll("expected_phone_hash", "phone_hash"),
    originalVerificationBody
  );

  const originalUpsertBody = functionBody(
    coordinatorSource,
    "upsert_voiceup_coordinator"
  ).replaceAll("upsert_coordinator.coordinator_id", "coordinator_id");
  const cleanedUpsertBody = functionBody(
    cleanupSource,
    "upsert_voiceup_coordinator"
  ).replaceAll("v_coordinator_id", "coordinator_id");
  assert.equal(cleanedUpsertBody, originalUpsertBody);
});

test("effective function definitions contain no conflicting local names", () => {
  const verificationBody = functionBody(
    cleanupSource,
    "voiceup_consume_coordinator_mobile_verification"
  );
  const upsertBody = functionBody(cleanupSource, "upsert_voiceup_coordinator");

  assert.match(verificationBody, /expected_phone_hash text := encode\(digest\(/);
  assert.match(verificationBody, /challenge\.phone_hash = expected_phone_hash/);
  assert.doesNotMatch(verificationBody, /(?:^|\n)\s*phone_hash\s+text\s*:=/);
  assert.doesNotMatch(verificationBody, /challenge\.phone_hash = phone_hash/);

  assert.match(upsertBody, /v_coordinator_id uuid :=/);
  assert.match(upsertBody, /link\.coordinator_id = v_coordinator_id/);
  assert.match(upsertBody, /on conflict \(coordinator_id, campaign_id\)/);
  assert.doesNotMatch(upsertBody, /(?:^|\n)\s*coordinator_id\s+uuid\s*:=/);
  assert.doesNotMatch(upsertBody, /upsert_coordinator\.coordinator_id/);
});

test("all historical ambiguous definitions have a later effective replacement", () => {
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const cleanupPosition = migrationFiles.indexOf(cleanupFile);
  assert.notEqual(cleanupPosition, -1);
  assert.equal(
    migrationFiles.slice(cleanupPosition + 1).some((file) =>
      /coordinator/i.test(readMigration(file))
    ),
    false
  );

  for (const functionName of [
    "voiceup_consume_coordinator_mobile_verification",
    "upsert_voiceup_coordinator"
  ]) {
    const definingFiles = migrationFiles.filter((file) =>
      readMigration(file).includes(`create or replace function public.${functionName}(`)
    );
    assert.equal(definingFiles.at(-1), cleanupFile);
  }
});

test("function security, pgcrypto visibility, and public contracts are preserved", () => {
  assert.equal([...cleanupSource.matchAll(/security definer/gi)].length, 2);
  assert.match(cleanupSource, /extension_info\.extname = 'pgcrypto'/);
  assert.match(cleanupSource, /to_regprocedure\(format\('%I\.digest\(text,text\)'/);
  assert.match(cleanupSource, /digest_return_type <> 'bytea'::regtype/);
  assert.match(
    cleanupSource,
    /alter function public\.voiceup_consume_coordinator_mobile_verification\(text,text,text\) set search_path = public, %I, pg_temp/
  );
  assert.match(
    cleanupSource,
    /alter function public\.upsert_voiceup_coordinator\(text,jsonb,jsonb,text\[\],text\) set search_path = public, %I, pg_temp/
  );
  assert.match(cleanupSource, /required function % is missing/);
  assert.match(cleanupSource, /must return %, found %/);
});

test("migration is transactional, idempotent, and non-destructive", () => {
  assert.match(cleanupSource, /^BEGIN;\s+/);
  assert.match(cleanupSource, /COMMIT;\s*$/);
  assert.equal([...cleanupSource.matchAll(/create or replace function/gi)].length, 2);
  assert.doesNotMatch(
    cleanupSource,
    /drop\s+(?:table|column|function)|truncate(?:\s+table)?\s+|delete\s+from/i
  );
});

test("all previous Coordinator migrations remain byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(coordinatorSource).digest("hex"),
    "6491976f7bed72938b2f164dc160a8a40388fc89b83157a8cca5dff97741fc43"
  );
  assert.equal(
    createHash("sha256").update(firstAmbiguityFixSource).digest("hex"),
    "d4a966aef5bd1dce77cda74c302b87342af57cddf49fc2793fe2aab0ba14bd6f"
  );
});
