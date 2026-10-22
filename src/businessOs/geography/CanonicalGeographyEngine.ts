import type {
  CanonicalLocationNode,
  LocationEntityKind,
  LocationLevel,
  LocationParentReference,
  LocationSource
} from "./LocationApiTypes.ts";
import type { CanonicalGeographyDataset } from "./CanonicalGeographyDataset.ts";

export interface CanonicalLocationFilter {
  officialCode?: string;
  levels?: readonly LocationLevel[];
  entityKinds?: readonly LocationEntityKind[];
  parentNodeId?: string;
  ancestorNodeId?: string;
  text?: string;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Read-only canonical geography index. It exposes only nodes and relationships
 * explicitly represented by the supplied dataset; it never synthesizes nodes,
 * names, parentage, or lineage.
 */
export class CanonicalGeographyEngine {
  readonly datasetVersion: string;
  readonly source: LocationSource;

  private readonly nodes: readonly CanonicalLocationNode[];
  private readonly nodesById: ReadonlyMap<string, CanonicalLocationNode>;
  private readonly nodesByOfficialCode: ReadonlyMap<string, readonly CanonicalLocationNode[]>;
  private readonly childrenByParentId: ReadonlyMap<string, readonly CanonicalLocationNode[]>;

  constructor(dataset: CanonicalGeographyDataset) {
    this.datasetVersion = dataset.datasetVersion;
    this.source = dataset.source;
    this.nodes = dataset.nodes;
    this.nodesById = new Map(dataset.nodes.map((node) => [node.nodeId, node]));

    const byCode = new Map<string, CanonicalLocationNode[]>();
    const byParent = new Map<string, CanonicalLocationNode[]>();
    for (const node of dataset.nodes) {
      if (node.officialCode) {
        const matches = byCode.get(node.officialCode) ?? [];
        matches.push(node);
        byCode.set(node.officialCode, matches);
      }
      for (const parent of node.parents) {
        const children = byParent.get(parent.nodeId) ?? [];
        children.push(node);
        byParent.set(parent.nodeId, children);
      }
    }
    this.nodesByOfficialCode = byCode;
    this.childrenByParentId = byParent;
  }

  getNode(nodeId: string): CanonicalLocationNode | undefined {
    return this.nodesById.get(nodeId);
  }

  /** Returns all code matches; callers must not assume codes are globally unique. */
  getNodesByOfficialCode(officialCode: string): readonly CanonicalLocationNode[] {
    return this.nodesByOfficialCode.get(officialCode) ?? [];
  }

  getNodesByLevel(level: LocationLevel): readonly CanonicalLocationNode[] {
    return this.nodes.filter((node) => node.level === level);
  }

  getNodesByEntityKind(entityKind: LocationEntityKind): readonly CanonicalLocationNode[] {
    return this.nodes.filter((node) => node.entityKind === entityKind);
  }

  getChildren(nodeId: string): readonly CanonicalLocationNode[] {
    return this.childrenByParentId.get(nodeId) ?? [];
  }

  getImmediateParentReferences(nodeId: string): readonly LocationParentReference[] {
    return this.getNode(nodeId)?.parents ?? [];
  }

  /** Returns the source-recorded lineage, from country through immediate parent. */
  getLineage(nodeId: string): readonly CanonicalLocationNode[] {
    const node = this.getNode(nodeId);
    if (!node) return [];
    return node.lineage.flatMap((entry) => {
      const ancestor = this.getNode(entry.nodeId);
      return ancestor ? [ancestor] : [];
    });
  }

  search(filter: CanonicalLocationFilter = {}): readonly CanonicalLocationNode[] {
    const text = filter.text ? normalizeSearchText(filter.text) : "";
    return this.nodes.filter((node) => {
      if (filter.officialCode && node.officialCode !== filter.officialCode) return false;
      if (filter.levels && !filter.levels.includes(node.level)) return false;
      if (filter.entityKinds && !filter.entityKinds.includes(node.entityKind)) return false;
      if (filter.parentNodeId && !node.parents.some((parent) => parent.nodeId === filter.parentNodeId)) return false;
      if (filter.ancestorNodeId && !node.lineage.some((entry) => entry.nodeId === filter.ancestorNodeId)) return false;
      if (!text) return true;
      return normalizeSearchText(node.displayName).includes(text) || node.officialCode?.toLocaleLowerCase().includes(text);
    });
  }

  isDescendantOf(nodeId: string, ancestorNodeId: string): boolean {
    const node = this.getNode(nodeId);
    return Boolean(node?.lineage.some((entry) => entry.nodeId === ancestorNodeId));
  }

  /** Checks a direct, source-represented parent relationship only. */
  hasOfficialParentRelationship(childNodeId: string, parentNodeId: string): boolean {
    return this.getImmediateParentReferences(childNodeId).some(
      (parent) => parent.nodeId === parentNodeId
    );
  }
}
