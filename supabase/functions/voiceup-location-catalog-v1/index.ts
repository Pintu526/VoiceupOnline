import type {
  CanonicalLocationNode,
  LocationLevel,
  LocationResolutionRequest,
  LocationResolutionResult
} from "../../../src/businessOs/geography/LocationApiTypes.ts";
import {
  LocationApiClient,
  type LocationApiClientResponse,
  type LocationApiMetadata,
  type LocationApiNodeList
} from "../../../src/businessOs/location/server/LocationApiClient.ts";
import {
  LOCATION_BROWSER_CATALOG_ACTION,
  LOCATION_BROWSER_CATALOG_MAX_RESULTS,
  type LocationBrowserAccessContext,
  type LocationBrowserCanonicalNode,
  type LocationBrowserCatalogQuery,
  type LocationBrowserDatasetIdentity,
  type LocationBrowserResolution
} from "../../../src/businessOs/location/browser/LocationBrowserCatalogContract.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const APPLICATION_KEY = "voiceup";
const RESOURCE_TYPE = "campaign";
const levels = new Set<LocationLevel>(["country", "state", "district", "block", "local_body", "village", "ward"]);

interface CatalogAdminClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

interface CatalogLocationClient {
  metadata(): Promise<LocationApiClientResponse<LocationApiMetadata>>;
  getNode(nodeId: string): Promise<LocationApiClientResponse<CanonicalLocationNode>>;
  getChildren(nodeId: string): Promise<LocationApiClientResponse<LocationApiNodeList>>;
  resolve(request: LocationResolutionRequest): Promise<LocationApiClientResponse<LocationResolutionResult>>;
  search(request: LocationResolutionRequest): Promise<LocationApiClientResponse<LocationResolutionResult>>;
}

export interface LocationBrowserCatalogEndpointDependencies {
  allowedOrigins: ReadonlySet<string>;
  getUser(request: Request): Promise<{ id: string } | null>;
  createAdminClient(): CatalogAdminClient;
  authorizeWorkspace(admin: CatalogAdminClient, userId: string, workspaceId: string): Promise<boolean>;
  resolvePublishedCampaign(admin: CatalogAdminClient, campaignSlug: string): Promise<boolean>;
  createLocationClient(): CatalogLocationClient;
}

interface ParsedCatalogRequest {
  access: LocationBrowserAccessContext;
  query: LocationBrowserCatalogQuery;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function cleanString(value: unknown, maximum = 200): string | null {
  if (typeof value !== "string") return null;
  const result = value.normalize("NFKC").replace(/[\t\n\r\f\v]/gu, " ").trim().replace(/\s+/gu, " ");
  return result && result.length <= maximum ? result : null;
}

function resultLimit(value: unknown): number | null {
  if (value === undefined) return LOCATION_BROWSER_CATALOG_MAX_RESULTS;
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= LOCATION_BROWSER_CATALOG_MAX_RESULTS
    ? Number(value)
    : null;
}

function parseAccess(value: unknown): LocationBrowserAccessContext | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "workspace" && hasOnlyKeys(value, ["type", "workspaceId"])) {
    const workspaceId = cleanString(value.workspaceId, 120);
    return workspaceId ? { type: "workspace", workspaceId } : null;
  }
  if (value.type === "campaign" && hasOnlyKeys(value, ["type", "workspaceId", "campaignId", "campaignSlug"])) {
    const workspaceId = cleanString(value.workspaceId, 120);
    const campaignId = cleanString(value.campaignId, 120);
    const campaignSlug = cleanString(value.campaignSlug, 120);
    return workspaceId && campaignId && campaignSlug
      ? { type: "campaign", workspaceId, campaignId, campaignSlug }
      : null;
  }
  if (value.type === "public_campaign" && hasOnlyKeys(value, ["type", "campaignSlug"])) {
    const campaignSlug = cleanString(value.campaignSlug, 120);
    return campaignSlug ? { type: "public_campaign", campaignSlug } : null;
  }
  return null;
}

