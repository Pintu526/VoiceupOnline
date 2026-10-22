import type {
  CanonicalLocationNode,
  LocationResolutionRequest,
  LocationResolutionResult,
  LocationValidationRequest,
  LocationValidationResult
} from "./LocationApiTypes.ts";
import type { CanonicalGeographyEngine } from "./CanonicalGeographyEngine.ts";
import { CanonicalLocationResolver } from "./CanonicalLocationResolver.ts";
import { CanonicalLocationValidator } from "./CanonicalLocationValidator.ts";

export const LOCATION_API_V1_NAMESPACE = "/v1";

/** Requirements a future HTTP host must enforce; no credentials are stored here. */
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
  | {
      operation: "officialCode";
      officialCode: string;
      request?: Omit<LocationResolutionRequest, "officialCode">;
    }
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
  body: {
    apiVersion: "v1";
    datasetVersion: string;
    data: T;
  };
}

export interface LocationApiV1Error {
  httpStatus: 400 | 404;
  body: {
    apiVersion: "v1";
    datasetVersion: string;
    error: {
      code: "invalid_request" | "not_found";
      message: string;
    };
  };
}

export type LocationApiV1Response = LocationApiV1Success<unknown> | LocationApiV1Error;

/**
 * Framework-neutral Location API v1 service. A future HTTP host can map its
 * routes under `/v1` to `handle` without changing canonical behavior.
 */
export class LocationApiV1 {
  private readonly engine: CanonicalGeographyEngine;
  private readonly resolver: CanonicalLocationResolver;
  private readonly validator: CanonicalLocationValidator;

  constructor(engine: CanonicalGeographyEngine) {
    this.engine = engine;
    this.resolver = new CanonicalLocationResolver(engine);
    this.validator = new CanonicalLocationValidator(engine);
  }

  handle(request: LocationApiV1Request): LocationApiV1Response {
    switch (request.operation) {
      case "metadata":
        return this.ok({
          namespace: LOCATION_API_V1_NAMESPACE,
          datasetVersion: this.engine.datasetVersion,
          source: this.engine.source,
          readOnly: true,
          security: locationApiV1SecurityContract
        });
      case "node": {
        const node = this.engine.getNode(request.nodeId);
        return node ? this.ok(node) : this.notFound(`Canonical node '${request.nodeId}' was not found.`);
      }
      case "officialCode":
        return this.ok(this.resolve({ ...request.request, officialCode: request.officialCode }));
      case "children": {
        const node = this.engine.getNode(request.nodeId);
        return node
          ? this.ok({ nodeId: node.nodeId, nodes: this.engine.getChildren(node.nodeId) })
          : this.notFound(`Canonical node '${request.nodeId}' was not found.`);
      }
      case "parents": {
        const node = this.engine.getNode(request.nodeId);
        return node
          ? this.ok({ nodeId: node.nodeId, parents: this.engine.getImmediateParentReferences(node.nodeId) })
          : this.notFound(`Canonical node '${request.nodeId}' was not found.`);
      }
      case "lineage": {
        const node = this.engine.getNode(request.nodeId);
        return node
          ? this.ok({ nodeId: node.nodeId, lineage: this.engine.getLineage(node.nodeId) })
          : this.notFound(`Canonical node '${request.nodeId}' was not found.`);
      }
      case "search":
      case "resolve":
        return this.ok(this.resolve(request.request));
      case "validate":
        return this.ok(this.validator.validate(request.request));
      case "descendant": {
        const node = this.engine.getNode(request.nodeId);
        const ancestor = this.engine.getNode(request.ancestorNodeId);
        return node && ancestor
          ? this.ok({ nodeId: node.nodeId, ancestorNodeId: ancestor.nodeId, descendant: this.engine.isDescendantOf(node.nodeId, ancestor.nodeId) })
          : this.notFound("Both nodeId and ancestorNodeId must identify canonical nodes.");
      }
      case "relationship": {
        const child = this.engine.getNode(request.childNodeId);
        const parent = this.engine.getNode(request.parentNodeId);
        return child && parent
          ? this.ok({ childNodeId: child.nodeId, parentNodeId: parent.nodeId, represented: this.engine.hasOfficialParentRelationship(child.nodeId, parent.nodeId) })
          : this.notFound("Both childNodeId and parentNodeId must identify canonical nodes.");
      }
    }
  }

  private resolve(request: LocationResolutionRequest): LocationResolutionResult {
    return this.resolver.resolve(request);
  }

  private ok<T>(data: T): LocationApiV1Success<T> {
    return {
      httpStatus: 200,
      body: { apiVersion: "v1", datasetVersion: this.engine.datasetVersion, data }
    };
  }

  private notFound(message: string): LocationApiV1Error {
    return {
      httpStatus: 404,
      body: {
        apiVersion: "v1",
        datasetVersion: this.engine.datasetVersion,
        error: { code: "not_found", message }
      }
    };
  }
}

export type LocationApiV1NodeResponse = LocationApiV1Success<CanonicalLocationNode> | LocationApiV1Error;
export type LocationApiV1ResolutionResponse = LocationApiV1Success<LocationResolutionResult>;
export type LocationApiV1ValidationResponse = LocationApiV1Success<LocationValidationResult>;
