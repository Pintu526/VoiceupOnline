export const PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION = "voiceup.location-reference/v1" as const;

export const PERSISTED_LOCATION_REFERENCE_BOUNDS = Object.freeze({
  maxSerializedPayloadBytes: 16_384,
  maxLabelLength: 256,
  maxCanonicalIdLength: 256,
  maxOfficialCodeLength: 128,
  maxDatasetStringLength: 128,
  maxLevelLength: 64,
  maxEntityKindLength: 64,
  maxValidatorVersionLength: 128,
  maxLineageCount: 16,
  maxParentCount: 8,
  maxParentContextCount: 8,
  maxObservationEvidenceCount: 8,
  maxProvenanceContextBytes: 2_048,
  maxProvenanceValueLength: 256,
  maxEvidenceValueLength: 512
});

export type PersistedLocationVerificationState =
  | "canonical_verified"
  | "unverified_custom"
  | "legacy_unresolved"
  | "unverified_observation";

export interface PersistedCanonicalLocationSnapshot {
  canonicalNodeId: string;
  officialCode: string | null;
  labelSnapshot: string;
  level: string;
  entityKind: string;
}

export interface PersistedLocationValidationMetadata {
  validatedAt: string;
  validatorVersion: string;
}

export interface PersistedCanonicalLocationReference {
  schemaVersion: typeof PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION;
  verificationState: "canonical_verified";
  canonicalNodeId: string;
  officialCode: string | null;
  labelSnapshot: string;
  level: string;
  entityKind: string;
  authority: string;
  sourceDataset: string;
  datasetVersion: string;
  parents: PersistedCanonicalLocationSnapshot[];
  lineageSnapshot: PersistedCanonicalLocationSnapshot[];
  validation: PersistedLocationValidationMetadata;
}

export interface PersistedLocationParentContext {
  labelSnapshot: string;
  level?: string;
  entityKind?: string;
}

export interface PersistedLocationProvenance {
  source: string;
  actorId?: string;
  sourceRecordId?: string;
  recordedAt?: string;
}

interface PersistedUnverifiedLocationBase {
  schemaVersion: typeof PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION;
  canonicalNodeId: null;
  officialCode: null;
  labelSnapshot: string;
  level?: string;
  parentContext?: PersistedLocationParentContext[];
}

export interface PersistedCustomLocationReference extends PersistedUnverifiedLocationBase {
  verificationState: "unverified_custom";
  provenance: PersistedLocationProvenance;
}

export interface PersistedLegacyLocationReference extends PersistedUnverifiedLocationBase {
  verificationState: "legacy_unresolved";
  provenance?: PersistedLocationProvenance;
}

export interface PersistedLocationObservationEvidence {
  kind: "ocr" | "gps" | "pin" | "other";
  valueSnapshot: string;
  confidence?: number;
}

export interface PersistedObservedLocationReference {
  schemaVersion: typeof PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION;
  verificationState: "unverified_observation";
  canonicalNodeId: null;
  officialCode: null;
  labelSnapshot?: string;
  level?: string;
  parentContext?: PersistedLocationParentContext[];
  provenance: PersistedLocationProvenance;
  evidence?: PersistedLocationObservationEvidence[];
}

export type PersistedLocationReference =
  | PersistedCanonicalLocationReference
  | PersistedCustomLocationReference
  | PersistedLegacyLocationReference
  | PersistedObservedLocationReference;

