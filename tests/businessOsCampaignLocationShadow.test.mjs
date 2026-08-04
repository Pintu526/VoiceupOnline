import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const shadowModule = await import(
  new URL(
    ["..", "src", "businessOs", "bulkImport", "bridges", "campaignLocationShadow", "index.ts"].join("/"),
    import.meta.url
  ).href
);

const adapterModule = await import(
  new URL(
    ["..", "src", "businessOs", "bulkImport", "adapters", "campaignLocation", "index.ts"].join("/"),
    import.meta.url
  ).href
);

const { runCampaignLocationShadow, summarizeCampaignLocationShadow } = shadowModule;
const { classifyCampaignLocationRows, cleanCampaignLocationValue } = adapterModule;

function row(overrides = {}) {
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

test("identical parsed rows produce a shadow match for comparable fields", async () => {
  const parsedRows = [
    row({ country: "India", state: "Odisha", district: "Khordha" }),
    row({ country: "India", state: "Karnataka" })
  ];

  const shadow = await runCampaignLocationShadow(parsedRows);

  assert.equal(shadow.ok, true);
  assert.equal(shadow.parseComparison.matches, true);
  assert.equal(shadow.parseComparison.mismatchedRows, 0);
  assert.deepEqual(shadow.parseComparison.notComparedFields, ["normalized_key", "outcome", "error_code"]);
});

test("case and whitespace variants are normalized by the Business OS adapter", async () => {
  const parsedRows = [row({ country: "India", state: "  Odisha  ", district: "Khordha" })];
  const shadow = await runCampaignLocationShadow(parsedRows);

  assert.equal(shadow.ok, true);
  const adapterResult = classifyCampaignLocationRows([{ rowNumber: 1, row: parsedRows[0] }])[0];
  assert.equal(adapterResult.cleaned.state, cleanCampaignLocationValue("  Odisha  "));
  assert.equal(adapterResult.cleaned.state, "Odisha");
});

test("shadow mismatch is reported deterministically", async () => {
  const parsedRows = [
    row({ country: "India", state: "Odisha" }),
    row({ country: "India", state: "Karnataka" })
  ];
  const serverRows = [
    {
      rowNumber: 1,
      country: "India",
      state: "Odisha",
      district: "",
      block: "",
      panchayat: "",
      village: "",
      postalCode: "",
      classification: "valid",
      errorCode: null
    },
    {
      rowNumber: 2,
      country: "India",
      state: "Karnataka",
      district: "",
      block: "",
      panchayat: "",
      village: "",
      postalCode: "",
      classification: "invalid",
      errorCode: "missing_state"
    }
  ];

  const shadow = await runCampaignLocationShadow(parsedRows, serverRows);

  assert.equal(shadow.ok, true);
  assert.equal(shadow.serverComparison?.matches, false);
  assert.deepEqual(
    shadow.serverComparison?.mismatches.map((entry) => entry.rowNumber),
    [2]
  );
  assert.ok(shadow.serverComparison?.mismatches[0].mismatchFields.includes("outcome"));
});

test("shadow exception does not throw into the legacy caller", async () => {
  await assert.doesNotReject(async () => runCampaignLocationShadow([]));
  await assert.doesNotReject(async () => runCampaignLocationShadow([row({ country: "India", state: "Odisha" })]));
  await assert.doesNotReject(async () => runCampaignLocationShadow(null));
  assert.equal((await runCampaignLocationShadow(null)).ok, false);
});

test("shadow execution does not mutate input rows", async () => {
  const parsedRows = [row({ country: "India", state: "Odisha" })];
  const snapshot = structuredClone(parsedRows);

  await runCampaignLocationShadow(parsedRows);

  assert.deepEqual(parsedRows, snapshot);
});

test("no persistence adapter is called", () => {
  const bridgeRoot = fileURLToPath(
    new URL(["..", "src", "businessOs", "bulkImport", "bridges", "campaignLocationShadow", ""].join("/"), import.meta.url)
  );

  walk(bridgeRoot, (filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /\bpersist\b|commitCampaignLocationImport|validateCampaignLocationImport/i);
  });
});

test("no backend or Supabase module is imported by the bridge", () => {
  const bridgeRoot = fileURLToPath(
    new URL(["..", "src", "businessOs", "bulkImport", "bridges", "campaignLocationShadow", ""].join("/"), import.meta.url)
  );

  walk(bridgeRoot, (filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /from ["'].*backend|supabase|ResourceLocationManager|resourceLocationCsv|react/i);
  });
});

test("no storage API is used", () => {
  const bridgeRoot = fileURLToPath(
    new URL(["..", "src", "businessOs", "bulkImport", "bridges", "campaignLocationShadow", ""].join("/"), import.meta.url)
  );

  walk(bridgeRoot, (filePath) => {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
  });
});

test("only the legacy validation result controls readiness", () => {
  const manager = readFileSync(
    new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url),
    "utf8"
  );

  assert.match(manager, /setImportState\(result\.status === "ready" \? "ready" : "validation errors"\)/);
  assert.match(manager, /importState === "ready"/);
  assert.doesNotMatch(manager, /shadowDiagnostic.*ready|ready.*shadowDiagnostic/i);
});

test("production mode does not render diagnostics", () => {
  const manager = readFileSync(
    new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url),
    "utf8"
  );

  assert.match(manager, /import\.meta\.env\.DEV && shadowDiagnostic/);
  assert.doesNotMatch(manager, /Shadow import comparison \(dev only\)[\s\S]*import\.meta\.env\.PROD/);
});

test("development mode may render diagnostics", () => {
  const manager = readFileSync(
    new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url),
    "utf8"
  );

  assert.match(manager, /Shadow import comparison \(dev only\)/);
  assert.match(manager, /summarizeCampaignLocationShadow/);
  assert.match(manager, /campaignLocationShadow/);
});

test("existing location importer behavior remains unchanged", () => {
  const manager = readFileSync(
    new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url),
    "utf8"
  );
  const csv = readFileSync(new URL("../src/businessOs/masterData/resourceLocationCsv.ts", import.meta.url), "utf8");

  assert.match(manager, /validateCampaignLocationImport\(scope, parsed\.rows, key, hash\)/);
  assert.match(manager, /commitCampaignLocationImport\(scope, importResult\.importId, importKey, importHash\)/);
  assert.match(manager, /parseResourceLocationCsv/);
  assert.match(csv, /maximumRows = 2000/);
  assert.match(csv, /maximumBytes = 2 \* 1024 \* 1024/);
});

test("shadow summary avoids raw location values in preview output", async () => {
  const parsedRows = [row({ country: "India", state: "Odisha" })];
  const serverRows = [
    {
      rowNumber: 1,
      country: "India",
      state: "Odisha",
      district: "",
      block: "",
      panchayat: "",
      village: "",
      postalCode: "",
      classification: "invalid",
      errorCode: "missing_state"
    }
  ];
  const shadow = await runCampaignLocationShadow(parsedRows, serverRows);
  const summary = summarizeCampaignLocationShadow(shadow);

  assert.equal(summary.status, "mismatch");
  assert.ok(summary.mismatchPreview.every((entry) => !("legacy" in entry) && !("businessOs" in entry)));
  assert.ok(summary.mismatchPreview.every((entry) => typeof entry.rowNumber === "number"));
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
