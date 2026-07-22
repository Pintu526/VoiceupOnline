import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export interface PublicCampaignIndexRow {
  workspace_id: string;
  campaign_id: string;
  slug: string;
  status: string;
  campaign?: Record<string, unknown> | null;
  organization?: Record<string, unknown> | null;
  authorities?: unknown[] | null;
  metrics?: Record<string, unknown> | null;
}

export type CanonicalPublicCampaignResolution =
  | { ok: true; row: PublicCampaignIndexRow }
  | { ok: false; reason: "not_found" | "ambiguous" };

export function resolveCanonicalPublishedCampaign(
  rows: PublicCampaignIndexRow[] | null | undefined
): CanonicalPublicCampaignResolution {
  const publishedRows = (rows ?? []).filter(
    (row) => row?.status === "Published" && Boolean(String(row?.workspace_id ?? "").trim())
  );
  if (publishedRows.length === 0) return { ok: false, reason: "not_found" };
  if (publishedRows.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, row: publishedRows[0] };
}

export async function fetchCanonicalPublishedCampaignBySlug(
  admin: SupabaseClient,
  slug: string
): Promise<CanonicalPublicCampaignResolution> {
  const normalizedSlug = String(slug ?? "").trim();
  if (!normalizedSlug) return { ok: false, reason: "not_found" };

  const { data, error } = await admin
    .from("voiceup_public_campaign_index")
    .select("workspace_id, campaign_id, slug, status, campaign, organization, authorities, metrics")
    .eq("slug", normalizedSlug)
    .eq("status", "Published")
    .limit(2);

  if (error) throw error;
  return resolveCanonicalPublishedCampaign((data ?? []) as PublicCampaignIndexRow[]);
}