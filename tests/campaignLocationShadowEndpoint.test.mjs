import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CampaignLocationPlatformAdapter } from "../src/businessOs/location/server/CampaignLocationPlatformAdapter.ts";
import { createCampaignLocationShadowHandler } from "../supabase/functions/voiceup-campaign-location-shadow/index.ts";

const endpointSource = readFileSync(
  new URL("../supabase/functions/voiceup-campaign-location-shadow/index.ts", import.meta.url),
  "utf8"
);
const allowedOrigin = "https://app.voiceup.test";
const datasetVersion = "lgd-2026-08-27";
const source = {
  authority: "LGD",
  sourceDataset: "india-lgd",
  sourceDatasetVersion: datasetVersion,
  provenance: "derived_official"
};

function canonicalNode(displayName, level, officialCode, parentNodeId) {
  return {
    nodeId: `node-${level}-${officialCode}`,
    officialCode,
    level,
    entityKind: level === "block" ? "development_block" : level,
    displayName,
    datasetVersion,
    source,
    parents: parentNodeId ? [{ nodeId: parentNodeId, officialCode: null, level: "state", relationship: "administrative_parent", source }] : [],
    lineage: []
  };
}

const nodes = {
  India: canonicalNode("India", "country", "IN"),
  Odisha: canonicalNode("Odisha", "state", "21", "node-country-IN"),
  Khordha: canonicalNode("Khordha", "district", "362", "node-state-21"),
  Balianta: canonicalNode("Balianta", "block", "3456", "node-district-362"),
  "Gram Panchayat": canonicalNode("Gram Panchayat", "local_body", "115000", "node-block-3456")
};

function apiResponse(data) {
  return { apiVersion: "v1", datasetVersion, data };
}

function adapterFor(resolveOperation, events) {
  return new CampaignLocationPlatformAdapter({
    metadata: async () => {
      events.push("location:metadata");
      return apiResponse({ namespace: "/v1", datasetVersion, source, readOnly: true, security: {} });
    },
    resolve: async (request) => {
      events.push(`location:resolve:${request.normalizedName}:${request.parentNodeId ?? "root"}`);
      return apiResponse(await resolveOperation(request));
    }
  });
}

function defaultResolution(request) {
  const node = nodes[request.normalizedName];
  return node ? { status: "resolved", node } : { status: "unresolved", reason: "No canonical match." };
}

function campaign(overrides = {}) {
  return {
    id: "campaign-1",
    slug: "campaign-one",
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Balianta",
    panchayat: "Gram Panchayat",
    ...overrides
  };
}

