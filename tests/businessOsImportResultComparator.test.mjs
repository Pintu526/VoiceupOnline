import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const comparisonModule = await import(
  new URL(
    ["..", "src", "businessOs", "bulkImport", "comparison", "index.ts"].join("/"),
    import.meta.url
  ).href
);

const { compareImportResults, locationImportCleanedFields } = comparisonModule;

function cleaned(overrides = {}) {
  return {
    country: "",
    state: "",
    district: "",
    block: "",
    panchayat: "",
    village: "",
    postalCode: "",
    ...overrides
  };
}

function result(rowNumber, overrides = {}) {
  return {
    rowNumber,
    cleaned: cleaned(overrides.cleaned),
    normalizedKey: overrides.normalizedKey,
    outcome: overrides.outcome ?? "valid",
    errorCode: overrides.errorCode
  };
}

test("identical results match", () => {
  const rows = [
    result(1, {
      cleaned: { country: "India", state: "Odisha" },
      normalizedKey: "india\u001fodisha"
    }),
    result(2, {
      cleaned: { country: "India", state: "Karnataka", district: "Bengaluru" },
      normalizedKey: "india\u001fkarnataka\u001fbengaluru"
    })
  ];

  const comparison = compareImportResults(rows, structuredClone(rows));

  assert.equal(comparison.matches, true);
  assert.equal(comparison.totalRows, 2);
  assert.equal(comparison.matchedRows, 2);
  assert.equal(comparison.mismatchedRows, 0);
  assert.equal(comparison.missingLegacyRows, 0);
  assert.equal(comparison.missingBusinessOsRows, 0);
  assert.deepEqual(comparison.mismatches, []);
});

test("different row counts mismatch", () => {
  const legacy = [result(1, { cleaned: { country: "India", state: "Odisha" } })];
  const businessOs = [
    result(1, { cleaned: { country: "India", state: "Odisha" } }),
    result(2, { cleaned: { country: "India", state: "Karnataka" } })
  ];

  const comparison = compareImportResults(legacy, businessOs);

  assert.equal(comparison.matches, false);
  assert.equal(comparison.totalRows, 2);
  assert.equal(comparison.missingLegacyRows, 1);
  assert.equal(comparison.mismatches[0].rowNumber, 2);
  assert.deepEqual(comparison.mismatches[0].mismatchFields, ["missing_legacy"]);
});

test("missing legacy row is reported", () => {
  const comparison = compareImportResults(
    [],
    [result(3, { cleaned: { country: "India", state: "Odisha" } })]
  );

  assert.equal(comparison.matches, false);
  assert.equal(comparison.missingLegacyRows, 1);
  assert.deepEqual(comparison.mismatches[0].mismatchFields, ["missing_legacy"]);
  assert.equal(comparison.mismatches[0].legacy, null);
});

test("missing business os row is reported", () => {
  const comparison = compareImportResults(
    [result(4, { cleaned: { country: "India", state: "Odisha" } })],
    []
  );

  assert.equal(comparison.matches, false);
  assert.equal(comparison.missingBusinessOsRows, 1);
  assert.deepEqual(comparison.mismatches[0].mismatchFields, ["missing_business_os"]);
  assert.equal(comparison.mismatches[0].businessOs, null);
});

test("normalized-key difference is reported", () => {
  const legacy = [result(1, { cleaned: { country: "India", state: "Odisha" }, normalizedKey: "a" })];
  const businessOs = [result(1, { cleaned: { country: "India", state: "Odisha" }, normalizedKey: "b" })];

  const comparison = compareImportResults(legacy, businessOs);

  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches[0].mismatchFields, ["normalized_key"]);
});

test("outcome difference is reported", () => {
  const legacy = [result(1, { cleaned: { country: "India", state: "Odisha" }, outcome: "valid" })];
  const businessOs = [
    result(1, { cleaned: { country: "India", state: "Odisha" }, outcome: "skipped_duplicate" })
  ];

  const comparison = compareImportResults(legacy, businessOs);

  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches[0].mismatchFields, ["outcome"]);
});

