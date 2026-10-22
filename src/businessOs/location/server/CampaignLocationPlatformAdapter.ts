import type {
  CanonicalLocationNode,
  LocationEntityKind,
  LocationLevel,
  LocationResolutionRequest,
  LocationResolutionResult,
  LocationValidationResult
} from "../../geography/LocationApiTypes.ts";
import type {
  LocationApiClient,
  LocationApiDescendantResult,
  LocationApiMetadata,
  LocationApiRelationshipResult
} from "./LocationApiClient.ts";

/**
 * Future persistence-safe canonical identity for a Campaign Management scope.
 * It is deliberately separate from legacy campaign location names and records.
 */
export interface CampaignCanonicalLocationReference {
  canonicalNodeId: string;
  officialCode: string | null;
  level: LocationLevel;
  entityKind: LocationEntityKind;
  canonicalLabel: string;
  dataset: {
    authority: string;
    sourceDataset: string;
    datasetVersion: string;
  };
}

export interface CampaignPersistenceLocationSnapshot {
  canonicalNodeId: string;
  officialCode: string | null;
  labelSnapshot: string;
  level: LocationLevel;
  entityKind: LocationEntityKind;
}

export interface CampaignPersistenceCanonicalLocationReference extends CampaignCanonicalLocationReference {
  parents: readonly CampaignPersistenceLocationSnapshot[];
  lineageSnapshot: readonly CampaignPersistenceLocationSnapshot[];
}

/** Campaign policy selects canonical identities but never modifies geography. */
export interface CampaignCanonicalLocationPolicy {
  includedCanonicalNodeIds: readonly string[];
  excludedCanonicalNodeIds?: readonly string[];
}

export type LegacyCampaignLocationKind = "legacy_official" | "campaign_manual" | "custom" | "unverified";

export interface LegacyCampaignLocationObservation {
  label: string;
  level?: LocationLevel;
  kind: LegacyCampaignLocationKind;
}

export type CampaignLocationShadowClassification =
  | "MATCH"
  | "LABEL_VARIANT"
  | "LEGACY_ONLY"
  | "CANONICAL_ONLY"
  | "AMBIGUOUS"
  | "UNRESOLVED"
  | "STRUCTURAL_MISMATCH"
  | "CUSTOM_UNVERIFIED";

export interface CampaignLocationShadowResult {
  classification: CampaignLocationShadowClassification;
  legacy?: LegacyCampaignLocationObservation;
  canonical?: CampaignCanonicalLocationReference;
  reason: string;
}

export interface CampaignLocationAdapterResolution {
  status: LocationResolutionResult["status"];
  reference?: CampaignCanonicalLocationReference;
  candidates?: readonly CampaignCanonicalLocationReference[];
  reason?: string;
}

/** Minimal client port keeps this adapter transport-only and testable. */
export type CampaignLocationApiClientPort = Pick<
  LocationApiClient,
  "metadata" | "getNode" | "getByOfficialCode" | "getChildren" | "getParents" | "getLineage" |
  "resolve" | "validate" | "isDescendant" | "relationship"
>;

