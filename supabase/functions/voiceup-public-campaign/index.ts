import {
  corsHeaders,
  createAdminClient,
  jsonResponse,
  parseJson
} from "../_shared/voiceup.ts";
import { fetchCanonicalPublishedCampaignBySlug } from "../_shared/publicCampaignIndex.ts";
import { normalizePublicCampaignSlug } from "../_shared/publicCampaignSlug.ts";

const PUBLIC_LOCATION_PAGE_SIZE = 1_000;
const MAX_PUBLIC_CAMPAIGN_LOCATIONS = 60_000;

function publicCampaignLocationsQuery(admin: any, resolved: any) {
  return admin
    .from("vboss_resource_location_paths")
    .eq("workspace_id", resolved.row.workspace_id)
    .eq("application_key", "voiceup")
    .eq("resource_type", "campaign")
    .eq("resource_id", resolved.row.campaign_id)
    .eq("active", true);
}

async function loadPublicCampaignLocations(admin: any, resolved: any) {
  const { count, error: countError } = await publicCampaignLocationsQuery(admin, resolved)
    .select("id", { count: "exact", head: true });
  if (countError || count === null) throw new Error("Unable to count campaign locations.");
  if (count > MAX_PUBLIC_CAMPAIGN_LOCATIONS) {
    throw new Error("Campaign location set exceeds the public response safety limit.");
  }

  const locations: Array<Record<string, string | null>> = [];
  const locationIds = new Set<string>();
  for (let offset = 0; offset < count; offset += PUBLIC_LOCATION_PAGE_SIZE) {
    const { data, error } = await publicCampaignLocationsQuery(admin, resolved)
      .select("id,country,state,district,block,panchayat,village,postal_code")
      .order("normalized_path")
      .order("id")
      .range(offset, offset + PUBLIC_LOCATION_PAGE_SIZE - 1);
    if (error) throw error;
    for (const location of data ?? []) {
      if (locationIds.has(location.id)) {
        throw new Error("Campaign location pagination returned a duplicate row.");
      }
      locationIds.add(location.id);
      locations.push(location);
    }
  }
  if (locations.length !== count) {
    throw new Error("Campaign location pagination did not return the complete location set.");
  }
  return locations;
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
    const customLocations = await loadPublicCampaignLocations(admin, resolved);

    return jsonResponse({
      campaign: {
        campaign: resolved.row.campaign,
        organization: resolved.row.organization ?? undefined,
        authorities: resolved.row.authorities ?? [],
        metrics: resolved.row.metrics,
        customLocations: (customLocations ?? []).map((location) => ({
          country: location.country, state: location.state ?? undefined, district: location.district ?? undefined,
          block: location.block ?? undefined, panchayat: location.panchayat ?? undefined,
          village: location.village ?? undefined, postalCode: location.postal_code ?? undefined
        }))
      }
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to load campaign." }, 500);
  }
});
