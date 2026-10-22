import type {
  CanonicalLocationNode,
  LocationResolutionRequest,
  LocationResolutionResult
} from "./LocationApiTypes.ts";
import type { CanonicalGeographyEngine } from "./CanonicalGeographyEngine.ts";
export { normalizeCanonicalLocationText } from "./CanonicalLocationText.ts";
import { normalizeCanonicalLocationText } from "./CanonicalLocationText.ts";

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * Resolves only existing canonical nodes. Name input is an exact normalized
 * display-name comparison and succeeds only when one constrained node remains.
 */
export class CanonicalLocationResolver {
  private readonly engine: CanonicalGeographyEngine;

  constructor(engine: CanonicalGeographyEngine) {
    this.engine = engine;
  }

  resolve(request: LocationResolutionRequest): LocationResolutionResult {
    const hasNodeId = hasText(request.nodeId);
    const hasOfficialCode = hasText(request.officialCode);
    const hasName = hasText(request.normalizedName);
    if (!hasNodeId && !hasOfficialCode && !hasName) {
      return { status: "invalid", reason: "Provide a nodeId, officialCode, or normalizedName." };
    }

    let candidates: readonly CanonicalLocationNode[];
    if (hasNodeId) {
      const node = this.engine.getNode(request.nodeId!.trim());
      candidates = node ? [node] : [];
    } else if (hasOfficialCode) {
      candidates = this.engine.getNodesByOfficialCode(request.officialCode!.trim());
    } else {
      const name = normalizeCanonicalLocationText(request.normalizedName!);
      candidates = this.engine.search({ text: name }).filter(
        (node) => normalizeCanonicalLocationText(node.displayName) === name
      );
    }

    candidates = candidates.filter((node) => {
      if (hasOfficialCode && node.officialCode !== request.officialCode!.trim()) return false;
      if (hasName && normalizeCanonicalLocationText(node.displayName) !== normalizeCanonicalLocationText(request.normalizedName!)) return false;
      if (request.expectedLevel && node.level !== request.expectedLevel) return false;
      if (request.parentNodeId && !node.parents.some((parent) => parent.nodeId === request.parentNodeId)) return false;
      if (request.datasetVersion && node.datasetVersion !== request.datasetVersion) return false;
      if (request.sourceDataset && node.source.sourceDataset !== request.sourceDataset) return false;
      return true;
    });

    if (candidates.length === 1) {
      return { status: "resolved", node: candidates[0] };
    }
    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        candidates,
        reason: "More than one canonical node satisfies the supplied constraints."
      };
    }
    return {
      status: "unresolved",
      reason: "No canonical node satisfies the supplied constraints."
    };
  }
}