test("error-code difference is reported", () => {
  const legacy = [
    result(1, {
      cleaned: { country: "India" },
      outcome: "validation_failed",
      errorCode: "missing_state"
    })
  ];
  const businessOs = [
    result(1, {
      cleaned: { country: "India" },
      outcome: "validation_failed",
      errorCode: "hierarchy_gap"
    })
  ];

  const comparison = compareImportResults(legacy, businessOs);

  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches[0].mismatchFields, ["error_code"]);
});

test("each of the seven location fields is compared", () => {
  const base = {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    panchayat: "Khandagiri",
    village: "Baramunda",
    postalCode: "751030"
  };

  for (const field of locationImportCleanedFields) {
    const legacy = [result(1, { cleaned: base })];
    const businessOs = [result(1, { cleaned: { ...base, [field]: "Different" } })];
    const comparison = compareImportResults(legacy, businessOs);

    assert.equal(comparison.matches, false, `expected mismatch for ${field}`);
    assert.deepEqual(comparison.mismatches[0].mismatchFields, [field], `expected only ${field}`);
  }
});

test("blank and undefined optional values compare consistently", () => {
  const legacy = [
    result(1, {
      cleaned: { country: "India", state: "Odisha", postalCode: "" },
      normalizedKey: undefined,
      errorCode: undefined
    })
  ];
  const businessOs = [
    result(1, {
      cleaned: { country: "India", state: "Odisha", postalCode: undefined },
      normalizedKey: "",
      errorCode: ""
    })
  ];

  const comparison = compareImportResults(legacy, businessOs);

  assert.equal(comparison.matches, true);
  assert.equal(comparison.mismatchedRows, 0);
});

test("mismatches are ordered by row number", () => {
  const legacy = [
    result(5, { cleaned: { country: "India", state: "Odisha" }, outcome: "valid" }),
    result(2, { cleaned: { country: "India", state: "Karnataka" }, outcome: "valid" })
  ];
  const businessOs = [
    result(5, { cleaned: { country: "India", state: "Odisha" }, outcome: "validation_failed" }),
    result(2, { cleaned: { country: "India", state: "Karnataka" }, outcome: "validation_failed" })
  ];

  const comparison = compareImportResults(legacy, businessOs);

  assert.deepEqual(comparison.mismatches.map((entry) => entry.rowNumber), [2, 5]);
});

test("input arrays are not mutated", () => {
  const legacy = [
    result(1, { cleaned: { country: "India", state: "Odisha" } }),
    result(2, { cleaned: { country: "India", state: "Karnataka" } })
  ];
  const businessOs = [
    result(1, { cleaned: { country: "India", state: "Odisha" } }),
    result(2, { cleaned: { country: "India", state: "Karnataka" } })
  ];
  const legacySnapshot = structuredClone(legacy);
  const businessOsSnapshot = structuredClone(businessOs);

  compareImportResults(legacy, businessOs);

  assert.deepEqual(legacy, legacySnapshot);
  assert.deepEqual(businessOs, businessOsSnapshot);
});

test("comparator imports no runtime, backend, supabase, react, campaign, or deployment module", () => {
  const comparisonRoot = fileURLToPath(
    new URL(["..", "src", "businessOs", "bulkImport", "comparison", ""].join("/"), import.meta.url)
  );

  walk(comparisonRoot, (filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(
      source,
      /resourceLocationCsv|ResourceLocationManager|voiceup-campaign-locations|supabase|react|backend|PublicCampaignPage|App\.tsx|pages\/|masterData|adapters/i
    );
  });
});

test("no existing runtime module imports the comparator", () => {
  const forbidden = /bulkImport[/\\]comparison/;

  for (const root of ["../src", "../tests"]) {
    const base = fileURLToPath(new URL(root, import.meta.url));
    walk(base, (filePath) => {
      if (filePath.endsWith("businessOsImportResultComparator.test.mjs")) return;
      if (!/\.(ts|tsx|mjs|js)$/.test(filePath)) return;
      const source = readFileSync(filePath, "utf8");
      assert.doesNotMatch(source, forbidden, `unexpected comparator import in ${filePath}`);
    });
  }
});

function walk(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(filePath, visit);
      continue;
    }
    visit(filePath);
  }
}
