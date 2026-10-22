import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalGeographyEngine } from "../src/businessOs/geography/CanonicalGeographyEngine.ts";
import { odishaCanonicalGeographyDataset } from "../src/businessOs/geography/CanonicalGeographyDataset.ts";
import { LocationApiV1 } from "../src/businessOs/geography/LocationApiV1.ts";
import { odishaLgdDataset } from "../src/businessOs/geography/OdishaLgdGenerated.ts";

const engine = new CanonicalGeographyEngine(odishaCanonicalGeographyDataset);
const api = new LocationApiV1(engine);

function ok(response) {
  assert.equal(response.httpStatus, 200);
  return response.body.data;
}

function canonicalReference(node) {
  return {
    nodeId: node.nodeId,
    officialCode: node.officialCode,
    level: node.level,
    datasetVersion: node.datasetVersion,
    source: {
      authority: node.source.authority,
      sourceDataset: node.source.sourceDataset,
      sourceDatasetVersion: node.source.sourceDatasetVersion
    },
    lineage: node.lineage
  };
}

function ambiguousGpName() {
  const names = new Map();
  for (const node of engine.getNodesByEntityKind("gram_panchayat")) {
    const matches = names.get(node.displayName) ?? [];
    matches.push(node);
    names.set(node.displayName, matches);
  }
  const entry = [...names.entries()].find(([, nodes]) => nodes.length > 1);
  if (!entry) throw new Error("Expected duplicate canonical Gram Panchayat display names.");
  return entry[0];
}

test("Location API v1 returns versioned read-only metadata and canonical node/code responses", () => {
  const metadata = ok(api.handle({ operation: "metadata" }));
  assert.equal(metadata.namespace, "/v1");
  assert.equal(metadata.datasetVersion, "lgd-2026-08-27");
  assert.equal(metadata.readOnly, true);
  assert.equal(metadata.security.authentication, "future_api_key_or_service_identity_required");

  const odisha = ok(api.handle({ operation: "node", nodeId: "in-state-odisha" }));
  assert.equal(odisha.displayName, "Odisha");
  assert.equal(odisha.datasetVersion, "lgd-2026-08-27");
  assert.equal(odisha.source.sourceDataset, "india-lgd");

  const bmcCode = ok(api.handle({ operation: "officialCode", officialCode: "250520", request: { expectedLevel: "local_body" } }));
  assert.equal(bmcCode.status, "resolved");
  assert.equal(bmcCode.node.entityKind, "municipal_corporation");
});

test("Location API v1 exposes children, parents, and explicit lineage", () => {
  const bmc = ok(api.handle({ operation: "officialCode", officialCode: "250520" })).node;
  const children = ok(api.handle({ operation: "children", nodeId: bmc.nodeId }));
  assert.equal(children.nodes.filter((node) => node.level === "ward").length, 67);

  const parents = ok(api.handle({ operation: "parents", nodeId: bmc.nodeId }));
  assert.equal(parents.parents[0].officialCode, "362");

  const lineage = ok(api.handle({ operation: "lineage", nodeId: bmc.nodeId }));
  assert.deepEqual(lineage.lineage.map((node) => node.officialCode), ["IN", "21", "362"]);
});

test("Location API v1 preserves every resolver state without fabrication", () => {
  const resolved = ok(api.handle({ operation: "resolve", request: { officialCode: "250520" } }));
  assert.equal(resolved.status, "resolved");

  const ambiguous = ok(api.handle({ operation: "search", request: { normalizedName: ambiguousGpName(), expectedLevel: "local_body" } }));
  assert.equal(ambiguous.status, "ambiguous");

  const unresolved = ok(api.handle({ operation: "resolve", request: { officialCode: "not-an-official-code" } }));
  assert.equal(unresolved.status, "unresolved");

  const invalid = ok(api.handle({ operation: "resolve", request: {} }));
  assert.equal(invalid.status, "invalid");

  const ambiguousSourceGp = odishaLgdDataset.nodes.find(
    (node) => node.kind === "gram_panchayat" && node.metadata?.blockRelationshipStatus === "ambiguous"
  );
  const unresolvedSourceGp = odishaLgdDataset.nodes.find(
    (node) => node.kind === "gram_panchayat" && node.metadata?.blockRelationshipStatus === "unresolved"
  );
  assert.ok(ambiguousSourceGp && unresolvedSourceGp);
  assert.deepEqual(ok(api.handle({ operation: "parents", nodeId: ambiguousSourceGp.id })).parents, []);
  assert.deepEqual(ok(api.handle({ operation: "parents", nodeId: unresolvedSourceGp.id })).parents, []);

  const missing = api.handle({ operation: "node", nodeId: "not-a-canonical-node" });
  assert.equal(missing.httpStatus, 404);
  assert.equal(missing.body.error.code, "not_found");
});

test("Location API v1 validates references and checks descendant and official relationships", () => {
  const bmc = ok(api.handle({ operation: "officialCode", officialCode: "250520" })).node;
  const validation = ok(api.handle({
    operation: "validate",
    request: {
      reference: canonicalReference(bmc),
      requiredParentNodeIds: ["in-state-odisha-district-362"],
      requiredAncestorNodeIds: ["in", "in-state-odisha", "in-state-odisha-district-362"],
      expectedSourceDataset: "india-lgd"
    }
  }));
  assert.equal(validation.status, "valid");

  const descendant = ok(api.handle({
    operation: "descendant",
    nodeId: bmc.nodeId,
    ancestorNodeId: "in-state-odisha-district-362"
  }));
  assert.equal(descendant.descendant, true);

  const relationship = ok(api.handle({
    operation: "relationship",
    childNodeId: bmc.nodeId,
    parentNodeId: "in-state-odisha-district-362"
  }));
  assert.equal(relationship.represented, true);
});
