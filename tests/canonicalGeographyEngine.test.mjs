import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalGeographyEngine } from "../src/businessOs/geography/CanonicalGeographyEngine.ts";
import { odishaCanonicalGeographyDataset } from "../src/businessOs/geography/CanonicalGeographyDataset.ts";
import { odishaLgdDataset } from "../src/businessOs/geography/OdishaLgdGenerated.ts";

const engine = new CanonicalGeographyEngine(odishaCanonicalGeographyDataset);

test("engine exposes the repaired Odisha LGD dataset and provenance", () => {
  const odisha = engine.getNodesByOfficialCode("21").find((node) => node.level === "state");
  assert.ok(odisha);
  assert.equal(odisha.displayName, "Odisha");
  assert.equal(engine.datasetVersion, "lgd-2026-08-27");
  assert.equal(engine.source.sourceDataset, "india-lgd");
  assert.equal(engine.getNodesByLevel("district").length, 30);
  assert.equal(engine.getNodesByEntityKind("development_block").length, 314);
  assert.equal(engine.getNodesByLevel("local_body").length, 7253);
  assert.equal(engine.getNodesByLevel("village").length, 51800);
  assert.equal(engine.getNodesByLevel("ward").length, 2119);
});

test("engine follows explicit BMC, ULB, ward, and Khordha block relationships", () => {
  const bmc = engine.getNodesByOfficialCode("250520")[0];
  assert.ok(bmc);
  const khordha = engine.getNodesByOfficialCode("362").find((node) => node.level === "district");
  assert.ok(khordha);

  assert.equal(engine.hasOfficialParentRelationship(bmc.nodeId, khordha.nodeId), true);
  assert.equal(engine.getImmediateParentReferences(bmc.nodeId)[0]?.officialCode, "362");
  assert.equal(engine.getChildren(bmc.nodeId).filter((node) => node.level === "ward").length, 67);
  assert.equal(engine.getChildren(khordha.nodeId).filter((node) => node.entityKind === "development_block").length, 10);

  const ward = engine.getChildren(bmc.nodeId).find((node) => node.level === "ward");
  assert.ok(ward);
  assert.equal(engine.hasOfficialParentRelationship(ward.nodeId, bmc.nodeId), true);
  assert.equal(engine.getImmediateParentReferences(ward.nodeId)[0]?.nodeId, bmc.nodeId);
});

test("engine preserves supported and parentless GP block relationships without inference", () => {
  const sourceSupportedGp = odishaLgdDataset.nodes.find(
    (node) => node.kind === "gram_panchayat" && node.metadata?.blockRelationshipStatus === "supported"
  );
  const sourceAmbiguousGp = odishaLgdDataset.nodes.find(
    (node) => node.kind === "gram_panchayat" && node.metadata?.blockRelationshipStatus === "ambiguous"
  );
  const sourceUnresolvedGp = odishaLgdDataset.nodes.find(
    (node) => node.kind === "gram_panchayat" && node.metadata?.blockRelationshipStatus === "unresolved"
  );

  assert.ok(sourceSupportedGp && sourceAmbiguousGp && sourceUnresolvedGp);

  const supported = engine.getNode(sourceSupportedGp.id);
  const ambiguous = engine.getNode(sourceAmbiguousGp.id);
  const unresolved = engine.getNode(sourceUnresolvedGp.id);
  assert.ok(supported && ambiguous && unresolved);

  assert.equal(engine.getImmediateParentReferences(supported.nodeId).length, 1);
  assert.equal(engine.getImmediateParentReferences(supported.nodeId)[0]?.level, "block");
  assert.equal(engine.getImmediateParentReferences(ambiguous.nodeId).length, 0);
  assert.equal(engine.getImmediateParentReferences(unresolved.nodeId).length, 0);
});

test("engine returns complete explicit lineage and filters without creating nodes", () => {
  const bmc = engine.getNodesByOfficialCode("250520")[0];
  assert.ok(bmc);

  assert.deepEqual(
    engine.getLineage(bmc.nodeId).map((node) => node.officialCode),
    ["IN", "21", "362"]
  );
  assert.equal(engine.isDescendantOf(bmc.nodeId, "in-state-odisha-district-362"), true);
  assert.equal(engine.isDescendantOf(bmc.nodeId, "in-state-odisha"), true);
  assert.equal(engine.search({ officialCode: "250520" }).length, 1);
  assert.equal(engine.search({ text: "Bhubaneswar", entityKinds: ["municipal_corporation"] }).length, 1);
  assert.deepEqual(engine.search({ officialCode: "not-an-official-code" }), []);
});
