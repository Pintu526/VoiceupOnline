import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLocationBrowserCatalogHandler } from "../supabase/functions/voiceup-location-catalog-v1/index.ts";

const allowedOrigin = "https://app.voiceup.test";
const version = "lgd-2026-08-27";
const source = {
  authority: "LGD",
  sourceDataset: "india-lgd",
  sourceDatasetVersion: version,
  provenance: "official"
};
const identity = { authority: source.authority, sourceDataset: source.sourceDataset, datasetVersion: version };
const endpointSource = readFileSync(new URL("../supabase/functions/voiceup-location-catalog-v1/index.ts", import.meta.url), "utf8");

function canonicalNode(overrides = {}) {
  return {
    nodeId: "in-state-odisha-district-362",
    officialCode: "362",
    level: "district",
    entityKind: "district",
    displayName: "Khordha",
    datasetVersion: version,
    source,
    parents: [{
      nodeId: "in-state-odisha",
      officialCode: "21",
      level: "state",
      relationship: "administrative_parent",
      source
    }],
    lineage: [
      { nodeId: "in", officialCode: "IN", level: "country" },
      { nodeId: "in-state-odisha", officialCode: "21", level: "state" }
    ],
    ...overrides
  };
}

function apiResponse(data, datasetVersion = version) {
  return { apiVersion: "v1", datasetVersion, data };
}

function requestBody(access, query = { operation: "metadata" }) {
  return { action: "read_canonical_location_catalog", access, query };
}

function request(body, options = {}) {
  return new Request("https://edge.voiceup.test/functions/v1/voiceup-location-catalog-v1", {
    method: options.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(options.origin === false ? {} : { origin: options.origin ?? allowedOrigin }),
      ...(options.auth === false ? {} : { authorization: "Bearer user-token" }),
      ...(options.headers ?? {})
    },
    body: options.method === "OPTIONS" ? undefined : JSON.stringify(body)
  });
}

function harness(options = {}) {
  const events = [];
  let authorizationCall;
  const admin = {
    async rpc(name, parameters) {
      events.push("campaign-authorization");
      authorizationCall = { name, parameters };
      if (options.authorizationThrows) throw new Error("private authorization detail");
      if (options.authorizationError) return { data: null, error: new Error("private database detail") };
      return { data: options.campaignAuthorized === false ? "forbidden" : "authorized", error: null };
    }
  };
  const locationClient = {
    async metadata() {
      events.push("location:metadata");
      if (options.locationThrows) throw new Error(options.locationThrows);
      const metadataVersion = options.metadataVersion ?? version;
      const metadataSource = {
        ...source,
        sourceDatasetVersion: options.metadataSourceVersion ?? metadataVersion
      };
      return apiResponse({ namespace: "/v1", datasetVersion: metadataVersion, source: metadataSource, readOnly: true, security: {} }, metadataVersion);
    },
    async getNode(nodeId) {
      events.push(`location:node:${nodeId}`);
      return apiResponse(canonicalNode(options.nodeOverrides));
    },
    async getChildren(nodeId) {
      events.push(`location:children:${nodeId}`);
      const nodes = options.children ?? [canonicalNode()];
      return apiResponse({ nodeId, nodes }, options.operationVersion ?? version);
    },
    async resolve(input) {
      events.push("location:resolve");
      options.onResolutionRequest?.(input);
      return apiResponse(options.resolution ?? { status: "resolved", node: canonicalNode() }, options.operationVersion ?? version);
    },
    async search(input) {
      events.push("location:search");
      options.onResolutionRequest?.(input);
      return apiResponse(options.resolution ?? { status: "ambiguous", candidates: [canonicalNode()], reason: "Multiple candidates." }, options.operationVersion ?? version);
    }
  };
  let locationConstructions = 0;
  const handler = createLocationBrowserCatalogHandler({
    allowedOrigins: new Set([allowedOrigin]),
    getUser: async () => {
      events.push("authentication");
      if (options.authenticationThrows) throw new Error("private auth detail");
      return options.user === null ? null : { id: "user-1" };
    },
    createAdminClient: () => {
      events.push("admin:create");
      if (options.adminThrows) throw new Error("private admin detail");
      return admin;
    },
    authorizeWorkspace: async (_admin, userId, workspaceId) => {
      events.push(`workspace-authorization:${userId}:${workspaceId}`);
      if (options.workspaceAuthorizationThrows) throw new Error("private workspace detail");
      return options.workspaceAuthorized !== false;
    },
    resolvePublishedCampaign: async (_admin, slug) => {
      events.push(`public-resolution:${slug}`);
      if (options.publicResolutionThrows) throw new Error("private public detail");
      return options.publicPublished !== false;
    },
    createLocationClient: () => {
      events.push("location:create");
      locationConstructions += 1;
      return locationClient;
    }
  });
  return {
    handler,
    events,
    get authorizationCall() { return authorizationCall; },
    get locationConstructions() { return locationConstructions; }
  };
}

