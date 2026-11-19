import { corsHeaders, createAdminClient, jsonResponse } from "../_shared/voiceup.ts";

// Public read-only resolver. The database RPC is service-role only and enforces
// approval, consent, non-deletion and revocation on every request.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^[0-9a-f]{24}$/.test(code)) return jsonResponse({ error: "not_found" }, 404);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("voiceup_resolve_media_share", { p_code: code });
    if (error) return jsonResponse({ error: "media_unavailable" }, 503);
    const item = Array.isArray(data) ? data[0] : null;
    if (!item || !item.storage_path || item.storage_bucket !== "campaign-private")
      return jsonResponse({ error: "not_found" }, 404);
    const signed = await admin.storage.from("campaign-private").createSignedUrl(item.storage_path, 30);
    if (signed.error || !signed.data?.signedUrl) return jsonResponse({ error: "media_unavailable" }, 503);
    const result = jsonResponse({ url: signed.data.signedUrl, caption: item.caption ?? "", mediaType: item.media_type });
    result.headers.set("Cache-Control", "no-store, max-age=0");
    result.headers.set("Referrer-Policy", "no-referrer");
    return result;
  } catch { return jsonResponse({ error: "media_unavailable" }, 503); }
});
