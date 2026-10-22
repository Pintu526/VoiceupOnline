import type {
  CanonicalLocationNode,
  LocationEntityKind,
  LocationLevel,
  LocationParentReference,
  LocationSource
} from "./LocationApiTypes.ts";

/** Immutable identity and provenance for a repository-selected dataset. */
export interface CanonicalLocationDatasetMetadata {
  datasetId: string;
  authority: string;
  sourceDataset: string;
  datasetVersion: string;
  effectiveDate: string;
  checksum: string;
  status: "staged" | "validated" | "active" | "superseded" | "retired" | "failed";
  source: LocationSource;
}

/** Production selection: exactly one active release for the supplied scope. */
export interface ActiveDatasetSelection {
  mode: "active_release";
  scopeKey: string;
}

/**
 * Deliberate non-production selection for controlled verification of a staged
 * import. It cannot be created implicitly by the repository.
 */
export interface StagedDatasetSelection {
  mode: "staged_dataset";
  datasetId: string;
  datasetVersion: string;
}

export type CanonicalLocationDatasetSelection =
  | ActiveDatasetSelection
  | StagedDatasetSelection;

export interface CanonicalLocationSearch {
  nodeId?: string;
  officialCode?: string;
  normalizedName?: string;
  expectedLevel?: LocationLevel;
  entityKinds?: readonly LocationEntityKind[];
  parentNodeId?: string;
  sourceDataset?: string;
  datasetVersion?: string;
  limit?: number;
}

/**
 * Read-only store boundary for canonical geography. Implementations must keep
 * every lookup scoped to their explicitly selected immutable dataset.
 */
export interface CanonicalLocationRepository {
  metadata(): Promise<CanonicalLocationDatasetMetadata | null>;
  getNode(nodeId: string): Promise<CanonicalLocationNode | null>;
  getByOfficialCode(officialCode: string, limit?: number): Promise<readonly CanonicalLocationNode[]>;
  getChildren(nodeId: string, limit?: number): Promise<readonly CanonicalLocationNode[]>;
  getParents(nodeId: string): Promise<readonly LocationParentReference[]>;
  getLineage(nodeId: string): Promise<readonly CanonicalLocationNode[]>;
  findResolutionCandidates(search: CanonicalLocationSearch): Promise<readonly CanonicalLocationNode[]>;
  hasOfficialRelationship(childNodeId: string, parentNodeId: string): Promise<boolean>;
  isDescendantOf(nodeId: string, ancestorNodeId: string): Promise<boolean>;
}
