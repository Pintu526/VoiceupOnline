import {
  corsHeaders,
  createAdminClient,
  getUser,
  jsonResponse
} from "../_shared/voiceup.ts";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const MEDIA_TYPES: Record<string, {
  kind: "photo" | "video";
  extension: string;
  maxBytes: number;
}> = {
  "image/jpeg": { kind: "photo", extension: "jpg", maxBytes: MAX_PHOTO_BYTES },
  "image/png": { kind: "photo", extension: "png", maxBytes: MAX_PHOTO_BYTES },
  "image/webp": { kind: "photo", extension: "webp", maxBytes: MAX_PHOTO_BYTES },
  "video/mp4": { kind: "video", extension: "mp4", maxBytes: MAX_VIDEO_BYTES },
  "video/webm": { kind: "video", extension: "webm", maxBytes: MAX_VIDEO_BYTES }
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const user = await getUser(req);

    if (!user?.id || !user.email_confirmed_at) {
      return jsonResponse({ error: "authentication_required" }, 401);
    }

    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    const action = body.action;
    const accountId = body.supporterAccountId;

    if (
      action !== "prepare_upload" ||
      typeof accountId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)
    ) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    const admin = createAdminClient();

    const { data: account, error: accountError } = await admin
      .from("voiceup_supporter_accounts")
      .select("id,auth_user_id,workspace_id,campaign_id,supporter_id")
      .eq("id", accountId)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (accountError) {
      return jsonResponse({ error: "media_service_unavailable" }, 503);
    }

    if (!account) {
      return jsonResponse({ error: "supporter_account_not_authorized" }, 403);
    }

    const contentType = body.contentType;
    const fileSize = body.fileSize;
    const consent = body.consentGiven;
    const caption = body.caption;

    const allowed = typeof contentType === "string"
      ? MEDIA_TYPES[contentType]
      : undefined;

    if (
      !allowed ||
      typeof fileSize !== "number" ||
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > allowed.maxBytes ||
      consent !== true ||
      typeof caption !== "string" ||
      caption.length > 500
    ) {
      return jsonResponse({ error: "invalid_media_submission" }, 400);
    }

    // Reserve a private, owner-scoped path. Never accept a path
    // supplied by the browser.
    const mediaId = crypto.randomUUID();
    const storagePath =
      `${account.workspace_id}/supporter-media/${account.id}/${mediaId}.${allowed.extension}`;

    const { data: upload, error: uploadError } = await admin.storage
      .from("campaign-private")
      .createSignedUploadUrl(storagePath);

    if (uploadError || !upload?.token) {
      return jsonResponse({ error: "media_upload_unavailable" }, 503);
    }

    return jsonResponse({
      status: "prepared",
      uploadEnabled: true,
      mediaId,
      storageBucket: "campaign-private",
      storagePath,
      uploadToken: upload.token,
      mediaType: allowed.kind,
      maxBytes: allowed.maxBytes,
      message: "Private upload authorization prepared."
    });
  } catch {
    return jsonResponse({ error: "media_request_failed" }, 500);
  }
});