export type PersistedLocationReferenceErrorCode =
  | "PROTOTYPE_UNSAFE"
  | "PAYLOAD_SERIALIZATION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "PAYLOAD_NOT_OBJECT"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "UNKNOWN_VERIFICATION_STATE"
  | "UNEXPECTED_FIELD"
  | "MISSING_FIELD"
  | "INVALID_FIELD_TYPE"
  | "EMPTY_STRING"
  | "STRING_TOO_LONG"
  | "MALFORMED_CANONICAL_ID"
  | "MISSING_CANONICAL_NODE_ID"
  | "MISSING_AUTHORITY"
  | "MISSING_SOURCE_DATASET"
  | "MISSING_DATASET_VERSION"
  | "MISSING_ENTITY_KIND"
  | "INVALID_OFFICIAL_CODE"
  | "PARENTS_TOO_LARGE"
  | "LINEAGE_TOO_LARGE"
  | "DUPLICATE_PARENT_NODE"
  | "DUPLICATE_LINEAGE_NODE"
  | "SELF_PARENT"
  | "SELF_LINEAGE"
  | "MALFORMED_PARENT"
  | "MALFORMED_PARENT_CONTEXT"
  | "MALFORMED_VALIDATION_METADATA"
  | "MALFORMED_PROVENANCE"
  | "MALFORMED_EVIDENCE"
  | "PROVENANCE_CONTEXT_TOO_LARGE"
  | "UNVERIFIED_CANONICAL_NODE_ID_MUST_BE_NULL"
  | "UNVERIFIED_OFFICIAL_CODE_MUST_BE_NULL"
  | "UNVERIFIED_CANONICAL_CLAIM";

export class PersistedLocationReferenceParseError extends Error {
  readonly code: PersistedLocationReferenceErrorCode;
  readonly path: string;

  constructor(code: PersistedLocationReferenceErrorCode, path: string) {
    super(`${code} at ${path}`);
    this.name = "PersistedLocationReferenceParseError";
    this.code = code;
    this.path = path;
  }
}

export type PersistedLocationReferenceParseResult =
  | { ok: true; value: PersistedLocationReference }
  | { ok: false; error: PersistedLocationReferenceParseError };

type PlainRecord = Record<string, unknown>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]*[A-Za-z0-9])?$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const CANONICAL_CLAIM_FIELDS = ["authority", "sourceDataset", "datasetVersion"] as const;

function fail(code: PersistedLocationReferenceErrorCode, path: string): never {
  throw new PersistedLocationReferenceParseError(code, path);
}

function hasOwn(value: PlainRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertPrototypeSafe(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("PROTOTYPE_UNSAFE", path);
  seen.add(value);

  const isArray = Array.isArray(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail("PROTOTYPE_UNSAFE", path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || "get" in descriptor || "set" in descriptor) fail("PROTOTYPE_UNSAFE", `${path}.${key}`);
    if (!descriptor.enumerable && !(isArray && key === "length")) fail("PROTOTYPE_UNSAFE", `${path}.${key}`);
  }

  if (isArray) {
    if (Object.getPrototypeOf(value) !== Array.prototype) fail("PROTOTYPE_UNSAFE", path);
    for (const key of Object.keys(value)) {
      if (!/^\d+$/u.test(key)) fail("PROTOTYPE_UNSAFE", `${path}.${key}`);
    }
    value.forEach((item, index) => assertPrototypeSafe(item, `${path}[${index}]`, seen));
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail("PROTOTYPE_UNSAFE", path);
    for (const key of Object.keys(value)) {
      if (PROTOTYPE_SENSITIVE_KEYS.has(key)) fail("PROTOTYPE_UNSAFE", `${path}.${key}`);
      assertPrototypeSafe((value as PlainRecord)[key], `${path}.${key}`, seen);
    }
  }

  seen.delete(value);
}

function serializedBytes(value: unknown, errorCode: PersistedLocationReferenceErrorCode, path: string): number {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail("PAYLOAD_SERIALIZATION_FAILED", path);
  }
  if (serialized === undefined) fail(errorCode, path);
  return new TextEncoder().encode(serialized).byteLength;
}

function expectObject(value: unknown, path: string, code: PersistedLocationReferenceErrorCode = "INVALID_FIELD_TYPE"): PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code, path);
  return value as PlainRecord;
}

function assertAllowedKeys(value: PlainRecord, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) fail("UNEXPECTED_FIELD", `${path}.${key}`);
  }
}

function required(value: PlainRecord, key: string, code: PersistedLocationReferenceErrorCode = "MISSING_FIELD"): unknown {
  if (!hasOwn(value, key)) fail(code, `$.${key}`);
  return value[key];
}

