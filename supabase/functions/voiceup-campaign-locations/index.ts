import {
  corsHeaders,
  createAdminClient,
  getUser,
  jsonResponse,
  parseJson,
  sha256Hex
} from "../_shared/voiceup.ts";
import { INDIA_MASTER_GEOGRAPHY } from "../_shared/generated/indiaMasterGeography.ts";

const applicationKey = "voiceup";
const resourceType = "campaign";
const hierarchyKeys = ["country", "state", "district", "block", "panchayat", "village"] as const;
type HierarchyKey = (typeof hierarchyKeys)[number];
type LocationPath = Partial<Record<HierarchyKey, string>> & { country: string; postalCode?: string };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\t\n\r\f\v]/g, " ")
    .replace(/[\p{Cc}]/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

function clean(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\t\n\r\f\v]/g, " ")
    .replace(/[\p{Cc}]/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
}

function responseStatus(code: string) {
  if (code === "unauthorized") return 401;
  if (["forbidden", "assignment_mismatch", "campaign_not_found", "campaign_archived"].includes(code)) return 403;
  if (["conflict", "idempotency_conflict"].includes(code)) return 409;
  if (code === "server_error" || code === "master_catalog_unavailable") return 503;
  return 400;
}

function error(code: string) {
  return jsonResponse({ error: code }, responseStatus(code));
}

async function masterPaths(): Promise<Set<string> | null> {
  const artifact = INDIA_MASTER_GEOGRAPHY;
  const canonical = stableJson({
    counts: artifact.counts,
    generatorVersion: artifact.generatorVersion,
    normalizationVersion: artifact.normalizationVersion,
    paths: artifact.paths,
    schemaVersion: artifact.schemaVersion,
    sourceDatasetVersion: artifact.sourceDatasetVersion
  });
  if (
    artifact.schemaVersion !== 1 ||
    artifact.normalizationVersion !== "v1" ||
    artifact.counts.total !== artifact.paths.length ||
    await sha256Hex(canonical) !== artifact.contentSha256
  ) return null;
  const paths = new Set<string>();
  for (const path of artifact.paths) {
    if (!path.normalizedPath || paths.has(path.normalizedPath)) return null;
    const parts = path.normalizedPath.split("|");
    if (parts.length > 1 && !paths.has(parts.slice(0, -1).join("|"))) return null;
    paths.add(path.normalizedPath);
  }
  return paths;
}

function requiredString(value: unknown, maximum = 120): string | null {
  const result = clean(value);
  return result && result.length <= maximum ? result : null;
}

function parsePath(value: unknown): { path: LocationPath; normalizedPath: string; leafLevel: HierarchyKey } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const country = requiredString(input.country);
  if (!country) return null;
  const path: LocationPath = { country };
  for (const key of hierarchyKeys.slice(1)) {
    const cleaned = clean(input[key]);
    if (cleaned && cleaned.length > 120) return null;
    if (cleaned) path[key] = cleaned;
  }
  const postalCode = clean(input.postalCode);
  if (postalCode && (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/.test(postalCode))) return null;
  if (postalCode) path.postalCode = postalCode;
  const values = hierarchyKeys.map((key) => path[key] ?? "");
  const firstEmpty = values.findIndex((item) => !item);
  if (firstEmpty >= 0 && values.slice(firstEmpty + 1).some(Boolean)) return null;
  const populated = hierarchyKeys.filter((key) => Boolean(path[key]));
  const leafLevel = populated[populated.length - 1];
  return { path, normalizedPath: populated.map((key) => normalize(path[key])).join("|"), leafLevel };
}

function campaignRequest(body: Record<string, unknown>) {
  const workspaceId = requiredString(body.workspaceId);
  const campaignId = requiredString(body.campaignId);
  const campaignSlug = requiredString(body.campaignSlug);
  if (!workspaceId || !campaignId || !campaignSlug) return null;
  return { workspaceId, campaignId, campaignSlug };
}

