import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createCanonicalLocationReferenceClaim,
  createCustomLocationReference,
  EMPTY_LEGACY_LOCATION_GOVERNANCE,
  projectCanonicalSelectionToLegacyLocation,
  updateUnverifiedLegacyLocation
} from "../src/businessOs/location/ui/CanonicalLocationLegacyAdapter.ts";
import { createUnverifiedCustomLocation } from "../src/businessOs/location/ui/CanonicalLocationUiModel.ts";
import { createIndiaLgdCatalogReader } from "../src/businessOs/location/ui/IndiaLgdCatalogReader.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const adapterSource = read("src/businessOs/location/ui/CanonicalLocationLegacyAdapter.ts");
const consumerSource = read("src/businessOs/location/ui/SaasLocationGovernancePicker.tsx");
const saasSource = read("src/pages/app/SaasTab.tsx");
const pickerSource = read("src/businessOs/location/ui/CanonicalLocationPicker.tsx");
const backendSource = read("src/backend.ts");
const ledgerSource = read("docs/location-consumer-migration-ledger.md");
const sourceFence = read("src/businessOs/location/ui/IndiaLgdCatalogReader.ts");

const identity = Object.freeze({
  authority: "LGD",
  sourceDataset: "india-lgd",
  datasetVersion: "lgd-2026-08-27"
});

function node(nodeId, officialCode, label, level, entityKind, ancestors = []) {
  const parent = ancestors[ancestors.length - 1];
  return {
    canonicalNodeId: nodeId,
    nodeId,
    officialCode,
    label,
    level,
    entityKind,
    ...identity,
    parents: parent ? [{
      nodeId: parent.nodeId,
      officialCode: parent.officialCode,
      level: parent.level,
      relationship: "administrative_parent",
      source: { ...identity }
    }] : [],
    lineage: ancestors.map((ancestor) => ({
      nodeId: ancestor.nodeId,
      officialCode: ancestor.officialCode,
      level: ancestor.level
    }))
  };
}

const india = node("in", "IN", "India", "country", "country");
const odisha = node("in-state-odisha", "21", "Odisha", "state", "state", [india]);
const khordha = node("in-state-odisha-district-362", "362", "Khordha", "district", "district", [india, odisha]);
const balianta = node("block-3456", "3456", "Balianta", "block", "development_block", [india, odisha, khordha]);
const gp = node("gp-120001", "120001", "Bentapur", "local_body", "gram_panchayat", [india, odisha, khordha, balianta]);
const bmc = node("ulb-250520", "250520", "Bhubaneswar", "local_body", "municipal_corporation", [india, odisha, khordha]);
const ward = node("ward-9001", "9001", "Ward 1", "ward", "ward", [india, odisha, khordha, bmc]);

test("C08 projects a rural canonical branch to additive dual persistence", () => {
  const result = projectCanonicalSelectionToLegacyLocation([india, odisha, khordha, balianta, gp]);
  assert.deepEqual(result.legacyLabels, {
    state: "Odisha",
    district: "Khordha",
    block: "Balianta",
    panchayat: "Bentapur"
  });
  assert.deepEqual(Object.keys(result.legacyLabels), Object.keys(EMPTY_LEGACY_LOCATION_GOVERNANCE));
  assert.equal(result.canonicalSelection.at(-1).canonicalNodeId, "gp-120001");
  assert.equal(result.canonicalSelection.at(-1).officialCode, "120001");
  assert.deepEqual(
    {
      authority: result.canonicalSelection.at(-1).authority,
      sourceDataset: result.canonicalSelection.at(-1).sourceDataset,
      datasetVersion: result.canonicalSelection.at(-1).datasetVersion
    },
    identity
  );
  assert.deepEqual(result.canonicalSelection.at(-1).lineage, gp.lineage);
  const claim = createCanonicalLocationReferenceClaim(result.canonicalSelection, new Date("2026-09-17T01:02:03Z"));
  assert.equal(claim.verificationState, "canonical_verified");
  assert.equal(claim.canonicalNodeId, "gp-120001");
  assert.equal(claim.entityKind, "gram_panchayat");
  assert.deepEqual(claim.lineageSnapshot.map((item) => item.canonicalNodeId), gp.lineage.map((item) => item.nodeId));
  assert.equal(claim.validation.validatorVersion, "browser-claim/v1");
});

test("urban BMC and Ward projection preserves exact official labels without synonyms", () => {
  const result = projectCanonicalSelectionToLegacyLocation([india, odisha, khordha, bmc, ward]);
  assert.deepEqual(result.legacyLabels, {
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    panchayat: "Ward 1"
  });
  assert.doesNotMatch(result.legacyLabels.block, /Municipal Corporation/u);
});

