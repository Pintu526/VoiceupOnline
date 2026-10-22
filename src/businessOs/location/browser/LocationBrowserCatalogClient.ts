import {
  LOCATION_BROWSER_CATALOG_ACTION,
  LOCATION_BROWSER_CATALOG_MAX_RESULTS,
  type LocationBrowserAccessContext,
  type LocationBrowserCanonicalNode,
  type LocationBrowserCatalogQuery,
  type LocationBrowserCatalogRequest,
  type LocationBrowserCatalogResponse,
  type LocationBrowserChildrenData,
  type LocationBrowserDatasetIdentity,
  type LocationBrowserMetadataData,
  type LocationBrowserNodeData,
  type LocationBrowserResolution,
  type LocationBrowserResolutionData
} from "./LocationBrowserCatalogContract.ts";

export type LocationBrowserCatalogClientErrorCode =
  | "invalid_request"
  | "invalid_response"
  | "mixed_dataset"
  | "transport_error";

export class LocationBrowserCatalogClientError extends Error {
  readonly code: LocationBrowserCatalogClientErrorCode;

  constructor(code: LocationBrowserCatalogClientErrorCode) {
    super(`Canonical browser location request failed (${code}).`);
    this.name = "LocationBrowserCatalogClientError";
    this.code = code;
  }
}

export type LocationBrowserCatalogTransport = (
  request: LocationBrowserCatalogRequest
) => Promise<unknown>;

export interface LocationBrowserCatalogClientOptions {
  access: LocationBrowserAccessContext;
  transport: LocationBrowserCatalogTransport;
  /** Metadata is refreshed after this interval. Defaults to 60 seconds. */
  metadataTtlMs?: number;
  /** Per-request deadline. Defaults to 15 seconds and is capped at 60 seconds. */
  requestTimeoutMs?: number;
  now?: () => number;
}

type LocationBrowserResolutionQuery = Omit<
  Extract<LocationBrowserCatalogQuery, { operation: "resolve" | "search" }>,
  "operation"
>;

const DEFAULT_METADATA_TTL_MS = 60_000;
const MAX_METADATA_TTL_MS = 5 * 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const locationLevels = new Set(["country", "state", "district", "block", "local_body", "village", "ward"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function requireText(value: string): string {
  const result = value.trim();
  if (!result || result.length > 200) throw new LocationBrowserCatalogClientError("invalid_request");
  return result;
}

function boundedResultLimit(value: number | undefined): number {
  if (value === undefined) return LOCATION_BROWSER_CATALOG_MAX_RESULTS;
  if (!Number.isInteger(value) || value < 1 || value > LOCATION_BROWSER_CATALOG_MAX_RESULTS) {
    throw new LocationBrowserCatalogClientError("invalid_request");
  }
  return value;
}

function parseDataset(value: unknown): LocationBrowserDatasetIdentity {
  if (!isRecord(value)
    || !isNonEmptyString(value.authority)
    || !isNonEmptyString(value.sourceDataset)
    || !isNonEmptyString(value.datasetVersion)) {
    throw new LocationBrowserCatalogClientError("invalid_response");
  }
  return {
    authority: value.authority,
    sourceDataset: value.sourceDataset,
    datasetVersion: value.datasetVersion
  };
}

function sameDataset(first: LocationBrowserDatasetIdentity, second: LocationBrowserDatasetIdentity): boolean {
  return first.authority === second.authority
    && first.sourceDataset === second.sourceDataset
    && first.datasetVersion === second.datasetVersion;
}

function validateNode(value: unknown, dataset: LocationBrowserDatasetIdentity): LocationBrowserCanonicalNode {
  if (!isRecord(value)
    || !isNonEmptyString(value.nodeId)
    || !(typeof value.officialCode === "string" || value.officialCode === null)
    || !isNonEmptyString(value.label)
    || !isNonEmptyString(value.level)
    || !locationLevels.has(value.level)
    || !isNonEmptyString(value.entityKind)
    || !Array.isArray(value.parents)
    || !Array.isArray(value.lineage)) {
    throw new LocationBrowserCatalogClientError("invalid_response");
  }
  const nodeDataset = parseDataset(value);
  if (!sameDataset(nodeDataset, dataset)) throw new LocationBrowserCatalogClientError("mixed_dataset");
  return value as unknown as LocationBrowserCanonicalNode;
}

function validateResponse<T>(value: unknown): LocationBrowserCatalogResponse<T> {
  if (!isRecord(value) || value.apiVersion !== "v1" || value.readOnly !== true || !("data" in value)) {
    throw new LocationBrowserCatalogClientError("invalid_response");
  }
  return {
    apiVersion: "v1",
    readOnly: true,
    dataset: parseDataset(value.dataset),
    data: value.data as T
  };
}

function boundedMetadataTtl(value: number | undefined): number {
  if (value === undefined) return DEFAULT_METADATA_TTL_MS;
  if (!Number.isFinite(value) || value < 0) throw new LocationBrowserCatalogClientError("invalid_request");
  return Math.min(MAX_METADATA_TTL_MS, Math.floor(value));
}

function boundedRequestTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(value) || value < 1) throw new LocationBrowserCatalogClientError("invalid_request");
  return Math.min(MAX_REQUEST_TIMEOUT_MS, Math.floor(value));
}

