import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LocationBrowserCatalogClient } from "../src/businessOs/location/browser/LocationBrowserCatalogClient.ts";
import { createIndiaLgdCatalogReader } from "../src/businessOs/location/ui/IndiaLgdCatalogReader.ts";
import {
  resolvePublicCampaignCanonicalLocation
} from "../src/businessOs/location/ui/PublicCampaignCanonicalLocationModel.ts";

const dataset = Object.freeze({
  authority: "LGD",
  sourceDataset: "india-lgd",
  datasetVersion: "fixture-version"
});

function canonicalNode({ nodeId, officialCode, label, level, entityKind, parent }) {
  return {
    ...dataset,
    nodeId,
    officialCode,
    label,
    level,
    entityKind,
    parents: parent ? [{
      nodeId: parent.nodeId,
      officialCode: parent.officialCode,
      level: parent.level,
      relationship: "administrative_parent",
      source: { ...dataset }
    }] : [],
    lineage: parent
      ? [...parent.lineage, { nodeId: parent.nodeId, officialCode: parent.officialCode, level: parent.level }]
      : []
  };
}

const india = canonicalNode({
  nodeId: "in",
  officialCode: "IN",
  label: "India",
  level: "country",
  entityKind: "country"
});
const odisha = canonicalNode({
  nodeId: "in-state-odisha",
  officialCode: "21",
  label: "Odisha",
  level: "state",
  entityKind: "state",
  parent: india
});
const khordha = canonicalNode({
  nodeId: "in-state-odisha-district-362",
  officialCode: "362",
  label: "Khordha",
  level: "district",
  entityKind: "district",
  parent: odisha
});
const balianta = canonicalNode({
  nodeId: "in-state-odisha-district-362-block-2933",
  officialCode: "2933",
  label: "Balianta",
  level: "block",
  entityKind: "development_block",
  parent: khordha
});
const benupur = canonicalNode({
  nodeId: "in-state-odisha-local-120000",
  officialCode: "120000",
  label: "Benupur",
  level: "local_body",
  entityKind: "gram_panchayat",
  parent: balianta
});
const bhubaneswar = canonicalNode({
  nodeId: "in-state-odisha-ulb-250520",
  officialCode: "250520",
  label: "Bhubaneswar",
  level: "local_body",
  entityKind: "municipal_corporation",
  parent: khordha
});

function catalogFixture({ overrides = new Map() } = {}) {
  const requests = [];
  const search = new Map([
    ["in\0odisha", { status: "resolved", node: odisha }],
    [`${odisha.nodeId}\0khordha`, { status: "resolved", node: khordha }],
    [`${khordha.nodeId}\0balianta`, { status: "resolved", node: balianta }],
    [`${balianta.nodeId}\0benupur`, { status: "resolved", node: benupur }],
    [`${khordha.nodeId}\0bhubaneswar`, { status: "resolved", node: bhubaneswar }],
    ...overrides
  ]);
  const transport = async (request) => {
    requests.push(request);
    let data;
    if (request.query.operation === "metadata") data = { namespace: "/v1", readOnly: true };
    else if (request.query.operation === "node") data = { node: india };
    else if (request.query.operation === "search") {
      const key = `${request.query.parentNodeId}\0${request.query.normalizedName.toLocaleLowerCase("en-IN")}`;
      data = {
        resolution: search.get(key) ?? { status: "unresolved", reason: "not_found" }
      };
    } else throw new Error(`Unexpected operation: ${request.query.operation}`);
    return { apiVersion: "v1", readOnly: true, dataset: { ...dataset }, data };
  };
  const client = createIndiaLgdCatalogReader(new LocationBrowserCatalogClient({
    access: { type: "public_campaign", campaignSlug: "gau-samman-ahvaan-abhiyan" },
    transport
  }));
  return { client, requests };
}

