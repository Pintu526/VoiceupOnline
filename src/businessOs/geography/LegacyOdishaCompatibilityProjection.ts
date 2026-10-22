import type { GeographyDataset, GeographyNode } from "./types.ts";

/**
 * Creates a legacy GeographyService-compatible view of the canonical Odisha
 * LGD dataset. This is not canonical data and must never be supplied to the
 * canonical Geography Engine or used as a source of official relationships.
 */
export function createLegacyOdishaCompatibilityProjection(
  canonicalDataset: GeographyDataset
): GeographyDataset {
  const nodesById = new Map(canonicalDataset.nodes.map((node) => [node.id, node]));
  const projectedNodes = canonicalDataset.nodes.flatMap((node): GeographyNode[] => {
    if (node.kind === "zilla_parishad" || node.kind === "panchayat_samiti") {
      return [];
    }

    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
    if (node.level === "village" && parent?.level === "district") {
      return [];
    }

    if (node.kind === "nagar_panchayat") {
      return [{
        ...node,
        kind: "town_panchayat",
        metadata: {
          ...node.metadata,
          legacyCompatibilityProjection: "nagar_panchayat_as_town_panchayat"
        }
      }];
    }

    return [node];
  });

  const countsByLevel = new Map<string, number>();
  for (const node of projectedNodes) {
    countsByLevel.set(node.level, (countsByLevel.get(node.level) ?? 0) + 1);
  }

  return {
    ...canonicalDataset,
    datasetVersion: `${canonicalDataset.datasetVersion}+legacy-compat-v1`,
    coverage: canonicalDataset.coverage.map((coverage) => {
      const recordCount = countsByLevel.get(coverage.level) ?? 0;
      const isComplete = recordCount === coverage.recordCount;
      return {
        ...coverage,
        recordCount,
        status: isComplete ? coverage.status : "partial",
        note: isComplete
          ? coverage.note
          : "Legacy compatibility projection only; unsupported canonical nodes are intentionally omitted."
      };
    }),
    nodes: projectedNodes
  };
}
