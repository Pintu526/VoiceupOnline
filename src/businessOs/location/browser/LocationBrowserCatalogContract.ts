import type { LocationEntityKind, LocationLevel } from "../../geography/LocationApiTypes.ts";

export const LOCATION_BROWSER_CATALOG_ACTION = "read_canonical_location_catalog" as const;
export const LOCATION_BROWSER_CATALOG_MAX_RESULTS = 100;

export interface LocationBrowserDatasetIdentity {
  authority: string;
  sourceDataset: string;
  datasetVersion: string;
}

export type LocationBrowserAccessContext =
  | { type: "workspace"; workspaceId: string }
  | { type: "campaign"; workspaceId: string; campaignId: string; campaignSlug: string }
  | { type: "public_campaign"; campaignSlug: string };

export type LocationBrowserCatalogQuery =
  | { operation: "metadata" }
  | { operation: "node"; nodeId: string }
  | { operation: "children"; parentNodeId: string; resultLimit?: number }
  | {
      operation: "resolve" | "search";
      nodeId?: string;
      officialCode?: string;
      normalizedName?: string;
      expectedLevel?: LocationLevel;
      parentNodeId?: string;
      resultLimit?: number;
    };

export interface LocationBrowserCatalogRequest {
  action: typeof LOCATION_BROWSER_CATALOG_ACTION;
  access: LocationBrowserAccessContext;
  query: LocationBrowserCatalogQuery;
}

export interface LocationBrowserParentReference {
  nodeId: string;
  officialCode: string | null;
  level: LocationLevel;
  relationship: "administrative_parent" | "official_containment";
  source: LocationBrowserDatasetIdentity;
}

export interface LocationBrowserLineageEntry {
  nodeId: string;
  officialCode: string | null;
  level: LocationLevel;
}

export interface LocationBrowserCanonicalNode extends LocationBrowserDatasetIdentity {
  nodeId: string;
  officialCode: string | null;
  label: string;
  level: LocationLevel;
  entityKind: LocationEntityKind;
  parents: readonly LocationBrowserParentReference[];
  lineage: readonly LocationBrowserLineageEntry[];
}

export interface LocationBrowserMetadataData {
  namespace: "/v1";
  readOnly: true;
}

export interface LocationBrowserNodeData {
  node: LocationBrowserCanonicalNode;
}

export interface LocationBrowserChildrenData {
  parentNodeId: string;
  nodes: readonly LocationBrowserCanonicalNode[];
}

export type LocationBrowserResolution =
  | { status: "resolved"; node: LocationBrowserCanonicalNode }
  | { status: "ambiguous"; candidates: readonly LocationBrowserCanonicalNode[]; reason: string }
  | { status: "unresolved"; suggestions?: readonly LocationBrowserCanonicalNode[]; reason: string }
  | { status: "invalid"; reason: string };

export interface LocationBrowserResolutionData {
  resolution: LocationBrowserResolution;
}

export interface LocationBrowserCatalogResponse<T> {
  apiVersion: "v1";
  readOnly: true;
  dataset: LocationBrowserDatasetIdentity;
  data: T;
}

export interface UnverifiedCustomLocationInput {
  customId?: string;
  country: string;
  state?: string;
  district?: string;
  block?: string;
  panchayat?: string;
  village?: string;
  postalCode?: string;
  source?: "campaign_manual" | "campaign_import" | "workspace_override" | "manual" | "ocr" | "gps" | "pin";
}

/**
 * Campaign/manual locations are a policy overlay, never canonical records.
 * This conversion deliberately performs no label matching and cannot assign an
 * LGD identity merely because a custom label resembles a canonical label.
 */
export interface LocationBrowserUnverifiedCustomLocation extends UnverifiedCustomLocationInput {
  verificationStatus: "unverified_custom";
  canonicalNodeId: null;
  officialCode: null;
}

export function representUnverifiedCustomLocation(
  input: UnverifiedCustomLocationInput
): LocationBrowserUnverifiedCustomLocation {
  return {
    ...input,
    verificationStatus: "unverified_custom",
    canonicalNodeId: null,
    officialCode: null
  };
}
