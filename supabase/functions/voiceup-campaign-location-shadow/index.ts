import {
  CampaignLocationPlatformAdapter,
  type CampaignLocationAdapterResolution,
  type CampaignLocationShadowResult,
  type LegacyCampaignLocationObservation
} from "../../../src/businessOs/location/server/CampaignLocationPlatformAdapter.ts";
import { LocationApiClient } from "../../../src/businessOs/location/server/LocationApiClient.ts";
import type { LocationLevel } from "../../../src/businessOs/geography/LocationApiTypes.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

const MAX_REQUEST_BYTES = 16 * 1024;
const APPLICATION_KEY = "voiceup";
const RESOURCE_TYPE = "campaign";
const ACTION = "read_campaign_location_shadow";
const ALLOWED_FIELDS = ["country", "state", "district", "block", "panchayat"] as const;

type CampaignField = (typeof ALLOWED_FIELDS)[number];

const FIELD_LEVEL: Partial<Record<CampaignField, LocationLevel>> = {
  country: "country",
  state: "state",
  district: "district"
};

interface CampaignRecord extends Record<string, unknown> {
  id?: unknown;
  slug?: unknown;
  country?: unknown;
  state?: unknown;
  district?: unknown;
  block?: unknown;
  panchayat?: unknown;
}

interface CampaignShadowAdminClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { data?: unknown } | null; error: unknown }>;
      };
    };
  };
}

interface CampaignShadowAdapter {
  metadata(): Promise<{ datasetVersion: string }>;
  resolve(request: {
    normalizedName: string;
    expectedLevel?: LocationLevel;
    parentNodeId?: string;
  }): Promise<CampaignLocationAdapterResolution>;
  compareShadow(input: {
    legacy?: LegacyCampaignLocationObservation;
    canonical?: CampaignLocationAdapterResolution["reference"];
    canonicalOutcome?: "ambiguous" | "unresolved";
  }): CampaignLocationShadowResult;
}

export interface CampaignLocationShadowDependencies {
  allowedOrigins: ReadonlySet<string>;
  getUser(request: Request): Promise<{ id: string } | null>;
  createAdminClient(): CampaignShadowAdminClient;
  createAdapter(): CampaignShadowAdapter;
}

interface CampaignShadowScope {
  workspaceId: string;
  campaignId: string;
  campaignSlug: string;
  field: CampaignField;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function cleanString(value: unknown, maximum = 120): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/[\t\n\r\f\v]/gu, " ").trim().replace(/\s+/gu, " ");
  return cleaned && cleaned.length <= maximum ? cleaned : null;
}

function normalized(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function responseHeaders(origin: string | null, allowedOrigins: ReadonlySet<string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  allowedOrigins: ReadonlySet<string>
): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin, allowedOrigins) });
}

function failure(
  code: string,
  status: number,
  origin: string | null,
  allowedOrigins: ReadonlySet<string>
): Response {
  return json({ error: code }, status, origin, allowedOrigins);
}

function parseScope(value: unknown): CampaignShadowScope | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["action", "workspaceId", "campaignId", "campaignSlug", "subject"])) return null;
  if (value.action !== ACTION || !isRecord(value.subject) || !hasOnlyKeys(value.subject, ["type", "field"])) return null;
  if (value.subject.type !== "campaign_field" || !ALLOWED_FIELDS.includes(value.subject.field as CampaignField)) return null;
  const workspaceId = cleanString(value.workspaceId);
  const campaignId = cleanString(value.campaignId);
  const campaignSlug = cleanString(value.campaignSlug);
  if (!workspaceId || !campaignId || !campaignSlug) return null;
  return { workspaceId, campaignId, campaignSlug, field: value.subject.field as CampaignField };
}

function campaignsFromWorkspace(value: unknown): CampaignRecord[] {
  if (!isRecord(value) || !Array.isArray(value.campaigns)) return [];
  return value.campaigns.filter(isRecord) as CampaignRecord[];
}

