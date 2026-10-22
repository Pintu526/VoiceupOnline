import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LocationApiClientError } from "../src/businessOs/location/server/LocationApiClient.ts";
import {
  CampaignLocationPlatformAdapter,
  toCampaignCanonicalReference
} from "../src/businessOs/location/server/CampaignLocationPlatformAdapter.ts";

const source = { authority: "LGD", sourceDataset: "india-lgd", sourceDatasetVersion: "lgd-2026-08-27", provenance: "derived_official" };
const response = (data) => ({ apiVersion: "v1", datasetVersion: "lgd-2026-08-27", data });

function node(nodeId, officialCode, level, entityKind, displayName, options = {}) {
  return {
    nodeId,
    officialCode,
    level,
    entityKind,
    displayName,
    datasetVersion: "lgd-2026-08-27",
    source,
    parents: options.parents ?? [],
    lineage: options.lineage ?? []
  };
}

const india = node("in-country-india", "IN", "country", "country", "India");
const odisha = node("in-state-odisha", "21", "state", "state", "Odisha", { lineage: [{ nodeId: india.nodeId, officialCode: "IN", level: "country" }] });
const khordha = node("in-state-odisha-district-362", "362", "district", "district", "Khordha", { lineage: odisha.lineage.concat([{ nodeId: odisha.nodeId, officialCode: "21", level: "state" }]) });
const balianta = node("in-state-odisha-district-362-block-3456", "3456", "block", "development_block", "Balianta");
const bmc = node("in-state-odisha-local-250520", "250520", "local_body", "municipal_corporation", "Bhubaneswar Municipal Corporation", {
  parents: [{ nodeId: khordha.nodeId, officialCode: "362", level: "district", relationship: "administrative_parent", source }],
  lineage: [
    { nodeId: india.nodeId, officialCode: "IN", level: "country" },
    { nodeId: odisha.nodeId, officialCode: "21", level: "state" },
    { nodeId: khordha.nodeId, officialCode: "362", level: "district" }
  ]
});
const ward = node("in-state-odisha-ward-1", "1", "ward", "ward", "Ward 1");
const allNodes = new Map([india, odisha, khordha, balianta, bmc, ward].map((item) => [item.nodeId, item]));

function clientStub() {
  return {
    metadata: async () => response({ namespace: "/v1", datasetVersion: "lgd-2026-08-27", source, readOnly: true, security: {} }),
    getNode: async (nodeId) => response(allNodes.get(nodeId)),
    getByOfficialCode: async (officialCode) => response({ status: "resolved", node: [...allNodes.values()].find((item) => item.officialCode === officialCode) }),
    getChildren: async (nodeId) => response({ nodeId, nodes: nodeId === khordha.nodeId ? [balianta, bmc] : nodeId === bmc.nodeId ? Array.from({ length: 67 }, () => ward) : [] }),
    getParents: async (nodeId) => response({ nodeId, parents: nodeId === bmc.nodeId ? [khordha] : [] }),
    getLineage: async (nodeId) => response({ nodeId, lineage: nodeId === bmc.nodeId ? [india, odisha, khordha] : [] }),
    resolve: async (request) => response(request.nodeId === "ambiguous" ? { status: "ambiguous", candidates: [balianta, bmc], reason: "Multiple candidates" } : { status: "resolved", node: bmc }),
    validate: async () => response({ status: "valid", node: bmc, checks: { nodeExists: true, levelMatches: true, officialCodeMatches: true, parentageMatches: true, lineageMatches: true, datasetVersionMatches: true, sourceDatasetMatches: true } }),
    isDescendant: async (nodeId, ancestorNodeId) => response({ nodeId, ancestorNodeId, descendant: nodeId === bmc.nodeId && ancestorNodeId === khordha.nodeId }),
    relationship: async (childNodeId, parentNodeId) => response({ childNodeId, parentNodeId, represented: childNodeId === bmc.nodeId && parentNodeId === khordha.nodeId })
  };
}

