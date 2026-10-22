import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalGeographyEngine } from "../src/businessOs/geography/CanonicalGeographyEngine.ts";
import { odishaCanonicalGeographyDataset } from "../src/businessOs/geography/CanonicalGeographyDataset.ts";
import { CanonicalLocationResolver } from "../src/businessOs/geography/CanonicalLocationResolver.ts";
import { CanonicalLocationValidator } from "../src/businessOs/geography/CanonicalLocationValidator.ts";
import { odishaLgdDataset } from "../src/businessOs/geography/OdishaLgdGenerated.ts";

const engine = new CanonicalGeographyEngine(odishaCanonicalGeographyDataset);
const resolver = new CanonicalLocationResolver(engine);
const validator = new CanonicalLocationValidator(engine);

function referenceFor(node) {
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

function duplicateGpWithUniqueParentContext() {
  const byName = new Map();
  for (const gp of engine.getNodesByEntityKind("gram_panchayat")) {
    const matches = byName.get(gp.displayName) ?? [];
    matches.push(gp);
    byName.set(gp.displayName, matches);
  }
  for (const [name, candidates] of byName) {
    if (candidates.length < 2) continue;
    for (const candidate of candidates) {
      const parent = engine.getImmediateParentReferences(candidate.nodeId)[0];
      if (parent && candidates.filter((node) => engine.getImmediateParentReferences(node.nodeId)[0]?.nodeId === parent.nodeId).length === 1) {
        return { name, candidate, parent };
      }
    }
  }
  throw new Error("Expected a duplicate Gram Panchayat name with a unique explicit parent context.");
}

test("resolver resolves Odisha, Khordha, BMC, and BMC wards by canonical identity", () => {
  const odisha = resolver.resolve({ nodeId: "in-state-odisha" });
  assert.equal(odisha.status, "resolved");
  assert.equal(odisha.node.displayName, "Odisha");

  const khordha = resolver.resolve({ officialCode: "362", expectedLevel: "district" });
  assert.equal(khordha.status, "resolved");
  assert.equal(khordha.node.displayName, "Khordha");

  const bmc = resolver.resolve({ officialCode: "250520", expectedLevel: "local_body" });
  assert.equal(bmc.status, "resolved");
  assert.equal(bmc.node.entityKind, "municipal_corporation");
  assert.equal(bmc.node.parents[0]?.officialCode, "362");

  const bmcWard = engine.getChildren(bmc.node.nodeId).find((node) => node.level === "ward");
  assert.ok(bmcWard);
  const ward = resolver.resolve({ officialCode: bmcWard.officialCode, expectedLevel: "ward", parentNodeId: bmc.node.nodeId });
  assert.equal(ward.status, "resolved");
  assert.equal(ward.node.nodeId, bmcWard.nodeId);
});

test("normalized names resolve only when unique and parent context disambiguates duplicate GPs", () => {
  const { name, candidate, parent } = duplicateGpWithUniqueParentContext();
  const ambiguous = resolver.resolve({ normalizedName: `  ${name.toUpperCase()}  `, expectedLevel: "local_body" });
  assert.equal(ambiguous.status, "ambiguous");

  const resolved = resolver.resolve({
    normalizedName: name,
    expectedLevel: "local_body",
    parentNodeId: parent.nodeId
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.node.nodeId, candidate.nodeId);
});

test("resolver never fabricates missing GP block parents or invalid code matches", () => {
  const ambiguousSourceGp = odishaLgdDataset.nodes.find(
    (node) => node.kind === "gram_panchayat" && node.metadata?.blockRelationshipStatus === "ambiguous"
  );
  const unresolvedSourceGp = odishaLgdDataset.nodes.find(
    (node) => node.kind === "gram_panchayat" && node.metadata?.blockRelationshipStatus === "unresolved"
  );
  assert.ok(ambiguousSourceGp && unresolvedSourceGp);

  const ambiguousGp = resolver.resolve({ nodeId: ambiguousSourceGp.id });
  const unresolvedGp = resolver.resolve({ nodeId: unresolvedSourceGp.id });
  assert.equal(ambiguousGp.status, "resolved");
  assert.equal(unresolvedGp.status, "resolved");
  assert.equal(engine.getImmediateParentReferences(ambiguousGp.node.nodeId).length, 0);
  assert.equal(engine.getImmediateParentReferences(unresolvedGp.node.nodeId).length, 0);

  assert.equal(resolver.resolve({ officialCode: "not-an-official-code" }).status, "unresolved");
  assert.equal(resolver.resolve({ officialCode: "250520", expectedLevel: "district" }).status, "unresolved");
  assert.equal(resolver.resolve({}).status, "invalid");
  assert.equal(resolver.resolve({ officialCode: "250520", sourceDataset: "other-source" }).status, "unresolved");
});

test("validator accepts explicit BMC lineage and rejects wrong parent, dataset, and source", () => {
  const bmcResult = resolver.resolve({ officialCode: "250520", expectedLevel: "local_body" });
  assert.equal(bmcResult.status, "resolved");
  const bmc = bmcResult.node;
  const reference = referenceFor(bmc);

  const valid = validator.validate({
    reference,
    expectedLevel: "local_body",
    expectedOfficialCode: "250520",
    requiredParentNodeIds: ["in-state-odisha-district-362"],
    requiredAncestorNodeIds: ["in", "in-state-odisha", "in-state-odisha-district-362"],
    datasetVersion: "lgd-2026-08-27",
    expectedSourceDataset: "india-lgd"
  });
  assert.equal(valid.status, "valid");

  const wrongParent = validator.validate({
    reference,
    requiredParentNodeIds: ["in-state-odisha-district-344"]
  });
  assert.equal(wrongParent.status, "invalid");
  assert.ok(wrongParent.issues.some((issue) => issue.code === "parent_mismatch"));

  const wrongDataset = validator.validate({ reference, datasetVersion: "lgd-1900-01-01" });
  assert.equal(wrongDataset.status, "invalid");
  assert.ok(wrongDataset.issues.some((issue) => issue.code === "dataset_mismatch"));

  const wrongSource = validator.validate({ reference, expectedSourceDataset: "other-source" });
  assert.equal(wrongSource.status, "invalid");
  assert.ok(wrongSource.issues.some((issue) => issue.code === "source_mismatch"));
});