function parseResolutionQuery(value: Record<string, unknown>, operation: "resolve" | "search"): LocationBrowserCatalogQuery | null {
  if (!hasOnlyKeys(value, ["operation", "nodeId", "officialCode", "normalizedName", "expectedLevel", "parentNodeId", "resultLimit"])) return null;
  const nodeId = value.nodeId === undefined ? undefined : cleanString(value.nodeId);
  const officialCode = value.officialCode === undefined ? undefined : cleanString(value.officialCode, 80);
  const normalizedName = value.normalizedName === undefined ? undefined : cleanString(value.normalizedName);
  const parentNodeId = value.parentNodeId === undefined ? undefined : cleanString(value.parentNodeId);
  const expectedLevel = value.expectedLevel === undefined
    ? undefined
    : typeof value.expectedLevel === "string" && levels.has(value.expectedLevel as LocationLevel)
      ? value.expectedLevel as LocationLevel
      : null;
  const limit = resultLimit(value.resultLimit);
  if (nodeId === null || officialCode === null || normalizedName === null || parentNodeId === null || expectedLevel === null || limit === null) return null;
  if (!nodeId && !officialCode && !normalizedName) return null;
  if (operation === "search" && (!normalizedName || (!expectedLevel && !parentNodeId))) return null;
  return {
    operation,
    ...(nodeId ? { nodeId } : {}),
    ...(officialCode ? { officialCode } : {}),
    ...(normalizedName ? { normalizedName } : {}),
    ...(expectedLevel ? { expectedLevel } : {}),
    ...(parentNodeId ? { parentNodeId } : {}),
    resultLimit: limit
  };
}

function parseQuery(value: unknown): LocationBrowserCatalogQuery | null {
  if (!isRecord(value) || typeof value.operation !== "string") return null;
  if (value.operation === "metadata") {
    return hasOnlyKeys(value, ["operation"]) ? { operation: "metadata" } : null;
  }
  if (value.operation === "node") {
    const nodeId = cleanString(value.nodeId);
    return hasOnlyKeys(value, ["operation", "nodeId"]) && nodeId ? { operation: "node", nodeId } : null;
  }
  if (value.operation === "children") {
    const parentNodeId = cleanString(value.parentNodeId);
    const limit = resultLimit(value.resultLimit);
    return hasOnlyKeys(value, ["operation", "parentNodeId", "resultLimit"]) && parentNodeId && limit !== null
      ? { operation: "children", parentNodeId, resultLimit: limit }
      : null;
  }
  if (value.operation === "resolve" || value.operation === "search") {
    return parseResolutionQuery(value, value.operation);
  }
  return null;
}

function parseRequest(value: unknown): ParsedCatalogRequest | null {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["action", "access", "query"])
    || value.action !== LOCATION_BROWSER_CATALOG_ACTION) return null;
  const access = parseAccess(value.access);
  const query = parseQuery(value.query);
  return access && query ? { access, query } : null;
}

function responseHeaders(origin: string | null, allowedOrigins: ReadonlySet<string>): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Vary": "Origin" };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return headers;
}

function rawJson(encoded: string, status: number, origin: string | null, allowedOrigins: ReadonlySet<string>): Response {
  return new Response(encoded, { status, headers: responseHeaders(origin, allowedOrigins) });
}

function failure(code: string, status: number, origin: string | null, allowedOrigins: ReadonlySet<string>): Response {
  return rawJson(JSON.stringify({ error: code }), status, origin, allowedOrigins);
}

function success(data: unknown, dataset: LocationBrowserDatasetIdentity, origin: string | null, allowedOrigins: ReadonlySet<string>): Response {
  const encoded = JSON.stringify({ apiVersion: "v1", readOnly: true, dataset, data });
  if (new TextEncoder().encode(encoded).byteLength > MAX_RESPONSE_BYTES) {
    return failure("response_too_large", 502, origin, allowedOrigins);
  }
  return rawJson(encoded, 200, origin, allowedOrigins);
}

function sameDataset(first: LocationBrowserDatasetIdentity, second: LocationBrowserDatasetIdentity): boolean {
  return first.authority === second.authority
    && first.sourceDataset === second.sourceDataset
    && first.datasetVersion === second.datasetVersion;
}

function datasetFromMetadata(response: LocationApiClientResponse<LocationApiMetadata>): LocationBrowserDatasetIdentity | null {
  const source = response.data?.source;
  if (response.apiVersion !== "v1"
    || response.data?.namespace !== "/v1"
    || response.data?.readOnly !== true
    || !cleanString(source?.authority)
    || !cleanString(source?.sourceDataset)
    || !cleanString(source?.sourceDatasetVersion)
    || response.datasetVersion !== response.data.datasetVersion
    || response.datasetVersion !== source.sourceDatasetVersion) return null;
  return {
    authority: source.authority,
    sourceDataset: source.sourceDataset,
    datasetVersion: response.datasetVersion
  };
}