function findAuthorizedCampaign(workspace: unknown, scope: CampaignShadowScope): CampaignRecord | null {
  return campaignsFromWorkspace(workspace).find((campaign) =>
    campaign.id === scope.campaignId && normalized(campaign.slug) === normalized(scope.campaignSlug)
  ) ?? null;
}

function comparisonForResolution(
  adapter: CampaignShadowAdapter,
  legacy: LegacyCampaignLocationObservation,
  resolution: CampaignLocationAdapterResolution
): CampaignLocationShadowResult {
  if (resolution.status === "resolved") return adapter.compareShadow({ legacy, canonical: resolution.reference });
  if (resolution.status === "ambiguous") return adapter.compareShadow({ legacy, canonicalOutcome: "ambiguous" });
  return adapter.compareShadow({ legacy, canonicalOutcome: "unresolved" });
}

function blockedResolution(
  field: CampaignField,
  resolution: CampaignLocationAdapterResolution
): CampaignLocationAdapterResolution & { blockedByParent: { field: CampaignField; status: CampaignLocationAdapterResolution["status"] } } {
  return {
    ...resolution,
    reason: `Required parent field '${field}' did not resolve uniquely.`,
    blockedByParent: { field, status: resolution.status }
  };
}

async function resolveSubject(
  campaign: CampaignRecord,
  field: CampaignField,
  adapter: CampaignShadowAdapter
): Promise<{ resolution: CampaignLocationAdapterResolution; comparison: CampaignLocationShadowResult }> {
  const targetLabel = cleanString(campaign[field]);
  const legacy: LegacyCampaignLocationObservation = {
    label: targetLabel ?? "",
    ...(FIELD_LEVEL[field] ? { level: FIELD_LEVEL[field] } : {}),
    kind: "legacy_official"
  };
  const targetIndex = ALLOWED_FIELDS.indexOf(field);
  let parentNodeId: string | undefined;

  for (let index = 0; index < targetIndex; index += 1) {
    const parentField = ALLOWED_FIELDS[index];
    const parentLabel = cleanString(campaign[parentField]);
    if (!parentLabel) {
      if (parentField === "country") continue;
      const resolution: CampaignLocationAdapterResolution = {
        status: "unresolved",
        reason: `Required parent field '${parentField}' is empty.`
      };
      return { resolution: blockedResolution(parentField, resolution), comparison: adapter.compareShadow({ legacy, canonicalOutcome: "unresolved" }) };
    }
    const parentResolution = await adapter.resolve({
      normalizedName: parentLabel,
      ...(FIELD_LEVEL[parentField] ? { expectedLevel: FIELD_LEVEL[parentField] } : {}),
      ...(parentNodeId ? { parentNodeId } : {})
    });
    if (parentResolution.status !== "resolved" || !parentResolution.reference) {
      return {
        resolution: blockedResolution(parentField, parentResolution),
        comparison: comparisonForResolution(adapter, legacy, parentResolution)
      };
    }
    parentNodeId = parentResolution.reference.canonicalNodeId;
  }

  const resolution = await adapter.resolve({
    normalizedName: targetLabel ?? "",
    ...(FIELD_LEVEL[field] ? { expectedLevel: FIELD_LEVEL[field] } : {}),
    ...(parentNodeId ? { parentNodeId } : {})
  });
  return { resolution, comparison: comparisonForResolution(adapter, legacy, resolution) };
}

