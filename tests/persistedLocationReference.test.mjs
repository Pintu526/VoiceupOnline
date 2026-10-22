import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSISTED_LOCATION_REFERENCE_BOUNDS,
  PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
  PersistedLocationReferenceParseError,
  parsePersistedLocationReference,
  safeParsePersistedLocationReference
} from "../src/businessOs/location/persistence/PersistedLocationReference.ts";

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

function canonical(overrides = {}) {
  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "canonical_verified",
    canonicalNodeId: "in-state-odisha-district-362-local-250520",
    officialCode: "250520",
    labelSnapshot: "Bhubaneswar",
    level: "local_body",
    entityKind: "municipal_corporation",
    authority: "LGD",
    sourceDataset: "india-lgd",
    datasetVersion: "lgd-2026-08-27",
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
    validation: {
      validatedAt: "2026-09-16T08:30:00.000Z",
      validatorVersion: "location-api-v1"
    },
    ...overrides
  };
}

function custom(overrides = {}) {
  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "unverified_custom",
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: "Village chowk",
    level: "locality",
    parentContext: [{ labelSnapshot: "Balianta", level: "block", entityKind: "development_block" }],
    provenance: {
      source: "campaign_manual",
      actorId: "user-123",
      sourceRecordId: "campaign-456",
      recordedAt: "2026-09-16T08:30:00Z"
    },
    ...overrides
  };
}

function legacy(overrides = {}) {
  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "legacy_unresolved",
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: "Old location label",
    parentContext: [{ labelSnapshot: "Legacy district", level: "district" }],
    ...overrides
  };
}

function observation(overrides = {}) {
  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "unverified_observation",
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: "Captured place",
    provenance: { source: "ocr", sourceRecordId: "scan-789", recordedAt: "2026-09-16T08:30:00Z" },
    evidence: [
      { kind: "ocr", valueSnapshot: "Captured place", confidence: 0.91 },
      { kind: "pin", valueSnapshot: "752101" }
    ],
    ...overrides
  };
}

function assertCode(value, code) {
  const result = safeParsePersistedLocationReference(value);
  assert.equal(result.ok, false);
  assert.ok(result.error instanceof PersistedLocationReferenceParseError);
  assert.equal(result.error.code, code);
  assert.match(result.error.message, new RegExp(`^${code} at \\$`));
}

test("parses and normalizes a bounded canonical_verified reference", () => {
  const value = canonical({ authority: "  LGD  ", labelSnapshot: "  Bhubaneswar  " });
  const parsed = parsePersistedLocationReference(value);
  assert.equal(parsed.verificationState, "canonical_verified");
  assert.equal(parsed.authority, "LGD");
  assert.equal(parsed.labelSnapshot, "Bhubaneswar");
  assert.deepEqual(parsed.lineageSnapshot.map((item) => item.canonicalNodeId), [
    "in",
    "in-state-odisha",
    "in-state-odisha-district-362"
  ]);
  assert.deepEqual(parsed.parents.map((item) => item.canonicalNodeId), ["in-state-odisha-district-362"]);
});

test("accepts an explicit null officialCode for a legitimate canonical node", () => {
  const parsed = parsePersistedLocationReference(canonical({ officialCode: null }));
  assert.equal(parsed.officialCode, null);
});

test("parses custom, legacy and observation states without canonical claims", () => {
  const parsedCustom = parsePersistedLocationReference(custom());
  const parsedLegacy = parsePersistedLocationReference(legacy());
  const parsedObservation = parsePersistedLocationReference(observation());
  assert.equal(parsedCustom.verificationState, "unverified_custom");
  assert.equal(parsedCustom.canonicalNodeId, null);
  assert.equal(parsedLegacy.verificationState, "legacy_unresolved");
  assert.equal(parsedLegacy.officialCode, null);
  assert.equal(parsedObservation.verificationState, "unverified_observation");
  assert.deepEqual(parsedObservation.evidence?.map((item) => item.kind), ["ocr", "pin"]);
});

test("does not promote an unverified label that equals a canonical label", () => {
  const parsed = parsePersistedLocationReference(custom({ labelSnapshot: "Bhubaneswar" }));
  assert.equal(parsed.verificationState, "unverified_custom");
  assert.equal(parsed.canonicalNodeId, null);
});

test("rejects unsupported schema versions and unknown verification states", () => {
  assertCode(canonical({ schemaVersion: "voiceup.location-reference/v2" }), "UNSUPPORTED_SCHEMA_VERSION");
  assertCode(canonical({ verificationState: "canonicalish" }), "UNKNOWN_VERIFICATION_STATE");
});

test("rejects missing and null canonical identity components with stable codes", () => {
  const missingNode = canonical();
  delete missingNode.canonicalNodeId;
  assertCode(missingNode, "MISSING_CANONICAL_NODE_ID");
  assertCode(canonical({ canonicalNodeId: null }), "INVALID_FIELD_TYPE");

  const missingAuthority = canonical();
  delete missingAuthority.authority;
  assertCode(missingAuthority, "MISSING_AUTHORITY");
  const missingSource = canonical();
  delete missingSource.sourceDataset;
  assertCode(missingSource, "MISSING_SOURCE_DATASET");
  const missingVersion = canonical();
  delete missingVersion.datasetVersion;
  assertCode(missingVersion, "MISSING_DATASET_VERSION");
  const missingKind = canonical();
  delete missingKind.entityKind;
  assertCode(missingKind, "MISSING_ENTITY_KIND");
});

