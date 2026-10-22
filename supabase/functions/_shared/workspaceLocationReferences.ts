type JsonRecord = Record<string, unknown>;

export type WorkspaceLocationVerificationState =
  | "canonical_verified"
  | "unverified_custom"
  | "legacy_unresolved"
  | "unverified_observation";

export interface WorkspaceLocationReferenceValidators {
  validateCanonical(candidate: JsonRecord): Promise<JsonRecord>;
  validateShape(candidate: JsonRecord): Promise<boolean>;
}

export type WorkspaceLocationReferenceErrorCode =
  | "invalid_workspace_location_reference"
  | "unsupported_workspace_location_observation"
  | "workspace_location_reference_limit";

export class WorkspaceLocationReferenceError extends Error {
  readonly code: WorkspaceLocationReferenceErrorCode;

  constructor(code: WorkspaceLocationReferenceErrorCode) {
    super(code);
    this.name = "WorkspaceLocationReferenceError";
    this.code = code;
  }
}

const MAX_WORKSPACE_LOCATION_REFERENCES = 512;
const urbanLocalBodyKinds = new Set([
  "municipality",
  "municipal_corporation",
  "nagar_panchayat",
  "notified_area_council",
  "town_panchayat",
  "other_local_body"
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isParentContext(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 8 && value.every((item) =>
    isRecord(item)
    && hasOnlyKeys(item, ["labelSnapshot", "level", "entityKind"])
    && isBoundedText(item.labelSnapshot, 256)
    && (!hasOwn(item, "level") || isBoundedText(item.level, 64))
    && (!hasOwn(item, "entityKind") || isBoundedText(item.entityKind, 64))
  );
}

function isProvenance(value: unknown): boolean {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["source", "actorId", "sourceRecordId", "recordedAt"])
    || !isBoundedText(value.source, 256)
  ) return false;
  for (const field of ["actorId", "sourceRecordId", "recordedAt"]) {
    if (hasOwn(value, field) && !isBoundedText(value[field], 256)) return false;
  }
  if (hasOwn(value, "recordedAt")) {
    const timestamp = String(value.recordedAt);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(timestamp)
      || Number.isNaN(Date.parse(timestamp))) return false;
  }
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 2_048;
}

function isObservationEvidence(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 8 && value.every((item) =>
    isRecord(item)
    && hasOnlyKeys(item, ["kind", "valueSnapshot", "confidence"])
    && ["ocr", "gps", "pin", "other"].includes(String(item.kind ?? ""))
    && isBoundedText(item.valueSnapshot, 512)
    && (!hasOwn(item, "confidence")
      || (typeof item.confidence === "number" && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1))
  );
}

function isStrictUnverifiedReference(value: JsonRecord): boolean {
  const state = value.verificationState;
  const allowed = [
    "schemaVersion", "verificationState", "canonicalNodeId", "officialCode",
    "labelSnapshot", "level", "parentContext", "provenance"
  ];
  if (!hasOnlyKeys(value, allowed)
    || value.canonicalNodeId !== null
    || value.officialCode !== null
    || !isBoundedText(value.labelSnapshot, 256)
    || (hasOwn(value, "level") && !isBoundedText(value.level, 64))
    || (hasOwn(value, "parentContext") && !isParentContext(value.parentContext))
    || (hasOwn(value, "provenance") && !isProvenance(value.provenance))
    || (state === "unverified_custom" && !isProvenance(value.provenance))
  ) return false;
  if (hasOwn(value, "parentContext")
    && new TextEncoder().encode(JSON.stringify(value.parentContext)).byteLength > 2_048
  ) return false;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16_384;
}

function isStrictObservationReference(value: JsonRecord): boolean {
  if (!hasOnlyKeys(value, [
    "schemaVersion", "verificationState", "canonicalNodeId", "officialCode",
    "labelSnapshot", "level", "parentContext", "provenance", "evidence"
  ])
    || value.verificationState !== "unverified_observation"
    || value.canonicalNodeId !== null
    || value.officialCode !== null
    || !isProvenance(value.provenance)
    || (hasOwn(value, "labelSnapshot") && !isBoundedText(value.labelSnapshot, 256))
    || (hasOwn(value, "level") && !isBoundedText(value.level, 64))
    || (hasOwn(value, "parentContext") && !isParentContext(value.parentContext))
    || (hasOwn(value, "evidence") && !isObservationEvidence(value.evidence))
  ) return false;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16_384;
}

function requireTrustedCanonical(value: unknown): JsonRecord {
  if (!isRecord(value)
    || value.schemaVersion !== "voiceup.location-reference/v1"
    || value.verificationState !== "canonical_verified"
    || typeof value.canonicalNodeId !== "string"
    || typeof value.authority !== "string"
    || typeof value.sourceDataset !== "string"
    || typeof value.datasetVersion !== "string"
    || !Array.isArray(value.parents)
    || !Array.isArray(value.lineageSnapshot)
  ) {
    throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
  }
  return value;
}