async function payload(response) {
  return await response.json();
}

test("authenticated workspace access is required before Location API construction", async () => {
  const access = { type: "workspace", workspaceId: "workspace-1" };
  const accepted = harness();
  assert.equal((await accepted.handler(request(requestBody(access)))).status, 200);
  assert.ok(accepted.events.indexOf("authentication") < accepted.events.indexOf("workspace-authorization:user-1:workspace-1"));
  assert.ok(accepted.events.indexOf("workspace-authorization:user-1:workspace-1") < accepted.events.indexOf("location:create"));

  const unauthenticated = harness({ user: null });
  const unauthenticatedResponse = await unauthenticated.handler(request(requestBody(access), { auth: false }));
  assert.equal(unauthenticatedResponse.status, 401);
  assert.deepEqual(await payload(unauthenticatedResponse), { error: "unauthorized" });
  assert.equal(unauthenticated.locationConstructions, 0);

  const wrongWorkspace = harness({ workspaceAuthorized: false });
  assert.equal((await wrongWorkspace.handler(request(requestBody(access)))).status, 403);
  assert.equal(wrongWorkspace.locationConstructions, 0);
});

test("campaign access uses the fixed VBOSS authorization boundary and campaign ID alone is insufficient", async () => {
  const access = { type: "campaign", workspaceId: "workspace-1", campaignId: "campaign-1", campaignSlug: "campaign-one" };
  const run = harness();
  assert.equal((await run.handler(request(requestBody(access)))).status, 200);
  assert.deepEqual(run.authorizationCall, {
    name: "vboss_resource_location_authorization",
    parameters: {
      p_actor_user_id: "user-1",
      p_workspace_id: "workspace-1",
      p_application_key: "voiceup",
      p_resource_type: "campaign",
      p_resource_id: "campaign-1",
      p_resource_slug: "campaign-one"
    }
  });

  for (const incomplete of [
    { type: "campaign", campaignId: "campaign-1" },
    { type: "campaign", workspaceId: "workspace-1", campaignId: "campaign-1" },
    { type: "campaign", workspaceId: "workspace-1", campaignId: "campaign-1", campaignSlug: "" }
  ]) {
    const rejected = harness();
    assert.equal((await rejected.handler(request(requestBody(incomplete)))).status, 400);
    assert.equal(rejected.events.length, 0);
  }
});

test("wrong campaign workspace or slug authorization fails closed", async () => {
  for (const access of [
    { type: "campaign", workspaceId: "wrong", campaignId: "campaign-1", campaignSlug: "campaign-one" },
    { type: "campaign", workspaceId: "workspace-1", campaignId: "wrong", campaignSlug: "campaign-one" },
    { type: "campaign", workspaceId: "workspace-1", campaignId: "campaign-1", campaignSlug: "wrong" }
  ]) {
    const run = harness({ campaignAuthorized: false });
    const response = await run.handler(request(requestBody(access)));
    assert.equal(response.status, 403);
    assert.equal(run.locationConstructions, 0);
  }
});

