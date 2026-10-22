/**
 * Canonical Business OS Location API v1 model.
 *
 * This module is intentionally standalone. It defines a future contract and is
 * not wired into the existing geography implementation or application flows.
 */

export const canonicalLocationLevels = [
  "country",
  "state",
  "district",
  "block",
  "local_body",
  "village",
  "ward"
] as const;

export type LocationLevel = (typeof canonicalLocationLevels)[number];

/** Entity kinds currently known to the Business OS canonical model. */
export type KnownLocationEntityKind =
  | "country"
  | "state"
  | "union_territory"
  | "district"
  | "development_block"
  | "subdistrict"
  | "taluk"
  | "tehsil"
  | "gram_panchayat"
  | "panchayat_samiti"
  | "zilla_parishad"
  | "municipality"
  | "municipal_corporation"
  | "nagar_panchayat"
  | "notified_area_council"
  | "town_panchayat"
  | "other_local_body"
  | "village"
  | "ward";

/**
 * Sources may introduce further official classifications without changing the
 * level contract. New values must be source-governed, not user-invented.
 */
export type LocationEntityKind = KnownLocationEntityKind | (string & {});

export type LocationProvenance = "official" | "derived_official";

export interface LocationSource {
  /** Government or other official authority responsible for the source. */
  authority: string;
  /** Stable identifier for the imported source dataset. */
  sourceDataset: string;
  /** Immutable release/version assigned by the source or import process. */
  sourceDatasetVersion: string;
  provenance: LocationProvenance;
  retrievedAt?: string;
  sourceRecordId?: string;
  sourceUrl?: string;
}

export interface LocationParentReference {
  /** Canonical parent identity; never a display-name-derived value. */
  nodeId: string;
  officialCode: string | null;
  level: LocationLevel;
  /** Relationship explicitly recorded by the authoritative source. */
  relationship: "administrative_parent" | "official_containment";
  source: Pick<LocationSource, "authority" | "sourceDataset" | "sourceDatasetVersion">;
}

export interface LocationLineageEntry {
  nodeId: string;
  officialCode: string | null;
  level: LocationLevel;
}

/**
 * A versioned, official administrative-geography record.
 * `displayName` is presentation only and must never be used as identity.
 */
export interface CanonicalLocationNode {
  nodeId: string;
  /** Null only when the governing source does not assign an official code. */
  officialCode: string | null;
  level: LocationLevel;
  entityKind: LocationEntityKind;
  displayName: string;
  datasetVersion: string;
  source: LocationSource;
  /** Immediate official parents only. Empty when the source defines none. */
  parents: readonly LocationParentReference[];
  /** Ordered country-through-immediate-parent official ancestry. */
  lineage: readonly LocationLineageEntry[];
}

/** A portable canonical reference for persistence and scope evaluation. */
export interface CanonicalLocationReference {
  nodeId: string;
  officialCode: string | null;
  level: LocationLevel;
  datasetVersion: string;
  source: Pick<LocationSource, "authority" | "sourceDataset" | "sourceDatasetVersion">;
  lineage: readonly LocationLineageEntry[];
}

export interface LocationResolutionRequest {
  nodeId?: string;
  officialCode?: string;
  normalizedName?: string;
  expectedLevel?: LocationLevel;
  parentNodeId?: string;
  datasetVersion?: string;
  sourceDataset?: string;
}

export type LocationResolutionResult =
  | {
      status: "resolved";
      node: CanonicalLocationNode;
    }
  | {
      status: "ambiguous";
      candidates: readonly CanonicalLocationNode[];
      reason: string;
    }
  | {
      status: "unresolved";
      reason: string;
      suggestions?: readonly CanonicalLocationNode[];
    }
  | {
      status: "invalid";
      reason: string;
    };

export interface LocationValidationRequest {
  reference: CanonicalLocationReference;
  expectedLevel?: LocationLevel;
  expectedOfficialCode?: string;
  requiredParentNodeIds?: readonly string[];
  requiredAncestorNodeIds?: readonly string[];
  datasetVersion?: string;
  expectedSourceDataset?: string;
}

export interface LocationValidationChecks {
  nodeExists: boolean;
  levelMatches: boolean;
  officialCodeMatches: boolean;
  parentageMatches: boolean;
  lineageMatches: boolean;
  datasetVersionMatches: boolean;
  sourceDatasetMatches: boolean;
}

export type LocationValidationIssueCode =
  | "not_found"
  | "level_mismatch"
  | "official_code_mismatch"
  | "parent_mismatch"
  | "lineage_mismatch"
  | "dataset_mismatch"
  | "source_mismatch";

export interface LocationValidationIssue {
  code: LocationValidationIssueCode;
  reason: string;
}

export type LocationValidationResult =
  | {
      status: "valid";
      node: CanonicalLocationNode;
      checks: LocationValidationChecks;
    }
  | {
      status: "invalid";
      checks: LocationValidationChecks;
      issues: readonly LocationValidationIssue[];
    };

export type LocationScopeType =
  | "campaign"
  | "resource"
  | "coordinator"
  | "organization"
  | "authority";

/** A scope target is identity-based; display names are deliberately absent. */
export interface LocationScopeTarget {
  nodeId: string;
  officialCode: string | null;
  level: LocationLevel;
  datasetVersion: string;
  source: Pick<LocationSource, "authority" | "sourceDataset" | "sourceDatasetVersion">;
}

export interface LocationScopePolicy {
  scopeId: string;
  scopeType: LocationScopeType;
  includedLocations: readonly LocationScopeTarget[];
  excludedLocations?: readonly LocationScopeTarget[];
  datasetVersion: string;
  policyVersion: string;
}

/**
 * A user- or system-submitted place which has not been established as official
 * administrative geography. It cannot stand in for a CanonicalLocationNode.
 */
export interface CustomPlace {
  customPlaceId: string;
  displayName: string;
  status: "unverified" | "under_review" | "rejected" | "resolved_to_canonical";
  submittedAt: string;
  submittedBy?: string;
  proposedParent?: CanonicalLocationReference;
  evidence?: readonly string[];
  resolvedCanonicalLocation?: CanonicalLocationReference;
}

/** A physical/postal address, separate from administrative geography. */
export interface StreetAddress {
  addressId?: string;
  line1: string;
  line2?: string;
  locality?: string;
  postalCode?: string;
  countryCode?: string;
  administrativeLocation?: CanonicalLocationReference;
}

/** OCR output is evidence only until separately resolved and validated. */
export interface OcrLocationSuggestion {
  suggestionId: string;
  rawText: string;
  field?: "country" | "state" | "district" | "block" | "local_body" | "village" | "ward" | "address" | "postal";
  confidence?: number;
  extractedAt: string;
  sourceDocumentId?: string;
  candidateLocations?: readonly CanonicalLocationReference[];
}

/** GPS readings and resolver candidates are not canonical administrative identity. */
export interface GpsLocationSuggestion {
  suggestionId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
  provider?: string;
  candidateLocations?: readonly CanonicalLocationReference[];
}

/** Postal data is a lookup clue, not proof of an administrative hierarchy. */
export interface PostalInformation {
  postalCode: string;
  countryCode?: string;
  source?: string;
  datasetVersion?: string;
  candidateLocations?: readonly CanonicalLocationReference[];
}
