import {
  corsHeaders,
  createAdminClient,
  jsonResponse,
  parseJson
} from "../_shared/voiceup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await parseJson(req);
    const slug = String(body?.slug ?? "").trim();
    if (!slug) return jsonResponse({ campaign: null }, 400);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("voiceup_public_campaign_index")
      .select("campaign, organization, authorities, metrics")
      .eq("slug", slug)
      .eq("status", "Published")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.campaign) return jsonResponse({ campaign: null });

    return jsonResponse({
      campaign: {
        campaign: data.campaign,
        organization: data.organization ?? undefined,
        authorities: data.authorities ?? [],
        metrics: data.metrics
      }
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to load campaign." }, 500);
  }
});
