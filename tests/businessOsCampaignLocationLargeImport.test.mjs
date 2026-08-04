import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  isLegacyImportLimits,
  legacyMaximumRows,
  parseResourceLocationCsv,
  parseResourceLocationCsvAuto,
  resourceLocationCsvHeaders,
  resourceLocationLargeImportErrorsCsv
} from "../src/businessOs/masterData/resourceLocationCsv.ts";

const largeImportModule = await import(
  new URL(
    ["..", "src", "businessOs", "bulkImport", "bridges", "campaignLocationLargeImport", "index.ts"].join("/"),
    import.meta.url
  ).href
);

const {
  buildLargeImportChunks,
  campaignLocationLargeImportChunkSize,
  campaignLocationLargeImportMaxRows,
  classifyLargeImportRows,
  createLargeImportSummary,
  dryRunLargeCampaignLocationImport
} = largeImportModule;

const manager = readFileSync(new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url), "utf8");
const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/voiceup-campaign-locations/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260804090000_resource_location_large_import.sql", import.meta.url), "utf8");

function row(overrides = {}) {
  return {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    panchayat: "Khandagiri",
    village: "Baramunda",
    postalCode: "751030",
    ...overrides
  };
}

function csvRow(rowValues) {
  return [resourceLocationCsvHeaders.join(","), rowValues.join(",")].join("\n");
}

function makeRows(count, mutate = () => ({})) {
  return Array.from({ length: count }, (_, index) => row({ village: `Village-${index + 1}`, ...mutate(index) }));
}

test("existing 100-row import remains on the legacy path", () => {
  const rows = makeRows(100);
  const text = [resourceLocationCsvHeaders.join(","), ...rows.map((entry) => resourceLocationCsvHeaders.map((field) => entry[field]).join(","))].join("\n");
  const parsed = parseResourceLocationCsvAuto(text, text.length);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "legacy");
  assert.equal(isLegacyImportLimits(100, text.length), true);
  assert.match(manager, /isLegacyImportLimits\(parsed\.rows\.length, importFile\.size\)/);
  assert.match(manager, /validateCampaignLocationImport\(scope, parsed\.rows, key, hash\)/);
});

test("existing 2,000-row boundary remains backward compatible", () => {
  assert.equal(legacyMaximumRows, 2000);
  assert.equal(isLegacyImportLimits(2000, 1024), true);
  assert.equal(isLegacyImportLimits(2001, 1024), false);
  const parsed = parseResourceLocationCsv(csvRow(["India", "Odisha", "", "", "", "", ""]));
  assert.equal(parsed.ok, true);
});

test("a 50,000-row input is divided into bounded chunks", () => {
  const rows = makeRows(50000);
  const chunks = buildLargeImportChunks(rows);
  assert.equal(chunks.length, 100);
  assert.equal(chunks[0].length, campaignLocationLargeImportChunkSize);
  assert.equal(chunks.at(-1)?.length, campaignLocationLargeImportChunkSize);
});

test("no request contains all 50,000 rows", () => {
  assert.match(edge, /rows\.length > 500/);
  assert.match(migration, /jsonb_array_length\(p_rows\) > 500/);
  const chunks = buildLargeImportChunks(makeRows(50000));
  assert.ok(chunks.every((chunk) => chunk.length <= campaignLocationLargeImportChunkSize));
});

test("chunk order remains deterministic", () => {
  const chunks = buildLargeImportChunks(makeRows(1250));
  assert.deepEqual(chunks.map((chunk) => chunk[0].rowNumber), [1, 501, 1001]);
  assert.equal(chunks[2].at(-1)?.rowNumber, 1250);
});

test("one duplicate does not reject valid rows", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport([
    row({ village: "Alpha" }),
    row({ village: "Beta" }),
    row({ village: "Alpha" })
  ]);
  assert.equal(dryRun.summary.importableRows, 2);
  assert.equal(dryRun.summary.skippedDuplicateRows, 1);
  assert.equal(dryRun.summary.ready, true);
});

