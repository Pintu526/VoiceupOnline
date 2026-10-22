import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LocationBrowserCatalogClient,
  LocationBrowserCatalogClientError
} from "../src/businessOs/location/browser/LocationBrowserCatalogClient.ts";
import {
  representUnverifiedCustomLocation
} from "../src/businessOs/location/browser/LocationBrowserCatalogContract.ts";

const versionOne = "lgd-2026-08-27";
const versionTwo = "lgd-2026-09-30";

function dataset(datasetVersion = versionOne, sourceDataset = "india-lgd") {
  return { authority: "LGD", sourceDataset, datasetVersion };
}

function node(label, nodeId, level = "district", identity = dataset()) {
  return {
    nodeId,
    officialCode: nodeId.split("-").at(-1),
    label,
    level,
    entityKind: level,
    parents: [],
    lineage: [],
    ...identity
  };
}

function response(data, identity = dataset()) {
  return { apiVersion: "v1", readOnly: true, dataset: identity, data };
}

function metadata(identity = dataset()) {
  return response({ namespace: "/v1", readOnly: true }, identity);
}

test("browser client exposes metadata, node, children, constrained resolve, and constrained search", async () => {
  const calls = [];
  const khordha = node("Khordha", "in-state-odisha-district-362");
  const transport = async (request) => {
    calls.push(request);
    switch (request.query.operation) {
      case "metadata": return metadata();
      case "node": return response({ node: khordha });
      case "children": return response({ parentNodeId: request.query.parentNodeId, nodes: [khordha] });
      case "resolve": return response({ resolution: { status: "resolved", node: khordha } });
      case "search": return response({ resolution: { status: "ambiguous", candidates: [khordha], reason: "Bounded candidates." } });
      default: throw new Error("unexpected operation");
    }
  };
  const client = new LocationBrowserCatalogClient({
    access: { type: "workspace", workspaceId: "workspace-1" },
    transport
  });

  assert.deepEqual(await client.metadata(), dataset());
  assert.deepEqual(await client.node(khordha.nodeId), khordha);
  assert.deepEqual(await client.children("in-state-odisha", 25), [khordha]);
  assert.equal((await client.resolve({ officialCode: "362", expectedLevel: "district" })).status, "resolved");
  assert.equal((await client.search({ normalizedName: "Khordha", parentNodeId: "in-state-odisha" })).status, "ambiguous");
  assert.deepEqual(calls.map((call) => call.query.operation), ["metadata", "node", "children", "resolve", "search"]);
  assert.ok(calls.every((call) => call.action === "read_canonical_location_catalog"));
  assert.ok(calls.every((call) => call.access.type === "workspace"));
});

test("children cache key includes source, version, parent, and result limit", async () => {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    if (request.query.operation === "metadata") return metadata();
    return response({ parentNodeId: request.query.parentNodeId, nodes: [] });
  };
  const client = new LocationBrowserCatalogClient({
    access: { type: "campaign", workspaceId: "workspace-1", campaignId: "campaign-1", campaignSlug: "campaign-one" },
    transport
  });
  await client.children("parent-a", 10);
  await client.children("parent-a", 10);
  await client.children("parent-b", 10);
  await client.children("parent-a", 20);
  assert.deepEqual(calls.map((call) => `${call.query.operation}:${call.query.parentNodeId ?? ""}:${call.query.resultLimit ?? ""}`), [
    "metadata::",
    "children:parent-a:10",
    "children:parent-b:10",
    "children:parent-a:20"
  ]);
});

test("metadata change invalidates stale children cache and builds a new source/version key", async () => {
  let now = 1_000;
  let active = dataset(versionOne);
  let childCalls = 0;
  const transport = async (request) => {
    if (request.query.operation === "metadata") return metadata(active);
    childCalls += 1;
    return response({ parentNodeId: request.query.parentNodeId, nodes: [node(`Child ${childCalls}`, `child-${childCalls}`, "district", active)] }, active);
  };
  const client = new LocationBrowserCatalogClient({
    access: { type: "public_campaign", campaignSlug: "published-campaign" },
    transport,
    metadataTtlMs: 100,
    now: () => now
  });
  assert.equal((await client.children("in-state-odisha"))[0].label, "Child 1");
  assert.equal((await client.children("in-state-odisha"))[0].label, "Child 1");
  active = dataset(versionTwo);
  now += 101;
  assert.equal((await client.children("in-state-odisha"))[0].label, "Child 2");
  assert.equal(childCalls, 2);
  assert.deepEqual(await client.metadata(), dataset(versionTwo));
});

