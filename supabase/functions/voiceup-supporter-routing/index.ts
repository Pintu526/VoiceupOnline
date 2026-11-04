import {
  corsHeaders,
  createAdminClient,
  createUserClient,
  getUser,
  jsonResponse,
  normalizePhone,
  sha256Hex
} from "../_shared/voiceup.ts";
import { fetchCanonicalPublishedCampaignBySlug } from "../_shared/publicCampaignIndex.ts";
import { normalizePublicCampaignSlug } from "../_shared/publicCampaignSlug.ts";

const MAX_BODY_BYTES = 8 * 1024;

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Response("invalid_payload", { status: 413 });
  }
  try {
    const body = JSON.parse(text || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return body as Record<string, unknown>;
  } catch {
    throw new Response("invalid_payload", { status: 400 });
  }
}

function codeFromError(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : "";
  return message.match(/voiceup:([a-z_]+)/)?.[1] ?? "routing_unavailable";
}

function safeError(code: string): { status: number; message: string } {
  if (code === "routing_rate_limited") {
    return { status: 429, message: "Please wait before checking this mobile number again." };
  }
  if (code === "authentication_required" || code === "verified_email_required") {
    return { status: 401, message: "Sign in with a confirmed VoiceUp account to continue." };
  }
  if (code === "routing_token_invalid") {
    return { status: 401, message: "This secure check expired. Enter the mobile number again." };
  }
  return { status: 400, message: "The secure mobile check could not be completed." };
}

function requestFingerprint(req: Request): string {
  const forwarded = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  return [
    forwarded,
    req.headers.get("cf-connecting-ip") ?? "",
    req.headers.get("user-agent") ?? "",
    req.headers.get("origin") ?? ""
  ].join(":");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await readBody(req);
    const action = String(body.action ?? "");
    const slug = String(body.slug ?? "").trim().toLowerCase();
    if (!normalizePublicCampaignSlug(slug)) {
      return jsonResponse({ error: "Campaign identifier is invalid.", code: "invalid_payload" }, 400);
    }

    const admin = createAdminClient();
    const resolved = await fetchCanonicalPublishedCampaignBySlug(admin, slug);
    if (!resolved.ok) {
      return jsonResponse({ error: "Campaign is not available.", code: "campaign_unavailable" }, 404);
    }

    if (action === "precheck") {
      const phone = normalizePhone(String(body.phone ?? ""));
      if (!/^[0-9]{8,15}$/.test(phone)) {
        return jsonResponse({ error: "Enter a valid mobile number.", code: "invalid_phone" }, 400);
      }
      const clientHash = await sha256Hex(requestFingerprint(req));
      const { data, error } = await admin.rpc("voiceup_create_supporter_routing_precheck", {
        p_workspace_id: resolved.row.workspace_id,
        p_campaign_id: resolved.row.campaign_id,
        p_phone: phone,
        p_client_hash: clientHash
      });
      if (error || !data?.routingToken) {
        const code = codeFromError(error);
        const mapped = safeError(code);
        return jsonResponse({ error: mapped.message, code }, mapped.status);
      }
      return jsonResponse({
        ok: true,
        routingToken: data.routingToken,
        expiresAt: data.expiresAt,
        message: "You can continue verification or use secure VoiceUp account access."
      });
    }

    if (action === "resolve") {
      const user = await getUser(req);
      if (!user?.id || !user.email_confirmed_at) {
        return jsonResponse({
          error: "Sign in with a confirmed VoiceUp account to continue.",
          code: "authentication_required"
        }, 401);
      }
      const routingToken = String(body.routingToken ?? "").trim();
      if (!/^vusr_[0-9a-f]{64}$/.test(routingToken)) {
        return jsonResponse({ error: "This secure check expired.", code: "routing_token_invalid" }, 401);
      }
      const userClient = createUserClient(req);
      const { data, error } = await userClient.rpc("voiceup_resolve_authenticated_supporter_routing", {
        p_workspace_id: resolved.row.workspace_id,
        p_campaign_id: resolved.row.campaign_id,
        p_routing_token: routingToken
      });
      if (error || !data?.route) {
        const code = codeFromError(error);
        const mapped = safeError(code);
        return jsonResponse({ error: mapped.message, code }, mapped.status);
      }
      return jsonResponse(data);
    }

    return jsonResponse({ error: "This routing action is not supported.", code: "unsupported_action" }, 400);
  } catch (error) {
    if (error instanceof Response) {
      const code = await error.text();
      return jsonResponse({ error: "The secure mobile check could not be completed.", code }, error.status);
    }
    console.error("voiceup-supporter-routing failed", {
      name: error instanceof Error ? error.name : "unknown"
    });
    return jsonResponse({
      error: "The secure mobile check could not be completed.",
      code: "routing_unavailable"
    }, 500);
  }
});