test("Campaign adapter maps canonical API operations without becoming a geography authority", async () => {
  const adapter = new CampaignLocationPlatformAdapter(clientStub());
  assert.equal((await adapter.metadata()).datasetVersion, "lgd-2026-08-27");
  assert.deepEqual(await adapter.getNode(odisha.nodeId), toCampaignCanonicalReference(odisha));
  const byCode = await adapter.getByOfficialCode("250520", { expectedLevel: "local_body" });
  assert.equal(byCode.status, "resolved");
  assert.equal(byCode.reference.officialCode, "250520");
  assert.equal((await adapter.getChildren(khordha.nodeId)).length, 2);
  assert.deepEqual((await adapter.getParents(bmc.nodeId)).map((item) => item.officialCode), ["362"]);
  assert.deepEqual((await adapter.getLineage(bmc.nodeId)).map((item) => item.officialCode), ["IN", "21", "362"]);
  assert.equal((await adapter.resolve({ nodeId: bmc.nodeId })).status, "resolved");
  assert.equal((await adapter.validate(toCampaignCanonicalReference(bmc), { requiredParentNodeIds: [khordha.nodeId] })).status, "valid");
  assert.equal((await adapter.isDescendant(bmc.nodeId, khordha.nodeId)).descendant, true);
  assert.equal((await adapter.hasOfficialRelationship(bmc.nodeId, khordha.nodeId)).represented, true);
});

test("campaign policy remains an identity-only subset and cannot change canonical geography", () => {
  const adapter = new CampaignLocationPlatformAdapter(clientStub());
  const canonical = [toCampaignCanonicalReference(odisha), toCampaignCanonicalReference(bmc)];
  const selected = adapter.selectPolicySubset(canonical, { includedCanonicalNodeIds: [bmc.nodeId] });
  assert.deepEqual(selected.map((item) => item.canonicalNodeId), [bmc.nodeId]);
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0].canonicalLabel, "Odisha");
});

test("shadow comparison preserves legacy names and classifies governance cases without substitution", () => {
  const adapter = new CampaignLocationPlatformAdapter(clientStub());
  const bmcReference = toCampaignCanonicalReference(bmc);
  assert.equal(adapter.compareShadow({ legacy: { label: bmc.displayName, level: "local_body", kind: "legacy_official" }, canonical: bmcReference }).classification, "MATCH");
  assert.equal(adapter.compareShadow({ legacy: { label: "  bhubaneswar municipal corporation ", level: "local_body", kind: "legacy_official" }, canonical: bmcReference }).classification, "LABEL_VARIANT");
  assert.equal(adapter.compareShadow({ legacy: { label: "Legacy place", kind: "legacy_official" } }).classification, "LEGACY_ONLY");
  assert.equal(adapter.compareShadow({ canonical: bmcReference }).classification, "CANONICAL_ONLY");
  assert.equal(adapter.compareShadow({ legacy: { label: "Balianta", kind: "legacy_official" }, canonical: toCampaignCanonicalReference(balianta), canonicalOutcome: "ambiguous" }).classification, "AMBIGUOUS");
  assert.equal(adapter.compareShadow({ legacy: { label: "No parent", kind: "legacy_official" }, canonicalOutcome: "unresolved" }).classification, "UNRESOLVED");
  assert.equal(adapter.compareShadow({ legacy: { label: "BMC", level: "block", kind: "legacy_official" }, canonical: bmcReference }).classification, "STRUCTURAL_MISMATCH");
  assert.equal(adapter.compareShadow({ legacy: { label: "Village chowk", kind: "campaign_manual" } }).classification, "CUSTOM_UNVERIFIED");
});

test("adapter preserves typed Location API failures", async () => {
  const adapter = new CampaignLocationPlatformAdapter({ ...clientStub(), metadata: async () => { throw new LocationApiClientError("unauthorized", 401); } });
  await assert.rejects(adapter.metadata(), { code: "unauthorized", status: 401 });
});

test("adapter is server-only and absent from protected browser runtime", () => {
  const adapterSource = readFileSync(new URL("../src/businessOs/location/server/CampaignLocationPlatformAdapter.ts", import.meta.url), "utf8");
  for (const forbidden of [
    "OdishaLgdGenerated", "OdishaLgdDataset", "CanonicalGeographyDataset", "CanonicalGeographyEngine", "IndiaAdministrativeHierarchy",
    "import.meta.env", "LOCATION_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL", "localStorage", "sessionStorage"
  ]) assert.doesNotMatch(adapterSource, new RegExp(forbidden));
  for (const path of [
    "../src/App.tsx", "../src/backend.ts", "../src/geography.ts", "../src/components/IndiaLocationFields.tsx",
    "../src/components/indiaLocationOptions.ts", "../src/components/useCampaignLocationCatalog.ts",
    "../src/pages/PublicCampaignPage.tsx", "../src/pages/app/CampaignsTab.tsx",
    "../src/pages/app/CoordinatorNetworkTab.tsx", "../src/pages/app/SaasTab.tsx"
  ]) assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /CampaignLocationPlatformAdapter/u, path);
});