export class LocationBrowserCatalogClient {
  private readonly access: LocationBrowserAccessContext;
  private readonly transport: LocationBrowserCatalogTransport;
  private readonly metadataTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly now: () => number;
  private activeDataset: LocationBrowserDatasetIdentity | null = null;
  private metadataLoadedAt = 0;
  private readonly childrenCache = new Map<string, readonly LocationBrowserCanonicalNode[]>();

  constructor(options: LocationBrowserCatalogClientOptions) {
    if (typeof options.transport !== "function") throw new LocationBrowserCatalogClientError("invalid_request");
    this.access = options.access;
    this.transport = options.transport;
    this.metadataTtlMs = boundedMetadataTtl(options.metadataTtlMs);
    this.requestTimeoutMs = boundedRequestTimeout(options.requestTimeoutMs);
    this.now = options.now ?? Date.now;
  }

  async metadata(): Promise<LocationBrowserDatasetIdentity> {
    const response = await this.send<LocationBrowserMetadataData>({ operation: "metadata" }, false);
    if (!isRecord(response.data) || response.data.namespace !== "/v1" || response.data.readOnly !== true) {
      throw new LocationBrowserCatalogClientError("invalid_response");
    }
    if (this.activeDataset && !sameDataset(this.activeDataset, response.dataset)) this.childrenCache.clear();
    this.activeDataset = response.dataset;
    this.metadataLoadedAt = this.now();
    return { ...response.dataset };
  }

  async node(nodeId: string): Promise<LocationBrowserCanonicalNode> {
    const dataset = await this.ensureMetadata();
    const response = await this.send<LocationBrowserNodeData>({ operation: "node", nodeId: requireText(nodeId) });
    this.assertResponseDataset(response.dataset, dataset);
    if (!isRecord(response.data) || !("node" in response.data)) {
      throw new LocationBrowserCatalogClientError("invalid_response");
    }
    return validateNode(response.data.node, dataset);
  }

  async children(parentNodeId: string, resultLimit?: number): Promise<readonly LocationBrowserCanonicalNode[]> {
    const normalizedParentNodeId = requireText(parentNodeId);
    const limit = boundedResultLimit(resultLimit);
    const dataset = await this.ensureMetadata();
    const cacheKey = [dataset.authority, dataset.sourceDataset, dataset.datasetVersion, normalizedParentNodeId, limit].join("\u0000");
    const cached = this.childrenCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.send<LocationBrowserChildrenData>({
      operation: "children",
      parentNodeId: normalizedParentNodeId,
      resultLimit: limit
    });
    this.assertResponseDataset(response.dataset, dataset);
    if (!isRecord(response.data)
      || response.data.parentNodeId !== normalizedParentNodeId
      || !Array.isArray(response.data.nodes)
      || response.data.nodes.length > limit) {
      throw new LocationBrowserCatalogClientError("invalid_response");
    }
    const nodes = Object.freeze(response.data.nodes.map((node) => validateNode(node, dataset)));
    this.childrenCache.set(cacheKey, nodes);
    return nodes;
  }

  resolve(query: LocationBrowserResolutionQuery): Promise<LocationBrowserResolution> {
    return this.resolveOperation("resolve", query);
  }