test("canonical ancestor changes reset descendants because projection is rebuilt from current lineage", () => {
  const cutBack = projectCanonicalSelectionToLegacyLocation([india, odisha, khordha]);
  assert.deepEqual(cutBack.legacyLabels, {
    state: "Odisha",
    district: "Khordha",
    block: "",
    panchayat: ""
  });
});

test("manual values retain exact labels, reset descendants, and remain unverified", () => {
  const current = { state: "Odisha", district: "Khordha", block: "Balianta", panchayat: "Bentapur" };
  const manual = updateUnverifiedLegacyLocation(current, "district", "  Operator District  ");
  assert.deepEqual(manual, {
    state: "Odisha",
    district: "  Operator District  ",
    block: "",
    panchayat: ""
  });
  const marker = createUnverifiedCustomLocation(manual.district);
  assert.equal(marker.label, "Operator District");
  assert.equal(marker.verificationStatus, "unverified_custom");
  assert.equal(marker.canonicalNodeId, null);
  assert.equal(marker.officialCode, null);
  const persisted = createCustomLocationReference(manual, "district", manual.district, new Date("2026-09-17T01:02:03Z"));
  assert.equal(persisted.verificationState, "unverified_custom");
  assert.equal(persisted.canonicalNodeId, null);
  assert.deepEqual(persisted.parentContext, [{ labelSnapshot: "Odisha", level: "state" }]);
  assert.doesNotMatch(adapterSource, /normalize|toLowerCase|synonym|alias/u);
  assert.match(consumerSource, /createCustomLocationReference/u);
  assert.match(consumerSource, /data-verification-state="unverified_custom"/u);
});

test("C08 official choices use only the Step 8/9 canonical foundation", () => {
  assert.match(saasSource, /<SaasLocationGovernancePicker/u);
  assert.doesNotMatch(saasSource, /<IndiaLocationFields/u);
  assert.match(consumerSource, /new LocationBrowserCatalogClient/u);
  assert.match(consumerSource, /createIndiaLgdCatalogReader/u);
  assert.match(consumerSource, /<CanonicalLocationPicker/u);
  assert.match(consumerSource, /rootNodeId="in"/u);
  assert.doesNotMatch(
    consumerSource + adapterSource,
    /OdishaLgdGenerated|CanonicalGeographyEngine|indiaLocationOptions|IndiaLocationFields|pinCodeDirectory|locationOverrides|locationDeletions/u
  );
  assert.doesNotMatch(consumerSource + adapterSource, /LOCATION_API_KEY|VITE_LOCATION|SUPABASE_SERVICE_ROLE_KEY/u);
});

