import {
  corsHeaders,
  createAdminClient,
  jsonResponse,
  parseJson
} from "../_shared/voiceup.ts";
import { fetchCanonicalPublishedCampaignBySlug } from "../_shared/publicCampaignIndex.ts";
import { normalizePublicCampaignSlug } from "../_shared/publicCampaignSlug.ts";

const hierarchyKeys = ["country", "state", "district", "block", "panchayat", "village"] as const;

function clean(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/[\t\n\r\f\v]/g, " ")
    .replace(/[\p{Cc}]/gu, "").trim().replace(/\s+/gu, " ");
}

function normalizedParentPath(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const parts: string[] = [];
  let foundEmpty = false;
  for (const key of hierarchyKeys) {
    const label = clean(input[key]);
    if (!label) {
      foundEmpty = true;
      continue;
    }
    if (foundEmpty || label.length > 120) return null;
    parts.push(label.toLowerCase());
  }
  return parts.length >= 1 && parts.length <= 5 ? parts.join("|") : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await parseJson(req);
    if (body?.action === "read_campaign_journey") {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("voiceup_read_public_campaign_journey", {
        p_referral_code: String(body?.referralCode ?? "")
      });
      if (error) throw error;
      return jsonResponse({ journey: data ?? null });
    }

    const slug = String(body?.slug ?? "").trim();
    if (!normalizePublicCampaignSlug(slug)) {
      return jsonResponse({ campaign: null }, 400);
    }

    const admin = createAdminClient();
    const resolved = await fetchCanonicalPublishedCampaignBySlug(admin, slug);
    if (!resolved.ok || !resolved.row.campaign) {
      return jsonResponse({ campaign: null });
    }
    if (body?.action === "read_campaign_location_hierarchy") {
      const parentPath = normalizedParentPath(body?.parentPath);
      if (!parentPath) return jsonResponse({ error: "validation_failed" }, 400);
      const { data, error } = await admin.rpc("read_public_campaign_location_hierarchy_v2", {
        p_workspace_id: resolved.row.workspace_id,
        p_application_key: "voiceup",
        p_resource_type: "campaign",
        p_resource_id: resolved.row.campaign_id,
        p_resource_slug: resolved.row.slug,
        p_parent_path: parentPath,
        p_limit: 1000
      });
      if (error || data?.code !== "ok") return jsonResponse({ error: data?.code ?? "server_error" }, 503);
      return jsonResponse({
        locations: data.locations ?? [],
        total: data.total ?? 0,
        childLevel: data.childLevel,
        configurationVersion: data.configurationVersion ?? 0
      });
    }

    return jsonResponse({
      campaign: {
        campaign: resolved.row.campaign,
        organization: resolved.row.organization ?? undefined,
        authorities: resolved.row.authorities ?? [],
        metrics: resolved.row.metrics,
        customLocations: []
      }
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to load campaign." }, 500);
  }
});
