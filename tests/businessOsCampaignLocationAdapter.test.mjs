import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const adapterModule = await import(
  new URL(
    ["..", "src", "businessOs", "bulkImport", "adapters", "campaignLocation", "index.ts"].join("/"),
    import.meta.url
  ).href
);

const {
  buildCampaignLocationNormalizedKey,
  campaignLocationImportFields,
  classifyCampaignLocationRows,
  cleanCampaignLocationRow,
  cleanCampaignLocationValue,
  validateCampaignLocationRow
} = adapterModule;

function row(overrides) {
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

function classifyOne(rowNumber, locationRow) {
  return classifyCampaignLocationRows([{ rowNumber, row: locationRow }])[0];
}

test("exact seven-column row contract is preserved", () => {
  assert.deepEqual(
    [...campaignLocationImportFields],
    ["country", "state", "district", "block", "panchayat", "village", "postalCode"]
  );
});

test("valid hierarchy rows pass", () => {
  assert.equal(classifyOne(1, row({ country: "India", state: "Odisha" })).outcome, "valid");
  assert.equal(
    classifyOne(2, row({ country: "India", state: "Odisha", district: "Khordha" })).outcome,
    "valid"
  );
  assert.equal(
    classifyOne(3, row({ country: "India", state: "Odisha", district: "Khordha", block: "Bhubaneswar" })).outcome,
    "valid"
  );
  assert.equal(
    classifyOne(4, row({
      country: "India",
      state: "Odisha",
      district: "Khordha",
      block: "Bhubaneswar",
      panchayat: "Khandagiri"
    })).outcome,
    "valid"
  );
  assert.equal(
    classifyOne(5, row({
      country: "India",
      state: "Odisha",
      district: "Khordha",
      block: "Bhubaneswar",
      panchayat: "Khandagiri",
      village: "Baramunda",
      postalCode: "751030"
    })).outcome,
    "valid"
  );
});

test("hierarchy gap and required-field failures are reported", () => {
  assert.equal(classifyOne(6, row({
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    village: "Baramunda"
  })).errorCode, "hierarchy_gap");

  assert.equal(classifyOne(7, row({
    country: "India",
    state: "Odisha",
    district: "Khordha",
    panchayat: "Khandagiri"
  })).errorCode, "hierarchy_gap");

  assert.equal(classifyOne(8, row({
    country: "India",
    state: "Odisha",
    block: "Bhubaneswar"
  })).errorCode, "hierarchy_gap");

  assert.equal(classifyOne(9, row({
    country: "India",
    district: "Khordha"
  })).errorCode, "hierarchy_gap");

  assert.equal(classifyOne(10, row({ state: "Odisha" })).errorCode, "hierarchy_gap");
  assert.equal(classifyOne(11, row({})).errorCode, "missing_country");
  assert.equal(classifyOne(12, row({ country: "India" })).errorCode, "missing_state");
});

test("whitespace cleaning, control-character removal, and NFKC normalization are deterministic", () => {
  assert.equal(cleanCampaignLocationValue("  Odisha\u2003  "), "Odisha");
  assert.equal(cleanCampaignLocationValue("Khordha\tBlock"), "Khordha Block");
  assert.equal(cleanCampaignLocationValue("Baramunda\u0007"), "Baramunda");
  assert.equal(cleanCampaignLocationValue("\u0041\u0301"), "\u00C1");

  const cleaned = cleanCampaignLocationRow(row({
    country: "  India ",
    state: " Odisha ",
    district: "",
    block: "",
    panchayat: "",
    village: "",
    postalCode: " 751030 "
  }));

  assert.deepEqual(cleaned, row({
    country: "India",
    state: "Odisha",
    district: "",
    block: "",
    panchayat: "",
    village: "",
    postalCode: "751030"
  }));
});

test("duplicate classification keeps the first valid row and skips later equivalents", () => {
  const results = classifyCampaignLocationRows([
    { rowNumber: 1, row: row({ country: "India", state: "Odisha", district: "Khordha" }) },
    { rowNumber: 2, row: row({ country: "india", state: "ODISHA", district: " khordha " }) },
    { rowNumber: 3, row: row({ country: " India", state: "Odisha ", district: "Khordha" }) }
  ]);

  assert.equal(results[0].outcome, "valid");
  assert.equal(results[1].outcome, "skipped_duplicate");
  assert.equal(results[2].outcome, "skipped_duplicate");
  assert.equal(results[0].normalizedKey, results[1].normalizedKey);
});

test("postal code remains optional and blank trailing hierarchy fields do not change the normalized key", () => {
  const withoutPostal = validateCampaignLocationRow(row({
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    panchayat: "Khandagiri",
    village: "Baramunda"
  }));
  assert.equal(withoutPostal.ok, true);
  if (!withoutPostal.ok) return;

  const withPostal = validateCampaignLocationRow(row({
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    panchayat: "Khandagiri",
    village: "Baramunda",
    postalCode: "751030"
  }));
  assert.equal(withPostal.ok, true);
  if (!withPostal.ok) return;

  assert.notEqual(withoutPostal.normalizedKey, withPostal.normalizedKey);

  const sparse = buildCampaignLocationNormalizedKey(row({
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "",
    panchayat: "",
    village: ""
  }));
  const dense = buildCampaignLocationNormalizedKey(row({
    country: "India",
    state: "Odisha",
    district: "Khordha"
  }));
  assert.equal(sparse, dense);
});

test("row numbers are retained in results", () => {
  const results = classifyCampaignLocationRows([
    { rowNumber: 11, row: row({ country: "India", state: "Odisha" }) },
    { rowNumber: 12, row: row({ country: "India" }) }
  ]);

  assert.deepEqual(results.map((entry) => entry.rowNumber), [11, 12]);
});

test("adapter contains no persistence function", () => {
  const adapterRoot = fileURLToPath(
    new URL(["..", "src", "businessOs", "bulkImport", "adapters", "campaignLocation", ""].join("/"), import.meta.url)
  );

  walk(adapterRoot, (filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /\bpersist\b|supabase|backend|ResourceLocationManager|resourceLocationCsv/i);
  });
});