function sanitizeNode(value: CanonicalLocationNode, dataset: LocationBrowserDatasetIdentity): LocationBrowserCanonicalNode | null {
  if (!value
    || !cleanString(value.nodeId)
    || !(typeof value.officialCode === "string" || value.officialCode === null)
    || !cleanString(value.displayName)
    || !levels.has(value.level)
    || !cleanString(value.entityKind)
    || value.datasetVersion !== dataset.datasetVersion
    || !sameDataset({
      authority: value.source?.authority,
      sourceDataset: value.source?.sourceDataset,
      datasetVersion: value.source?.sourceDatasetVersion
    }, dataset)
    || !Array.isArray(value.parents)
    || !Array.isArray(value.lineage)) return null;

  const parents = value.parents.flatMap((parent) => {
    const parentDataset = {
      authority: parent.source?.authority,
      sourceDataset: parent.source?.sourceDataset,
      datasetVersion: parent.source?.sourceDatasetVersion
    };
    if (!cleanString(parent.nodeId)
      || !(typeof parent.officialCode === "string" || parent.officialCode === null)
      || !levels.has(parent.level)
      || !["administrative_parent", "official_containment"].includes(parent.relationship)
      || !sameDataset(parentDataset, dataset)) return [];
    return [{
      nodeId: parent.nodeId,
      officialCode: parent.officialCode,
      level: parent.level,
      relationship: parent.relationship,
      source: dataset
    }];
  });
  if (parents.length !== value.parents.length) return null;

  const lineage = value.lineage.flatMap((entry) =>
    cleanString(entry.nodeId)
      && (typeof entry.officialCode === "string" || entry.officialCode === null)
      && levels.has(entry.level)
      ? [{ nodeId: entry.nodeId, officialCode: entry.officialCode, level: entry.level }]
      : []
  );
  if (lineage.length !== value.lineage.length) return null;

  return {
    nodeId: value.nodeId,
    officialCode: value.officialCode,
    label: value.displayName,
    level: value.level,
    entityKind: value.entityKind,
    parents,
    lineage,
    ...dataset
  };
}

function sanitizeResolution(
  resolution: LocationResolutionResult,
  dataset: LocationBrowserDatasetIdentity,
  limit: number
): LocationBrowserResolution | null {
  const reason = "reason" in resolution ? cleanString(resolution.reason, 500) : null;
  if (resolution.status === "resolved") {
    const node = sanitizeNode(resolution.node, dataset);
    return node ? { status: "resolved", node } : null;
  }
  if (resolution.status === "ambiguous") {
    const candidates = resolution.candidates.slice(0, limit).map((node) => sanitizeNode(node, dataset));
    return reason && candidates.every(Boolean)
      ? { status: "ambiguous", candidates: candidates as LocationBrowserCanonicalNode[], reason }
      : null;
  }
  if (resolution.status === "unresolved") {
    const suggestions = resolution.suggestions?.slice(0, limit).map((node) => sanitizeNode(node, dataset));
    return reason && (!suggestions || suggestions.every(Boolean))
      ? { status: "unresolved", reason, ...(suggestions ? { suggestions: suggestions as LocationBrowserCanonicalNode[] } : {}) }
      : null;
  }
  return resolution.status === "invalid" && reason ? { status: "invalid", reason } : null;
}

async function authorizeAccess(
  request: Request,
  access: LocationBrowserAccessContext,
  dependencies: LocationBrowserCatalogEndpointDependencies
): Promise<"authorized" | "unauthorized" | "forbidden" | "not_found" | "unavailable"> {
  let admin: CatalogAdminClient;
  try {
    admin = dependencies.createAdminClient();
  } catch {
    return "unavailable";
  }
  if (access.type === "public_campaign") {
    try {
      return await dependencies.resolvePublishedCampaign(admin, access.campaignSlug) ? "authorized" : "not_found";
    } catch {
      return "unavailable";
    }
  }

  let user: { id: string } | null;
  try {
    user = await dependencies.getUser(request);
  } catch {
    return "unavailable";
  }
  if (!user?.id) return "unauthorized";

  if (access.type === "workspace") {
    try {
      return await dependencies.authorizeWorkspace(admin, user.id, access.workspaceId) ? "authorized" : "forbidden";
    } catch {
      return "unavailable";
    }
  }

  try {
    const authorization = await admin.rpc("vboss_resource_location_authorization", {
      p_actor_user_id: user.id,
      p_workspace_id: access.workspaceId,
      p_application_key: APPLICATION_KEY,
      p_resource_type: RESOURCE_TYPE,
      p_resource_id: access.campaignId,
      p_resource_slug: access.campaignSlug
    });
    if (authorization.error) return "unavailable";
    return authorization.data === "authorized" ? "authorized" : "forbidden";
  } catch {
    return "unavailable";
  }
}

