import type { LocationLevel } from "../../geography/LocationApiTypes.ts";
import {
  PERSISTED_LOCATION_REFERENCE_BOUNDS,
  PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
  parsePersistedLocationReference,
  type PersistedCanonicalLocationReference,
  type PersistedCanonicalLocationSnapshot,
  type PersistedLocationReference
} from "../persistence/PersistedLocationReference.ts";
import type {
  CampaignCanonicalLocationReference,
  CampaignLocationPlatformAdapter,
  CampaignPersistenceCanonicalLocationReference,
  CampaignPersistenceLocationSnapshot
} from "./CampaignLocationPlatformAdapter.ts";

export type PersistedLocationValidationErrorCode =
  | "ACTIVE_DATASET_MISMATCH"
  | "HISTORICAL_REVALIDATION_UNSUPPORTED"
  | "CANONICAL_VALIDATION_REJECTED"
  | "OFFICIAL_CODE_MISMATCH"
  | "LABEL_MISMATCH"
  | "LEVEL_MISMATCH"
  | "ENTITY_KIND_MISMATCH"
  | "AUTHORITY_MISMATCH"
  | "SOURCE_DATASET_MISMATCH"
  | "DATASET_VERSION_MISMATCH"
  | "PARENTS_MISMATCH"
  | "LINEAGE_MISMATCH"
  | "PARENTS_TOO_LARGE"
  | "LINEAGE_TOO_LARGE";

export class PersistedLocationValidationError extends Error {
  readonly code: PersistedLocationValidationErrorCode;

  constructor(code: PersistedLocationValidationErrorCode) {
    super(`Persisted location validation failed (${code}).`);
    this.name = "PersistedLocationValidationError";
    this.code = code;
  }
}

export interface PersistedLocationReferenceValidatorOptions {
  now?: () => Date;
  validatorVersion?: string;
}

type TrustedLocationPlatformPort = Pick<
  CampaignLocationPlatformAdapter,
  "metadata" | "getPersistenceReference" | "validate"
>;

function fail(code: PersistedLocationValidationErrorCode): never {
  throw new PersistedLocationValidationError(code);
}

function sameSnapshot(
  claimed: PersistedCanonicalLocationSnapshot,
  trusted: CampaignPersistenceLocationSnapshot
): boolean {
  return claimed.canonicalNodeId === trusted.canonicalNodeId
    && claimed.officialCode === trusted.officialCode
    && claimed.labelSnapshot === trusted.labelSnapshot
    && claimed.level === trusted.level
    && claimed.entityKind === trusted.entityKind;
}

function sortedSnapshots<T extends { canonicalNodeId: string }>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => left.canonicalNodeId.localeCompare(right.canonicalNodeId));
}

function sameParents(
  claimed: readonly PersistedCanonicalLocationSnapshot[],
  trusted: readonly CampaignPersistenceLocationSnapshot[]
): boolean {
  if (claimed.length !== trusted.length) return false;
  const sortedClaimed = sortedSnapshots(claimed);
  const sortedTrusted = sortedSnapshots(trusted);
  return sortedClaimed.every((snapshot, index) => sameSnapshot(snapshot, sortedTrusted[index]));
}

function sameOrderedLineage(
  claimed: readonly PersistedCanonicalLocationSnapshot[],
  trusted: readonly CampaignPersistenceLocationSnapshot[]
): boolean {
  return claimed.length === trusted.length
    && claimed.every((snapshot, index) => sameSnapshot(snapshot, trusted[index]));
}

function toPersistedSnapshot(snapshot: CampaignPersistenceLocationSnapshot): PersistedCanonicalLocationSnapshot {
  return {
    canonicalNodeId: snapshot.canonicalNodeId,
    officialCode: snapshot.officialCode,
    labelSnapshot: snapshot.labelSnapshot,
    level: snapshot.level,
    entityKind: snapshot.entityKind
  };
}

/**
 * Server-only trust bridge. Canonical browser payloads are claims: this class
 * validates them against the active canonical API and rebuilds the persisted
 * reference exclusively from trusted API data.
 */
export class PersistedLocationReferenceValidator {
  private readonly platform: TrustedLocationPlatformPort;
  private readonly now: () => Date;
  private readonly validatorVersion: string;

  constructor(platform: TrustedLocationPlatformPort, options: PersistedLocationReferenceValidatorOptions = {}) {
    this.platform = platform;
    this.now = options.now ?? (() => new Date());
    this.validatorVersion = options.validatorVersion?.trim() || "location-api-v1";
  }