test("public access requires a published campaign slug without authenticating a browser user", async () => {
  const access = { type: "public_campaign", campaignSlug: "published-campaign" };
  const published = harness();
  const response = await published.handler(request(requestBody(access), { auth: false }));
  assert.equal(response.status, 200);
  assert.equal(published.events.includes("authentication"), false);
  assert.ok(published.events.includes("public-resolution:published-campaign"));

  const unpublished = harness({ publicPublished: false });
  const rejected = await unpublished.handler(request(requestBody(access), { auth: false }));
  assert.equal(rejected.status, 404);
  assert.deepEqual(await payload(rejected), { error: "not_found" });
  assert.equal(unpublished.locationConstructions, 0);
});

test("metadata and canonical node responses preserve identity and provenance", async () => {
  const access = { type: "workspace", workspaceId: "workspace-1" };
  const metadataResponse = await harness().handler(request(requestBody(access)));
  assert.deepEqual(await payload(metadataResponse), {
    apiVersion: "v1",
    readOnly: true,
    dataset: identity,
    data: { namespace: "/v1", readOnly: true }
  });

  const nodeResponse = await harness().handler(request(requestBody(access, {
    operation: "node",
    nodeId: "in-state-odisha-district-362"
  })));
  const result = await payload(nodeResponse);
  assert.equal(result.data.node.nodeId, "in-state-odisha-district-362");
  assert.equal(result.data.node.officialCode, "362");
  assert.equal(result.data.node.label, "Khordha");
  assert.equal(result.data.node.level, "district");
  assert.equal(result.data.node.entityKind, "district");
  assert.deepEqual(result.data.node.parents[0].source, identity);
  assert.deepEqual(result.data.node.lineage.map((item) => item.nodeId), ["in", "in-state-odisha"]);
  assert.equal(result.data.node.authority, "LGD");
  assert.equal(result.data.node.sourceDataset, "india-lgd");
  assert.equal(result.data.node.datasetVersion, version);
});

test("children and resolution results are bounded and pinned to metadata source/version", async () => {
  const access = { type: "workspace", workspaceId: "workspace-1" };
  const manyChildren = Array.from({ length: 20 }, (_, index) => canonicalNode({ nodeId: `district-${index}`, officialCode: String(index) }));
  const childrenRun = harness({ children: manyChildren });
  const childrenResponse = await childrenRun.handler(request(requestBody(access, {
    operation: "children",
    parentNodeId: "in-state-odisha",
    resultLimit: 5
  })));
  const childrenResult = await payload(childrenResponse);
  assert.equal(childrenResult.data.nodes.length, 5);

  let captured;
  const resolutionRun = harness({ onResolutionRequest: (input) => { captured = input; } });
  const resolutionResponse = await resolutionRun.handler(request(requestBody(access, {
    operation: "resolve",
    officialCode: "362",
    expectedLevel: "district",
    resultLimit: 10
  })));
  assert.equal(resolutionResponse.status, 200);
  assert.equal((await payload(resolutionResponse)).data.resolution.status, "resolved");
  assert.equal(captured.sourceDataset, "india-lgd");
  assert.equal(captured.datasetVersion, version);

  const searchResponse = await harness().handler(request(requestBody(access, {
    operation: "search",
    normalizedName: "Khordha",
    parentNodeId: "in-state-odisha",
    resultLimit: 10
  })));
  assert.equal(searchResponse.status, 200);
  assert.equal((await payload(searchResponse)).data.resolution.status, "ambiguous");
});