function normalizeLabel(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

/**
 * Server-only Campaign Management boundary. It owns no credentials and no
 * canonical data: a trusted host injects the LocationApiClient port.
 */
export class CampaignLocationPlatformAdapter {
  private readonly client: CampaignLocationApiClientPort;

  constructor(client: CampaignLocationApiClientPort) {
    this.client = client;
  }

  async metadata(): Promise<LocationApiMetadata> {
    return (await this.client.metadata()).data;
  }

  async getNode(nodeId: string): Promise<CampaignCanonicalLocationReference> {
    return toCampaignCanonicalReference((await this.client.getNode(nodeId)).data);
  }

  /**
   * Rebuilds the bounded persistence snapshot from canonical API data. It does
   * not accept labels as lookup keys and it preserves the API's lineage order.
   */
  async getPersistenceReference(nodeId: string): Promise<CampaignPersistenceCanonicalLocationReference> {
    const [nodeResponse, parentsResponse, lineageResponse] = await Promise.all([
      this.client.getNode(nodeId),
      this.client.getParents(nodeId),
      this.client.getLineage(nodeId)
    ]);
    const node = nodeResponse.data;
    const parents = parentsResponse.data.parents;
    const lineage = lineageResponse.data.lineage;
    this.assertSameCanonicalDataset(nodeResponse.datasetVersion, node, [...parents, ...lineage]);
    return {
      ...toCampaignCanonicalReference(node),
      parents: parents.map(toCampaignPersistenceSnapshot).sort((left, right) => left.canonicalNodeId.localeCompare(right.canonicalNodeId)),
      lineageSnapshot: lineage.map(toCampaignPersistenceSnapshot)
    };
  }

  async getByOfficialCode(
    officialCode: string,
    request?: Omit<LocationResolutionRequest, "officialCode">
  ): Promise<CampaignLocationAdapterResolution> {
    return this.toResolution((await this.client.getByOfficialCode(officialCode, request)).data);
  }

  async resolve(request: LocationResolutionRequest): Promise<CampaignLocationAdapterResolution> {
    return this.toResolution((await this.client.resolve(request)).data);
  }

  async getChildren(nodeId: string): Promise<readonly CampaignCanonicalLocationReference[]> {
    return (await this.client.getChildren(nodeId)).data.nodes.map(toCampaignCanonicalReference);
  }

  async getParents(nodeId: string): Promise<readonly CampaignCanonicalLocationReference[]> {
    const parents = (await this.client.getParents(nodeId)).data.parents;
    return Promise.all(parents.map(async (parent) => this.getNode(parent.nodeId)));
  }

  async getLineage(nodeId: string): Promise<readonly CampaignCanonicalLocationReference[]> {
    return (await this.client.getLineage(nodeId)).data.lineage.map(toCampaignCanonicalReference);
  }

  async validate(
    reference: CampaignCanonicalLocationReference,
    requirements: {
      expectedLevel?: LocationLevel;
      expectedOfficialCode?: string;
      requiredParentNodeIds?: readonly string[];
      requiredAncestorNodeIds?: readonly string[];
    } = {}
  ): Promise<LocationValidationResult> {
    const node = (await this.client.getNode(reference.canonicalNodeId)).data;
    return (await this.client.validate({
      reference: {
        nodeId: node.nodeId,
        officialCode: node.officialCode,
        level: node.level,
        datasetVersion: node.datasetVersion,
        source: node.source,
        lineage: node.lineage
      },
      ...requirements,
      datasetVersion: reference.dataset.datasetVersion,
      expectedSourceDataset: reference.dataset.sourceDataset
    })).data;
  }

  async isDescendant(
    nodeId: string,
    ancestorNodeId: string
  ): Promise<LocationApiDescendantResult> {
    return (await this.client.isDescendant(nodeId, ancestorNodeId)).data;
  }

  async hasOfficialRelationship(
    childNodeId: string,
    parentNodeId: string
  ): Promise<LocationApiRelationshipResult> {
    return (await this.client.relationship(childNodeId, parentNodeId)).data;
  }

  /** A policy is an identity-only projection; canonical records remain unchanged. */
  selectPolicySubset(
    references: readonly CampaignCanonicalLocationReference[],
    policy: CampaignCanonicalLocationPolicy
  ): readonly CampaignCanonicalLocationReference[] {
    const included = new Set(policy.includedCanonicalNodeIds);
    const excluded = new Set(policy.excludedCanonicalNodeIds ?? []);
    return references.filter((reference) => included.has(reference.canonicalNodeId) && !excluded.has(reference.canonicalNodeId));
  }

  compareShadow(input: {
    legacy?: LegacyCampaignLocationObservation;
    canonical?: CampaignCanonicalLocationReference;
    canonicalOutcome?: "ambiguous" | "unresolved";
  }): CampaignLocationShadowResult {
    const { legacy, canonical, canonicalOutcome } = input;
    if (legacy && legacy.kind !== "legacy_official") {
      return { classification: "CUSTOM_UNVERIFIED", legacy, canonical, reason: "Manual/custom campaign places are not canonical geography." };
    }
    if (canonicalOutcome === "ambiguous") return { classification: "AMBIGUOUS", legacy, canonical, reason: "Canonical parentage is not uniquely supported." };
    if (canonicalOutcome === "unresolved") return { classification: "UNRESOLVED", legacy, canonical, reason: "Canonical relationship is not source-supported." };
    if (!legacy && canonical) return { classification: "CANONICAL_ONLY", canonical, reason: "No legacy observation was supplied." };
    if (legacy && !canonical) return { classification: "LEGACY_ONLY", legacy, reason: "Legacy data was not converted into a canonical node." };
    if (!legacy || !canonical) return { classification: "UNRESOLVED", reason: "Neither legacy nor canonical observation was supplied." };
    if (legacy.level && legacy.level !== canonical.level) {
      return { classification: "STRUCTURAL_MISMATCH", legacy, canonical, reason: "Legacy and canonical levels differ." };
    }
    if (legacy.label === canonical.canonicalLabel) return { classification: "MATCH", legacy, canonical, reason: "Labels and canonical level agree." };
    if (normalizeLabel(legacy.label) === normalizeLabel(canonical.canonicalLabel)) {
      return { classification: "LABEL_VARIANT", legacy, canonical, reason: "Only deterministic presentation normalization differs." };
    }
    return { classification: "STRUCTURAL_MISMATCH", legacy, canonical, reason: "Labels differ; no automatic canonical substitution is permitted." };
  }

  private toResolution(result: LocationResolutionResult): CampaignLocationAdapterResolution {
    switch (result.status) {
      case "resolved":
        return { status: result.status, reference: toCampaignCanonicalReference(result.node) };
      case "ambiguous":
        return {
          status: result.status,
          candidates: result.candidates.map(toCampaignCanonicalReference),
          reason: result.reason
        };
      case "unresolved":
      case "invalid":
        return { status: result.status, reason: result.reason };
    }
  }


  private assertSameCanonicalDataset(
    responseDatasetVersion: string,
    selected: CanonicalLocationNode,
    related: readonly CanonicalLocationNode[]
  ): void {
    const sameDataset = (candidate: CanonicalLocationNode) =>
      candidate.datasetVersion === selected.datasetVersion
      && candidate.source.authority === selected.source.authority
      && candidate.source.sourceDataset === selected.source.sourceDataset
      && candidate.source.sourceDatasetVersion === selected.source.sourceDatasetVersion;
    if (responseDatasetVersion !== selected.datasetVersion || !related.every(sameDataset)) {
      throw new Error("Canonical Location API returned mixed dataset identity.");
    }
  }
}

export function toCampaignCanonicalReference(node: CanonicalLocationNode): CampaignCanonicalLocationReference {
  return {
    canonicalNodeId: node.nodeId,
    officialCode: node.officialCode,
    level: node.level,
    entityKind: node.entityKind,
    canonicalLabel: node.displayName,
    dataset: {
      authority: node.source.authority,
      sourceDataset: node.source.sourceDataset,
      datasetVersion: node.datasetVersion
    }
  };
}

export function toCampaignPersistenceSnapshot(node: CanonicalLocationNode): CampaignPersistenceLocationSnapshot {
  return {
    canonicalNodeId: node.nodeId,
    officialCode: node.officialCode,
    labelSnapshot: node.displayName,
    level: node.level,
    entityKind: node.entityKind
  };
}