function normalizeString(
  value: unknown,
  path: string,
  maxLength: number,
  missingCode?: PersistedLocationReferenceErrorCode
): string {
  if (value === undefined && missingCode) fail(missingCode, path);
  if (typeof value !== "string") fail("INVALID_FIELD_TYPE", path);
  const normalized = value.trim();
  if (normalized.length === 0) fail("EMPTY_STRING", path);
  if (normalized.length > maxLength) fail("STRING_TOO_LONG", path);
  return normalized;
}

function normalizeIdentifier(value: unknown, path: string, missingCode?: PersistedLocationReferenceErrorCode): string {
  const normalized = normalizeString(value, path, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxCanonicalIdLength, missingCode);
  if (!IDENTIFIER_PATTERN.test(normalized)) fail("MALFORMED_CANONICAL_ID", path);
  return normalized;
}

function normalizeOptionalString(value: PlainRecord, key: string, path: string, maxLength: number): string | undefined {
  return hasOwn(value, key) ? normalizeString(value[key], `${path}.${key}`, maxLength) : undefined;
}

function normalizeOfficialCode(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") fail("INVALID_OFFICIAL_CODE", path);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxOfficialCodeLength) {
    fail("INVALID_OFFICIAL_CODE", path);
  }
  return normalized;
}

function normalizeTimestamp(value: unknown, path: string, code: PersistedLocationReferenceErrorCode): string {
  const normalized = normalizeString(value, path, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxProvenanceValueLength);
  if (!ISO_TIMESTAMP_PATTERN.test(normalized) || Number.isNaN(Date.parse(normalized))) fail(code, path);
  return normalized;
}

function parseCanonicalSnapshot(value: unknown, path: string, malformedCode: PersistedLocationReferenceErrorCode): PersistedCanonicalLocationSnapshot {
  const object = expectObject(value, path, malformedCode);
  assertAllowedKeys(object, ["canonicalNodeId", "officialCode", "labelSnapshot", "level", "entityKind"], path);
  for (const key of ["canonicalNodeId", "officialCode", "labelSnapshot", "level", "entityKind"]) {
    if (!hasOwn(object, key)) fail(malformedCode, `${path}.${key}`);
  }
  return {
    canonicalNodeId: normalizeIdentifier(object.canonicalNodeId, `${path}.canonicalNodeId`),
    officialCode: normalizeOfficialCode(object.officialCode, `${path}.officialCode`),
    labelSnapshot: normalizeString(object.labelSnapshot, `${path}.labelSnapshot`, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLabelLength),
    level: normalizeString(object.level, `${path}.level`, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLevelLength),
    entityKind: normalizeString(object.entityKind, `${path}.entityKind`, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxEntityKindLength)
  };
}

function parseCanonicalSnapshotArray(
  value: unknown,
  path: string,
  maxCount: number,
  tooLargeCode: PersistedLocationReferenceErrorCode,
  malformedCode: PersistedLocationReferenceErrorCode,
  duplicateCode: PersistedLocationReferenceErrorCode,
  selectedNodeId: string,
  selfCode: PersistedLocationReferenceErrorCode
): PersistedCanonicalLocationSnapshot[] {
  if (!Array.isArray(value)) fail(malformedCode, path);
  if (value.length > maxCount) fail(tooLargeCode, path);
  const seen = new Set<string>();
  return value.map((item, index) => {
    const snapshot = parseCanonicalSnapshot(item, `${path}[${index}]`, malformedCode);
    if (snapshot.canonicalNodeId === selectedNodeId) fail(selfCode, `${path}[${index}].canonicalNodeId`);
    if (seen.has(snapshot.canonicalNodeId)) fail(duplicateCode, `${path}[${index}].canonicalNodeId`);
    seen.add(snapshot.canonicalNodeId);
    return snapshot;
  });
}

