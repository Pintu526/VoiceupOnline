import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocationApiClient } from "../src/businessOs/location/server/LocationApiClient.ts";
import { CampaignLocationPlatformAdapter } from "../src/businessOs/location/server/CampaignLocationPlatformAdapter.ts";

const developmentProjectRef = "ravweavcfrpiykfgtmbf";
const apiKeyPath = join(tmpdir(), "voiceup-location-api-dev-test-key.txt");

function environmentValue(name) {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) return null;
  const line = readFileSync(path, "utf8").split(/\r?\n/u).find((value) => value.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^['"]|['"]$/gu, "") : null;
}

function adapterForDevelopment() {
  const apiKey = existsSync(apiKeyPath) ? readFileSync(apiKeyPath, "utf8").trim() : null;
  const bearer = environmentValue("VITE_SUPABASE_ANON_KEY") ?? environmentValue("SUPABASE_ANON_KEY");
  const url = environmentValue("VITE_SUPABASE_URL") ?? environmentValue("SUPABASE_URL");
  if (!apiKey || !bearer || !url || !url.includes(developmentProjectRef)) return null;
  return new CampaignLocationPlatformAdapter(new LocationApiClient({
    baseUrl: `${url.replace(/\/+$/u, "")}/functions/v1/location-api-v1`,
    apiKey,
    gatewayBearerToken: bearer,
    timeoutMs: 30_000
  }));
}

test("Campaign adapter shadow proof uses only the ACTIVE Development Location Platform", { timeout: 180_000 }, async (t) => {
  const adapter = adapterForDevelopment();
  if (!adapter) return t.skip("Development-only server test credentials are unavailable.");
  const metadata = await adapter.metadata();
  assert.equal(metadata.datasetVersion, "lgd-2026-08-27");
  assert.equal(metadata.source.sourceDataset, "india-lgd");

  const odisha = await adapter.getNode("in-state-odisha");
  assert.equal(odisha.canonicalLabel, "Odisha");
  const khordha = await adapter.getByOfficialCode("362", { expectedLevel: "district" });
  assert.equal(khordha.status, "resolved");
  const khordhaBlocks = (await adapter.getChildren(khordha.reference.canonicalNodeId)).filter((node) => node.level === "block");
  assert.equal(khordhaBlocks.length, 10);
  const balianta = await adapter.resolve({ normalizedName: "Balianta", parentNodeId: khordha.reference.canonicalNodeId, expectedLevel: "block" });
  assert.equal(balianta.status, "resolved");

  const bmc = await adapter.getByOfficialCode("250520", { expectedLevel: "local_body" });
  assert.equal(bmc.status, "resolved");
  const bmcParents = await adapter.getParents(bmc.reference.canonicalNodeId);
  assert.deepEqual(bmcParents.map((node) => node.officialCode), ["362"]);
  assert.deepEqual((await adapter.getLineage(bmc.reference.canonicalNodeId)).map((node) => node.officialCode), ["IN", "21", "362"]);
  assert.equal((await adapter.getChildren(bmc.reference.canonicalNodeId)).filter((node) => node.level === "ward").length, 67);
  assert.equal((await adapter.validate(bmc.reference, { requiredParentNodeIds: [khordha.reference.canonicalNodeId] })).status, "valid");
  assert.equal((await adapter.isDescendant(bmc.reference.canonicalNodeId, khordha.reference.canonicalNodeId)).descendant, true);
  assert.equal((await adapter.hasOfficialRelationship(bmc.reference.canonicalNodeId, khordha.reference.canonicalNodeId)).represented, true);

  assert.equal((await adapter.getParents("in-state-odisha-local-115727")).length, 0);
  assert.equal((await adapter.getParents("in-state-odisha-local-116942")).length, 0);
  assert.equal(adapter.compareShadow({ legacy: { label: "Bhubaneswar", level: "local_body", kind: "legacy_official" }, canonical: bmc.reference }).classification, "MATCH");
  assert.equal(adapter.compareShadow({ legacy: { label: "Manual landmark", kind: "campaign_manual" } }).classification, "CUSTOM_UNVERIFIED");
  assert.equal(adapter.compareShadow({ legacy: { label: "Ambiguous GP", kind: "legacy_official" }, canonicalOutcome: "ambiguous" }).classification, "AMBIGUOUS");
  assert.equal(adapter.compareShadow({ legacy: { label: "Unresolved GP", kind: "legacy_official" }, canonicalOutcome: "unresolved" }).classification, "UNRESOLVED");

  const canonical = [odisha, bmc.reference];
  assert.deepEqual(adapter.selectPolicySubset(canonical, { includedCanonicalNodeIds: [bmc.reference.canonicalNodeId] }).map((item) => item.canonicalNodeId), [bmc.reference.canonicalNodeId]);
  assert.equal(canonical.length, 2);
});
