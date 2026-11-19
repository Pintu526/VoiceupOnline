import {
  corsHeaders,
  createAdminClient,
  createUserClient,
  getUser,
  jsonResponse
} from "../_shared/voiceup.ts";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ARTWORK_BYTES = 12 * 1024 * 1024;
const ARTWORK_BUCKET = "campaign-certificates";
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const GSAA_SLUG = "gau-samman-ahvaan-abhiyan";
const GSAA_BUNDLED_PATH = "bundled/gau-samman/gau-samman-participation-certificate-dynamic-background.png";
const GSAA_BUNDLED_URL = "/brands/gau-samman/gau-samman-participation-certificate-dynamic-background.png";
const GSAA_BUNDLED_SHA = "1f6280d98519a2d2f000d78867c54159e04746e0773c317a6bee4b9fb53e1d83";

interface CertificateScope {
  workspaceId: string;
  campaignId: string;
  campaignSlug: string;
}

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

function scopeFromBody(body: Record<string, unknown>): CertificateScope | null {
  const workspaceId = String(body.workspaceId ?? "").trim();
  const campaignId = String(body.campaignId ?? "").trim();
  const campaignSlug = String(body.campaignSlug ?? "").trim().toLowerCase();
  if (!/^[A-Za-z0-9._:-]{2,160}$/.test(workspaceId)) return null;
  if (!/^[A-Za-z0-9._:-]{2,160}$/.test(campaignId)) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(campaignSlug)) return null;
  return { workspaceId, campaignId, campaignSlug };
}

function codeFromError(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : "";
  return message.match(/voiceup:([a-z_]+)/)?.[1] ?? "certificate_unavailable";
}

function errorStatus(code: string): number {
  if (code === "authentication_required") return 401;
  if (code === "campaign_admin_required" || code === "certificate_not_authorized") return 403;
  if (code === "certificate_not_found") return 404;
  if (code === "certificate_not_available" || code === "certificate_participation_ineligible") return 409;
  return 400;
}

function safeMessage(code: string): string {
  if (code === "authentication_required") return "Sign in to continue.";
  if (code === "campaign_admin_required") return "Only the assigned Campaign Admin can manage certificate settings.";
  if (code === "certificate_not_authorized") return "This certificate is not available to this account.";
  if (code === "certificate_not_available") return "Participation certificates are not currently available for this campaign.";
  if (code === "certificate_participation_ineligible") return "Verified participation and secure account linkage are required.";
  if (code === "certificate_not_found") return "Certificate not found.";
  return "The certificate request could not be completed.";
}

async function requireConfirmedUser(req: Request) {
  const user = await getUser(req);
  if (!user?.id || !user.email_confirmed_at) {
    throw new Response("authentication_required", { status: 401 });
  }
  return user;
}

function safeFileName(value: unknown, mimeType: string): string {
  const fallback = mimeType === "image/png" ? "certificate.png" : mimeType === "image/webp" ? "certificate.webp" : "certificate.jpg";
  const name = String(value ?? fallback).replace(/[^A-Za-z0-9._-]/g, "-").slice(-120);
  return name || fallback;
}

function stringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function verifyUploadedArtwork(
  admin: ReturnType<typeof createAdminClient>,
  scope: CertificateScope,
  artwork: Record<string, unknown>
) {
  const storagePath = String(artwork.storagePath ?? "").trim();
  const url = String(artwork.url ?? "").trim();
  const sha256 = String(artwork.sha256 ?? "").trim().toLowerCase();
  const mimeType = String(artwork.mimeType ?? "").trim();

  if (storagePath.startsWith("bundled/")) {
    const validBundledArtwork = scope.campaignSlug === GSAA_SLUG
      && storagePath === GSAA_BUNDLED_PATH
      && url === GSAA_BUNDLED_URL
      && sha256 === GSAA_BUNDLED_SHA
      && mimeType === "image/png"
      && Number(artwork.width) === 1536
      && Number(artwork.height) === 1024;
    if (!validBundledArtwork) throw new Response("invalid_certificate_artwork", { status: 400 });
    return artwork;
  }

  const expectedPrefix = `${scope.workspaceId}/${scope.campaignId}/`;
  if (!storagePath.startsWith(expectedPrefix) || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Response("invalid_certificate_artwork", { status: 400 });
  }
  const { data, error } = await admin.storage.from(ARTWORK_BUCKET).download(storagePath);
  if (error || !data || data.size <= 0 || data.size > MAX_ARTWORK_BYTES) {
    throw new Response("invalid_certificate_artwork", { status: 400 });
  }
  if (data.type && data.type !== mimeType) {
    throw new Response("invalid_certificate_artwork", { status: 400 });
  }
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  const actualHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (sha256 !== actualHash) throw new Response("invalid_certificate_artwork", { status: 400 });
  const publicUrl = admin.storage.from(ARTWORK_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  if (url !== publicUrl) throw new Response("invalid_certificate_artwork", { status: 400 });
  return artwork;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await readBody(req);
    const action = String(body.action ?? "");
    const admin = createAdminClient();

    if (action === "verify") {
      const certificateId = String(body.certificateId ?? "").trim().toUpperCase();
      const verificationReference = String(body.verificationReference ?? "").trim().toLowerCase();
      const { data, error } = await admin.rpc("voiceup_verify_public_certificate", {
        p_certificate_id: certificateId,
        p_verification_reference: verificationReference
      });
      if (error) return jsonResponse({ status: "not_found" });
      return jsonResponse(data ?? { status: "not_found" });
    }

    await requireConfirmedUser(req);
    const userClient = createUserClient(req);

    if (action === "list") {
      const { data, error } = await userClient.rpc("voiceup_list_owned_participation_certificates");
      if (error) {
        const code = codeFromError(error);
        return jsonResponse({ error: safeMessage(code), code }, errorStatus(code));
      }
      return jsonResponse({ certificates: Array.isArray(data) ? data : [] });
    }

    if (action === "issue") {
      const accountId = String(body.accountId ?? "").trim();
      const language = ["en", "hi", "or"].includes(String(body.language)) ? String(body.language) : "en";
      if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
        return jsonResponse({ error: "Certificate account is invalid.", code: "invalid_payload" }, 400);
      }
      const { data, error } = await userClient.rpc("voiceup_issue_owned_participation_certificate", {
        p_account_id: accountId,
        p_language: language
      });
      if (error) {
        const code = codeFromError(error);
        return jsonResponse({ error: safeMessage(code), code }, errorStatus(code));
      }
      return jsonResponse({ certificate: data });
    }

    const scope = scopeFromBody(body);
    if (!scope) return jsonResponse({ error: "Campaign scope is invalid.", code: "invalid_payload" }, 400);

    if (action === "admin-read") {
      const { data, error } = await userClient.rpc("voiceup_read_campaign_certificate_settings", {
        p_workspace_id: scope.workspaceId,
        p_campaign_id: scope.campaignId,
        p_campaign_slug: scope.campaignSlug
      });
      if (error) {
        const code = codeFromError(error);
        return jsonResponse({ error: safeMessage(code), code }, errorStatus(code));
      }
      return jsonResponse({ settings: data });
    }

    if (action === "admin-create-upload") {
      const mimeType = String(body.mimeType ?? "").trim();
      const size = Number(body.size ?? 0);
      if (!ALLOWED_MIME_TYPES.has(mimeType) || !Number.isFinite(size) || size <= 0 || size > MAX_ARTWORK_BYTES) {
        return jsonResponse({ error: "Choose a PNG, JPEG or WebP image up to 12 MB.", code: "invalid_artwork" }, 400);
      }
      const { error: accessError } = await userClient.rpc("voiceup_read_campaign_certificate_settings", {
        p_workspace_id: scope.workspaceId,
        p_campaign_id: scope.campaignId,
        p_campaign_slug: scope.campaignSlug
      });
      if (accessError) {
        const code = codeFromError(accessError);
        return jsonResponse({ error: safeMessage(code), code }, errorStatus(code));
      }
      const fileName = safeFileName(body.fileName, mimeType);
      const storagePath = `${scope.workspaceId}/${scope.campaignId}/${crypto.randomUUID()}-${fileName}`;
      const { data, error } = await admin.storage.from(ARTWORK_BUCKET).createSignedUploadUrl(storagePath);
      if (error || !data?.token) {
        return jsonResponse({ error: "Secure artwork upload could not be prepared.", code: "upload_unavailable" }, 500);
      }
      const { error: auditError } = await userClient.rpc("voiceup_record_certificate_artwork_upload", {
        p_workspace_id: scope.workspaceId,
        p_campaign_id: scope.campaignId,
        p_campaign_slug: scope.campaignSlug,
        p_storage_path: storagePath
      });
      if (auditError) {
        const code = codeFromError(auditError);
        return jsonResponse({ error: safeMessage(code), code }, errorStatus(code));
      }
      return jsonResponse({
        bucket: ARTWORK_BUCKET,
        path: storagePath,
        token: data.token,
        publicUrl: admin.storage.from(ARTWORK_BUCKET).getPublicUrl(storagePath).data.publicUrl
      });
    }

    if (action === "admin-save") {
      const settings = stringRecord(body.settings);
      const artworkValue = settings.artwork == null ? null : stringRecord(settings.artwork);
      const artwork = artworkValue ? await verifyUploadedArtwork(admin, scope, artworkValue) : null;
      const { data, error } = await userClient.rpc("voiceup_save_campaign_certificate_settings", {
        p_workspace_id: scope.workspaceId,
        p_campaign_id: scope.campaignId,
        p_campaign_slug: scope.campaignSlug,
        p_certificates_enabled: settings.certificatesEnabled === true,
        p_artwork: artwork,
        p_wording: stringRecord(settings.wording),
        p_issuer: stringRecord(settings.issuer),
        p_placement: stringRecord(settings.placement)
      });
      if (error) {
        const code = codeFromError(error);
        return jsonResponse({ error: safeMessage(code), code }, errorStatus(code));
      }
      return jsonResponse({ settings: data });
    }

    if (action === "admin-revoke") {
      const { data, error } = await userClient.rpc("voiceup_revoke_participation_certificate", {
        p_certificate_id: String(body.certificateId ?? "").trim().toUpperCase(),
        p_reason: String(body.reason ?? "").trim()
      });
      if (error) {
        const code = codeFromError(error);
        return jsonResponse({ error: safeMessage(code), code }, errorStatus(code));
      }
      return jsonResponse(data);
    }

    return jsonResponse({ error: "Certificate action is not supported.", code: "unsupported_action" }, 400);
  } catch (error) {
    if (error instanceof Response) {
      const code = await error.text();
      return jsonResponse({ error: safeMessage(code), code }, error.status);
    }
    console.error("voiceup-certificates failed", {
      name: error instanceof Error ? error.name : "unknown"
    });
    return jsonResponse({
      error: "The certificate service is temporarily unavailable.",
      code: "certificate_unavailable"
    }, 500);
  }
});