async function rpc(admin: ReturnType<typeof createAdminClient>, name: string, parameters: Record<string, unknown>) {
  const { data, error: rpcError } = await admin.rpc(name, parameters);
  if (rpcError) return { code: "server_error" };
  return (data ?? { code: "server_error" }) as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("validation_failed");
  try {
    const body = await parseJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) return error("validation_failed");
    const request = body as Record<string, unknown>;
    const user = await getUser(req);
    if (!user) return error("unauthorized");
    const scope = campaignRequest(request);
    if (!scope) return error("validation_failed");
    const admin = createAdminClient();
    const base = {
      p_actor_user_id: user.id,
      p_workspace_id: scope.workspaceId,
      p_application_key: applicationKey,
      p_resource_type: resourceType,
      p_resource_id: scope.campaignId,
      p_resource_slug: scope.campaignSlug
    };

    if (request.action === "read_campaign_locations") {
      const active = typeof request.active === "boolean" ? request.active : true;
      const parent = request.parentPath && typeof request.parentPath === "object"
        ? parsePath({ country: "India", ...(request.parentPath as Record<string, unknown>) })?.normalizedPath ?? null
        : null;
      if (request.parentPath && !parent) return error("validation_failed");
      const result = await rpc(admin, "read_resource_locations", {
        ...base, p_active: active, p_parent_path: parent
      });
      if (result.code !== "ok") return error(String(result.code));
      return jsonResponse({ locations: result.locations ?? [], configurationVersion: result.configurationVersion ?? 0 });
    }

    if (request.action === "add_campaign_location") {
      const idempotencyKey = String(request.idempotencyKey ?? "");
      const parsed = parsePath(request.path);
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey) || !parsed) return error("validation_failed");
      const master = await masterPaths();
      if (!master) return error("master_catalog_unavailable");
      if (master.has(parsed.normalizedPath)) return error("master_value_protected");
      const parentPath = parsed.normalizedPath.split("|").slice(0, -1).join("|");
      if (parentPath && !master.has(parentPath)) {
        const existing = await rpc(admin, "read_resource_locations", { ...base, p_active: true, p_parent_path: null });
        if (existing.code !== "ok" || !(existing.locations as Array<{ id: string }>).some((location) => {
          const values = hierarchyKeys.map((key) => normalize((location as Record<string, unknown>)[key]));
          return values.filter(Boolean).join("|") === parentPath;
        })) return error(existing.code === "ok" ? "invalid_parent" : String(existing.code));
      }
      const fingerprint = await sha256Hex(stableJson({
        workspaceId: scope.workspaceId, campaignId: scope.campaignId, campaignSlug: normalize(scope.campaignSlug),
        idempotencyKey, normalizedPath: parsed.normalizedPath, postalCode: parsed.path.postalCode ?? ""
      }));
      const result = await rpc(admin, "add_resource_location", {
        ...base,
        p_country: parsed.path.country, p_state: parsed.path.state ?? null, p_district: parsed.path.district ?? null,
        p_block: parsed.path.block ?? null, p_panchayat: parsed.path.panchayat ?? null, p_village: parsed.path.village ?? null,
        p_postal_code: parsed.path.postalCode ?? null, p_normalized_path: parsed.normalizedPath,
        p_leaf_level: parsed.leafLevel, p_source: "campaign_manual", p_idempotency_key: idempotencyKey,
        p_request_fingerprint: fingerprint
      });
      if (!["created", "reactivated", "duplicate"].includes(String(result.code))) return error(String(result.code));
      return jsonResponse({ location: result.location, configurationVersion: result.configurationVersion, result: result.code });
    }

    if (request.action === "validate_campaign_location_import") {
      const idempotencyKey = String(request.idempotencyKey ?? "");
      const contentHash = String(request.contentHash ?? "");
      const rows = request.rows;
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey) || !/^[a-f0-9]{64}$/.test(contentHash) || !Array.isArray(rows) || rows.length > 2000) {
        return error("validation_failed");
      }
      const master = await masterPaths();
      if (!master) return error("master_catalog_unavailable");
      const seen = new Set<string>();
      const normalizedRows = rows.map((row) => {
        const parsed = parsePath(row);
        if (!parsed) return { classification: "invalid", errorCode: "validation_failed" };
        if (master.has(parsed.normalizedPath)) return { ...parsed.path, normalizedPath: parsed.normalizedPath, leafLevel: parsed.leafLevel, classification: "master_conflict", errorCode: "master_value_protected" };
        if (seen.has(parsed.normalizedPath)) return { ...parsed.path, normalizedPath: parsed.normalizedPath, leafLevel: parsed.leafLevel, classification: "duplicate_in_file", errorCode: "duplicate" };
        seen.add(parsed.normalizedPath);
        return { ...parsed.path, normalizedPath: parsed.normalizedPath, leafLevel: parsed.leafLevel, classification: "valid", errorCode: null };
      });
      const result = await rpc(admin, "validate_resource_location_import", {
        ...base, p_idempotency_key: idempotencyKey, p_content_hash: contentHash, p_rows: normalizedRows
      });
      if (result.code !== "ok") return error(String(result.code));
      const snapshot = await rpc(admin, "read_resource_location_import", { ...base, p_import_id: result.importId });
      if (snapshot.code !== "ok") return error(String(snapshot.code));
      return jsonResponse(snapshot);
    }

    if (request.action === "commit_campaign_location_import") {
      const importId = requiredString(request.importId);
      const idempotencyKey = String(request.idempotencyKey ?? "");
      const contentHash = String(request.contentHash ?? "");
      if (!importId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId) || !/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey) || !/^[a-f0-9]{64}$/.test(contentHash)) {
        return error("validation_failed");
      }
      const master = await masterPaths();
      if (!master) return error("master_catalog_unavailable");
      const result = await rpc(admin, "commit_resource_location_import", {
        ...base, p_import_id: importId, p_idempotency_key: idempotencyKey, p_content_hash: contentHash
      });
      if (result.code !== "completed") return error(String(result.code));
      return jsonResponse(result);
    }

    if (request.action === "read_campaign_location_import") {
      const importId = requiredString(request.importId);
      if (!importId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId)) return error("validation_failed");
      const result = await rpc(admin, "read_resource_location_import", { ...base, p_import_id: importId });
      if (result.code !== "ok") return error(String(result.code));
      return jsonResponse(result);
    }

    if (request.action === "begin_campaign_location_large_import") {
      const idempotencyKey = String(request.idempotencyKey ?? "");
      const contentHash = String(request.contentHash ?? "");
      const totalRows = Number(request.totalRows);
      const chunkSize = Number(request.chunkSize ?? 500);
      const totalChunks = Number(request.totalChunks);
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey) || !/^[a-f0-9]{64}$/.test(contentHash) || !Number.isInteger(totalRows) || totalRows < 1 || totalRows > 50000 || !Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 500 || !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 200) {
        return error("validation_failed");
      }
      const result = await rpc(admin, "begin_resource_location_large_import", {
        ...base, p_idempotency_key: idempotencyKey, p_content_hash: contentHash, p_total_rows: totalRows, p_chunk_size: chunkSize, p_total_chunks: totalChunks
      });
      if (result.code !== "ok") return error(String(result.code));
      return jsonResponse(result);
    }

    if (request.action === "validate_campaign_location_import_chunk") {
      const importId = requiredString(request.importId);
      const chunkIndex = Number(request.chunkIndex);
      const idempotencyKey = String(request.idempotencyKey ?? "");
      const contentHash = String(request.contentHash ?? "");
      const rows = request.rows;
      if (!importId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId) || !Number.isInteger(chunkIndex) || chunkIndex < 0 || !/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey) || !/^[a-f0-9]{64}$/.test(contentHash) || !Array.isArray(rows) || rows.length > 500) {
        return error("validation_failed");
      }
      const master = await masterPaths();
      if (!master) return error("master_catalog_unavailable");
      const seen = new Set<string>();
      const normalizedRows = rows.map((row) => {
        const rowNumber = Number((row as Record<string, unknown>).rowNumber);
        const parsed = parsePath(row);
        if (!parsed || !Number.isInteger(rowNumber) || rowNumber < 1) return { rowNumber, classification: "invalid", errorCode: "validation_failed" };
        if (master.has(parsed.normalizedPath)) return { rowNumber, ...parsed.path, normalizedPath: parsed.normalizedPath, leafLevel: parsed.leafLevel, classification: "master_conflict", errorCode: "master_value_protected" };
        if (seen.has(parsed.normalizedPath)) return { rowNumber, ...parsed.path, normalizedPath: parsed.normalizedPath, leafLevel: parsed.leafLevel, classification: "duplicate_in_file", errorCode: "duplicate" };
        seen.add(parsed.normalizedPath);
        return { rowNumber, ...parsed.path, normalizedPath: parsed.normalizedPath, leafLevel: parsed.leafLevel, classification: "valid", errorCode: null };
      });
      const result = await rpc(admin, "validate_resource_location_import_chunk", {
        ...base, p_import_id: importId, p_chunk_index: chunkIndex, p_idempotency_key: idempotencyKey, p_content_hash: contentHash, p_rows: normalizedRows
      });
      if (result.code !== "ok") return error(String(result.code));
      return jsonResponse(result);
    }

    if (request.action === "commit_campaign_location_import_chunk") {
      const importId = requiredString(request.importId);
      const chunkIndex = Number(request.chunkIndex);
      const idempotencyKey = String(request.idempotencyKey ?? "");
      const contentHash = String(request.contentHash ?? "");
      if (!importId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId) || !Number.isInteger(chunkIndex) || chunkIndex < 0 || !/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey) || !/^[a-f0-9]{64}$/.test(contentHash)) {
        return error("validation_failed");
      }
      const master = await masterPaths();
      if (!master) return error("master_catalog_unavailable");
      const result = await rpc(admin, "commit_resource_location_import_chunk", {
        ...base, p_import_id: importId, p_chunk_index: chunkIndex, p_idempotency_key: idempotencyKey, p_content_hash: contentHash
      });
      if (result.code === "persistence_failed") return error("server_error");
      if (result.code !== "completed") return error(String(result.code));
      return jsonResponse(result);
    }

    if (request.action === "read_campaign_location_large_import") {
      const importId = requiredString(request.importId);
      if (!importId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId)) return error("validation_failed");
      const result = await rpc(admin, "read_resource_location_large_import", { ...base, p_import_id: importId });
      if (result.code !== "ok") return error(String(result.code));
      return jsonResponse(result);
    }

    if (request.action === "read_campaign_location_import_errors") {
      const importId = requiredString(request.importId);
      if (!importId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(importId)) return error("validation_failed");
      const result = await rpc(admin, "read_resource_location_import_errors", { ...base, p_import_id: importId });
      if (result.code !== "ok") return error(String(result.code));
      return jsonResponse(result);
    }

    if (request.action === "deactivate_campaign_location") {
      const locationId = requiredString(request.locationId);
      const expectedVersion = request.expectedVersion;
      if (!locationId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(locationId) || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
        return error("validation_failed");
      }
      const result = await rpc(admin, "deactivate_resource_location", {
        ...base, p_location_id: locationId, p_expected_version: expectedVersion
      });
      if (result.code !== "deactivated") return error(String(result.code));
      return jsonResponse({ location: result.location, configurationVersion: result.configurationVersion, result: result.code });
    }

    return error("validation_failed");
  } catch {
    return error("server_error");
  }
});
