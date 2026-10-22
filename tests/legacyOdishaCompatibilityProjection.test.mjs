import assert from "node:assert/strict";
import test from "node:test";
import { odishaLgdDataset } from "../src/businessOs/geography/OdishaLgdGenerated.ts";
import { createLegacyOdishaCompatibilityProjection } from "../src/businessOs/geography/LegacyOdishaCompatibilityProjection.ts";
import { GeographyService } from "../src/businessOs/geography/GeographyService.ts";
import { indiaAdministrativeHierarchy } from "../src/businessOs/geography/IndiaAdministrativeHierarchy.ts";
import { CanonicalGeographyEngine } from "../src/businessOs/geography/CanonicalGeographyEngine.ts";
import { odishaCanonicalGeographyDataset } from "../src/businessOs/geography/CanonicalGeographyDataset.ts";
import { indiaGeographyService } from "../src/geography.ts";

const projection = createLegacyOdishaCompatibilityProjection(odishaLgdDataset);
const count = (dataset, predicate) => dataset.nodes.filter(predicate).length;
const nodeById = new Map(odishaLgdDataset.nodes.map((node) => [node.id, node]));

test("legacy projection registers in the existing GeographyService and existing integration starts", () => {
  assert.doesNotThrow(() => new GeographyService({
    hierarchies: [indiaAdministrativeHierarchy],
    datasets: [projection]
  }));
  assert.ok(indiaGeographyService.getNode("in-state-odisha"));
  assert.equal(indiaGeographyService.getNode("in-state-odisha-local-303"), undefined);
});

test("legacy projection is explicitly partial and does not fabricate relationships", () => {
  assert.equal(projection.datasetVersion, "lgd-2026-08-27+legacy-compat-v1");
  assert.equal(count(projection, (node) => node.level === "local_body"), 6909);
  assert.equal(count(projection, (node) => node.level === "village"), 50002);
  assert.equal(count(projection, (node) => node.kind === "zilla_parishad"), 0);
  assert.equal(count(projection, (node) => node.kind === "panchayat_samiti"), 0);
  assert.equal(count(projection, (node) => node.kind === "nagar_panchayat"), 0);
  assert.equal(count(projection, (node) => node.metadata?.legacyCompatibilityProjection === "nagar_panchayat_as_town_panchayat"), 62);

  for (const village of projection.nodes.filter((node) => node.level === "village")) {
    const canonicalParent = village.parentId ? nodeById.get(village.parentId) : undefined;
    assert.notEqual(canonicalParent?.level, "district");
  }
});

test("canonical dataset and canonical engine retain full official coverage and parentless GP cases", () => {
  const engine = new CanonicalGeographyEngine(odishaCanonicalGeographyDataset);
  assert.equal(count(odishaLgdDataset, (node) => node.level === "district"), 30);
  assert.equal(count(odishaLgdDataset, (node) => node.kind === "development_block"), 314);
  assert.equal(count(odishaLgdDataset, (node) => node.level === "local_body"), 7253);
  assert.equal(count(odishaLgdDataset, (node) => node.level === "village"), 51800);
  assert.equal(count(odishaLgdDataset, (node) => node.level === "ward"), 2119);
  assert.equal(engine.getNodesByLevel("local_body").length, 7253);
  assert.equal(engine.getNodesByLevel("village").length, 51800);

  const ambiguousGp = odishaLgdDataset.nodes.find((node) => node.metadata?.blockRelationshipStatus === "ambiguous");
  const unresolvedGp = odishaLgdDataset.nodes.find((node) => node.metadata?.blockRelationshipStatus === "unresolved");
  assert.ok(ambiguousGp && unresolvedGp);
  assert.equal(ambiguousGp.parentId, undefined);
  assert.equal(unresolvedGp.parentId, undefined);
  assert.deepEqual(engine.getImmediateParentReferences(ambiguousGp.id), []);
  assert.deepEqual(engine.getImmediateParentReferences(unresolvedGp.id), []);
});

test("legacy service retains BMC, its wards, and Khordha development blocks", () => {
  const bmc = indiaGeographyService.getNode("in-state-odisha-ulb-250520");
  const khordha = indiaGeographyService.getNode("in-state-odisha-district-362");
  assert.ok(bmc && khordha);
  assert.equal(bmc.parentId, khordha.id);
  assert.equal(indiaGeographyService.getChildren(bmc.id, { levels: ["ward"] }).length, 67);
  assert.equal(indiaGeographyService.getChildren(khordha.id, { levels: ["block"] }).length, 10);
});
