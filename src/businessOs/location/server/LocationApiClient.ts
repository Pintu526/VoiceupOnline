import type {
  CanonicalLocationNode,
  LocationResolutionRequest,
  LocationResolutionResult,
  LocationValidationRequest,
  LocationValidationResult
} from "../../geography/LocationApiTypes.ts";
import type { LocationApiV1Request } from "../../geography/LocationApiV1Contract.ts";

/**
 * Server-side transport client for the read-only Business OS Location API.
 *
 * Credentials are supplied by a trusted server at construction time. This
 * module intentionally does not read browser build variables, persistence, or
 * geography datasets, and is not imported by the current application runtime.
 */

export type LocationApiClientErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_request"
  | "invalid_response"
  | "network_error"
  | "timeout"
  | "api_error";

export class LocationApiClientError extends Error {
  readonly code: LocationApiClientErrorCode;
  readonly status?: number;

  constructor(code: LocationApiClientErrorCode, status?: number) {
    super(`Location API request failed (${code}).`);
    this.name = "LocationApiClientError";
    this.code = code;
    this.status = status;
  }
}

export interface LocationApiClientOptions {
  /** Base URL of the trusted Location API endpoint, without a trailing slash. */
  baseUrl: string;
  /** Server-injected Location API credential. Never provide this to a browser. */
  apiKey: string;
  /** Optional server-injected gateway bearer token, e.g. for a function gateway. */
  gatewayBearerToken?: string;
  fetch?: typeof globalThis.fetch;
  /** Defaults to 10 seconds and is clamped to 100 ms through 30 seconds. */
  timeoutMs?: number;
}

export interface LocationApiClientResponse<T> {
  apiVersion: "v1";
  datasetVersion: string;
  data: T;
}

export interface LocationApiMetadata {
  namespace: "/v1";
  datasetVersion: string;
  source: {
    authority: string;
    sourceDataset: string;
    sourceDatasetVersion: string;
  };
  readOnly: true;
  security: Record<string, unknown>;
}

export interface LocationApiNodeList {
  nodeId: string;
  nodes: readonly CanonicalLocationNode[];
}

export interface LocationApiParentList {
  nodeId: string;
  parents: readonly CanonicalLocationNode[];
}

export interface LocationApiLineage {
  nodeId: string;
  lineage: readonly CanonicalLocationNode[];
}

export interface LocationApiDescendantResult {
  nodeId: string;
  ancestorNodeId: string;
  descendant: boolean;
}

export interface LocationApiRelationshipResult {
  childNodeId: string;
  parentNodeId: string;
  represented: boolean;
}

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_COLLECTION_ITEMS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new LocationApiClientError("invalid_request");
  return normalized;
}

function boundedTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value)) throw new LocationApiClientError("invalid_request");
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(value)));
}

function isBoundedResponseData(value: unknown): boolean {
  if (!isRecord(value)) return true;
  for (const key of ["nodes", "parents", "lineage", "candidates", "suggestions"]) {
    if (key in value && Array.isArray(value[key]) && value[key].length > MAX_RESPONSE_COLLECTION_ITEMS) return false;
  }
  return true;
}

/**
 * A reusable, server-only client. Future backend adapters own authorization
 * policy and decide which consumers may construct or call this client.
 */