test("mixed top-level or node dataset responses fail closed and clear cached children", async () => {
  let mode = "normal";
  let childrenCalls = 0;
  const transport = async (request) => {
    if (request.query.operation === "metadata") return metadata();
    childrenCalls += 1;
    if (mode === "top-level-mixed") return response({ parentNodeId: request.query.parentNodeId, nodes: [] }, dataset(versionTwo));
    if (mode === "node-mixed") return response({ parentNodeId: request.query.parentNodeId, nodes: [node("Mixed", "mixed", "district", dataset(versionTwo))] });
    return response({ parentNodeId: request.query.parentNodeId, nodes: [] });
  };
  const client = new LocationBrowserCatalogClient({
    access: { type: "workspace", workspaceId: "workspace-1" },
    transport
  });
  await client.children("cached-parent");
  mode = "top-level-mixed";
  await assert.rejects(client.children("different-parent"), (error) => error instanceof LocationBrowserCatalogClientError && error.code === "mixed_dataset");
  mode = "node-mixed";
  await assert.rejects(client.children("node-mixed-parent"), { code: "mixed_dataset" });
  mode = "normal";
  await client.children("cached-parent");
  assert.equal(childrenCalls, 4);
});

test("request and result bounds are enforced in the browser client", async () => {
  const client = new LocationBrowserCatalogClient({
    access: { type: "workspace", workspaceId: "workspace-1" },
    transport: async () => metadata()
  });
  await assert.rejects(client.children("parent", 101), { code: "invalid_request" });
  await assert.rejects(client.resolve({}), { code: "invalid_request" });
  await assert.rejects(client.node(" "), { code: "invalid_request" });
});

test("stalled authenticated catalog request reaches a bounded retryable transport error", async () => {
  const client = new LocationBrowserCatalogClient({
    access: { type: "workspace", workspaceId: "workspace-1" },
    transport: async () => await new Promise(() => {}),
    requestTimeoutMs: 10
  });
  await assert.rejects(client.metadata(), (error) =>
    error instanceof LocationBrowserCatalogClientError && error.code === "transport_error"
  );
});

test("custom/manual labels stay unverified and never acquire canonical identity from label equality", () => {
  const custom = representUnverifiedCustomLocation({
    customId: "custom-1",
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    source: "campaign_manual"
  });
  assert.equal(custom.verificationStatus, "unverified_custom");
  assert.equal(custom.canonicalNodeId, null);
  assert.equal(custom.officialCode, null);
  assert.equal(custom.block, "Bhubaneswar");
  assert.equal("datasetVersion" in custom, false);
  assert.equal("authority" in custom, false);
});

test("browser boundary source has no server credentials or generated datasets and only migrated consumers import it", () => {
  const clientSource = readFileSync(new URL("../src/businessOs/location/browser/LocationBrowserCatalogClient.ts", import.meta.url), "utf8");
  const contractSource = readFileSync(new URL("../src/businessOs/location/browser/LocationBrowserCatalogContract.ts", import.meta.url), "utf8");
  const combined = `${clientSource}\n${contractSource}`;
  for (const forbidden of [
    "LOCATION_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "VITE_",
    "OdishaLgdGenerated",
    "CanonicalGeographyEngine",
    "geography.ts",
    "indiaMasterGeography",
    "business-os-compatibility"
  ]) assert.doesNotMatch(combined, new RegExp(forbidden), forbidden);

  for (const path of [
    "../src/components/IndiaLocationFields.tsx",
    "../src/components/indiaLocationOptions.ts",
    "../src/components/useCampaignLocationCatalog.ts",
    "../src/businessOs/masterData/ResourceLocationManager.tsx"
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /LocationBrowserCatalogClient|voiceup-location-catalog-v1/u, path);
  }

  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
  const saasSource = readFileSync(new URL("../src/pages/app/SaasTab.tsx", import.meta.url), "utf8");
  const publicPageSource = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const campaignsSource = readFileSync(new URL("../src/pages/app/CampaignsTab.tsx", import.meta.url), "utf8");
  const coordinatorsSource = readFileSync(new URL("../src/pages/app/CoordinatorNetworkTab.tsx", import.meta.url), "utf8");
  assert.match(backendSource, /invokeWorkspaceLocationCatalog/u);
  assert.match(backendSource, /invokePublicCampaignLocationCatalog/u);
  assert.match(backendSource, /voiceup-location-catalog-v1/u);
  assert.match(saasSource, /SaasLocationGovernancePicker/u);
  assert.doesNotMatch(saasSource, /LocationBrowserCatalogClient/u);
  assert.match(publicPageSource, /PublicCampaignCanonicalLocationDisplay/u);
  assert.doesNotMatch(publicPageSource, /LocationBrowserCatalogClient/u);
  assert.match(appSource, /LocationBrowserCatalogClient/u);
  assert.match(campaignsSource, /WorkspaceCanonicalLocationPicker/u);
  assert.match(coordinatorsSource, /WorkspaceCanonicalLocationPicker/u);
});
