import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  chunkRows,
  classifyDuplicateRows,
  createBulkImportCancellationToken,
  createBulkImportProgress,
  isBulkImportProgressConsistent,
  processBulkImportChunks,
  recordBulkImportOutcome
} from "../src/businessOs/bulkImport/index.ts";

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizedKey(row) {
  return normalizeLabel(row.label);
}

function toNormalizedRows(rows) {
  return rows.map((input, index) => ({
    rowNumber: index + 1,
    input,
    normalized: input,
    normalizedKey: normalizedKey(input)
  }));
}

test("rows are divided into deterministic configurable chunks", () => {
  assert.deepEqual(chunkRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkRows(["a", "b", "c"], 10), [["a", "b", "c"]]);
});

test("input row order is preserved across chunking and duplicate classification", () => {
  const rows = [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }];
  const chunks = chunkRows(rows, 2);
  assert.deepEqual(chunks[0].map((row) => row.label), ["Alpha", "Beta"]);
  assert.deepEqual(chunks[1].map((row) => row.label), ["Gamma"]);

  const classified = classifyDuplicateRows(toNormalizedRows(rows));
  assert.deepEqual(classified.map((row) => row.rowNumber), [1, 2, 3]);
  assert.deepEqual(classified.map((row) => row.input.label), ["Alpha", "Beta", "Gamma"]);
});

test("empty input produces no chunks", () => {
  assert.deepEqual(chunkRows([], 500), []);
});

test("first duplicate wins and later duplicates are skipped", () => {
  const classified = classifyDuplicateRows(
    toNormalizedRows([{ label: "Same" }, { label: "Other" }, { label: "Same" }])
  );

  assert.equal(classified[0].outcome, "valid");
  assert.equal(classified[1].outcome, "valid");
  assert.equal(classified[2].outcome, "skipped_duplicate");
});

test("case and whitespace equivalence works with caller-supplied normalized keys", () => {
  const classified = classifyDuplicateRows(
    toNormalizedRows([{ label: "  Odisha  " }, { label: "odisha" }])
  );

  assert.equal(classified[0].outcome, "valid");
  assert.equal(classified[1].outcome, "skipped_duplicate");
  assert.equal(classified[0].normalizedKey, "odisha");
  assert.equal(classified[1].normalizedKey, "odisha");
});

test("progress counters remain internally consistent", () => {
  let progress = createBulkImportProgress(4);
  assert.equal(isBulkImportProgressConsistent(progress), true);

  progress = recordBulkImportOutcome(progress, "valid");
  progress = recordBulkImportOutcome(progress, "skipped_duplicate");
  progress = recordBulkImportOutcome(progress, "skipped_protected");
  progress = recordBulkImportOutcome(progress, "validation_failed");

  assert.equal(isBulkImportProgressConsistent(progress), true);
  assert.deepEqual(progress, {
    total: 4,
    validated: 3,
    processed: 4,
    imported: 1,
    skipped: 2,
    failed: 1,
    remaining: 0
  });
});

test("cancellation stops before processing the next chunk", async () => {
  const token = createBulkImportCancellationToken();
  const seen = [];

  const pending = processBulkImportChunks([1, 2, 3, 4], 1, token, async (_chunk, chunkIndex) => {
    seen.push(chunkIndex);
    if (chunkIndex === 0) token.cancel();
  });

  await assert.rejects(pending, /bulk_import_cancelled/);
  assert.deepEqual(seen, [0]);
});

test("bulk import core does not import existing campaign-location runtime modules", () => {
  const coreFiles = [
    "../src/businessOs/bulkImport/contracts.ts",
    "../src/businessOs/bulkImport/chunkRows.ts",
    "../src/businessOs/bulkImport/classifyDuplicates.ts",
    "../src/businessOs/bulkImport/index.ts"
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  for (const source of coreFiles) {
    assert.doesNotMatch(source, /resourceLocationCsv|ResourceLocationManager|voiceup-campaign-locations|supabase|react/i);
    assert.doesNotMatch(source, /from ["'].*backend|from ["'].*PublicCampaignPage|from ["'].*App\.tsx/i);
  }
});

test("existing runtime modules do not import the dormant bulk-import core", () => {
  const roots = ["../src", "../tests"];
  const forbidden = /businessOs\/bulkImport|businessOs\\bulkImport/;

  for (const root of roots) {
    const base = fileURLToPath(new URL(root, import.meta.url));
    walk(base, (filePath) => {
      if (filePath.endsWith("businessOsBulkImportCore.test.mjs")) return;
      if (!/\.(ts|tsx|mjs|js)$/.test(filePath)) return;
      const source = readFileSync(filePath, "utf8");
      assert.doesNotMatch(source, forbidden, `unexpected bulk-import import in ${filePath}`);
    });
  }
});

function walk(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "bulkImport") continue;
      walk(filePath, visit);
      continue;
    }
    visit(filePath);
  }
}