async function executeQuery(client: CatalogLocationClient, query: LocationBrowserCatalogQuery) {
  const metadataResponse = await client.metadata();
  const dataset = datasetFromMetadata(metadataResponse);
  if (!dataset) return null;
  if (query.operation === "metadata") {
    return { dataset, data: { namespace: "/v1", readOnly: true } };
  }
  if (query.operation === "node") {
    const response = await client.getNode(query.nodeId);
    if (response.datasetVersion !== dataset.datasetVersion) return null;
    const node = sanitizeNode(response.data, dataset);
    return node ? { dataset, data: { node } } : null;
  }
  if (query.operation === "children") {
    const response = await client.getChildren(query.parentNodeId);
    if (response.datasetVersion !== dataset.datasetVersion || response.data.nodeId !== query.parentNodeId) return null;
    const nodes = response.data.nodes.slice(0, query.resultLimit).map((node) => sanitizeNode(node, dataset));
    return nodes.every(Boolean)
      ? { dataset, data: { parentNodeId: query.parentNodeId, nodes: nodes as LocationBrowserCanonicalNode[] } }
      : null;
  }

  const locationRequest: LocationResolutionRequest = {
    ...(query.nodeId ? { nodeId: query.nodeId } : {}),
    ...(query.officialCode ? { officialCode: query.officialCode } : {}),
    ...(query.normalizedName ? { normalizedName: query.normalizedName } : {}),
    ...(query.expectedLevel ? { expectedLevel: query.expectedLevel } : {}),
    ...(query.parentNodeId ? { parentNodeId: query.parentNodeId } : {}),
    sourceDataset: dataset.sourceDataset,
    datasetVersion: dataset.datasetVersion
  };
  const response = query.operation === "resolve"
    ? await client.resolve(locationRequest)
    : await client.search(locationRequest);
  if (response.datasetVersion !== dataset.datasetVersion) return null;
  const resolution = sanitizeResolution(response.data, dataset, query.resultLimit);
  return resolution ? { dataset, data: { resolution } } : null;
}

export function createLocationBrowserCatalogHandler(dependencies: LocationBrowserCatalogEndpointDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      return failure("cors_forbidden", 403, origin, dependencies.allowedOrigins);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(origin, dependencies.allowedOrigins) });
    }
    if (request.method !== "POST") return failure("invalid_request", 400, origin, dependencies.allowedOrigins);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return failure("request_too_large", 413, origin, dependencies.allowedOrigins);
    }
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return failure("invalid_request", 400, origin, dependencies.allowedOrigins);
    }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return failure("request_too_large", 413, origin, dependencies.allowedOrigins);
    }

    let parsed: ParsedCatalogRequest | null;
    try {
      parsed = parseRequest(JSON.parse(rawBody));
    } catch {
      parsed = null;
    }
    if (!parsed) return failure("invalid_request", 400, origin, dependencies.allowedOrigins);

    const authorization = await authorizeAccess(request, parsed.access, dependencies);
    if (authorization !== "authorized") {
      const status = authorization === "unauthorized" ? 401
        : authorization === "not_found" ? 404
          : authorization === "unavailable" ? 503
            : 403;
      return failure(authorization === "unavailable" ? "authorization_unavailable" : authorization, status, origin, dependencies.allowedOrigins);
    }

    try {
      const result = await executeQuery(dependencies.createLocationClient(), parsed.query);
      return result
        ? success(result.data, result.dataset, origin, dependencies.allowedOrigins)
        : failure("mixed_or_invalid_canonical_response", 503, origin, dependencies.allowedOrigins);
    } catch {
      return failure("location_api_unavailable", 503, origin, dependencies.allowedOrigins);
    }
  };
}

function serverLocationClient(): LocationApiClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const gatewayBearerToken = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const apiKey = Deno.env.get("LOCATION_API_KEY")?.trim();
  if (!supabaseUrl || !gatewayBearerToken || !apiKey) throw new Error("Server configuration is unavailable.");
  return new LocationApiClient({
    baseUrl: `${supabaseUrl.replace(/\/+$/u, "")}/functions/v1/location-api-v1`,
    apiKey,
    gatewayBearerToken
  });
}

if (typeof Deno !== "undefined") {
  const allowedOrigins = new Set(
    (Deno.env.get("LOCATION_BROWSER_CATALOG_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  Deno.serve(async (request) => {
    try {
      const [shared, publicCampaign] = await Promise.all([
        import("../_shared/voiceup.ts"),
        import("../_shared/publicCampaignIndex.ts")
      ]);
      return await createLocationBrowserCatalogHandler({
        allowedOrigins,
        getUser: shared.getUser,
        createAdminClient: shared.createAdminClient as () => CatalogAdminClient,
        authorizeWorkspace: async (admin, userId, workspaceId) => {
          const [platformAdmin, role] = await Promise.all([
            shared.isPlatformAdmin(admin as never, userId),
            shared.getWorkspaceRole(admin as never, workspaceId, userId)
          ]);
          return platformAdmin || Boolean(role);
        },
        resolvePublishedCampaign: async (admin, campaignSlug) =>
          (await publicCampaign.fetchCanonicalPublishedCampaignBySlug(admin as never, campaignSlug)).ok,
        createLocationClient: serverLocationClient
      })(request);
    } catch {
      return failure("server_error", 503, request.headers.get("origin"), allowedOrigins);
    }
  });
}
