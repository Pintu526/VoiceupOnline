import assert from "node:assert/strict";
import test from "node:test";
import {
  CampaignLocationPlatformAdapter
} from "../src/businessOs/location/server/CampaignLocationPlatformAdapter.ts";
import {
  PersistedLocationReferenceValidator,
  PersistedLocationValidationError
} from "../src/businessOs/location/server/PersistedLocationReferenceValidator.ts";

const dataset = {
  authority: "LGD",
  sourceDataset: "india-lgd",
  datasetVersion: "lgd-2026-08-27"
};

function snapshot(overrides = {}) {
  return {
    canonicalNodeId: "in-state-odisha",
    officialCode: "21",
    labelSnapshot: "Odisha",
    level: "state",
    entityKind: "state",
    ...overrides
  };
}

function trustedReference(overrides = {}) {
  return {
    canonicalNodeId: "in-state-odisha-district-362-local-250520",
    officialCode: "250520",
    canonicalLabel: "Bhubaneswar",
    level: "local_body",
    entityKind: "municipal_corporation",
    dataset,
    parents: [snapshot({
      canonicalNodeId: "in-state-odisha-district-362",
      officialCode: "362",
      labelSnapshot: "Khordha",
      level: "district",
      entityKind: "district"
    })],
    lineageSnapshot: [
      snapshot({ canonicalNodeId: "in", officialCode: "IN", labelSnapshot: "India", level: "country", entityKind: "country" }),
      snapshot(),
      snapshot({
        canonicalNodeId: "in-state-odisha-district-362",
        officialCode: "362",
        labelSnapshot: "Khordha",
        level: "district",
        entityKind: "district"
      })
    ],
    ...overrides
  };
}

function claim(overrides = {}) {
  const trusted = trustedReference();
  return {
    schemaVersion: "voiceup.location-reference/v1",
    verificationState: "canonical_verified",
    canonicalNodeId: trusted.canonicalNodeId,
    officialCode: trusted.officialCode,
    labelSnapshot: trusted.canonicalLabel,
    level: trusted.level,
    entityKind: trusted.entityKind,
    authority: dataset.authority,
    sourceDataset: dataset.sourceDataset,
    datasetVersion: dataset.datasetVersion,
    parents: trusted.parents.map((item) => ({ ...item })),
    lineageSnapshot: trusted.lineageSnapshot.map((item) => ({ ...item })),
    validation: { validatedAt: "2020-01-01T00:00:00Z", validatorVersion: "untrusted-client" },
    ...overrides
  };
}

function custom() {
  return {
    schemaVersion: "voiceup.location-reference/v1",
    verificationState: "unverified_custom",
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: "Village chowk",
    provenance: { source: "campaign_manual" }
  };
}

function platform(overrides = {}) {
  const calls = { metadata: 0, getPersistenceReference: [], validate: 0 };
  return {
    calls,
    metadata: async () => {
      calls.metadata += 1;
      return {
        namespace: "/v1",
        datasetVersion: dataset.datasetVersion,
        source: { ...dataset, sourceDatasetVersion: dataset.datasetVersion },
        readOnly: true,
        security: {}
      };
    },
    getPersistenceReference: async (nodeId) => {
      calls.getPersistenceReference.push(nodeId);
      return trustedReference();
    },
    validate: async () => {
      calls.validate += 1;
      return {
        status: "valid",
        node: {},
        checks: {
          nodeExists: true,
          levelMatches: true,
          officialCodeMatches: true,
          parentageMatches: true,
          lineageMatches: true,
          datasetVersionMatches: true,
          sourceDatasetMatches: true
        }
      };
    },
    ...overrides
  };
}

async function assertCode(value, code, platformOverrides = {}) {
  const validator = new PersistedLocationReferenceValidator(platform(platformOverrides));
  await assert.rejects(
    validator.validateAndRebuildForNewWrite(value),
    (error) => error instanceof PersistedLocationValidationError && error.code === code
  );
}

test("trusted validator rebuilds a canonical claim from the active Location Platform", async () => {
  const port = platform();
  const validator = new PersistedLocationReferenceValidator(port, {
    now: () => new Date("2026-09-17T01:02:03.000Z"),
    validatorVersion: "location-api-v1-test"
  });
  const rebuilt = await validator.validateAndRebuildForNewWrite(claim());
  assert.equal(rebuilt.verificationState, "canonical_verified");
  assert.equal(rebuilt.labelSnapshot, "Bhubaneswar");
  assert.equal(rebuilt.entityKind, "municipal_corporation");
  assert.deepEqual(rebuilt.validation, {
    validatedAt: "2026-09-17T01:02:03.000Z",
    validatorVersion: "location-api-v1-test"
  });
  assert.deepEqual(port.calls.getPersistenceReference, [claim().canonicalNodeId]);
  assert.equal(port.calls.validate, 1);
});