  async validateAndRebuildForNewWrite(input: unknown): Promise<PersistedLocationReference> {
    const parsed = parsePersistedLocationReference(input);
    if (parsed.verificationState !== "canonical_verified") return parsed;
    const metadata = await this.platform.metadata();
    if (
      parsed.authority !== metadata.source.authority
      || parsed.sourceDataset !== metadata.source.sourceDataset
      || parsed.datasetVersion !== metadata.datasetVersion
      || parsed.datasetVersion !== metadata.source.sourceDatasetVersion
    ) {
      fail("ACTIVE_DATASET_MISMATCH");
    }
    return this.validateCanonicalClaim(parsed);
  }

  async revalidateHistorical(input: unknown): Promise<PersistedLocationReference> {
    const parsed = parsePersistedLocationReference(input);
    if (parsed.verificationState !== "canonical_verified") return parsed;
    const metadata = await this.platform.metadata();
    if (
      parsed.authority !== metadata.source.authority
      || parsed.sourceDataset !== metadata.source.sourceDataset
      || parsed.datasetVersion !== metadata.datasetVersion
      || parsed.datasetVersion !== metadata.source.sourceDatasetVersion
    ) {
      fail("HISTORICAL_REVALIDATION_UNSUPPORTED");
    }
    return this.validateCanonicalClaim(parsed);
  }

  private async validateCanonicalClaim(
    claimed: PersistedCanonicalLocationReference
  ): Promise<PersistedCanonicalLocationReference> {
    const trusted = await this.platform.getPersistenceReference(claimed.canonicalNodeId);
    this.assertSelectedNode(claimed, trusted);
    if (trusted.parents.length > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxParentCount) fail("PARENTS_TOO_LARGE");
    if (trusted.lineageSnapshot.length > PERSISTED_LOCATION_REFERENCE_BOUNDS.maxLineageCount) fail("LINEAGE_TOO_LARGE");
    if (!sameParents(claimed.parents, trusted.parents)) fail("PARENTS_MISMATCH");
    if (!sameOrderedLineage(claimed.lineageSnapshot, trusted.lineageSnapshot)) fail("LINEAGE_MISMATCH");

    const apiValidation = await this.platform.validate(
      trusted as CampaignCanonicalLocationReference,
      {
        expectedLevel: claimed.level as LocationLevel,
        ...(claimed.officialCode === null ? {} : { expectedOfficialCode: claimed.officialCode }),
        requiredParentNodeIds: claimed.parents.map((parent) => parent.canonicalNodeId),
        requiredAncestorNodeIds: claimed.lineageSnapshot.map((ancestor) => ancestor.canonicalNodeId)
      }
    );
    if (apiValidation.status !== "valid") fail("CANONICAL_VALIDATION_REJECTED");

    return parsePersistedLocationReference({
      schemaVersion: PERSISTED_LOCATION_REFERENCE_SCHEMA_VERSION,
      verificationState: "canonical_verified",
      canonicalNodeId: trusted.canonicalNodeId,
      officialCode: trusted.officialCode,
      labelSnapshot: trusted.canonicalLabel,
      level: trusted.level,
      entityKind: trusted.entityKind,
      authority: trusted.dataset.authority,
      sourceDataset: trusted.dataset.sourceDataset,
      datasetVersion: trusted.dataset.datasetVersion,
      parents: sortedSnapshots(trusted.parents).map(toPersistedSnapshot),
      lineageSnapshot: trusted.lineageSnapshot.map(toPersistedSnapshot),
      validation: {
        validatedAt: this.now().toISOString(),
        validatorVersion: this.validatorVersion
      }
    }) as PersistedCanonicalLocationReference;
  }

  private assertSelectedNode(
    claimed: PersistedCanonicalLocationReference,
    trusted: CampaignPersistenceCanonicalLocationReference
  ): void {
    if (claimed.officialCode !== trusted.officialCode) fail("OFFICIAL_CODE_MISMATCH");
    if (claimed.labelSnapshot !== trusted.canonicalLabel) fail("LABEL_MISMATCH");
    if (claimed.level !== trusted.level) fail("LEVEL_MISMATCH");
    if (claimed.entityKind !== trusted.entityKind) fail("ENTITY_KIND_MISMATCH");
    if (claimed.authority !== trusted.dataset.authority) fail("AUTHORITY_MISMATCH");
    if (claimed.sourceDataset !== trusted.dataset.sourceDataset) fail("SOURCE_DATASET_MISMATCH");
    if (claimed.datasetVersion !== trusted.dataset.datasetVersion) fail("DATASET_VERSION_MISMATCH");
  }
}
