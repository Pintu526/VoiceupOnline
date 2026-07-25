import {
  corsHeaders,
  createAdminClient,
  jsonResponse,
  parseJson
} from "../_shared/voiceup.ts";
import { fetchCanonicalPublishedCampaignBySlug } from "../_shared/publicCampaignIndex.ts";
import { normalizePublicCampaignSlug } from "../_shared/publicCampaignSlug.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await parseJson(req);
    const slug = String(body?.slug ?? "").trim();
    if (!normalizePublicCampaignSlug(slug)) {
      return jsonResponse({ campaign: null }, 400);
    }

    const admin = createAdminClient();
    const resolved = await fetchCanonicalPublishedCampaignBySlug(admin, slug);
    if (!resolved.ok || !resolved.row.campaign) {
      return jsonResponse({ campaign: null });
    }

    return jsonResponse({
      campaign: {
        campaign: resolved.row.campaign,
        organization: resolved.row.organization ?? undefined,
        authorities: resolved.row.authorities ?? [],
        metrics: resolved.row.metrics
      }
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to load campaign." }, 500);
  }
});