export async function prepareWorkspaceLocationReference(
  value: unknown,
  validators: WorkspaceLocationReferenceValidators,
  options: { allowObservation?: boolean } = {}
): Promise<JsonRecord | null> {
  if (value === null) return null;
  if (!isRecord(value) || value.schemaVersion !== "voiceup.location-reference/v1") {
    throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
  }
  if (value.verificationState === "canonical_verified") {
    return requireTrustedCanonical(await validators.validateCanonical(value));
  }
  if (value.verificationState === "unverified_observation") {
    if (!options.allowObservation
      || !isStrictObservationReference(value)
      || !(await validators.validateShape(value))) {
      throw new WorkspaceLocationReferenceError(
        options.allowObservation
          ? "invalid_workspace_location_reference"
          : "unsupported_workspace_location_observation"
      );
    }
    return value;
  }
  if (value.verificationState !== "unverified_custom" && value.verificationState !== "legacy_unresolved") {
    throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
  }
  if (!isStrictUnverifiedReference(value) || !(await validators.validateShape(value))) {
    throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
  }
  return value;
}

export function workspaceLocationVerificationState(
  owner: unknown,
  field = "locationReference"
): WorkspaceLocationVerificationState {
  if (!isRecord(owner) || !hasOwn(owner, field) || owner[field] === null) return "legacy_unresolved";
  const state = isRecord(owner[field]) ? owner[field].verificationState : undefined;
  return state === "canonical_verified"
    || state === "unverified_custom"
    || state === "legacy_unresolved"
    || state === "unverified_observation"
    ? state
    : "legacy_unresolved";
}

export function projectTrustedReferenceToLegacyLabels(reference: JsonRecord): {
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  selected: string;
} {
  const labels = { country: "", state: "", district: "", block: "", panchayat: "", selected: "" };
  const lineage = Array.isArray(reference.lineageSnapshot)
    ? reference.lineageSnapshot.filter(isRecord)
    : [];
  const nodes = [...lineage, reference];
  for (const node of nodes) {
    const label = typeof node.labelSnapshot === "string" ? node.labelSnapshot : "";
    const level = String(node.level ?? "");
    const entityKind = String(node.entityKind ?? "");
    if (level === "country") labels.country = label;
    if (level === "state") labels.state = label;
    if (level === "district") labels.district = label;
    if (level === "block" || urbanLocalBodyKinds.has(entityKind)) labels.block = label;
    if (entityKind === "gram_panchayat" || level === "ward") labels.panchayat = label;
  }
  labels.selected = typeof reference.labelSnapshot === "string" ? reference.labelSnapshot : "";
  return labels;
}

async function prepareOwner(
  owner: JsonRecord,
  validators: WorkspaceLocationReferenceValidators,
  projection: "campaign" | "organization"
): Promise<JsonRecord> {
  if (!hasOwn(owner, "locationReference")) return owner;
  const locationReference = await prepareWorkspaceLocationReference(
    owner.locationReference,
    validators,
    { allowObservation: projection === "campaign" }
  );
  const prepared = { ...owner, locationReference };
  if (!locationReference || locationReference.verificationState !== "canonical_verified") return prepared;
  const labels = projectTrustedReferenceToLegacyLabels(locationReference);
  if (projection === "campaign") {
    return {
      ...prepared,
      country: labels.country,
      state: labels.state,
      district: labels.district,
      block: labels.block,
      panchayat: labels.panchayat,
      location: labels.selected
    };
  }
  return {
    ...prepared,
    state: labels.state,
    district: labels.district,
    block: labels.block,
    panchayat: labels.panchayat
  };
}