export function createCampaignLocationShadowHandler(dependencies: CampaignLocationShadowDependencies) {
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
      return failure("invalid_request", 400, origin, dependencies.allowedOrigins);
    }
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return failure("invalid_request", 400, origin, dependencies.allowedOrigins);
    }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return failure("invalid_request", 400, origin, dependencies.allowedOrigins);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return failure("invalid_request", 400, origin, dependencies.allowedOrigins);
    }
    const scope = parseScope(body);
    if (!scope) return failure("invalid_request", 400, origin, dependencies.allowedOrigins);

    let user: { id: string } | null;
    try {
      user = await dependencies.getUser(request);
    } catch {
      return failure("server_error", 503, origin, dependencies.allowedOrigins);
    }
    if (!user?.id) return failure("unauthorized", 401, origin, dependencies.allowedOrigins);

    let admin: CampaignShadowAdminClient;
    try {
      admin = dependencies.createAdminClient();
    } catch {
      return failure("server_error", 503, origin, dependencies.allowedOrigins);
    }

    let authorization: { data: unknown; error: unknown };
    try {
      authorization = await admin.rpc("vboss_resource_location_authorization", {
        p_actor_user_id: user.id,
        p_workspace_id: scope.workspaceId,
        p_application_key: APPLICATION_KEY,
        p_resource_type: RESOURCE_TYPE,
        p_resource_id: scope.campaignId,
        p_resource_slug: scope.campaignSlug
      });
    } catch {
      return failure("authorization_unavailable", 503, origin, dependencies.allowedOrigins);
    }
    if (authorization.error) return failure("authorization_unavailable", 503, origin, dependencies.allowedOrigins);
    if (authorization.data !== "authorized") return failure("forbidden", 403, origin, dependencies.allowedOrigins);

    let campaignResult: { data: { data?: unknown } | null; error: unknown };
    try {
      campaignResult = await admin
        .from("voiceup_workspaces")
        .select("data")
        .eq("id", scope.workspaceId)
        .maybeSingle();
    } catch {
      return failure("campaign_subject_unavailable", 503, origin, dependencies.allowedOrigins);
    }
    if (campaignResult.error) return failure("campaign_subject_unavailable", 503, origin, dependencies.allowedOrigins);
    const campaign = findAuthorizedCampaign(campaignResult.data?.data, scope);
    if (!campaign) return failure("forbidden", 403, origin, dependencies.allowedOrigins);
    const legacyValue = cleanString(campaign[scope.field]);
    if (!legacyValue) return failure("campaign_subject_empty", 400, origin, dependencies.allowedOrigins);

    try {
      const adapter = dependencies.createAdapter();
      const metadata = await adapter.metadata();
      const shadow = await resolveSubject(campaign, scope.field, adapter);
      if (
        shadow.resolution.status === "resolved" &&
        shadow.resolution.reference?.dataset.datasetVersion !== metadata.datasetVersion
      ) {
        return failure("location_api_unavailable", 503, origin, dependencies.allowedOrigins);
      }
      return json({
        apiVersion: "v1",
        shadowOnly: true,
        authoritative: false,
        scope: {
          workspaceId: scope.workspaceId,
          campaignId: scope.campaignId,
          campaignSlug: scope.campaignSlug
        },
        subject: { type: "campaign_field", field: scope.field },
        datasetVersion: metadata.datasetVersion,
        resolution: shadow.resolution,
        comparison: shadow.comparison
      }, 200, origin, dependencies.allowedOrigins);
    } catch {
      return failure("location_api_unavailable", 503, origin, dependencies.allowedOrigins);
    }
  };
}

function serverAdapter(): CampaignLocationPlatformAdapter {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const gatewayBearerToken = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const apiKey = Deno.env.get("LOCATION_API_KEY")?.trim();
  if (!supabaseUrl || !gatewayBearerToken || !apiKey) throw new Error("Server configuration is unavailable.");
  return new CampaignLocationPlatformAdapter(new LocationApiClient({
    baseUrl: `${supabaseUrl.replace(/\/+$/u, "")}/functions/v1/location-api-v1`,
    apiKey,
    gatewayBearerToken
  }));
}

if (typeof Deno !== "undefined") {
  const allowedOrigins = new Set(
    (Deno.env.get("CAMPAIGN_LOCATION_SHADOW_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  Deno.serve(async (request) => {
    try {
      const shared = await import("../_shared/voiceup.ts");
      return await createCampaignLocationShadowHandler({
        allowedOrigins,
        getUser: shared.getUser,
        createAdminClient: shared.createAdminClient as () => CampaignShadowAdminClient,
        createAdapter: serverAdapter
      })(request);
    } catch {
      return failure("server_error", 503, request.headers.get("origin"), allowedOrigins);
    }
  });
}
