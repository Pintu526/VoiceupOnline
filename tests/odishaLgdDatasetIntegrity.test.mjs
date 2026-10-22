import assert from "node:assert/strict";
import test from "node:test";
import { odishaLgdDataset } from "../src/businessOs/geography/OdishaLgdGenerated.ts";

const nodes = odishaLgdDataset.nodes;
const nodeById = new Map(nodes.map((node) => [node.id, node]));
const count = (items, predicate) => items.filter(predicate).length;
const byLevel = (level) => nodes.filter((node) => node.level === level);
const byKind = (kind) => nodes.filter((node) => node.kind === kind);

test("Odisha LGD dataset reconciles to the 2026-08-27 official level counts", () => {
  assert.equal(odishaLgdDataset.datasetVersion, "lgd-2026-08-27");
  assert.equal(byLevel("district").length, 30);
  assert.equal(byLevel("block").length, 314);
  assert.equal(byLevel("local_body").length, 7253);
  assert.equal(byLevel("village").length, 51800);
  assert.equal(byLevel("ward").length, 2119);
  assert.equal(nodes.length, 61518);
  assert.deepEqual(
    Object.fromEntries(odishaLgdDataset.coverage.map((entry) => [entry.level, entry.recordCount])),
    { country: 1, state: 1, district: 30, block: 314, local_body: 7253, village: 51800, ward: 2119 }
  );
});

test("Odisha LGD dataset retains every official PRI and urban local-body class", () => {
  assert.equal(byKind("zilla_parishad").length, 30);
  assert.equal(byKind("panchayat_samiti").length, 314);
  assert.equal(byKind("gram_panchayat").length, 6794);
  assert.equal(byKind("municipal_corporation").length, 5);
  assert.equal(byKind("municipality").length, 48);
  assert.equal(byKind("nagar_panchayat").length, 62);
  assert.equal(
    count(nodes, (node) => ["municipal_corporation", "municipality", "nagar_panchayat"].includes(node.kind)),
    115
  );
});

test("ULBs are district-scoped and wards are scoped to exactly one ULB", () => {
  const urbanKinds = new Set(["municipal_corporation", "municipality", "nagar_panchayat"]);
  const ulbs = nodes.filter((node) => urbanKinds.has(node.kind));
  const ulbIds = new Set(ulbs.map((node) => node.id));

  assert.equal(ulbs.length, 115);
  for (const ulb of ulbs) {
    const parent = nodeById.get(ulb.parentId);
    assert.ok(parent, `${ulb.code} has an official district parent`);
    assert.equal(parent.level, "district", `${ulb.code} is district-scoped`);
  }

  const wards = byLevel("ward");
  assert.equal(wards.length, 2119);
  for (const ward of wards) {
    assert.ok(ward.parentId && ulbIds.has(ward.parentId), `${ward.code} has one ULB parent`);
  }

  const bmc = ulbs.find((node) => node.code === "250520");
  assert.ok(bmc);
  assert.equal(nodeById.get(bmc.parentId)?.code, "362");
  assert.equal(count(wards, (ward) => ward.parentId === bmc.id), 67);
});

test("PRI parentage retains only supported GP-to-block edges", () => {
  const gps = byKind("gram_panchayat");
  const panchayatSamitis = new Set(byKind("panchayat_samiti").map((node) => node.code));
  const zillaParishadIds = new Set(byKind("zilla_parishad").map((node) => node.id));
  const samitis = byKind("panchayat_samiti");

  assert.equal(gps.length, 6794);
  assert.equal(count(gps, (node) => node.metadata?.blockRelationshipStatus === "supported"), 6736);
  assert.equal(count(gps, (node) => node.metadata?.blockRelationshipStatus === "ambiguous"), 47);
  assert.equal(count(gps, (node) => node.metadata?.blockRelationshipStatus === "unresolved"), 11);

  for (const gp of gps) {
    assert.ok(panchayatSamitis.has(gp.metadata?.officialPanchayatSamitiCode));
    if (gp.metadata?.blockRelationshipStatus === "supported") {
      assert.equal(nodeById.get(gp.parentId)?.kind, "development_block");
    } else {
      assert.equal(gp.parentId, undefined, `${gp.code} remains parentless when block parentage is not unique`);
    }
  }

  assert.equal(samitis.length, 314);
  for (const samiti of samitis) {
    assert.ok(samiti.parentId && zillaParishadIds.has(samiti.parentId));
  }
  assert.equal(count(byKind("zilla_parishad"), (node) => !node.parentId), 30);
});

test("all official villages are retained without fabricating block relationships", () => {
  const villages = byLevel("village");
  assert.equal(villages.length, 51800);
  assert.equal(count(villages, (node) => node.metadata?.blockRelationshipStatus === "district_containment"), 1798);
  assert.equal(count(villages, (node) => node.metadata?.blockRelationshipStatus === undefined), 50002);
  for (const village of villages) {
    const parent = nodeById.get(village.parentId);
    assert.ok(parent, `${village.code} has an official block or district containment parent`);
    assert.ok(["block", "district"].includes(parent.level));
  }
});

test("Khordha has its ten official development blocks", () => {
  const khordha = byLevel("district").find((node) => node.code === "362");
  assert.ok(khordha);
  assert.deepEqual(
    nodes
      .filter((node) => node.level === "block" && node.parentId === khordha.id)
      .map((node) => node.name)
      .sort(),
    ["Balianta", "Balipatna", "Banapur", "Begunia", "Bhubaneswar", "Bolagarh", "Chilika", "Jatni", "Khordha", "Tangi"]
  );
});
