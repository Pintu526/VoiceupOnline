import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocationApiClient } from "../src/businessOs/location/server/LocationApiClient.ts";

const developmentProjectRef = "ravweavcfrpiykfgtmbf";
const expectedDatasetVersion = "lgd-2026-08-27";
const apiKeyPath = join(tmpdir(), "voiceup-location-api-dev-test-key.txt");

function environmentValue(name) {
  const environmentPath = new URL("../.env.local", import.meta.url);
  if (!existsSync(environmentPath)) return null;
  const line = readFileSync(environmentPath, "utf8")
    .split(/\r?\n/u)
    .find((value) => value.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^['"]|['"]$/gu, "") : null;
}

function integrationClient() {
  const apiKey = existsSync(apiKeyPath) ? readFileSync(apiKeyPath, "utf8").trim() : null;
  const gatewayBearerToken = environmentValue("VITE_SUPABASE_ANON_KEY") ?? environmentValue("SUPABASE_ANON_KEY");
  const supabaseUrl = environmentValue("VITE_SUPABASE_URL") ?? environmentValue("SUPABASE_URL");
  if (!apiKey || !gatewayBearerToken || !supabaseUrl || !supabaseUrl.includes(developmentProjectRef)) return null;
  return new LocationApiClient({
    baseUrl: `${supabaseUrl.replace(/\/+$/u, "")}/functions/v1/location-api-v1`,
    apiKey,
    gatewayBearerToken,
    timeoutMs: 30_000
  });
}

test("ACTIVE Development Location API works through the isolated server-only client", { timeout: 180_000 }, async (t) => {
  const client = integrationClient();
  if (!client) return t.skip("Development-only server credentials are unavailable to this local test harness.");

  const metadata = await client.metadata();
  assert.equal(metadata.datasetVersion, expectedDatasetVersion);
  assert.equal(metadata.data.source.sourceDataset, "india-lgd");

  const unauthorizedClient = new LocationApiClient({
    baseUrl: "https://ravweavcfrpiykfgtmbf.supabase.co/functions/v1/location-api-v1",
    apiKey: "invalid-development-location-api-credential",
    gatewayBearerToken: environmentValue("VITE_SUPABASE_ANON_KEY") ?? environmentValue("SUPABASE_ANON_KEY"),
    timeoutMs: 30_000
  });
  await assert.rejects(unauthorizedClient.metadata(), { code: "unauthorized" });

  const odisha = await client.getNode("in-state-odisha");
  assert.equal(odisha.data.displayName, "Odisha");
  assert.equal(odisha.data.level, "state");

  const khordha = await client.getByOfficialCode("362", { expectedLevel: "district" });
  assert.equal(khordha.data.status, "resolved");
  assert.equal(khordha.data.node.displayName, "Khordha");
  const khordhaId = khordha.data.node.nodeId;

  const khordhaChildren = await client.getChildren(khordhaId);
  const blocks = khordhaChildren.data.nodes.filter((node) => node.entityKind === "development_block");
  assert.equal(blocks.length, 10);

  const balianta = await client.search({ normalizedName: "Balianta", parentNodeId: khordhaId, expectedLevel: "block" });
  assert.equal(balianta.data.status, "resolved");
  assert.equal(balianta.data.node.displayName, "Balianta");

  const bmc = await client.getByOfficialCode("250520", { expectedLevel: "local_body" });
  assert.equal(bmc.data.status, "resolved");
  const bmcNode = bmc.data.node;
  assert.equal(bmcNode.entityKind, "municipal_corporation");

  const bmcParents = await client.getParents(bmcNode.nodeId);
  assert.equal(bmcParents.data.parents.length, 1);
  assert.equal(bmcParents.data.parents[0].officialCode, "362");

  const bmcLineage = await client.getLineage(bmcNode.nodeId);
  assert.deepEqual(bmcLineage.data.lineage.map((node) => node.officialCode), ["IN", "21", "362"]);

  const bmcChildren = await client.getChildren(bmcNode.nodeId);
  assert.equal(bmcChildren.data.nodes.filter((node) => node.level === "ward").length, 67);

  const resolvedBmc = await client.resolve({ officialCode: "250520", expectedLevel: "local_body" });
  assert.equal(resolvedBmc.data.status, "resolved");

  const validation = await client.validate({
    reference: {
      nodeId: bmcNode.nodeId,
      officialCode: bmcNode.officialCode,
      level: bmcNode.level,
      datasetVersion: bmcNode.datasetVersion,
      source: bmcNode.source,
      lineage: bmcNode.lineage
    },
    expectedLevel: "local_body",
    expectedOfficialCode: "250520",
    requiredParentNodeIds: [khordhaId],
    requiredAncestorNodeIds: ["in", "in-state-odisha", khordhaId],
    datasetVersion: expectedDatasetVersion,
    expectedSourceDataset: "india-lgd"
  });
  assert.equal(validation.data.status, "valid");

  const descendant = await client.isDescendant(bmcNode.nodeId, khordhaId);
  assert.equal(descendant.data.descendant, true);
  const relationship = await client.relationship(bmcNode.nodeId, khordhaId);
  assert.equal(relationship.data.represented, true);

  const ambiguousGpParents = await client.getParents("in-state-odisha-local-115727");
  assert.equal(ambiguousGpParents.data.parents.length, 0);
  const unresolvedGpParents = await client.getParents("in-state-odisha-local-116942");
  assert.equal(unresolvedGpParents.data.parents.length, 0);
});
