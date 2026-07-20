import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const prerequisiteFile = "20260720005000_platform_admin_prerequisite.sql";
const fieldCollectionFile = "20260720010000_field_collection_atomic_approval.sql";
const otpFile = "20260720015000_voiceup_otp_challenges_prerequisite.sql";
const coordinatorFile = "20260720020000_coordinator_network_v1.sql";

const readMigration = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");

const prerequisiteSource = readMigration(prerequisiteFile);
const fieldCollectionSource = readMigration(fieldCollectionFile);
const otpSource = readMigration(otpFile);
const coordinatorSource = readMigration(coordinatorFile);
const schemaSource = readFileSync(new URL("../supabase-schema.sql", import.meta.url), "utf8");

const normalizeSql = (source) => source.trim().replace(/\s+/g, " ").toLowerCase();

test("platform-admin prerequisite sorts before Field Collection and the downstream chain", () => {
  assert.ok(prerequisiteFile.localeCompare(fieldCollectionFile) < 0);
  assert.ok(fieldCollectionFile.localeCompare(otpFile) < 0);
  assert.ok(otpFile.localeCompare(coordinatorFile) < 0);
});

test("platform-admin prerequisite is transactional and non-destructive", () => {
  assert.match(prerequisiteSource, /^BEGIN;\s+/);
  assert.match(prerequisiteSource, /COMMIT;\s*$/);
  assert.doesNotMatch(
    prerequisiteSource,
    /drop\s+|truncate(?:\s+table)?\s+|delete\s+from|create\s+or\s+replace\s+table/i
  );
});

test("created platform-admin helper preserves the exact schema authorization body", () => {
  const schemaBody = schemaSource.match(
    /create or replace function public\.voiceup_is_platform_admin\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i
  )?.[1];
  const migrationBody = prerequisiteSource.match(
    /create function public\.voiceup_is_platform_admin\(\)[\s\S]*?as \$function\$([\s\S]*?)\$function\$;/i
  )?.[1];

  assert.ok(schemaBody);
  assert.ok(migrationBody);
  assert.equal(normalizeSql(migrationBody), normalizeSql(schemaBody));
  assert.match(
    prerequisiteSource,
    /create function public\.voiceup_is_platform_admin\(\)\s+returns boolean\s+language sql\s+security definer\s+set search_path = public\s+stable/i
  );
  assert.doesNotMatch(prerequisiteSource, /create or replace function public\.voiceup_is_platform_admin/i);
});

test("every external object and compatible column type used by the helper is asserted", () => {
  for (const dependency of [
    "public",
    "auth",
    "organization_members",
    "voiceup_workspace_members",
    "auth.uid()"
  ]) {
    assert.match(prerequisiteSource, new RegExp(dependency.replace(/[().]/g, "\\$&")));
  }
  for (const contract of [
    "('organization_members', 'user_id', 'uuid')",
    "('organization_members', 'role', 'text')",
    "('voiceup_workspace_members', 'user_id', 'uuid')",
    "('voiceup_workspace_members', 'role', 'text')"
  ]) {
    assert.ok(prerequisiteSource.includes(contract));
  }
  assert.match(prerequisiteSource, /auth_uid_return_type <> 'uuid'::regtype/);
  assert.match(prerequisiteSource, /raise exception 'Platform admin prerequisite failed:/);
});

test("an incompatible existing function fails closed instead of being replaced", () => {
  assert.match(
    prerequisiteSource,
    /function_oid oid := to_regprocedure\('public\.voiceup_is_platform_admin\(\)'\)/
  );
  assert.match(prerequisiteSource, /function_return_type <> 'boolean'::regtype/);
  assert.match(prerequisiteSource, /incompatible signature or return type/);
  assert.match(prerequisiteSource, /does not match the repository authorization contract/);
  assert.match(
    prerequisiteSource,
    /if to_regprocedure\('public\.voiceup_is_platform_admin\(\)'\) is null then\s+execute/i
  );
});

test("Field Collection consumes the helper supplied by the ordered prerequisite", () => {
  assert.match(fieldCollectionSource, /public\.voiceup_is_platform_admin\(\)/);
  assert.match(prerequisiteSource, /create function public\.voiceup_is_platform_admin\(\)/);
});

test("all frozen pending migrations remain byte-for-byte unchanged", () => {
  const expectedHashes = new Map([
    [fieldCollectionSource, "40c9e30e5a82cc6bef10d47d5ed920ee0752427f5f9d24c5712b7acc590b11b4"],
    [otpSource, "c2eb120507eca80a78f47fbeb466edac5932aaa1cf0e755adc1648c73133725e"],
    [coordinatorSource, "6491976f7bed72938b2f164dc160a8a40388fc89b83157a8cca5dff97741fc43"]
  ]);

  for (const [source, expectedHash] of expectedHashes) {
    assert.equal(createHash("sha256").update(source).digest("hex"), expectedHash);
  }
});
