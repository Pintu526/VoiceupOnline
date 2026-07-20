import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const coordinatorFile = "20260720020000_coordinator_network_v1.sql";
const fixFile = "20260720025000_coordinator_pgcrypto_search_path.sql";
const readMigration = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");

const coordinatorSource = readMigration(coordinatorFile);
const fixSource = readMigration(fixFile);
const edgeSharedSource = readFileSync(
  new URL("../supabase/functions/_shared/voiceup.ts", import.meta.url),
  "utf8"
);

test("Coordinator pgcrypto fix sorts after the frozen Coordinator migration", () => {
  assert.ok(coordinatorFile.localeCompare(fixFile) < 0);
});

test("all three PostgreSQL digest calls are confined to the two corrected Coordinator functions", () => {
  assert.equal([...coordinatorSource.matchAll(/\bdigest\s*\(/gi)].length, 3);
  assert.match(
    coordinatorSource,
    /function public\.voiceup_consume_coordinator_mobile_verification[\s\S]*?digest\([\s\S]*?digest\(/i
  );
  assert.match(
    coordinatorSource,
    /function public\.upsert_voiceup_coordinator[\s\S]*?digest\(/i
  );
  assert.match(edgeSharedSource, /crypto\.subtle\.digest\("SHA-256"/);
});

test("migration discovers pgcrypto's installed schema and validates digest(text,text)", () => {
  assert.match(fixSource, /extension_info\.extname = 'pgcrypto'/);
  assert.match(fixSource, /to_regprocedure\(format\('%I\.digest\(text,text\)'/);
  assert.match(fixSource, /digest_return_type <> 'bytea'::regtype/);
  assert.match(fixSource, /raise exception 'Coordinator pgcrypto prerequisite failed:/);
});

test("only the two digest-consuming Coordinator function search paths are changed", () => {
  const alteredFunctions = [
    ...fixSource.matchAll(/alter function public\.([a-z0-9_]+)\(([^)]*)\) set search_path/gi)
  ].map((match) => `${match[1]}(${match[2]})`);

  assert.deepEqual(alteredFunctions, [
    "voiceup_consume_coordinator_mobile_verification(text,text,text)",
    "upsert_voiceup_coordinator(text,jsonb,jsonb,text[],text)"
  ]);
  assert.equal([...fixSource.matchAll(/pgcrypto_schema/g)].length > 1, true);
});

test("affected RPC signatures and return types fail closed when incompatible", () => {
  assert.ok(
    fixSource.includes(
      "'public.voiceup_consume_coordinator_mobile_verification(text,text,text)',\n        'boolean'"
    )
  );
  assert.ok(
    fixSource.includes(
      "'public.upsert_voiceup_coordinator(text,jsonb,jsonb,text[],text)',\n        'jsonb'"
    )
  );
  assert.match(fixSource, /required function % is missing/);
  assert.match(fixSource, /must return %, found %/);
});

test("migration is transactional, forward-only, and does not replace function bodies", () => {
  assert.match(fixSource, /^BEGIN;\s+/);
  assert.match(fixSource, /COMMIT;\s*$/);
  assert.doesNotMatch(
    fixSource,
    /drop\s+|truncate(?:\s+table)?\s+|delete\s+from|create\s+or\s+replace|create\s+table/i
  );
});

test("frozen Coordinator migration remains byte-for-byte unchanged", () => {
  assert.equal(
    createHash("sha256").update(coordinatorSource).digest("hex"),
    "6491976f7bed72938b2f164dc160a8a40388fc89b83157a8cca5dff97741fc43"
  );
});