test("rejects malformed identifiers and mixed canonical official-code values", () => {
  assertCode(canonical({ canonicalNodeId: "bad id with spaces" }), "MALFORMED_CANONICAL_ID");
  assertCode(canonical({ officialCode: 250520 }), "INVALID_OFFICIAL_CODE");
});

test("rejects canonical claims in every unverified state", () => {
  assertCode(custom({ authority: "LGD" }), "UNVERIFIED_CANONICAL_CLAIM");
  assertCode(legacy({ sourceDataset: "india-lgd" }), "UNVERIFIED_CANONICAL_CLAIM");
  assertCode(observation({ datasetVersion: "lgd-2026-08-27" }), "UNVERIFIED_CANONICAL_CLAIM");
  assertCode(custom({ canonicalNodeId: "in-state-odisha" }), "UNVERIFIED_CANONICAL_NODE_ID_MUST_BE_NULL");
  assertCode(legacy({ officialCode: "21" }), "UNVERIFIED_OFFICIAL_CODE_MUST_BE_NULL");
});

test("rejects oversized payloads and strings", () => {
  assertCode(canonical({ ignored: "x".repeat(PERSISTED_LOCATION_REFERENCE_BOUNDS.maxSerializedPayloadBytes) }), "PAYLOAD_TOO_LARGE");
  assertCode(canonical({ labelSnapshot: "x".repeat(PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLabelLength + 1) }), "STRING_TOO_LONG");
});

test("rejects oversized parent and lineage arrays", () => {
  const parents = Array.from({ length: PERSISTED_LOCATION_REFERENCE_BOUNDS.maxParentCount + 1 }, (_, index) =>
    snapshot({ canonicalNodeId: `parent-${index}` })
  );
  assertCode(canonical({ parents }), "PARENTS_TOO_LARGE");

  const lineageSnapshot = Array.from({ length: PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLineageCount + 1 }, (_, index) =>
    snapshot({ canonicalNodeId: `ancestor-${index}` })
  );
  assertCode(canonical({ lineageSnapshot }), "LINEAGE_TOO_LARGE");
});

test("rejects oversized bounded context and evidence arrays", () => {
  const parentContext = Array.from({ length: PERSISTED_LOCATION_REFERENCE_BOUNDS.maxParentContextCount }, (_, index) => ({
    labelSnapshot: `${index}-${"x".repeat(PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLabelLength - 2)}`,
    level: "district",
    entityKind: "district"
  }));
  assertCode(custom({ parentContext }), "PROVENANCE_CONTEXT_TOO_LARGE");

  const evidence = Array.from({ length: PERSISTED_LOCATION_REFERENCE_BOUNDS.maxObservationEvidenceCount + 1 }, () => ({
    kind: "ocr",
    valueSnapshot: "observed"
  }));
  assertCode(observation({ evidence }), "MALFORMED_EVIDENCE");
});

test("rejects duplicate and self-referential lineage", () => {
  const duplicate = snapshot({ canonicalNodeId: "ancestor-1" });
  assertCode(canonical({ lineageSnapshot: [duplicate, { ...duplicate }] }), "DUPLICATE_LINEAGE_NODE");
  assertCode(canonical({ lineageSnapshot: [snapshot({ canonicalNodeId: canonical().canonicalNodeId })] }), "SELF_LINEAGE");
});

test("rejects malformed parents and parentContext", () => {
  assertCode(canonical({ parents: [{ canonicalNodeId: "parent-only" }] }), "MALFORMED_PARENT");
  assertCode(custom({ parentContext: { labelSnapshot: "not-an-array" } }), "MALFORMED_PARENT_CONTEXT");
});

test("rejects unexpected nested fields", () => {
  assertCode(canonical({ lineageSnapshot: [snapshot({ relationshipEvidence: { inferred: true } })] }), "UNEXPECTED_FIELD");
  assertCode(custom({ provenance: { source: "campaign_manual", arbitrary: { nested: true } } }), "UNEXPECTED_FIELD");
});

test("rejects prototype-sensitive inputs before contract parsing", () => {
  const pollutedKey = JSON.parse(`{
    "schemaVersion":"voiceup.location-reference/v1",
    "verificationState":"legacy_unresolved",
    "canonicalNodeId":null,
    "officialCode":null,
    "labelSnapshot":"Legacy",
    "__proto__":{"polluted":true}
  }`);
  assertCode(pollutedKey, "PROTOTYPE_UNSAFE");

  const nonPlain = Object.create(null);
  Object.assign(nonPlain, legacy());
  assertCode(nonPlain, "PROTOTYPE_UNSAFE");

  let getterInvoked = false;
  const accessorInput = legacy();
  Object.defineProperty(accessorInput, "labelSnapshot", {
    enumerable: true,
    get() {
      getterInvoked = true;
      return "unsafe";
    }
  });
  assertCode(accessorInput, "PROTOTYPE_UNSAFE");
  assert.equal(getterInvoked, false);
});

test("safe parser exposes deterministic error code and path", () => {
  const result = safeParsePersistedLocationReference(canonical({ lineageSnapshot: [snapshot({ canonicalNodeId: canonical().canonicalNodeId })] }));
  assert.equal(result.ok, false);
  assert.deepEqual({ code: result.error.code, path: result.error.path }, {
    code: "SELF_LINEAGE",
    path: "$.lineageSnapshot[0].canonicalNodeId"
  });
});
