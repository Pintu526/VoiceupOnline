import type {
  CanonicalLocationNode,
  LocationLineageEntry,
  LocationResolutionRequest,
  LocationResolutionResult,
  LocationValidationChecks,
  LocationValidationIssue,
  LocationValidationRequest,
  LocationValidationResult
} from "./LocationApiTypes.ts";
import type {
  CanonicalLocationDatasetMetadata,
  CanonicalLocationRepository
} from "./CanonicalLocationRepository.ts";
import { normalizeCanonicalLocationText } from "./CanonicalLocationText.ts";

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

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
 * Async resolver/validator service over a read-only repository. It preserves
 * the v1 resolution and validation semantics while avoiding an in-memory data
 * dependency in the Postgres-backed path.
 */
export class RepositoryLocationService {
  private readonly repository: CanonicalLocationRepository;

  constructor(repository: CanonicalLocationRepository) {
    this.repository = repository;
  }

  metadata(): Promise<CanonicalLocationDatasetMetadata | null> {
    return this.repository.metadata();
  }

  getNode(nodeId: string): Promise<CanonicalLocationNode | null> {
    return this.repository.getNode(nodeId);
  }

  getChildren(nodeId: string): Promise<readonly CanonicalLocationNode[]> {
    return this.repository.getChildren(nodeId);
  }

  getParents(nodeId: string) {
    return this.repository.getParents(nodeId);
  }

  getLineage(nodeId: string): Promise<readonly CanonicalLocationNode[]> {
    return this.repository.getLineage(nodeId);
  }

  hasOfficialRelationship(childNodeId: string, parentNodeId: string): Promise<boolean> {
    return this.repository.hasOfficialRelationship(childNodeId, parentNodeId);
  }

  isDescendantOf(nodeId: string, ancestorNodeId: string): Promise<boolean> {
    return this.repository.isDescendantOf(nodeId, ancestorNodeId);
  }

  async resolve(request: LocationResolutionRequest): Promise<LocationResolutionResult> {
    const hasNodeId = hasText(request.nodeId);
    const hasOfficialCode = hasText(request.officialCode);
    const hasName = hasText(request.normalizedName);
    if (!hasNodeId && !hasOfficialCode && !hasName) {
      return { status: "invalid", reason: "Provide a nodeId, officialCode, or normalizedName." };
    }

    const candidates = await this.repository.findResolutionCandidates({
      nodeId: hasNodeId ? request.nodeId!.trim() : undefined,
      officialCode: hasOfficialCode ? request.officialCode!.trim() : undefined,
      normalizedName: hasName ? normalizeCanonicalLocationText(request.normalizedName!) : undefined,
      expectedLevel: request.expectedLevel,
      parentNodeId: request.parentNodeId,
      datasetVersion: request.datasetVersion,
      sourceDataset: request.sourceDataset
    });

    if (candidates.length === 1) return { status: "resolved", node: candidates[0] };
    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        candidates,
        reason: "More than one canonical node satisfies the supplied constraints."
      };
    }
    return { status: "unresolved", reason: "No canonical node satisfies the supplied constraints." };
  }

  async validate(request: LocationValidationRequest): Promise<LocationValidationResult> {
    const node = await this.repository.getNode(request.reference.nodeId);
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

    const [parents, lineage] = await Promise.all([
      this.repository.getParents(node.nodeId),
      this.repository.getLineage(node.nodeId)
    ]);
    const reference = request.reference;
    const lineageEntries = lineage.map((entry) => ({
      nodeId: entry.nodeId,
      officialCode: entry.officialCode,
      level: entry.level
    }));
    const checks: LocationValidationChecks = {
      nodeExists: true,
      levelMatches: node.level === reference.level && (!request.expectedLevel || node.level === request.expectedLevel),
      officialCodeMatches: node.officialCode === reference.officialCode && (!request.expectedOfficialCode || node.officialCode === request.expectedOfficialCode),
      parentageMatches: (request.requiredParentNodeIds ?? []).every((parentNodeId) => parents.some((parent) => parent.nodeId === parentNodeId)),
      lineageMatches: hasMatchingLineage(lineageEntries, reference.lineage)
        && (request.requiredAncestorNodeIds ?? []).every((ancestorNodeId) => lineageEntries.some((entry) => entry.nodeId === ancestorNodeId)),
      datasetVersionMatches: node.datasetVersion === reference.datasetVersion
        && (!request.datasetVersion || node.datasetVersion === request.datasetVersion),
      sourceDatasetMatches: node.source.sourceDataset === reference.source.sourceDataset
        && node.source.sourceDatasetVersion === reference.source.sourceDatasetVersion
        && node.source.authority === reference.source.authority
        && (!request.expectedSourceDataset || node.source.sourceDataset === request.expectedSourceDataset)
    };
    const issues: LocationValidationIssue[] = [];
    if (!checks.levelMatches) issues.push({ code: "level_mismatch", reason: "The reference or expected level does not match the canonical node." });
    if (!checks.officialCodeMatches) issues.push({ code: "official_code_mismatch", reason: "The reference or expected official code does not match the canonical node." });
    if (!checks.parentageMatches) issues.push({ code: "parent_mismatch", reason: "A required immediate parent is not an explicit canonical parent." });
    if (!checks.lineageMatches) issues.push({ code: "lineage_mismatch", reason: "The supplied or required lineage does not match the canonical node." });
    if (!checks.datasetVersionMatches) issues.push({ code: "dataset_mismatch", reason: "The reference or requested dataset version does not match." });
    if (!checks.sourceDatasetMatches) issues.push({ code: "source_mismatch", reason: "The reference or requested source dataset does not match." });
    return issues.length === 0 ? { status: "valid", node, checks } : invalidResult(checks, issues);
  }
}
