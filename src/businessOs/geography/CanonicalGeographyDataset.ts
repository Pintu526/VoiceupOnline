import { odishaLgdDataset } from "./OdishaLgdGenerated.ts";
import type { GeographyDataset, GeographyNode } from "./types.ts";
import type {
  CanonicalLocationNode,
  LocationLineageEntry,
  LocationParentReference,
  LocationSource
} from "./LocationApiTypes.ts";

/** A versioned canonical dataset consumed by the standalone Geography Engine. */
export interface CanonicalGeographyDataset {
  datasetVersion: string;
  source: LocationSource;
  nodes: readonly CanonicalLocationNode[];
}

function sourceFor(dataset: GeographyDataset, node: GeographyNode): LocationSource {
  return {
    authority: dataset.source.publisher,
    sourceDataset: dataset.source.id,
    sourceDatasetVersion: dataset.datasetVersion,
    provenance: dataset.source.authoritative ? "derived_official" : "official",
    retrievedAt: dataset.generatedAt,
    sourceRecordId: node.code,
    sourceUrl: dataset.source.downloadPage ?? dataset.source.homepage
  };
}

function lineageFor(
  node: GeographyNode,
  nodesById: ReadonlyMap<string, GeographyNode>
): readonly LocationLineageEntry[] {
  return node.ancestorIds.flatMap((ancestorId) => {
    const ancestor = nodesById.get(ancestorId);
    return ancestor
      ? [{ nodeId: ancestor.id, officialCode: ancestor.code ?? null, level: ancestor.level }]
      : [];
  });
}

function parentReferencesFor(
  node: GeographyNode,
  nodesById: ReadonlyMap<string, GeographyNode>,
  source: LocationSource
): readonly LocationParentReference[] {
  if (!node.parentId) return [];

  const parent = nodesById.get(node.parentId);
  if (!parent) return [];

  return [{
    nodeId: parent.id,
    officialCode: parent.code ?? null,
    level: parent.level,
    relationship:
      node.metadata?.blockRelationshipStatus === "district_containment"
        ? "official_containment"
        : "administrative_parent",
    source: {
      authority: source.authority,
      sourceDataset: source.sourceDataset,
      sourceDatasetVersion: source.sourceDatasetVersion
    }
  }];
}

/**
 * Adapts an existing official GeographyDataset without altering it or adding
 * relationships. Missing or parentless source relationships remain absent.
 */
export function createCanonicalGeographyDataset(
  dataset: GeographyDataset
): CanonicalGeographyDataset {
  const nodesById = new Map(dataset.nodes.map((node) => [node.id, node]));
  const source = sourceFor(dataset, dataset.nodes[0] ?? {
    id: "",
    countryCode: dataset.countryCode,
    ancestorIds: [],
    level: "country",
    kind: "country",
    name: "",
    active: true
  });

  return {
    datasetVersion: dataset.datasetVersion,
    source,
    nodes: dataset.nodes.map((node) => {
      const nodeSource = sourceFor(dataset, node);
      return {
        nodeId: node.id,
        officialCode: node.code ?? null,
        level: node.level,
        entityKind: node.kind,
        displayName: node.name,
        datasetVersion: dataset.datasetVersion,
        source: nodeSource,
        parents: parentReferencesFor(node, nodesById, nodeSource),
        lineage: lineageFor(node, nodesById)
      };
    })
  };
}

/** The repaired, official Odisha LGD dataset exposed through the v1 model. */
export const odishaCanonicalGeographyDataset = createCanonicalGeographyDataset(odishaLgdDataset);