function parseParentContext(value: unknown, path: string): PersistedLocationParentContext[] {
  if (!Array.isArray(value)) fail("MALFORMED_PARENT_CONTEXT", path);
  if (value.length > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxParentContextCount) fail("MALFORMED_PARENT_CONTEXT", path);
  const context = value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const object = expectObject(item, itemPath, "MALFORMED_PARENT_CONTEXT");
    assertAllowedKeys(object, ["labelSnapshot", "level", "entityKind"], itemPath);
    if (!hasOwn(object, "labelSnapshot")) fail("MALFORMED_PARENT_CONTEXT", `${itemPath}.labelSnapshot`);
    const normalized: PersistedLocationParentContext = {
      labelSnapshot: normalizeString(object.labelSnapshot, `${itemPath}.labelSnapshot`, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLabelLength)
    };
    const level = normalizeOptionalString(object, "level", itemPath, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLevelLength);
    const entityKind = normalizeOptionalString(object, "entityKind", itemPath, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxEntityKindLength);
    if (level !== undefined) normalized.level = level;
    if (entityKind !== undefined) normalized.entityKind = entityKind;
    return normalized;
  });
  if (serializedBytes(context, "MALFORMED_PARENT_CONTEXT", path) > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxProvenanceContextBytes) {
    fail("PROVENANCE_CONTEXT_TOO_LARGE", path);
  }
  return context;
}

function parseProvenance(value: unknown, path: string): PersistedLocationProvenance {
  const object = expectObject(value, path, "MALFORMED_PROVENANCE");
  assertAllowedKeys(object, ["source", "actorId", "sourceRecordId", "recordedAt"], path);
  if (!hasOwn(object, "source")) fail("MALFORMED_PROVENANCE", `${path}.source`);
  const provenance: PersistedLocationProvenance = {
    source: normalizeString(object.source, `${path}.source`, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxProvenanceValueLength)
  };
  const actorId = normalizeOptionalString(object, "actorId", path, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxProvenanceValueLength);
  const sourceRecordId = normalizeOptionalString(object, "sourceRecordId", path, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxProvenanceValueLength);
  if (actorId !== undefined) provenance.actorId = actorId;
  if (sourceRecordId !== undefined) provenance.sourceRecordId = sourceRecordId;
  if (hasOwn(object, "recordedAt")) provenance.recordedAt = normalizeTimestamp(object.recordedAt, `${path}.recordedAt`, "MALFORMED_PROVENANCE");
  if (serializedBytes(provenance, "MALFORMED_PROVENANCE", path) > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxProvenanceContextBytes) {
    fail("PROVENANCE_CONTEXT_TOO_LARGE", path);
  }
  return provenance;
}

function parseEvidence(value: unknown, path: string): PersistedLocationObservationEvidence[] {
  if (!Array.isArray(value)) fail("MALFORMED_EVIDENCE", path);
  if (value.length > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxObservationEvidenceCount) fail("MALFORMED_EVIDENCE", path);
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const object = expectObject(item, itemPath, "MALFORMED_EVIDENCE");
    assertAllowedKeys(object, ["kind", "valueSnapshot", "confidence"], itemPath);
    if (!hasOwn(object, "kind") || !hasOwn(object, "valueSnapshot")) fail("MALFORMED_EVIDENCE", itemPath);
    if (!(["ocr", "gps", "pin", "other"] as unknown[]).includes(object.kind)) fail("MALFORMED_EVIDENCE", `${itemPath}.kind`);
    const evidence: PersistedLocationObservationEvidence = {
      kind: object.kind as PersistedLocationObservationEvidence["kind"],
      valueSnapshot: normalizeString(object.valueSnapshot, `${itemPath}.valueSnapshot`, PERSISTED_LOCATION_REFERENCE_BOUNDS.maxEvidenceValueLength)
    };
    if (hasOwn(object, "confidence")) {
      if (typeof object.confidence !== "number" || !Number.isFinite(object.confidence) || object.confidence < 0 || object.confidence > 1) {
        fail("MALFORMED_EVIDENCE", `${itemPath}.confidence`);
      }
      evidence.confidence = object.confidence;
    }
    return evidence;
  });
}