test("the consumer source fence accepts metadata-driven LGD versions and rejects another authority", async () => {
  const calls = [];
  const client = {
    async metadata() { calls.push("metadata"); return { ...identity }; },
    async node() { calls.push("node"); return khordha; },
    async children() { calls.push("children"); return [khordha]; },
    async resolve() { calls.push("resolve"); return { status: "resolved", node: khordha }; },
    async search() { calls.push("search"); return { status: "unresolved", reason: "none", suggestions: [] }; },
    clearCache() { calls.push("clearCache"); }
  };
  const reader = createIndiaLgdCatalogReader(client);
  assert.deepEqual(await reader.metadata(), identity);
  assert.equal((await reader.node("khordha")).officialCode, "362");
  assert.equal((await reader.children("odisha")).length, 1);
  assert.equal((await reader.resolve({ nodeId: "khordha" })).status, "resolved");
  assert.equal((await reader.search({ normalizedName: "missing" })).status, "unresolved");
  reader.clearCache();
  assert.deepEqual(calls, ["metadata", "node", "children", "resolve", "search", "clearCache"]);

  const wrong = createIndiaLgdCatalogReader({ ...client, async metadata() {
    return { authority: "Other", sourceDataset: "other", datasetVersion: "v1" };
  }});
  await assert.rejects(() => wrong.metadata(), (error) => error?.code === "mixed_dataset");
  assert.match(sourceFence, /authority: "LGD"/u);
  assert.match(sourceFence, /sourceDataset: "india-lgd"/u);
  assert.doesNotMatch(sourceFence, /datasetVersion:\s*"/u);
});

test("workspace credentials stay behind the authenticated gateway transport", () => {
  assert.match(backendSource, /export async function invokeWorkspaceLocationCatalog/u);
  assert.match(backendSource, /const workspaceId = await resolveWorkspaceId\(\)/u);
  assert.match(backendSource, /"voiceup-location-catalog-v1"/u);
  assert.match(backendSource, /access: \{ type: "workspace", workspaceId \}/u);
  assert.match(saasSource, /transport=\{invokeWorkspaceLocationCatalog\}/u);
  assert.doesNotMatch(saasSource + consumerSource, /VITE_SUPABASE|LOCATION_API_KEY/u);
});

test("edit, save, clear, disabled, loading, error, and empty behavior remain explicit", () => {
  assert.match(consumerSource, /value=\{values\[field\]\}/u);
  assert.match(consumerSource, /onChange\(nextValues, label\.trim\(\) \? createCustomLocationReference/u);
  assert.match(saasSource, /setOrganization\(\(current\) =>/u);
  assert.match(saasSource, /locationGovernance: \{/u);
  assert.match(pickerSource, /onClear\?\.\(\)/u);
  assert.match(consumerSource, /onClear=\{handleCanonicalClear\}/u);
  assert.match(consumerSource, /disabled=\{disabled\}/u);
  assert.match(pickerSource, /state\.status === "loading"/u);
  assert.match(pickerSource, /state\.error/u);
  assert.match(pickerSource, /branch\.status === "empty"/u);
});

test("organization persistence remains label-compatible and adds one location reference", () => {
  const updateStart = saasSource.indexOf("const updateLocationGovernance");
  const updateEnd = saasSource.indexOf("function getProviderStatus", updateStart);
  const persistenceBoundary = saasSource.slice(updateStart, updateEnd);
  assert.match(persistenceBoundary, /state: values\.state/u);
  assert.match(persistenceBoundary, /district: values\.district/u);
  assert.match(persistenceBoundary, /block: values\.block/u);
  assert.match(persistenceBoundary, /panchayat: values\.panchayat/u);
  assert.match(persistenceBoundary, /locationReference/u);
  assert.doesNotMatch(persistenceBoundary, /canonicalNodeId|officialCode|datasetVersion|lineage|parents/u);
});

test("migration ledger has exactly 29 stable rows completed by the consolidated closure", () => {
  const rows = ledgerSource.split(/\r?\n/u).filter((line) => /^\| C\d{2} \|/u.test(line));
  assert.equal(rows.length, 29);
  assert.deepEqual(rows.map((row) => row.match(/^\| (C\d{2}) \|/u)?.[1]),
    Array.from({ length: 29 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(rows.filter((row) => /\| MIGRATED \|$/u.test(row)).map((row) => row.slice(2, 5)),
    Array.from({ length: 29 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`));
  assert.equal(rows.filter((row) => /\| NOT_STARTED \|$/u.test(row)).length, 0);
  assert.equal(rows.filter((row) => /\| DEFERRED_WITH_REASON \|$/u.test(row)).length, 0);
  for (const row of rows) {
    const columns = row.split("|").map((value) => value.trim());
    assert.match(columns[7], /^(?:LOW|MEDIUM|HIGH)$/u);
    assert.match(columns[8], /^(?:YES|NO)$/u);
    assert.match(columns[9], /^(?:YES|NO)$/u);
    assert.match(columns[10], /^(?:NOT_STARTED|PARTIAL|MIGRATED|DEFERRED_WITH_REASON)$/u);
  }
});

test("migrated high-risk consumers use the shared UI without replacing compatibility-only surfaces", () => {
  const protectedFiles = [
    "src/pages/app/ScansTab.tsx",
    "src/pages/app/ReportsTab.tsx",
    "src/components/IndiaLocationFields.tsx",
    "src/components/useCampaignLocationCatalog.ts",
    "src/businessOs/masterData/ResourceLocationManager.tsx"
  ];
  for (const relativePath of protectedFiles) {
    assert.doesNotMatch(
      read(relativePath),
      /CanonicalLocationPicker|SaasLocationGovernancePicker|businessOs\/location\/ui/u,
      relativePath
    );
  }

  assert.match(read("src/pages/app/CampaignsTab.tsx"), /WorkspaceCanonicalLocationPicker/u);
  assert.match(read("src/pages/app/CoordinatorNetworkTab.tsx"), /WorkspaceCanonicalLocationPicker/u);

  const publicPage = read("src/pages/PublicCampaignPage.tsx");
  assert.match(publicPage, /PublicCampaignCanonicalLocationDisplay/u);
  assert.doesNotMatch(publicPage, /CanonicalLocationPicker|SaasLocationGovernancePicker|useCanonicalLocationUi/u);
});
