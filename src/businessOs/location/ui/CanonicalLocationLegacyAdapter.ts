import type { CanonicalLocationSelection } from "./CanonicalLocationUiModel.ts";
import {
  PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
  type PersistedCanonicalLocationReference,
  type PersistedCustomLocationReference,
  type PersistedLocationParentContext
} from "../persistence/PersistedLocationReference.ts";

export interface LegacyLocationGovernanceLabels {
  state: string;
  district: string;
  block: string;
  panchayat: string;
}

export interface CanonicalLocationLegacyState {
  canonicalSelection: readonly CanonicalLocationSelection[];
  legacyLabels: LegacyLocationGovernanceLabels;
}

export type LegacyLocationGovernanceField = keyof LegacyLocationGovernanceLabels;

const governanceFieldLevel: Record<LegacyLocationGovernanceField, string> = {
  state: "state",
  district: "district",
  block: "block",
  panchayat: "panchayat"
};

export const EMPTY_LEGACY_LOCATION_GOVERNANCE: LegacyLocationGovernanceLabels = Object.freeze({
  state: "",
  district: "",
  block: "",
  panchayat: ""
});

const urbanLocalBodyKinds = new Set([
  "municipality",
  "municipal_corporation",
  "nagar_panchayat",
  "notified_area_council",
  "town_panchayat",
  "other_local_body"
]);

/**
 * Temporary names-only compatibility projection for the existing Organization
 * contract. Canonical identity remains in UI state; this function derives only
 * the exact official display labels representable by the legacy fields.
 */
export function projectCanonicalSelectionToLegacyLocation(
  selection: readonly CanonicalLocationSelection[]
): CanonicalLocationLegacyState {
  const labels: LegacyLocationGovernanceLabels = { ...EMPTY_LEGACY_LOCATION_GOVERNANCE };

  for (const node of selection) {
    if (node.level === "state") labels.state = node.label;
    if (node.level === "district") labels.district = node.label;
    if (node.level === "block" || urbanLocalBodyKinds.has(node.entityKind)) labels.block = node.label;
    if (node.entityKind === "gram_panchayat" || node.level === "ward") labels.panchayat = node.label;
  }

  return {
    canonicalSelection: selection.map((node) => ({
      ...node,
      parents: node.parents.map((parent) => ({ ...parent, source: { ...parent.source } })),
      lineage: node.lineage.map((ancestor) => ({ ...ancestor }))
    })),
    legacyLabels: labels
  };
}

function requireSelectionNode(
  selectionById: ReadonlyMap<string, CanonicalLocationSelection>,
  nodeId: string
): CanonicalLocationSelection {
  const node = selectionById.get(nodeId);
  if (!node) throw new Error("The canonical selection is missing trusted ancestry. Reselect the location.");
  return node;
}

function toPersistenceSnapshot(node: CanonicalLocationSelection) {
  return {
    canonicalNodeId: node.canonicalNodeId,
    officialCode: node.officialCode,
    labelSnapshot: node.label,
    level: node.level,
    entityKind: node.entityKind
  };
}

/**
 * Builds a browser claim only. The workspace server must validate and rebuild
 * it from canonical data before persistence.
 */
export function createCanonicalLocationReferenceClaim(
  selection: readonly CanonicalLocationSelection[],
  now = new Date()
): PersistedCanonicalLocationReference {
  const selected = selection[selection.length - 1];
  if (!selected) throw new Error("A canonical location selection is required.");
  const selectionById = new Map(selection.map((node) => [node.canonicalNodeId, node]));
  const parents = selected.parents.map((parent) =>
    toPersistenceSnapshot(requireSelectionNode(selectionById, parent.nodeId))
  );
  const lineageSnapshot = selected.lineage.map((ancestor) =>
    toPersistenceSnapshot(requireSelectionNode(selectionById, ancestor.nodeId))
  );
  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "canonical_verified",
    canonicalNodeId: selected.canonicalNodeId,
    officialCode: selected.officialCode,
    labelSnapshot: selected.label,
    level: selected.level,
    entityKind: selected.entityKind,
    authority: selected.authority,
    sourceDataset: selected.sourceDataset,
    datasetVersion: selected.datasetVersion,
    parents,
    lineageSnapshot,
    validation: {
      validatedAt: now.toISOString(),
      validatorVersion: "browser-claim/v1"
    }
  };
}

export function createCustomLocationReference(
  values: LegacyLocationGovernanceLabels,
  field: LegacyLocationGovernanceField,
  label: string,
  now = new Date()
): PersistedCustomLocationReference {
  const fields: LegacyLocationGovernanceField[] = ["state", "district", "block", "panchayat"];
  const fieldIndex = fields.indexOf(field);
  const parentContext: PersistedLocationParentContext[] = fields
    .slice(0, fieldIndex)
    .filter((parentField) => Boolean(values[parentField].trim()))
    .map((parentField) => ({
      labelSnapshot: values[parentField].trim(),
      level: governanceFieldLevel[parentField]
    }));
  return {
    schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
    verificationState: "unverified_custom",
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: label.trim(),
    level: governanceFieldLevel[field],
    ...(parentContext.length ? { parentContext } : {}),
    provenance: {
      source: "workspace_manual",
      recordedAt: now.toISOString()
    }
  };
}

/**
 * Manual compatibility input is deliberately label-preserving and cannot
 * acquire canonical identity. Descendants are reset when an ancestor changes.
 */
export function updateUnverifiedLegacyLocation(
  current: LegacyLocationGovernanceLabels,
  field: LegacyLocationGovernanceField,
  label: string
): LegacyLocationGovernanceLabels {
  const next = { ...current, [field]: label };
  if (field === "state") return { ...next, district: "", block: "", panchayat: "" };
  if (field === "district") return { ...next, block: "", panchayat: "" };
  if (field === "block") return { ...next, panchayat: "" };
  return next;
}