test("adapter imports only the dormant bulk-import core and its own files", () => {
  const adapterRoot = fileURLToPath(
    new URL(["..", "src", "businessOs", "bulkImport", "adapters", "campaignLocation", ""].join("/"), import.meta.url)
  );

  walk(adapterRoot, (filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /from ["'].*(?:backend|supabase|react|ResourceLocationManager|resourceLocationCsv)/i);
    assert.doesNotMatch(source, /from ["'].*masterData/);
    assert.doesNotMatch(source, /from ["'].*pages\//);
  });
});

test("existing runtime modules do not import the dormant campaign location adapter", () => {
  const forbidden = /adapters[/\\]campaignLocation/;

  for (const root of ["../src", "../tests"]) {
    const base = fileURLToPath(new URL(root, import.meta.url));
    walk(base, (filePath) => {
      if (filePath.endsWith("businessOsCampaignLocationAdapter.test.mjs")) return;
      if (!/\.(ts|tsx|mjs|js)$/.test(filePath)) return;
      const source = readFileSync(filePath, "utf8");
      assert.doesNotMatch(source, forbidden, `unexpected adapter import in ${filePath}`);
    });
  }
});

test("existing campaign location importer sources remain untouched", () => {
  const csv = readFileSync(new URL("../src/businessOs/masterData/resourceLocationCsv.ts", import.meta.url), "utf8");
  const manager = readFileSync(new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(csv, /adapters[/\\]campaignLocation/);
  assert.doesNotMatch(manager, /adapters[/\\]campaignLocation/);
  assert.match(csv, /maximumRows = 2000/);
  assert.match(manager, /parseResourceLocationCsv/);
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