function parseValidation(value: unknown): PersistedLocationValidationMetadata {
  const path = "$.validation";
  const object = expectObject(value, path, "MALFORMED_VALIDATION_METADATA");
  assertAllowedKeys(object, ["validatedAt", "validatorVersion"], path);
  if (!hasOwn(object, "validatedAt") || !hasOwn(object, "validatorVersion")) fail("MALFORMED_VALIDATION_METADATA", path);
  return {
    validatedAt: normalizeTimestamp(object.validatedAt, `${path}.validatedAt`, "MALFORMED_VALIDATION_METADATA"),
    validatorVersion: normalizeString(
      object.validatorVersion,
      `${path}.validatorVersion`,
      PERSISTED_LOCATION_REFERENCE_BOUNDS.maxValidatorVersionLength
    )
  };
}

function assertUnverifiedNullIdentity(object: PlainRecord): void {
  if (!hasOwn(object, "canonicalNodeId") || object.canonicalNodeId !== null) {
    fail("UNVERIFIED_CANONICAL_NODE_ID_MUST_BE_NULL", "$.canonicalNodeId");
  }
  if (!hasOwn(object, "officialCode") || object.officialCode !== null) {
    fail("UNVERIFIED_OFFICIAL_CODE_MUST_BE_NULL", "$.officialCode");
  }
  for (const field of CANONICAL_CLAIM_FIELDS) {
    if (hasOwn(object, field)) fail("UNVERIFIED_CANONICAL_CLAIM", `$.${field}`);
  }
}

function parseCommonUnverified(object: PlainRecord): {
  canonicalNodeId: null;
  officialCode: null;
  labelSnapshot: string;
  level?: string;
  parentContext?: PersistedLocationParentContext[];
} {
  assertUnverifiedNullIdentity(object);
  const common: {
    canonicalNodeId: null;
    officialCode: null;
    labelSnapshot: string;
    level?: string;
    parentContext?: PersistedLocationParentContext[];
  } = {
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: normalizeString(required(object, "labelSnapshot"), "$.labelSnapshot", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLabelLength)
  };
  const level = normalizeOptionalString(object, "level", "$", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLevelLength);
  if (level !== undefined) common.level = level;
  if (hasOwn(object, "parentContext")) common.parentContext = parseParentContext(object.parentContext, "$.parentContext");
  return common;
}

function parseCanonical(object: PlainRecord): PersistedCanonicalLocationReference {
  assertAllowedKeys(object, [
    "schemaVersion", "verificationState", "canonicalNodeId", "officialCode", "labelSnapshot", "level", "entityKind",
    "authority", "sourceDataset", "datasetVersion", "parents", "lineageSnapshot", "validation"
  ], "$" );

  const canonicalNodeId = normalizeIdentifier(
    required(object, "canonicalNodeId", "MISSING_CANONICAL_NODE_ID"),
    "$.canonicalNodeId",
    "MISSING_CANONICAL_NODE_ID"
  );
  if (!hasOwn(object, "officialCode")) fail("MISSING_FIELD", "$.officialCode");
  const entityKind = normalizeString(required(object, "entityKind", "MISSING_ENTITY_KIND"), "$.entityKind", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxEntityKindLength, "MISSING_ENTITY_KIND");
  const authority = normalizeString(required(object, "authority", "MISSING_AUTHORITY"), "$.authority", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxDatasetStringLength, "MISSING_AUTHORITY");
  const sourceDataset = normalizeString(required(object, "sourceDataset", "MISSING_SOURCE_DATASET"), "$.sourceDataset", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxDatasetStringLength, "MISSING_SOURCE_DATASET");
  const datasetVersion = normalizeString(required(object, "datasetVersion", "MISSING_DATASET_VERSION"), "$.datasetVersion", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxDatasetStringLength, "MISSING_DATASET_VERSION");

  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "canonical_verified",
    canonicalNodeId,
    officialCode: normalizeOfficialCode(object.officialCode, "$.officialCode"),
    labelSnapshot: normalizeString(required(object, "labelSnapshot"), "$.labelSnapshot", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLabelLength),
    level: normalizeString(required(object, "level"), "$.level", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLevelLength),
    entityKind,
    authority,
    sourceDataset,
    datasetVersion,
    parents: parseCanonicalSnapshotArray(
      required(object, "parents"), "$.parents", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxParentCount,
      "PARENTS_TOO_LARGE", "MALFORMED_PARENT", "DUPLICATE_PARENT_NODE", canonicalNodeId, "SELF_PARENT"
    ),
    lineageSnapshot: parseCanonicalSnapshotArray(
      required(object, "lineageSnapshot"), "$.lineageSnapshot", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLineageCount,
      "LINEAGE_TOO_LARGE", "INVALID_FIELD_TYPE", "DUPLICATE_LINEAGE_NODE", canonicalNodeId, "SELF_LINEAGE"
    ),
    validation: parseValidation(required(object, "validation"))
  };
}