  search(query: LocationBrowserResolutionQuery): Promise<LocationBrowserResolution> {
    return this.resolveOperation("search", query);
  }

  clearCache(): void {
    this.childrenCache.clear();
  }

  private async resolveOperation(
    operation: "resolve" | "search",
    query: LocationBrowserResolutionQuery
  ): Promise<LocationBrowserResolution> {
    const resultLimit = boundedResultLimit(query.resultLimit);
    const request = {
      operation,
      ...(query.nodeId ? { nodeId: requireText(query.nodeId) } : {}),
      ...(query.officialCode ? { officialCode: requireText(query.officialCode) } : {}),
      ...(query.normalizedName ? { normalizedName: requireText(query.normalizedName) } : {}),
      ...(query.expectedLevel ? { expectedLevel: query.expectedLevel } : {}),
      ...(query.parentNodeId ? { parentNodeId: requireText(query.parentNodeId) } : {}),
      resultLimit
    } as Extract<LocationBrowserCatalogQuery, { operation: "resolve" | "search" }>;
    if (!request.nodeId && !request.officialCode && !request.normalizedName) {
      throw new LocationBrowserCatalogClientError("invalid_request");
    }
    const dataset = await this.ensureMetadata();
    const response = await this.send<LocationBrowserResolutionData>(request);
    this.assertResponseDataset(response.dataset, dataset);
    if (!isRecord(response.data) || !isRecord(response.data.resolution)) {
      throw new LocationBrowserCatalogClientError("invalid_response");
    }
    const resolution = response.data.resolution;
    if (resolution.status === "resolved") {
      return { status: "resolved", node: validateNode(resolution.node, dataset) };
    }
    if (resolution.status === "ambiguous") {
      if (!Array.isArray(resolution.candidates) || resolution.candidates.length > resultLimit || typeof resolution.reason !== "string") {
        throw new LocationBrowserCatalogClientError("invalid_response");
      }
      return { status: "ambiguous", candidates: resolution.candidates.map((node) => validateNode(node, dataset)), reason: resolution.reason };
    }
    if (resolution.status === "unresolved") {
      if (typeof resolution.reason !== "string" || (resolution.suggestions !== undefined && !Array.isArray(resolution.suggestions))) {
        throw new LocationBrowserCatalogClientError("invalid_response");
      }
      const suggestions = resolution.suggestions?.map((node) => validateNode(node, dataset));
      if (suggestions && suggestions.length > resultLimit) throw new LocationBrowserCatalogClientError("invalid_response");
      return { status: "unresolved", reason: resolution.reason, ...(suggestions ? { suggestions } : {}) };
    }
    if (resolution.status === "invalid" && typeof resolution.reason === "string") {
      return { status: "invalid", reason: resolution.reason };
    }
    throw new LocationBrowserCatalogClientError("invalid_response");
  }

  private async ensureMetadata(): Promise<LocationBrowserDatasetIdentity> {
    if (!this.activeDataset || this.now() - this.metadataLoadedAt >= this.metadataTtlMs) {
      return await this.metadata();
    }
    return this.activeDataset;
  }

  private assertResponseDataset(
    responseDataset: LocationBrowserDatasetIdentity,
    expectedDataset: LocationBrowserDatasetIdentity
  ): void {
    if (!sameDataset(responseDataset, expectedDataset)) {
      this.childrenCache.clear();
      throw new LocationBrowserCatalogClientError("mixed_dataset");
    }
  }

  private async send<T>(
    query: LocationBrowserCatalogQuery,
    compareWithActiveDataset = true
  ): Promise<LocationBrowserCatalogResponse<T>> {
    let payload: unknown;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      payload = await Promise.race([
        this.transport({ action: LOCATION_BROWSER_CATALOG_ACTION, access: this.access, query }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new LocationBrowserCatalogClientError("transport_error")),
            this.requestTimeoutMs
          );
        })
      ]);
    } catch {
      throw new LocationBrowserCatalogClientError("transport_error");
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const response = validateResponse<T>(payload);
    if (compareWithActiveDataset && this.activeDataset && !sameDataset(response.dataset, this.activeDataset)) {
      this.childrenCache.clear();
      throw new LocationBrowserCatalogClientError("mixed_dataset");
    }
    return response;
  }
}