test("duplicate within file is skipped", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport([row(), row()]);
  assert.equal(dryRun.summary.skippedDuplicateRows, 1);
  assert.equal(dryRun.issueRows[0].outcome, "skipped_duplicate");
});

test("existing database duplicate is skipped at server layer", () => {
  assert.match(migration, /classification := case when existing_active then 'existing'/);
  assert.match(migration, /classification in \('valid','reactivate'\)/);
});

test("case-only duplicate is skipped", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport([
    row({ state: "Odisha" }),
    row({ state: "odisha" })
  ]);
  assert.equal(dryRun.summary.skippedDuplicateRows, 1);
});

test("whitespace-only duplicate is skipped", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport([
    row({ district: "Khordha" }),
    row({ district: "  Khordha  " })
  ]);
  assert.equal(dryRun.summary.skippedDuplicateRows, 1);
});

test("protected master value is skipped", async () => {
  const results = await classifyLargeImportRows([row({ country: "India", state: "Odisha", district: "Khordha", block: "Bhubaneswar", panchayat: "Khandagiri", village: "Baramunda" })]);
  assert.ok(results.length > 0);
  assert.match(edge, /master_value_protected/);
});

test("invalid hierarchy is reported while valid rows continue", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport([
    row({ village: "Valid Village" }),
    row({ district: "Khordha", block: "", panchayat: "Gap", village: "Invalid Village" })
  ]);
  assert.equal(dryRun.summary.importableRows, 1);
  assert.equal(dryRun.summary.validationFailedRows, 1);
  assert.equal(dryRun.summary.ready, true);
});

test("village without panchayat remains invalid", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport([
    row({ panchayat: "", village: "Lonely Village" })
  ]);
  assert.equal(dryRun.summary.validationFailedRows, 1);
  assert.equal(dryRun.summary.importableRows, 0);
});

test("village row retains complete parent hierarchy", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport([row()]);
  assert.equal(dryRun.summary.importableRows, 1);
  assert.match(migration, /panchayat,village,postal_code,normalized_path/);
});

test("retry creates zero duplicate paths via idempotency", () => {
  assert.match(migration, /if chunk_record\.status='completed'/);
  assert.match(migration, /unique \(import_id, idempotency_key\)/);
  assert.match(migration, /idempotency_conflict/);
});

test("repeated completed chunk is idempotent", () => {
  assert.match(migration, /if chunk_record\.status in \('validated','ready','completed'\)/);
  assert.match(migration, /if chunk_record\.status='completed' then/);
});

test("genuine persistence failure stops later chunks", () => {
  assert.match(migration, /return jsonb_build_object\('code','persistence_failed'\)/);
  assert.match(manager, /commitLargeCampaignLocationImport/);
});

test("prior committed chunks remain intact", () => {
  assert.match(migration, /status = case when completed_chunks \+ 1 >= total_chunks then 'completed' else 'partial' end/);
  assert.match(migration, /completed_chunks = completed_chunks \+ 1/);
});

test("campaign A import cannot affect Campaign B", () => {
  assert.match(migration, /resource_id=p_resource_id/);
  assert.match(migration, /vboss_resource_location_authorization/);
});