test("C11 resolves a rural path through the published public campaign gateway and retains identity", async () => {
  const { client, requests } = catalogFixture();
  const result = await resolvePublicCampaignCanonicalLocation(client, {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Balianta",
    panchayat: "Benupur"
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.canonicalSelection.map((node) => node.canonicalNodeId), [
    india.nodeId,
    odisha.nodeId,
    khordha.nodeId,
    balianta.nodeId,
    benupur.nodeId
  ]);
  assert.equal(result.canonicalSelection.at(-1).officialCode, "120000");
  assert.equal(result.canonicalSelection.at(-1).authority, "LGD");
  assert.equal(result.canonicalSelection.at(-1).sourceDataset, "india-lgd");
  assert.equal(result.canonicalSelection.at(-1).datasetVersion, "fixture-version");
  assert.ok(result.canonicalSelection.at(-1).parents.length > 0);
  assert.ok(result.canonicalSelection.at(-1).lineage.length > 0);
  assert.equal(result.input.verificationState, "unverified_custom");
  assert.equal(result.input.canonicalNodeId, null);
  assert.equal(result.input.officialCode, null);
  assert.ok(requests.every((request) => request.access.type === "public_campaign"));
  assert.ok(requests.every((request) => request.access.campaignSlug === "gau-samman-ahvaan-abhiyan"));
});

test("C11 resolves Bhubaneswar as a district-scoped municipal corporation", async () => {
  const { client } = catalogFixture();
  const result = await resolvePublicCampaignCanonicalLocation(client, {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar"
  });

  assert.equal(result.status, "ready");
  const selected = result.canonicalSelection.at(-1);
  assert.equal(selected.canonicalNodeId, "in-state-odisha-ulb-250520");
  assert.equal(selected.officialCode, "250520");
  assert.equal(selected.label, "Bhubaneswar");
  assert.equal(selected.level, "local_body");
  assert.equal(selected.entityKind, "municipal_corporation");
  assert.equal(selected.parents[0].nodeId, khordha.nodeId);
  assert.equal(result.canonicalSelection.some((node) => node.level === "block"), false);
});

test("campaign policy can filter but cannot create a canonical C11 path", async () => {
  const allowed = await resolvePublicCampaignCanonicalLocation(catalogFixture().client, {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar"
  }, [{ country: "India", state: "Odisha", district: "Khordha", block: "Bhubaneswar" }]);
  assert.equal(allowed.status, "ready");

  const filtered = await resolvePublicCampaignCanonicalLocation(catalogFixture().client, {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar"
  }, [{ country: "India", state: "Odisha", district: "Khordha", block: "Balianta" }]);
  assert.equal(filtered.status, "empty");
  assert.equal(filtered.reason, "campaign_policy_filtered");
  assert.equal(filtered.canonicalSelection.length, 0);
});

test("manual label equality never assigns canonical identity without a gateway resolution", async () => {
  const unresolved = new Map([
    [`${khordha.nodeId}\0bhubaneswar`, { status: "unresolved", reason: "not_confirmed" }]
  ]);
  const result = await resolvePublicCampaignCanonicalLocation(catalogFixture({ overrides: unresolved }).client, {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar"
  });
  assert.equal(result.status, "unresolved");
  assert.equal(result.input.block, "Bhubaneswar");
  assert.equal(result.input.verificationState, "unverified_custom");
  assert.equal(result.input.canonicalNodeId, null);
  assert.equal(result.input.officialCode, null);
  assert.equal(result.canonicalSelection.at(-1).canonicalNodeId, khordha.nodeId);
});

test("ambiguity is retained and mixed dataset versions fail closed", async () => {
  const alternateBmc = { ...bhubaneswar, nodeId: "alternate-bmc" };
  const ambiguous = new Map([
    [`${khordha.nodeId}\0bhubaneswar`, {
      status: "ambiguous",
      reason: "multiple_candidates",
      candidates: [bhubaneswar, alternateBmc]
    }]
  ]);
  const result = await resolvePublicCampaignCanonicalLocation(catalogFixture({ overrides: ambiguous }).client, {
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar"
  });
  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 2);

  const mixed = new Map([
    [`${khordha.nodeId}\0bhubaneswar`, {
      status: "resolved",
      node: { ...bhubaneswar, datasetVersion: "other-version" }
    }]
  ]);
  await assert.rejects(
    resolvePublicCampaignCanonicalLocation(catalogFixture({ overrides: mixed }).client, {
      state: "Odisha",
      district: "Khordha",
      block: "Bhubaneswar"
    }),
    /mixed_dataset|versions cannot be combined/u
  );
});