test("unverified custom references remain unverified and never call canonical lookup", async () => {
  const port = platform();
  const validator = new PersistedLocationReferenceValidator(port);
  const result = await validator.validateAndRebuildForNewWrite(custom());
  assert.equal(result.verificationState, "unverified_custom");
  assert.equal(result.canonicalNodeId, null);
  assert.deepEqual(port.calls, { metadata: 0, getPersistenceReference: [], validate: 0 });
});

test("new writes require the exact active authority, dataset and version", async () => {
  await assertCode(claim({ authority: "OTHER" }), "ACTIVE_DATASET_MISMATCH");
  await assertCode(claim({ sourceDataset: "other-dataset" }), "ACTIVE_DATASET_MISMATCH");
  await assertCode(claim({ datasetVersion: "lgd-old" }), "ACTIVE_DATASET_MISMATCH");
});

test("historical revalidation explicitly fails closed without rewriting the old version", async () => {
  const historical = claim({ datasetVersion: "lgd-2025-01-01" });
  const validator = new PersistedLocationReferenceValidator(platform());
  await assert.rejects(
    validator.revalidateHistorical(historical),
    (error) => error instanceof PersistedLocationValidationError
      && error.code === "HISTORICAL_REVALIDATION_UNSUPPORTED"
  );
  assert.equal(historical.datasetVersion, "lgd-2025-01-01");
});

test("wrong selected-node fields are rejected without same-label substitution", async () => {
  await assertCode(claim({ officialCode: "999999" }), "OFFICIAL_CODE_MISMATCH");
  await assertCode(claim({ labelSnapshot: "Bhubaneswar Municipal Corporation" }), "LABEL_MISMATCH");
  await assertCode(claim({ level: "block" }), "LEVEL_MISMATCH");
  await assertCode(claim({ entityKind: "municipality" }), "ENTITY_KIND_MISMATCH");
});

test("wrong immediate parents and ordered lineage are rejected", async () => {
  const wrongParents = claim();
  wrongParents.parents[0].officialCode = "999";
  await assertCode(wrongParents, "PARENTS_MISMATCH");

  const wrongLineage = claim();
  wrongLineage.lineageSnapshot = [...wrongLineage.lineageSnapshot].reverse();
  await assertCode(wrongLineage, "LINEAGE_MISMATCH");
});

test("canonical API validation rejection remains fail-closed", async () => {
  await assertCode(claim(), "CANONICAL_VALIDATION_REJECTED", {
    validate: async () => ({ status: "invalid", checks: {}, issues: [{ code: "lineage_mismatch", reason: "invalid" }] })
  });
});

test("adapter produces persistence-ready entity, parent and ordered lineage snapshots", async () => {
  const source = { authority: "LGD", sourceDataset: "india-lgd", sourceDatasetVersion: dataset.datasetVersion, provenance: "official" };
  const node = (nodeId, officialCode, level, entityKind, displayName) => ({
    nodeId, officialCode, level, entityKind, displayName, datasetVersion: dataset.datasetVersion, source, parents: [], lineage: []
  });
  const selected = node(claim().canonicalNodeId, "250520", "local_body", "municipal_corporation", "Bhubaneswar");
  const parent = node("in-state-odisha-district-362", "362", "district", "district", "Khordha");
  const india = node("in", "IN", "country", "country", "India");
  const odisha = node("in-state-odisha", "21", "state", "state", "Odisha");
  const response = (data) => ({ apiVersion: "v1", datasetVersion: dataset.datasetVersion, data });
  const adapter = new CampaignLocationPlatformAdapter({
    getNode: async () => response(selected),
    getParents: async () => response({ nodeId: selected.nodeId, parents: [parent] }),
    getLineage: async () => response({ nodeId: selected.nodeId, lineage: [india, odisha, parent] })
  });
  const reference = await adapter.getPersistenceReference(selected.nodeId);
  assert.equal(reference.entityKind, "municipal_corporation");
  assert.deepEqual(reference.parents.map((item) => item.labelSnapshot), ["Khordha"]);
  assert.deepEqual(reference.lineageSnapshot.map((item) => item.labelSnapshot), ["India", "Odisha", "Khordha"]);
});

test("adapter rejects mixed-version related nodes", async () => {
  const source = { authority: "LGD", sourceDataset: "india-lgd", sourceDatasetVersion: dataset.datasetVersion, provenance: "official" };
  const selected = {
    nodeId: claim().canonicalNodeId, officialCode: "250520", level: "local_body", entityKind: "municipal_corporation",
    displayName: "Bhubaneswar", datasetVersion: dataset.datasetVersion, source, parents: [], lineage: []
  };
  const wrong = { ...selected, nodeId: "old-parent", datasetVersion: "lgd-old" };
  const response = (data) => ({ apiVersion: "v1", datasetVersion: dataset.datasetVersion, data });
  const adapter = new CampaignLocationPlatformAdapter({
    getNode: async () => response(selected),
    getParents: async () => response({ nodeId: selected.nodeId, parents: [wrong] }),
    getLineage: async () => response({ nodeId: selected.nodeId, lineage: [] })
  });
  await assert.rejects(adapter.getPersistenceReference(selected.nodeId), /mixed dataset identity/u);
});