function harness(options = {}) {
  const events = [];
  const storedCampaign = options.campaign ?? campaign();
  const expected = options.expectedScope ?? {
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    campaignSlug: "campaign-one"
  };
  let authorizationParameters;
  let adapterConstructions = 0;
  const admin = {
    async rpc(name, parameters) {
      events.push("authorization");
      authorizationParameters = { name, parameters };
      if (options.authorizationThrow) throw new Error("private authorization exception");
      if (options.authorizationError) return { data: null, error: new Error("private database detail") };
      if (options.authorizationData !== undefined) return { data: options.authorizationData, error: null };
      const authorized = parameters.p_workspace_id === expected.workspaceId
        && parameters.p_resource_id === expected.campaignId
        && parameters.p_resource_slug === expected.campaignSlug;
      return { data: authorized ? "authorized" : "forbidden", error: null };
    },
    from(table) {
      events.push(`subject:from:${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  events.push("subject:read");
                  if (options.subjectReadThrow) throw new Error("private subject exception");
                  if (options.subjectReadError) return { data: null, error: new Error("private subject detail") };
                  return { data: { data: { campaigns: [storedCampaign] } }, error: null };
                }
              };
            }
          };
        }
      };
    }
  };
  const handler = createCampaignLocationShadowHandler({
    allowedOrigins: new Set([allowedOrigin]),
    getUser: async () => {
      events.push("authentication");
      if (options.authenticationError) throw new Error("private auth detail");
      return options.user === undefined ? { id: "verified-user-1" } : options.user;
    },
    createAdminClient: () => {
      events.push("admin:create");
      return admin;
    },
    createAdapter: () => {
      events.push("adapter:create");
      adapterConstructions += 1;
      if (options.adapterConstructionError) throw new Error(options.adapterConstructionError);
      return adapterFor(options.resolveOperation ?? defaultResolution, events);
    }
  });
  return {
    handler,
    events,
    get authorizationParameters() { return authorizationParameters; },
    get adapterConstructions() { return adapterConstructions; }
  };
}

function body(overrides = {}) {
  return {
    action: "read_campaign_location_shadow",
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    campaignSlug: "campaign-one",
    subject: { type: "campaign_field", field: "district" },
    ...overrides
  };
}

function request(requestBody = body(), options = {}) {
  return new Request("https://edge.voiceup.test/functions/v1/voiceup-campaign-location-shadow", {
    method: options.method ?? "POST",
    headers: {
      "authorization": "Bearer verified-user-token",
      "content-type": "application/json",
      ...(options.origin === false ? {} : { origin: options.origin ?? allowedOrigin }),
      ...(options.headers ?? {})
    },
    body: options.method === "OPTIONS" ? undefined : JSON.stringify(requestBody)
  });
}

async function payload(response) {
  return await response.json();
}

test("authentication supplies the actor and exact fixed campaign authorization runs before subject access", async () => {
  const run = harness();
  const response = await run.handler(request());
  assert.equal(response.status, 200);
  assert.ok(run.events.indexOf("authentication") < run.events.indexOf("authorization"));
  assert.ok(run.events.indexOf("authorization") < run.events.indexOf("subject:read"));
  assert.ok(run.events.indexOf("subject:read") < run.events.indexOf("adapter:create"));
  assert.deepEqual(run.authorizationParameters, {
    name: "vboss_resource_location_authorization",
    parameters: {
      p_actor_user_id: "verified-user-1",
      p_workspace_id: "workspace-1",
      p_application_key: "voiceup",
      p_resource_type: "campaign",
      p_resource_id: "campaign-1",
      p_resource_slug: "campaign-one"
    }
  });
});

test("missing authentication fails before privileged access or Location API construction", async () => {
  const run = harness({ user: null });
  const response = await run.handler(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await payload(response), { error: "unauthorized" });
  assert.deepEqual(run.events, ["authentication"]);
  assert.equal(run.adapterConstructions, 0);
});

test("wrong workspace, campaign, and slug are IDOR-fenced by the existing authorization call", async () => {
  for (const override of [
    { workspaceId: "workspace-other" },
    { campaignId: "campaign-other" },
    { campaignSlug: "campaign-other" }
  ]) {
    const run = harness();
    const response = await run.handler(request(body(override)));
    assert.equal(response.status, 403);
    assert.deepEqual(await payload(response), { error: "forbidden" });
    assert.equal(run.events.includes("subject:read"), false);
    assert.equal(run.adapterConstructions, 0);
  }
});

test("archived, closed, missing, and mismatched campaign authorization outcomes fail closed", async () => {
  for (const authorizationData of ["campaign_archived", "campaign_not_found", "assignment_mismatch", "forbidden"]) {
    const run = harness({ authorizationData });
    const response = await run.handler(request());
    assert.equal(response.status, 403);
    assert.deepEqual(await payload(response), { error: "forbidden" });
    assert.equal(run.events.includes("subject:read"), false);
    assert.equal(run.adapterConstructions, 0);
  }
});

test("authorization and campaign subject read infrastructure failures are stable and private", async () => {
  for (const options of [{ authorizationError: true }, { authorizationThrow: true }]) {
    const authorizationFailure = harness(options);
    const authorizationResponse = await authorizationFailure.handler(request());
    assert.equal(authorizationResponse.status, 503);
    assert.deepEqual(await payload(authorizationResponse), { error: "authorization_unavailable" });
  }
  for (const options of [{ subjectReadError: true }, { subjectReadThrow: true }]) {
    const subjectFailure = harness(options);
    const subjectResponse = await subjectFailure.handler(request());
    assert.equal(subjectResponse.status, 503);
    assert.deepEqual(await payload(subjectResponse), { error: "campaign_subject_unavailable" });
  }
});

test("request accepts exactly one campaign-owned field and rejects arbitrary labels and actors", async () => {
  for (const invalidBody of [
    body({ subject: [{ type: "campaign_field", field: "district" }] }),
    body({ subjects: [{ type: "campaign_field", field: "district" }] }),
    body({ subject: { type: "campaign_field", field: "village" } }),
    body({ subject: { type: "campaign_field", field: "district", label: "Caller supplied" } }),
    body({ label: "Caller supplied" }),
    body({ actorUserId: "spoofed-user" }),
    body({ applicationKey: "other" }),
    body({ resourceType: "other" })
  ]) {
    const run = harness();
    const response = await run.handler(request(invalidBody));
    assert.equal(response.status, 400);
    assert.deepEqual(await payload(response), { error: "invalid_request" });
    assert.equal(run.events.length, 0);
  }
});

test("all and only the five bounded campaign fields are accepted", async () => {
  for (const field of ["country", "state", "district", "block", "panchayat"]) {
    const run = harness();
    const response = await run.handler(request(body({ subject: { type: "campaign_field", field } })));
    assert.equal(response.status, 200, field);
  }
  for (const key of ["workspaceId", "campaignId", "campaignSlug"]) {
    const run = harness();
    const response = await run.handler(request(body({ [key]: "x".repeat(121) })));
    assert.equal(response.status, 400, key);
  }
});

test("empty campaign-owned subject is rejected without constructing the Location API client", async () => {
  const run = harness({ campaign: campaign({ district: "" }) });
  const response = await run.handler(request());
  assert.equal(response.status, 400);
  assert.deepEqual(await payload(response), { error: "campaign_subject_empty" });
  assert.equal(run.adapterConstructions, 0);
});

test("request body is bounded to 16 KiB before authentication", async () => {
  const run = harness();
  const response = await run.handler(request(body(), { headers: { "content-length": String(16 * 1024 + 1) } }));
  assert.equal(response.status, 400);
  assert.deepEqual(run.events, []);
  const actualBytesRun = harness();
  const oversized = body({ campaignSlug: "x".repeat(17 * 1024) });
  const actualBytesResponse = await actualBytesRun.handler(request(oversized));
  assert.equal(actualBytesResponse.status, 400);
  assert.deepEqual(actualBytesRun.events, []);
});

test("CORS allows one exact origin, rejects other origins, and never emits a wildcard", async () => {
  const run = harness();
  const preflight = await run.handler(request({}, { method: "OPTIONS" }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), allowedOrigin);
  assert.equal(preflight.headers.get("vary"), "Origin");
  const rejected = await run.handler(request(body(), { origin: "https://hostile.example" }));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  assert.equal(rejected.headers.get("vary"), "Origin");
  assert.doesNotMatch(endpointSource, /Access-Control-Allow-Origin[\s\S]{0,30}["']\*["']/u);
});

test("resolved shadow response preserves canonical identity, provenance, and non-authoritative flags", async () => {
  const run = harness();
  const response = await run.handler(request());
  const result = await payload(response);
  assert.equal(result.apiVersion, "v1");
  assert.equal(result.shadowOnly, true);
  assert.equal(result.authoritative, false);
  assert.deepEqual(result.scope, { workspaceId: "workspace-1", campaignId: "campaign-1", campaignSlug: "campaign-one" });
  assert.deepEqual(result.subject, { type: "campaign_field", field: "district" });
  assert.equal(result.datasetVersion, datasetVersion);
  assert.equal(result.resolution.status, "resolved");
  assert.deepEqual(result.resolution.reference, {
    canonicalNodeId: "node-district-362",
      officialCode: "362",
      level: "district",
      entityKind: "district",
      canonicalLabel: "Khordha",
    dataset: { authority: "LGD", sourceDataset: "india-lgd", datasetVersion }
  });
  assert.equal(result.comparison.classification, "MATCH");
});

test("ambiguous, unresolved, and invalid canonical states remain explicit", async () => {
  const cases = [
    [{ status: "ambiguous", candidates: [nodes.Khordha], reason: "Multiple candidates." }, "AMBIGUOUS"],
    [{ status: "unresolved", reason: "No canonical match." }, "UNRESOLVED"],
    [{ status: "invalid", reason: "Invalid constraint." }, "UNRESOLVED"]
  ];
  for (const [resolution, classification] of cases) {
    const run = harness({
      campaign: campaign({ country: "Test country" }),
      resolveOperation: async () => resolution
    });
    const response = await run.handler(request(body({ subject: { type: "campaign_field", field: "country" } })));
    const result = await payload(response);
    assert.equal(response.status, 200);
    assert.equal(result.resolution.status, resolution.status);
    assert.equal(result.comparison.classification, classification);
  }
});

test("an ambiguous parent is preserved and prevents an unconstrained target retry", async () => {
  const run = harness({
    campaign: campaign({ country: "", state: "Odisha", district: "Khordha" }),
    resolveOperation: async (resolutionRequest) => resolutionRequest.normalizedName === "Odisha"
      ? { status: "ambiguous", candidates: [nodes.Odisha], reason: "Parent ambiguous." }
      : defaultResolution(resolutionRequest)
  });
  const response = await run.handler(request());
  const result = await payload(response);
  assert.equal(response.status, 200);
  assert.equal(result.resolution.status, "ambiguous");
  assert.deepEqual(result.resolution.blockedByParent, { field: "state", status: "ambiguous" });
  assert.equal(result.comparison.classification, "AMBIGUOUS");
  assert.equal(run.events.some((event) => event.includes("resolve:Khordha")), false);
});

test("resolved descendants retain every resolved parent constraint", async () => {
  const run = harness();
  const response = await run.handler(request());
  assert.equal(response.status, 200);
  assert.ok(run.events.includes("location:resolve:India:root"));
  assert.ok(run.events.includes("location:resolve:Odisha:node-country-IN"));
  assert.ok(run.events.includes("location:resolve:Khordha:node-state-21"));
});

test("Location API construction and downstream failures return a stable 503 without credential leakage", async () => {
  const secret = "unit-test-location-secret";
  const constructionFailure = harness({ adapterConstructionError: secret });
  const constructionResponse = await constructionFailure.handler(request());
  assert.equal(constructionResponse.status, 503);
  const constructionBody = await payload(constructionResponse);
  assert.deepEqual(constructionBody, { error: "location_api_unavailable" });
  assert.doesNotMatch(JSON.stringify(constructionBody), new RegExp(secret));

  const downstreamFailure = harness({ resolveOperation: async () => { throw new Error(secret); } });
  const downstreamResponse = await downstreamFailure.handler(request());
  assert.equal(downstreamResponse.status, 503);
  const downstreamBody = await payload(downstreamResponse);
  assert.deepEqual(downstreamBody, { error: "location_api_unavailable" });
  assert.doesNotMatch(JSON.stringify(downstreamBody), new RegExp(secret));
});

test("endpoint source keeps credentials server-only and contains no write surface", () => {
  assert.match(endpointSource, /Deno\.env\.get\("LOCATION_API_KEY"\)/u);
  assert.match(endpointSource, /Deno\.env\.get\("SUPABASE_ANON_KEY"\)/u);
  assert.match(endpointSource, /Deno\.env\.get\("SUPABASE_URL"\)/u);
  assert.doesNotMatch(endpointSource, /VITE_/u);
  assert.doesNotMatch(endpointSource, /console\.|authorization\.headers|service.role.key|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL/iu);
  assert.doesNotMatch(endpointSource, /\b(insert|update|delete|upsert)\b|add_resource_location|deactivate_resource_location|commit_resource_location_import|validate_resource_location_import/iu);
  assert.equal((endpointSource.match(/\.from\(/gu) ?? []).length, 1);
  assert.match(endpointSource, /\.from\("voiceup_workspaces"\)/u);
});

test("new endpoint and server adapter remain absent from every protected browser/live campaign path", () => {
  for (const path of [
    "../src/App.tsx",
    "../src/backend.ts",
    "../src/components/useCampaignLocationCatalog.ts",
    "../src/components/IndiaLocationFields.tsx",
    "../src/pages/PublicCampaignPage.tsx",
    "../src/pages/app/CampaignsTab.tsx",
    "../src/businessOs/masterData/ResourceLocationManager.tsx",
    "../supabase/functions/voiceup-campaign-locations/index.ts"
  ]) {
    const sourceText = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(sourceText, /voiceup-campaign-location-shadow|CampaignLocationPlatformAdapter|LocationApiClient/u, path);
  }
});