test("unconstrained search, invalid limits, mutation names, and oversized requests are rejected before authorization", async () => {
  const access = { type: "workspace", workspaceId: "workspace-1" };
  for (const query of [
    { operation: "search", normalizedName: "Khordha" },
    { operation: "children", parentNodeId: "in-state-odisha", resultLimit: 101 },
    { operation: "insert", nodeId: "x" },
    { operation: "delete", nodeId: "x" },
    { operation: "validate", nodeId: "x" }
  ]) {
    const run = harness();
    const response = await run.handler(request(requestBody(access, query)));
    assert.equal(response.status, 400);
    assert.equal(run.events.length, 0);
  }

  const declared = harness();
  const declaredResponse = await declared.handler(request(requestBody(access), {
    headers: { "content-length": String(16 * 1024 + 1) }
  }));
  assert.equal(declaredResponse.status, 413);
  assert.equal(declared.events.length, 0);

  const actual = harness();
  const actualResponse = await actual.handler(request({
    ...requestBody(access),
    padding: "x".repeat(17 * 1024)
  }));
  assert.equal(actualResponse.status, 413);
  assert.equal(actual.events.length, 0);
});

test("mixed canonical metadata, operation, node, and parent sources fail closed", async () => {
  const access = { type: "workspace", workspaceId: "workspace-1" };
  for (const [options, query] of [
    [{ metadataSourceVersion: "wrong" }, { operation: "metadata" }],
    [{ operationVersion: "wrong" }, { operation: "children", parentNodeId: "in-state-odisha" }],
    [{ nodeOverrides: { datasetVersion: "wrong" } }, { operation: "node", nodeId: "district" }],
    [{ nodeOverrides: { source: { ...source, sourceDataset: "wrong" } } }, { operation: "node", nodeId: "district" }]
  ]) {
    const response = await harness(options).handler(request(requestBody(access, query)));
    assert.equal(response.status, 503);
    assert.deepEqual(await payload(response), { error: "mixed_or_invalid_canonical_response" });
  }
});

test("CORS is exact-origin, wildcard-free, and originless trusted calls are supported", async () => {
  const access = { type: "workspace", workspaceId: "workspace-1" };
  const preflight = await harness().handler(request({}, { method: "OPTIONS" }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), allowedOrigin);
  assert.equal(preflight.headers.get("vary"), "Origin");

  const hostile = await harness().handler(request(requestBody(access), { origin: "https://hostile.example" }));
  assert.equal(hostile.status, 403);
  assert.equal(hostile.headers.get("access-control-allow-origin"), null);

  const originless = await harness().handler(request(requestBody(access), { origin: false }));
  assert.equal(originless.status, 200);
  assert.equal(originless.headers.get("access-control-allow-origin"), null);
  assert.doesNotMatch(endpointSource, /Access-Control-Allow-Origin[\s\S]{0,30}["']\*["']/u);
});

test("infrastructure failures return stable errors without credential or private-detail leakage", async () => {
  const access = { type: "workspace", workspaceId: "workspace-1" };
  const secret = "private-secret-value";
  for (const options of [
    { authenticationThrows: true },
    { workspaceAuthorizationThrows: true },
    { locationThrows: secret }
  ]) {
    const response = await harness(options).handler(request(requestBody(access)));
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await payload(response)), new RegExp(secret));
  }
});

test("gateway source is server-configured, read-only, and imports no generated or compatibility geography", () => {
  assert.match(endpointSource, /Deno\.env\.get\("LOCATION_API_KEY"\)/u);
  assert.match(endpointSource, /new LocationApiClient/u);
  assert.doesNotMatch(endpointSource, /VITE_|OdishaLgdGenerated|CanonicalGeographyEngine|indiaMasterGeography|business-os-compatibility/u);
  assert.doesNotMatch(endpointSource, /Access-Control-Allow-Origin[\s\S]{0,30}["']\*["']/u);
  assert.doesNotMatch(endpointSource, /\.from\(|\b(insert|update|delete|upsert)\b|add_resource_location|commit_resource_location_import|deactivate_resource_location/iu);
});
