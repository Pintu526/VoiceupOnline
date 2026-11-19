import { PostgresCanonicalLocationRepository } from "../../../src/businessOs/geography/PostgresCanonicalLocationRepository.ts";
import { RepositoryLocationService } from "../../../src/businessOs/geography/RepositoryLocationService.ts";
import { RepositoryLocationApiV1 } from "../../../src/businessOs/geography/RepositoryLocationApiV1.ts";
import type { CanonicalLocationDatasetSelection } from "../../../src/businessOs/geography/CanonicalLocationRepository.ts";
import type { LocationApiV1Request } from "../../../src/businessOs/geography/LocationApiV1Contract.ts";
import { SupabasePostgresReadOnlyExecutor } from "./SupabasePostgresReadOnlyExecutor.ts";

const MAX_REQUEST_BYTES = 16 * 1024;
const ALLOWED_ORIGINS = new Set((Deno.env.get("LOCATION_API_ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean));

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Vary": "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, x-api-key, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function isAuthorized(req: Request): boolean {
  const configuredKey = Deno.env.get("LOCATION_API_KEY");
  if (!configuredKey) return false;
  return req.headers.get("x-api-key") === configuredKey || req.headers.get("authorization") === `Bearer ${configuredKey}`;
}

function datasetSelection(): CanonicalLocationDatasetSelection {
  if (Deno.env.get("LOCATION_API_ALLOW_STAGED_DATASET_TESTING") === "true") {
    const datasetId = Deno.env.get("LOCATION_API_STAGED_DATASET_ID");
    const datasetVersion = Deno.env.get("LOCATION_API_STAGED_DATASET_VERSION");
    if (!datasetId || !datasetVersion) throw new Error("Controlled staged dataset selection is incomplete.");
    return { mode: "staged_dataset", datasetId, datasetVersion };
  }
  return { mode: "active_release", scopeKey: Deno.env.get("LOCATION_API_ACTIVE_RELEASE_SCOPE_KEY") ?? "india:odisha" };
}

function createApi(): RepositoryLocationApiV1 {
  // Direct Postgres keeps the private `location` schema out of PostgREST.
  if (!Deno.env.get("SUPABASE_URL") || !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) throw new Error("Missing Supabase server credentials.");
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) throw new Error("Missing server-only Supabase database connection.");
  const repository = new PostgresCanonicalLocationRepository(new SupabasePostgresReadOnlyExecutor(databaseUrl), datasetSelection());
  return new RepositoryLocationApiV1(new RepositoryLocationService(repository));
}

function isLocationApiRequest(value: unknown): value is LocationApiV1Request {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = (value as { operation?: unknown }).operation;
  return typeof operation === "string" && ["metadata", "node", "officialCode", "children", "parents", "lineage", "search", "resolve", "validate", "descendant", "relationship"].includes(operation);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return origin && !ALLOWED_ORIGINS.has(origin)
      ? new Response("Forbidden", { status: 403, headers: corsHeaders(origin) })
      : new Response("ok", { status: 204, headers: corsHeaders(origin) });
  }
  if (!isAuthorized(req)) return json({ apiVersion: "v1", error: { code: "unauthorized", message: "A valid Location API credential is required." } }, 401, origin);
  if (req.method !== "POST") return json({ apiVersion: "v1", error: { code: "invalid_request", message: "POST is required." } }, 400, origin);
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return json({ apiVersion: "v1", error: { code: "invalid_request", message: "Request body exceeds the API limit." } }, 400, origin);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return json({ apiVersion: "v1", error: { code: "invalid_request", message: "Request body exceeds the API limit." } }, 400, origin);
    const body = JSON.parse(rawBody) as unknown;
    if (!isLocationApiRequest(body)) return json({ apiVersion: "v1", error: { code: "invalid_request", message: "A valid Location API v1 operation is required." } }, 400, origin);
    const response = await createApi().handle(body);
    return json(response.body, response.httpStatus, origin);
  } catch (error) {
    console.error("Location API request failed.", error);
    return json({ apiVersion: "v1", error: { code: "invalid_request", message: "Invalid Location API request." } }, 400, origin);
  }
});