export class LocationApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly gatewayBearerToken?: string;
  private readonly requestFetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: LocationApiClientOptions) {
    this.baseUrl = requireNonEmpty(options.baseUrl, "baseUrl").replace(/\/+$/, "");
    this.apiKey = requireNonEmpty(options.apiKey, "apiKey");
    this.gatewayBearerToken = options.gatewayBearerToken?.trim() || undefined;
    this.requestFetch = options.fetch ?? globalThis.fetch;
    if (typeof this.requestFetch !== "function") throw new LocationApiClientError("invalid_request");
    this.timeoutMs = boundedTimeout(options.timeoutMs);
  }

  metadata(): Promise<LocationApiClientResponse<LocationApiMetadata>> {
    return this.request({ operation: "metadata" });
  }

  getNode(nodeId: string): Promise<LocationApiClientResponse<CanonicalLocationNode>> {
    return this.request({ operation: "node", nodeId: requireNonEmpty(nodeId, "nodeId") });
  }

  getByOfficialCode(
    officialCode: string,
    request?: Omit<LocationResolutionRequest, "officialCode">
  ): Promise<LocationApiClientResponse<LocationResolutionResult>> {
    return this.request({ operation: "officialCode", officialCode: requireNonEmpty(officialCode, "officialCode"), request });
  }

  getChildren(nodeId: string): Promise<LocationApiClientResponse<LocationApiNodeList>> {
    return this.request({ operation: "children", nodeId: requireNonEmpty(nodeId, "nodeId") });
  }

  getParents(nodeId: string): Promise<LocationApiClientResponse<LocationApiParentList>> {
    return this.request({ operation: "parents", nodeId: requireNonEmpty(nodeId, "nodeId") });
  }

  getLineage(nodeId: string): Promise<LocationApiClientResponse<LocationApiLineage>> {
    return this.request({ operation: "lineage", nodeId: requireNonEmpty(nodeId, "nodeId") });
  }

  search(request: LocationResolutionRequest): Promise<LocationApiClientResponse<LocationResolutionResult>> {
    return this.request({ operation: "search", request });
  }

  resolve(request: LocationResolutionRequest): Promise<LocationApiClientResponse<LocationResolutionResult>> {
    return this.request({ operation: "resolve", request });
  }

  validate(request: LocationValidationRequest): Promise<LocationApiClientResponse<LocationValidationResult>> {
    return this.request({ operation: "validate", request });
  }

  isDescendant(nodeId: string, ancestorNodeId: string): Promise<LocationApiClientResponse<LocationApiDescendantResult>> {
    return this.request({
      operation: "descendant",
      nodeId: requireNonEmpty(nodeId, "nodeId"),
      ancestorNodeId: requireNonEmpty(ancestorNodeId, "ancestorNodeId")
    });
  }

  relationship(childNodeId: string, parentNodeId: string): Promise<LocationApiClientResponse<LocationApiRelationshipResult>> {
    return this.request({
      operation: "relationship",
      childNodeId: requireNonEmpty(childNodeId, "childNodeId"),
      parentNodeId: requireNonEmpty(parentNodeId, "parentNodeId")
    });
  }

  private async request<T>(body: LocationApiV1Request): Promise<LocationApiClientResponse<T>> {
    let encoded: string;
    try {
      encoded = JSON.stringify(body);
    } catch {
      throw new LocationApiClientError("invalid_request");
    }
    if (new TextEncoder().encode(encoded).byteLength > MAX_REQUEST_BYTES) {
      throw new LocationApiClientError("invalid_request");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.requestFetch(this.baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          ...(this.gatewayBearerToken ? { authorization: `Bearer ${this.gatewayBearerToken}` } : {})
        },
        body: encoded,
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted || (isRecord(error) && error.name === "AbortError")) {
        throw new LocationApiClientError("timeout");
      }
      throw new LocationApiClientError("network_error");
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new LocationApiClientError(response.ok ? "invalid_response" : this.errorCode(response.status), response.status);
    }

    if (!response.ok) throw new LocationApiClientError(this.errorCode(response.status), response.status);
    if (!isRecord(payload) || payload.apiVersion !== "v1" || typeof payload.datasetVersion !== "string" || !payload.datasetVersion || !("data" in payload) || !isBoundedResponseData(payload.data)) {
      throw new LocationApiClientError("invalid_response", response.status);
    }
    return { apiVersion: "v1", datasetVersion: payload.datasetVersion, data: payload.data as T };
  }

  private errorCode(status: number): LocationApiClientErrorCode {
    if (status === 401 || status === 403) return "unauthorized";
    if (status === 404) return "not_found";
    if (status === 400 || status === 413 || status === 422) return "invalid_request";
    return "api_error";
  }
}