function parseCustom(object: PlainRecord): PersistedCustomLocationReference {
  assertUnverifiedNullIdentity(object);
  assertAllowedKeys(object, ["schemaVersion", "verificationState", "canonicalNodeId", "officialCode", "labelSnapshot", "level", "parentContext", "provenance"], "$" );
  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "unverified_custom",
    ...parseCommonUnverified(object),
    provenance: parseProvenance(required(object, "provenance"), "$.provenance")
  };
}

function parseLegacy(object: PlainRecord): PersistedLegacyLocationReference {
  assertUnverifiedNullIdentity(object);
  assertAllowedKeys(object, ["schemaVersion", "verificationState", "canonicalNodeId", "officialCode", "labelSnapshot", "level", "parentContext", "provenance"], "$" );
  const reference: PersistedLegacyLocationReference = {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "legacy_unresolved",
    ...parseCommonUnverified(object)
  };
  if (hasOwn(object, "provenance")) reference.provenance = parseProvenance(object.provenance, "$.provenance");
  return reference;
}

function parseObservation(object: PlainRecord): PersistedObservedLocationReference {
  assertUnverifiedNullIdentity(object);
  assertAllowedKeys(object, ["schemaVersion", "verificationState", "canonicalNodeId", "officialCode", "labelSnapshot", "level", "parentContext", "provenance", "evidence"], "$" );
  const reference: PersistedObservedLocationReference = {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "unverified_observation",
    canonicalNodeId: null,
    officialCode: null,
    provenance: parseProvenance(required(object, "provenance"), "$.provenance")
  };
  if (hasOwn(object, "labelSnapshot")) {
    reference.labelSnapshot = normalizeString(object.labelSnapshot, "$.labelSnapshot", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLabelLength);
  }
  const level = normalizeOptionalString(object, "level", "$", PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLevelLength);
  if (level !== undefined) reference.level = level;
  if (hasOwn(object, "parentContext")) reference.parentContext = parseParentContext(object.parentContext, "$.parentContext");
  if (hasOwn(object, "evidence")) reference.evidence = parseEvidence(object.evidence, "$.evidence");
  return reference;
}

export function parsePersistedLocationReference(input: unknown): PersistedLocationReference {
  assertPrototypeSafe(input, "$", new Set());
  if (serializedBytes(input, "PAYLOAD_SERIALIZATION_FAILED", "$") > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxSerializedPayloadBytes) {
    fail("PAYLOAD_TOO_LARGE", "$");
  }
  const object = expectObject(input, "$", "PAYLOAD_NOT_OBJECT");

  if (object.schemaVersion !== PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION) fail("UNSUPPORTED_SCHEMA_VERSION", "$.schemaVersion");
  const state = object.verificationState;
  if (state === "canonical_verified") return parseCanonical(object);
  if (state === "unverified_custom") return parseCustom(object);
  if (state === "legacy_unresolved") return parseLegacy(object);
  if (state === "unverified_observation") return parseObservation(object);
  fail("UNKNOWN_VERIFICATION_STATE", "$.verificationState");
}

export function safeParsePersistedLocationReference(input: unknown): PersistedLocationReferenceParseResult {
  try {
    return { ok: true, value: parsePersistedLocationReference(input) };
  } catch (error) {
    if (error instanceof PersistedLocationReferenceParseError) return { ok: false, error };
    throw error;
  }
}