test("C11 source fence uses only the canonical public path and preserves legacy signing boundaries", () => {
  const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../src/businessOs/location/ui/PublicCampaignCanonicalLocationDisplay.tsx", import.meta.url), "utf8");
  const model = readFileSync(new URL("../src/businessOs/location/ui/PublicCampaignCanonicalLocationModel.ts", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");

  assert.match(page, /<PublicCampaignCanonicalLocationDisplay[\s\S]*transport=\{invokePublicCampaignLocationCatalog\}/u);
  assert.doesNotMatch(page, /indiaGeographyService/u);
  assert.match(page, /import type \{[\s\S]*LocationDeletions[\s\S]*\} from "\.\.\/geography"/u);
  assert.match(component, /access: \{ type: "public_campaign", campaignSlug \}/u);
  assert.match(component, /setState\(loadingState\(values\)\)/u);
  assert.match(component, /status: "empty"/u);
  assert.match(component, /status: "error"/u);
  assert.doesNotMatch(`${component}\n${model}`, /OdishaLgdGenerated|indiaMasterGeography|\.\.\/\.\.\/geography\.ts|synthetic/iu);
  assert.doesNotMatch(`${component}\n${model}`, /LOCATION_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL/u);

  const publicTransport = backend.match(/export async function invokePublicCampaignLocationCatalog[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(publicTransport, /voiceup-location-catalog-v1/u);
  assert.match(publicTransport, /access: \{ type: "public_campaign", campaignSlug \}/u);
  assert.doesNotMatch(publicTransport, /resolveWorkspaceId|getCurrentAuth|getSession|getUser/u);

  assert.match(page, /<IndiaLocationFields/u);
  assert.match(page, /setPublicForm/u);
  assert.match(page, /onSendOtp/u);
  assert.doesNotMatch(component, /setPublicForm|onSubmit|otp|saveRemoteState|mutatePublicParticipation/iu);
});

test("devotional video sequence and loop behavior remain byte-intent equivalent", () => {
  const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
  assert.match(page, /const monkpujaVideoSources = \["\/assets\/gemini_generated_video_4\.mp4"\] as const;/u);
  const monkpujaVideo = page.match(/<video\s+key=\{monkpujaVideoSources\[monkpujaVideoIndex\]\}[\s\S]*?\/>/u)?.[0] ?? "";
  assert.match(monkpujaVideo, /src=\{monkpujaVideoSources\[monkpujaVideoIndex\]\}/u);
  assert.match(monkpujaVideo, /autoPlay[\s\S]*muted[\s\S]*playsInline[\s\S]*controls=\{false\}[\s\S]*preload="auto"[\s\S]*loop/u);
  assert.match(monkpujaVideo, /onEnded=\{\(\) => setMonkpujaVideoIndex\(0\)\}/u);

  assert.match(page, /const panchagavyaVideoSources = \["\/assets\/panchagabyavideo\.mp4", "\/assets\/dhanlaxmi\.mp4"\] as const;/u);
  const panchagavyaVideo = page.match(/<video\s+key=\{panchagavyaVideoSources\[panchagavyaVideoIndex\]\}[\s\S]*?\/>/u)?.[0] ?? "";
  assert.match(panchagavyaVideo, /src=\{panchagavyaVideoSources\[panchagavyaVideoIndex\]\}/u);
  assert.match(panchagavyaVideo, /onEnded=\{\(\) => setPanchagavyaVideoIndex\(\(current\) => \(current \+ 1\) % panchagavyaVideoSources\.length\)\}/u);
  assert.doesNotMatch(panchagavyaVideo, /\bloop\b/u);
});

test("the migration ledger records the completed consolidated C01-C29 boundary", () => {
  const ledger = readFileSync(new URL("../docs/location-consumer-migration-ledger.md", import.meta.url), "utf8");
  const rows = ledger.split(/\r?\n/u).filter((line) => /^\| C\d{2} /u.test(line));
  const migrated = rows.filter((line) => /\| MIGRATED \|$/u.test(line)).map((line) => line.split("|")[1].trim());
  assert.equal(rows.length, 29);
  assert.deepEqual(migrated, Array.from({ length: 29 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`));
  assert.equal(rows.filter((line) => /\| NOT_STARTED \|$/u.test(line)).length, 0);
});