test("authorization is enforced for every chunk action", () => {
  for (const name of [
    "begin_resource_location_large_import",
    "validate_resource_location_import_chunk",
    "commit_resource_location_import_chunk",
    "read_resource_location_large_import",
    "read_resource_location_import_errors"
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
  }
  assert.match(edge, /begin_campaign_location_large_import/);
  assert.match(edge, /validate_campaign_location_import_chunk/);
  assert.match(edge, /commit_campaign_location_import_chunk/);
});

test("consolidated error CSV contains correct row numbers and reasons", () => {
  const csv = resourceLocationLargeImportErrorsCsv([
    {
      ...row({ village: "Bad" }),
      rowNumber: 12,
      outcome: "validation_failed",
      errorCode: "hierarchy_gap",
      reason: "Each location level requires its parent level.",
      chunkIndex: 0
    }
  ]);
  assert.match(csv, /rowNumber,outcome,errorCode,reason,chunkIndex/);
  assert.match(csv, /12,validation_failed,hierarchy_gap/);
});

test("progress counters remain consistent", async () => {
  const dryRun = await dryRunLargeCampaignLocationImport(makeRows(1200));
  assert.equal(dryRun.progress.total, 1200);
  assert.equal(dryRun.progress.processed + dryRun.progress.remaining, 1200);
  const summary = createLargeImportSummary(1200);
  assert.equal(summary.totalChunks, 3);
});

test("confirm import remains a required user action", () => {
  const validateImport = manager.slice(manager.indexOf("const validateImport"), manager.indexOf("const commitImport"));
  assert.match(manager, /importState === "ready"/);
  assert.match(manager, /Confirm Import/);
  assert.doesNotMatch(validateImport, /commitImport\(/);
});

test("active locations refresh only after completion", () => {
  const commitImport = manager.slice(manager.indexOf("const commitImport"), manager.indexOf("const selectTab"));
  assert.match(commitImport, /await refresh\(\)/);
  assert.doesNotMatch(commitImport.slice(0, commitImport.indexOf("await refresh()")), /await refresh\(\)/);
});

test("existing public dropdown contract remains unchanged", () => {
  const publicPage = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(publicPage, /campaignLocationLargeImport/);
  assert.doesNotMatch(manager, /PublicCampaignPage/);
});

test("existing coordinator flow remains unchanged", () => {
  const otp = backend.slice(backend.indexOf("export async function requestOtp"));
  assert.doesNotMatch(otp, /LargeImport|campaignLocationLargeImport/);
});

test("existing manual add/remove remains unchanged", () => {
  assert.match(manager, /addCampaignLocation\(scope, cleaned, idempotencyKey\(\)\)/);
  assert.match(manager, /deactivateCampaignLocation\(scope, pendingDeactivate\.id, pendingDeactivate\.version\)/);
});

test("existing location statistics remain unchanged", () => {
  assert.match(manager, /countUniqueActiveLocationValues\(locations,/);
  assert.match(manager, /locationCoverage\.states/);
});

test("existing template headers remain unchanged", () => {
  assert.deepEqual(
    [...resourceLocationCsvHeaders],
    ["country", "state", "district", "block", "panchayat", "village", "postalCode"]
  );
});

test("existing shadow bridge remains non-authoritative and fail-open", () => {
  assert.match(manager, /import\.meta\.env\.DEV && shadowDiagnostic/);
  assert.match(manager, /runCampaignLocationShadow/);
  assert.match(manager, /setImportState\(result\.status === "ready"/);
  assert.match(manager, /catch \{[\s\S]*setShadowDiagnostic\(null\)/);
});

test("large import bridge imports no backend or supabase modules directly", () => {
  const bridgeRoot = fileURLToPath(
    new URL(["..", "src", "businessOs", "bulkImport", "bridges", "campaignLocationLargeImport", ""].join("/"), import.meta.url)
  );
  walk(bridgeRoot, (filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /from ["'].*backend|supabase|ResourceLocationManager/i);
  });
});

test("backend exposes only minimal large-import wrappers", () => {
  assert.match(backend, /beginCampaignLocationLargeImport/);
  assert.match(backend, /validateCampaignLocationImportChunk/);
  assert.match(backend, /commitCampaignLocationImportChunk/);
  assert.match(backend, /readCampaignLocationLargeImport/);
  assert.match(backend, /readCampaignLocationImportErrors/);
});

function walk(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(filePath, visit);
      continue;
    }
    visit(filePath);
  }
}