/** Validates only explicit references; absent fields retain legacy semantics. */
export async function prepareWorkspaceLocationReferences(
  stateValue: unknown,
  validators: WorkspaceLocationReferenceValidators
): Promise<JsonRecord> {
  if (!isRecord(stateValue)) {
    throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
  }
  const state = { ...stateValue };
  let referenceCount = 0;

  if (Array.isArray(state.campaigns)) {
    referenceCount += state.campaigns.filter((campaign) =>
      isRecord(campaign) && hasOwn(campaign, "locationReference")
    ).length;
    if (referenceCount > MAX_WORKSPACE_LOCATION_REFERENCES) {
      throw new WorkspaceLocationReferenceError("workspace_location_reference_limit");
    }
    state.campaigns = await Promise.all(state.campaigns.map(async (campaign) => {
      if (!isRecord(campaign)) return campaign;
      return prepareOwner(campaign, validators, "campaign");
    }));
  }

  if (isRecord(state.organization)) {
    const organization = { ...state.organization };
    if (isRecord(organization.locationGovernance)) {
      if (hasOwn(organization.locationGovernance, "locationReference")) referenceCount += 1;
      if (referenceCount > MAX_WORKSPACE_LOCATION_REFERENCES) {
        throw new WorkspaceLocationReferenceError("workspace_location_reference_limit");
      }
      organization.locationGovernance = await prepareOwner(
        organization.locationGovernance,
        validators,
        "organization"
      );
    }
    state.organization = organization;
  }

  const prepareArray = async (
    value: unknown,
    fields: readonly string[],
    allowObservation = false
  ): Promise<unknown> => {
    if (!Array.isArray(value)) return value;
    return Promise.all(value.map(async (item) => {
      if (!isRecord(item)) return item;
      let prepared = { ...item };
      for (const field of fields) {
        if (!hasOwn(prepared, field)) continue;
        referenceCount += 1;
        if (referenceCount > MAX_WORKSPACE_LOCATION_REFERENCES) {
          throw new WorkspaceLocationReferenceError("workspace_location_reference_limit");
        }
        prepared[field] = await prepareWorkspaceLocationReference(
          prepared[field], validators, { allowObservation }
        );
        if (isRecord(prepared[field]) && prepared[field].verificationState === "canonical_verified") {
          const labels = projectTrustedReferenceToLegacyLabels(prepared[field]);
          if (field === "locationReference") {
            prepared = {
              ...prepared,
              country: labels.country,
              state: labels.state,
              district: labels.district,
              block: labels.block,
              panchayat: labels.panchayat,
              [field]: prepared[field]
            };
          }
          if (field === "jurisdictionLocationReference") {
            prepared = {
              ...prepared,
              state: labels.state,
              district: labels.district,
              block: labels.block,
              panchayat: labels.panchayat,
              [field]: prepared[field]
            };
          }
        }
      }
      if (isRecord(prepared.parsedSigner) && hasOwn(prepared.parsedSigner, "locationReference")) {
        referenceCount += 1;
        if (referenceCount > MAX_WORKSPACE_LOCATION_REFERENCES) {
          throw new WorkspaceLocationReferenceError("workspace_location_reference_limit");
        }
        const parsedSignerReference = await prepareWorkspaceLocationReference(
          prepared.parsedSigner.locationReference, validators, { allowObservation }
        );
        const parsedSignerLabels = isRecord(parsedSignerReference)
          && parsedSignerReference.verificationState === "canonical_verified"
          ? projectTrustedReferenceToLegacyLabels(parsedSignerReference)
          : null;
        prepared.parsedSigner = {
          ...prepared.parsedSigner,
          ...(parsedSignerLabels ? {
            country: parsedSignerLabels.country,
            state: parsedSignerLabels.state,
            district: parsedSignerLabels.district,
            block: parsedSignerLabels.block,
            panchayat: parsedSignerLabels.panchayat
          } : {}),
          locationReference: parsedSignerReference
        };
      }
      if (isRecord(prepared.coordinatorApplication)
        && hasOwn(prepared.coordinatorApplication, "requestedLocationReference")) {
        referenceCount += 1;
        if (referenceCount > MAX_WORKSPACE_LOCATION_REFERENCES) {
          throw new WorkspaceLocationReferenceError("workspace_location_reference_limit");
        }
        const requestedReference = await prepareWorkspaceLocationReference(
          prepared.coordinatorApplication.requestedLocationReference, validators, { allowObservation }
        );
        const requestedLabels = isRecord(requestedReference)
          && requestedReference.verificationState === "canonical_verified"
          ? projectTrustedReferenceToLegacyLabels(requestedReference)
          : null;
        prepared.coordinatorApplication = {
          ...prepared.coordinatorApplication,
          ...(requestedLabels && isRecord(prepared.coordinatorApplication.requestedGeography)
            ? { requestedGeography: {
                ...prepared.coordinatorApplication.requestedGeography,
                country: requestedLabels.country,
                state: requestedLabels.state,
                district: requestedLabels.district,
                block: requestedLabels.block,
                panchayat: requestedLabels.panchayat
              } }
            : {}),
          requestedLocationReference: requestedReference
        };
      }
      return prepared;
    }));
  };

  state.signers = await prepareArray(state.signers, ["locationReference"], true);
  state.scanItems = await prepareArray(state.scanItems, ["locationReference"], true);
  state.authorities = await prepareArray(state.authorities, ["jurisdictionLocationReference"]);

  if (isRecord(state.locationOverrideReferences)) {
    const entries = Object.entries(state.locationOverrideReferences);
    referenceCount += entries.length;
    if (referenceCount > MAX_WORKSPACE_LOCATION_REFERENCES) {
      throw new WorkspaceLocationReferenceError("workspace_location_reference_limit");
    }
    state.locationOverrideReferences = Object.fromEntries(await Promise.all(entries.map(async ([key, value]) => {
      if (!key || key.length > 720) {
        throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
      }
      return [key, await prepareWorkspaceLocationReference(value, validators)] as const;
    })));
  }

  return state;
}
