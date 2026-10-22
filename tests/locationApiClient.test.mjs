import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LocationApiClient,
  LocationApiClientError
} from "../src/businessOs/location/server/LocationApiClient.ts";

const apiKey = "unit-test-location-key";
const gatewayToken = "unit-test-gateway-token";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function success(data, datasetVersion = "lgd-2026-08-27") {
  return { apiVersion: "v1", datasetVersion, data };
}

function mockClient(payloads, options = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = payloads.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return {
    calls,
    client: new LocationApiClient({
      baseUrl: "https://location.example.test/functions/v1/location-api-v1/",
      apiKey,
      gatewayBearerToken: gatewayToken,
      fetch,
      ...options
    })
  };
}

test("LocationApiClient maps every v1 operation through a bounded authenticated POST", async () => {
  const payloads = Array.from({ length: 11 }, (_, index) => response(success({ operation: index })));
  const { client, calls } = mockClient(payloads);
  const reference = {
    nodeId: "in-state-odisha",
    officialCode: "21",
    level: "state",
    datasetVersion: "lgd-2026-08-27",
    source: { authority: "LGD", sourceDataset: "india-lgd", sourceDatasetVersion: "lgd-2026-08-27" },
    lineage: []
  };
  await client.metadata();
  await client.getNode("in-state-odisha");
  await client.getByOfficialCode("362", { expectedLevel: "district" });
  await client.getChildren("district");
  await client.getParents("bmc");
  await client.getLineage("bmc");
  await client.search({ normalizedName: "Balianta", parentNodeId: "district" });
  await client.resolve({ officialCode: "250520", expectedLevel: "local_body" });
  await client.validate({ reference, expectedLevel: "state" });
  await client.isDescendant("bmc", "district");
  await client.relationship("ward", "bmc");
  assert.equal(calls.length, 11);
  assert.equal(calls[0].url, "https://location.example.test/functions/v1/location-api-v1");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["x-api-key"], apiKey);
  assert.equal(calls[0].init.headers.authorization, `Bearer ${gatewayToken}`);
  assert.deepEqual(calls.map((call) => JSON.parse(call.init.body).operation), [
    "metadata", "node", "officialCode", "children", "parents", "lineage", "search", "resolve", "validate", "descendant", "relationship"
  ]);
});

for (const [label, status, code] of [
  ["unauthorized", 401, "unauthorized"],
  ["not found", 404, "not_found"],
  ["invalid request", 400, "invalid_request"],
  ["API failure", 500, "api_error"]
]) {
  test(`LocationApiClient returns deterministic ${label} errors without credential leakage`, async () => {
    const { client } = mockClient([response({ apiVersion: "v1", error: { code: "ignored" } }, status)]);
    await assert.rejects(client.metadata(), (error) => {
      assert.ok(error instanceof LocationApiClientError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, new RegExp(`${apiKey}|${gatewayToken}`));
      return true;
    });
  });
}

test("LocationApiClient rejects malformed responses, invalid inputs, oversized requests, and network failures", async () => {
  const malformed = mockClient([response({ apiVersion: "v1", datasetVersion: "lgd-2026-08-27" })]).client;
  await assert.rejects(malformed.metadata(), { code: "invalid_response" });
  const unbounded = mockClient([response(success({ nodes: Array.from({ length: 101 }) }))]).client;
  await assert.rejects(unbounded.getChildren("district"), { code: "invalid_response" });
  const network = mockClient([new Error("network down")]).client;
  await assert.rejects(network.metadata(), { code: "network_error" });
  const unused = mockClient([]).client;
  assert.throws(() => unused.getNode("  "), { code: "invalid_request" });
  await assert.rejects(unused.search({ normalizedName: "x".repeat(20_000) }), { code: "invalid_request" });
});

test("LocationApiClient reports an aborted fetch as a timeout", async () => {
  const fetch = async (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const client = new LocationApiClient({ baseUrl: "https://location.example.test", apiKey, fetch, timeoutMs: 100 });
  await assert.rejects(client.metadata(), { code: "timeout" });
});

test("LocationApiClient remains dataset- and browser-runtime-free", () => {
  const source = readFileSync(new URL("../src/businessOs/location/server/LocationApiClient.ts", import.meta.url), "utf8");
  for (const forbidden of [
    "OdishaLgdGenerated", "OdishaLgdDataset", "CanonicalGeographyDataset", "CanonicalGeographyEngine", "IndiaAdministrativeHierarchy",
    "import.meta.env", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"
  ]) assert.doesNotMatch(source, new RegExp(forbidden));
});

test("LocationApiClient is absent from protected browser consumers and browser source contains no server credential names", () => {
  const protectedBrowserSources = [
    "../src/App.tsx",
    "../src/backend.ts",
    "../src/geography.ts",
    "../src/components/IndiaLocationFields.tsx",
    "../src/components/indiaLocationOptions.ts",
    "../src/components/useCampaignLocationCatalog.ts",
    "../src/pages/PublicCampaignPage.tsx",
    "../src/pages/app/CampaignsTab.tsx",
    "../src/pages/app/CoordinatorNetworkTab.tsx",
    "../src/pages/app/SaasTab.tsx"
  ];
  for (const path of protectedBrowserSources) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /LocationApiClient/u, path);
    assert.doesNotMatch(source, /LOCATION_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL/u, path);
  }
});
