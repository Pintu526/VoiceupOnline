import {
  PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
  parsePersistedLocationReference,
  type PersistedCanonicalLocationReference,
  type PersistedLocationObservationEvidence,
  type PersistedLocationParentContext,
  type PersistedLocationReference
} from "./PersistedLocationReference.ts";

export interface LegacyLocationLabels {
  country?: string;
  state?: string;
  district?: string;
  block?: string;
  panchayat?: string;
  village?: string;
  ward?: string;
  postalCode?: string;
}

export interface LocationReferenceDisplay {
  label: string;
  groupingKey: string;
  verificationState: PersistedLocationReference["verificationState"] | "legacy_unresolved";
  canonicalNodeId: string | null;
}

const orderedLegacyFields: ReadonlyArray<keyof LegacyLocationLabels> = [
  "country", "state", "district", "block", "panchayat", "village", "ward"
];

function clean(value: unknown, maxLength = 256): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, maxLength) : "";
}

function parentContext(labels: LegacyLocationLabels, selectedField?: keyof LegacyLocationLabels): PersistedLocationParentContext[] {
  const stopAt = selectedField ? orderedLegacyFields.indexOf(selectedField) : orderedLegacyFields.length;
  return orderedLegacyFields
    .slice(0, stopAt < 0 ? orderedLegacyFields.length : stopAt)
    .flatMap((field) => {
      const labelSnapshot = clean(labels[field]);
      return labelSnapshot ? [{ labelSnapshot, level: field }] : [];
    })
    .slice(-8);
}

export function deepestLegacyLocation(labels: LegacyLocationLabels): {
  field: keyof LegacyLocationLabels;
  label: string;
} | null {
  for (const field of [...orderedLegacyFields].reverse()) {
    const label = clean(labels[field]);
    if (label) return { field, label };
  }
  return null;
}

export function legacyLocationPathKey(labels: LegacyLocationLabels): string {
  return orderedLegacyFields
    .map((field) => clean(labels[field]).toLocaleLowerCase("en-IN"))
    .filter(Boolean)
    .join("|");
}

export function createUnverifiedLocationReference(
  labels: LegacyLocationLabels,
  source: string,
  options: {
    state?: "unverified_custom" | "legacy_unresolved";
    actorId?: string;
    sourceRecordId?: string;
    now?: Date;
  } = {}
): PersistedLocationReference | null {
  const selected = deepestLegacyLocation(labels);
  if (!selected) return null;
  const context = parentContext(labels, selected.field);
  return parsePersistedLocationReference({
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: options.state ?? "unverified_custom",
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: selected.label,
    level: selected.field,
    ...(context.length ? { parentContext: context } : {}),
    provenance: {
      source: clean(source) || "manual",
      ...(clean(options.actorId) ? { actorId: clean(options.actorId) } : {}),
      ...(clean(options.sourceRecordId) ? { sourceRecordId: clean(options.sourceRecordId) } : {}),
      recordedAt: (options.now ?? new Date()).toISOString()
    }
  });
}

export function createObservedLocationReference(
  labels: LegacyLocationLabels,
  source: string,
  evidence: readonly PersistedLocationObservationEvidence[],
  options: { actorId?: string; sourceRecordId?: string; now?: Date } = {}
): PersistedLocationReference {
  const selected = deepestLegacyLocation(labels);
  const context = selected ? parentContext(labels, selected.field) : [];
  return parsePersistedLocationReference({
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "unverified_observation",
    canonicalNodeId: null,
    officialCode: null,
    ...(selected ? { labelSnapshot: selected.label, level: selected.field } : {}),
    ...(context.length ? { parentContext: context } : {}),
    provenance: {
      source: clean(source) || "observation",
      ...(clean(options.actorId) ? { actorId: clean(options.actorId) } : {}),
      ...(clean(options.sourceRecordId) ? { sourceRecordId: clean(options.sourceRecordId) } : {}),
      recordedAt: (options.now ?? new Date()).toISOString()
    },
    evidence: evidence.slice(0, 8).map((item) => ({
      kind: item.kind,
      valueSnapshot: clean(item.valueSnapshot, 512),
      ...(typeof item.confidence === "number" ? { confidence: item.confidence } : {})
    }))
  });
}

function canonicalNodes(reference: PersistedCanonicalLocationReference) {
  return [...reference.lineageSnapshot, reference];
}

export function canonicalSnapshotForLevel(
  reference: PersistedLocationReference | null | undefined,
  level: string
) {
  if (reference?.verificationState !== "canonical_verified") return undefined;
  return canonicalNodes(reference).find((node) => node.level === level);
}

export function canonicalContainsNode(
  reference: PersistedLocationReference | null | undefined,
  canonicalNodeId: string
): boolean {
  return reference?.verificationState === "canonical_verified"
    && canonicalNodes(reference).some((node) => node.canonicalNodeId === canonicalNodeId);
}

export function locationReferenceDisplay(
  reference: PersistedLocationReference | null | undefined,
  legacy: LegacyLocationLabels,
  preferredLevel?: string
): LocationReferenceDisplay {
  if (reference?.verificationState === "canonical_verified") {
    const node = preferredLevel
      ? canonicalSnapshotForLevel(reference, preferredLevel) ?? reference
      : reference;
    return {
      label: node.labelSnapshot,
      groupingKey: `canonical:${reference.authority}:${reference.sourceDataset}:${reference.datasetVersion}:${node.canonicalNodeId}`,
      verificationState: reference.verificationState,
      canonicalNodeId: node.canonicalNodeId
    };
  }
  if (reference) {
    return {
      label: reference.labelSnapshot ?? deepestLegacyLocation(legacy)?.label ?? "",
      groupingKey: `unverified:${reference.verificationState}:${clean(reference.labelSnapshot).toLocaleLowerCase("en-IN")}`,
      verificationState: reference.verificationState,
      canonicalNodeId: null
    };
  }
  const selected = preferredLevel
    ? clean(legacy[preferredLevel as keyof LegacyLocationLabels])
    : deepestLegacyLocation(legacy)?.label ?? "";
  return {
    label: selected,
    groupingKey: `legacy:${clean(selected).toLocaleLowerCase("en-IN")}`,
    verificationState: "legacy_unresolved",
    canonicalNodeId: null
  };
}

export function canonicalFirstLocationLabel(
  owner: LegacyLocationLabels & { locationReference?: PersistedLocationReference | null }
): string {
  if (owner.locationReference?.verificationState === "canonical_verified") {
    return canonicalNodes(owner.locationReference)
      .filter((node) => node.level !== "country")
      .map((node) => node.labelSnapshot)
      .join(", ");
  }
  return orderedLegacyFields.map((field) => clean(owner[field])).filter(Boolean).join(", ");
}

export function canonicalScopeMatches(
  scope: PersistedLocationReference | null | undefined,
  candidate: PersistedLocationReference | null | undefined
): boolean | undefined {
  if (scope?.verificationState !== "canonical_verified" || candidate?.verificationState !== "canonical_verified") {
    return undefined;
  }
  if (
    scope.authority !== candidate.authority
    || scope.sourceDataset !== candidate.sourceDataset
    || scope.datasetVersion !== candidate.datasetVersion
  ) return false;
  return canonicalContainsNode(candidate, scope.canonicalNodeId);
}
