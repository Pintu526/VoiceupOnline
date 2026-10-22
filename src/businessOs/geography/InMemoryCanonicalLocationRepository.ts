import type {
  CanonicalLocationNode,
  LocationParentReference
} from "./LocationApiTypes.ts";
import type {
  CanonicalLocationDatasetMetadata,
  CanonicalLocationRepository,
  CanonicalLocationSearch
} from "./CanonicalLocationRepository.ts";
import type { CanonicalGeographyEngine } from "./CanonicalGeographyEngine.ts";

const maxCollectionLimit = 100;

function limit(value: number | undefined): number {
  if (!Number.isInteger(value) || !value || value < 1) return maxCollectionLimit;
  return Math.min(value, maxCollectionLimit);
}

/**
 * Deterministic local/test implementation. It intentionally remains separate
 * from the Postgres production path and therefore may use the in-memory engine.
 */
export class InMemoryCanonicalLocationRepository implements CanonicalLocationRepository {
  private readonly engine: CanonicalGeographyEngine;

  constructor(engine: CanonicalGeographyEngine) {
    this.engine = engine;
  }

  async metadata(): Promise<CanonicalLocationDatasetMetadata> {
    return {
      datasetId: `in-memory:${this.engine.source.sourceDataset}:${this.engine.datasetVersion}`,
      authority: this.engine.source.authority,
      sourceDataset: this.engine.source.sourceDataset,
      datasetVersion: this.engine.datasetVersion,
      effectiveDate: this.engine.source.sourceDatasetVersion,
      checksum: "in-memory",
      status: "active",
      source: this.engine.source
    };
  }

  async getNode(nodeId: string): Promise<CanonicalLocationNode | null> {
    return this.engine.getNode(nodeId) ?? null;
  }

  async getByOfficialCode(officialCode: string, requestedLimit?: number): Promise<readonly CanonicalLocationNode[]> {
    return this.engine.getNodesByOfficialCode(officialCode).slice(0, limit(requestedLimit));
  }

  async getChildren(nodeId: string, requestedLimit?: number): Promise<readonly CanonicalLocationNode[]> {
    return this.engine.getChildren(nodeId).slice(0, limit(requestedLimit));
  }

  async getParents(nodeId: string): Promise<readonly LocationParentReference[]> {
    return this.engine.getImmediateParentReferences(nodeId);
  }

  async getLineage(nodeId: string): Promise<readonly CanonicalLocationNode[]> {
    return this.engine.getLineage(nodeId);
  }

  async findResolutionCandidates(search: CanonicalLocationSearch): Promise<readonly CanonicalLocationNode[]> {
    if (search.datasetVersion && search.datasetVersion !== this.engine.datasetVersion) return [];
    if (search.sourceDataset && search.sourceDataset !== this.engine.source.sourceDataset) return [];
    const normalizedName = search.normalizedName?.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
    return this.engine.search({
      officialCode: search.officialCode,
      levels: search.expectedLevel ? [search.expectedLevel] : undefined,
      entityKinds: search.entityKinds,
      parentNodeId: search.parentNodeId
    }).filter((node) => {
      if (search.nodeId && node.nodeId !== search.nodeId) return false;
      return !normalizedName || node.displayName.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ") === normalizedName;
    }).slice(0, limit(search.limit));
  }

  async hasOfficialRelationship(childNodeId: string, parentNodeId: string): Promise<boolean> {
    return this.engine.hasOfficialParentRelationship(childNodeId, parentNodeId);
  }

  async isDescendantOf(nodeId: string, ancestorNodeId: string): Promise<boolean> {
    return this.engine.isDescendantOf(nodeId, ancestorNodeId);
  }
}
