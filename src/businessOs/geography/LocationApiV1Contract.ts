import type {
  CanonicalLocationNode,
  LocationResolutionRequest,
  LocationResolutionResult,
  LocationValidationRequest,
  LocationValidationResult
} from "./LocationApiTypes.ts";

export const LOCATION_API_V1_NAMESPACE = "/v1";

export const locationApiV1SecurityContract = {
  namespace: LOCATION_API_V1_NAMESPACE,
  canonicalDataAccess: "read_only",
  authentication: "future_api_key_or_service_identity_required",
  rateLimiting: "future_per_client_rate_limit_and_metering_required",
  cors: "future_host_must_allow_explicit_origins_only_and_never_use_wildcard_credentials",
  mutations: "custom_or_unverified_places_cannot_mutate_canonical_geography"
} as const;

export type LocationApiV1Request =
  | { operation: "metadata" }
  | { operation: "node"; nodeId: string }
  | { operation: "officialCode"; officialCode: string; request?: Omit<LocationResolutionRequest, "officialCode"> }
  | { operation: "children"; nodeId: string }
  | { operation: "parents"; nodeId: string }
  | { operation: "lineage"; nodeId: string }
  | { operation: "search"; request: LocationResolutionRequest }
  | { operation: "resolve"; request: LocationResolutionRequest }
  | { operation: "validate"; request: LocationValidationRequest }
  | { operation: "descendant"; nodeId: string; ancestorNodeId: string }
  | { operation: "relationship"; childNodeId: string; parentNodeId: string };

export interface LocationApiV1Success<T> {
  httpStatus: 200;
  body: { apiVersion: "v1"; datasetVersion: string; data: T };
}

export interface LocationApiV1Error {
  httpStatus: 400 | 404;
  body: {
    apiVersion: "v1";
    datasetVersion: string;
    error: { code: "invalid_request" | "not_found"; message: string };
  };
}

export type LocationApiV1Response = LocationApiV1Success<unknown> | LocationApiV1Error;
export type LocationApiV1NodeResponse = LocationApiV1Success<CanonicalLocationNode> | LocationApiV1Error;
export type LocationApiV1ResolutionResponse = LocationApiV1Success<LocationResolutionResult>;
export type LocationApiV1ValidationResponse = LocationApiV1Success<LocationValidationResult>;
