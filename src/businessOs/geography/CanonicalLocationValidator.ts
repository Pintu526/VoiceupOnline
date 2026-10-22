import type {
  CanonicalLocationNode,
  LocationLineageEntry,
  LocationValidationChecks,
  LocationValidationIssue,
  LocationValidationRequest,
  LocationValidationResult
} from "./LocationApiTypes.ts";
import type { CanonicalGeographyEngine } from "./CanonicalGeographyEngine.ts";

function hasMatchingLineage(
  actual: readonly LocationLineageEntry[],
  supplied: readonly LocationLineageEntry[]
): boolean {
  return actual.length === supplied.length && actual.every((entry, index) => {
    const candidate = supplied[index];
    return candidate?.nodeId === entry.nodeId
      && candidate.officialCode === entry.officialCode
      && candidate.level === entry.level;
  });
}

function invalidResult(
  checks: LocationValidationChecks,
  issues: readonly LocationValidationIssue[]
): LocationValidationResult {
  return { status: "invalid", checks, issues };
}

/**
 * Validates references against one canonical engine. It never repairs a
 * reference, infers ancestry, or accepts a missing direct relationship.
 */
export class CanonicalLocationValidator {
  private readonly engine: CanonicalGeographyEngine;

  constructor(engine: CanonicalGeographyEngine) {
    this.engine = engine;
  }

  validate(request: LocationValidationRequest): LocationValidationResult {
    const node = this.engine.getNode(request.reference.nodeId);
    if (!node) {
      return invalidResult(
        {
          nodeExists: false,
          levelMatches: false,
          officialCodeMatches: false,
          parentageMatches: false,
          lineageMatches: false,
          datasetVersionMatches: false,
          sourceDatasetMatches: false
        },
        [{ code: "not_found", reason: "The canonical nodeId is not in this dataset." }]
      );
    }

    const checks = this.check(node, request);
    const issues: LocationValidationIssue[] = [];
    if (!checks.levelMatches) issues.push({ code: "level_mismatch", reason: "The reference or expected level does not match the canonical node." });
    if (!checks.officialCodeMatches) issues.push({ code: "official_code_mismatch", reason: "The reference or expected official code does not match the canonical node." });
    if (!checks.parentageMatches) issues.push({ code: "parent_mismatch", reason: "A required immediate parent is not an explicit canonical parent." });
    if (!checks.lineageMatches) issues.push({ code: "lineage_mismatch", reason: "The supplied or required lineage does not match the canonical node." });
    if (!checks.datasetVersionMatches) issues.push({ code: "dataset_mismatch", reason: "The reference or requested dataset version does not match." });
    if (!checks.sourceDatasetMatches) issues.push({ code: "source_mismatch", reason: "The reference or requested source dataset does not match." });

    return issues.length === 0
      ? { status: "valid", node, checks }
      : invalidResult(checks, issues);
  }

  private check(
    node: CanonicalLocationNode,
    request: LocationValidationRequest
  ): LocationValidationChecks {
    const reference = request.reference;
    const levelMatches = node.level === reference.level
      && (!request.expectedLevel || node.level === request.expectedLevel);
    const officialCodeMatches = node.officialCode === reference.officialCode
      && (!request.expectedOfficialCode || node.officialCode === request.expectedOfficialCode);
    const parentageMatches = (request.requiredParentNodeIds ?? []).every((parentNodeId) =>
      this.engine.hasOfficialParentRelationship(node.nodeId, parentNodeId)
    );
    const lineageMatches = hasMatchingLineage(node.lineage, reference.lineage)
      && (request.requiredAncestorNodeIds ?? []).every((ancestorNodeId) =>
        node.lineage.some((entry) => entry.nodeId === ancestorNodeId)
      );
    const datasetVersionMatches = node.datasetVersion === reference.datasetVersion
      && (!request.datasetVersion || node.datasetVersion === request.datasetVersion);
    const sourceDatasetMatches = node.source.sourceDataset === reference.source.sourceDataset
      && node.source.sourceDatasetVersion === reference.source.sourceDatasetVersion
      && node.source.authority === reference.source.authority
      && (!request.expectedSourceDataset || node.source.sourceDataset === request.expectedSourceDataset);

    return {
      nodeExists: true,
      levelMatches,
      officialCodeMatches,
      parentageMatches,
      lineageMatches,
      datasetVersionMatches,
      sourceDatasetMatches
    };
  }
}
