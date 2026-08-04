import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseResourceLocationCsv,
  resourceLocationCsvHeaders,
  resourceLocationTemplateCsv
} from "../src/businessOs/masterData/resourceLocationCsv.ts";

const edge = readFileSync(new URL("../supabase/functions/voiceup-campaign-locations/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260802030000_resource_location_import_v1.sql", import.meta.url), "utf8");

test("template has approved columns, samples, and formula-safe values", () => {
  assert.equal(resourceLocationCsvHeaders.join(","), "country,state,district,block,panchayat,village,postalCode");
  assert.equal(resourceLocationTemplateCsv().split(/\r?\n/).length, 3);
  assert.match(resourceLocationTemplateCsv(), /India,Odisha/);
});

test("CSV parser rejects malformed input, unsupported headers, and limits", () => {
  assert.equal(parseResourceLocationCsv("country,state\nIndia").ok, false);
  assert.deepEqual(parseResourceLocationCsv("country,state,district,block,panchayat,village,postalCode\nIndia,Odisha,,,,,").ok, true);
  assert.equal(parseResourceLocationCsv("state,country,district,block,panchayat,village,postalCode\nOdisha,India,,,,,").code, "unsupported_headers");
  assert.equal(parseResourceLocationCsv("x", 2 * 1024 * 1024 + 1).code, "file_too_large");
});

test("server import remains scoped, validates first, and commits atomically", () => {
  for (const name of ["validate_campaign_location_import", "commit_campaign_location_import", "read_campaign_location_import"]) assert.match(edge, new RegExp(`request\\.action === "${name}"`));
  assert.match(migration, /create table public\.resource_location_imports/);
  assert.match(migration, /create table public\.resource_location_import_rows/);
  assert.match(migration, /status in \('validating', 'validation_failed', 'ready', 'importing', 'completed', 'failed'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /master_conflict/);
  assert.doesNotMatch(migration.slice(migration.indexOf("validate_resource_location_import"), migration.indexOf("commit_resource_location_import")), /insert into public\.vboss_resource_location_paths/);
});

test("large import adds chunked session support without replacing legacy route", () => {
  const largeMigration = readFileSync(new URL("../supabase/migrations/20260804090000_resource_location_large_import.sql", import.meta.url), "utf8");
  assert.match(largeMigration, /begin_resource_location_large_import/);
  assert.match(largeMigration, /validate_resource_location_import_chunk/);
  assert.match(largeMigration, /commit_resource_location_import_chunk/);
  assert.match(edge, /begin_campaign_location_large_import/);
  assert.match(edge, /validate_campaign_location_import_chunk/);
  assert.match(edge, /commit_campaign_location_import_chunk/);
});
