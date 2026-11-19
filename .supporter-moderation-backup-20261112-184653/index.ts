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
      !["prepare_upload", "finalize_upload", "list_media"].includes(action) ||
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

    if (action === "list_media") {
      const { data: items, error: listError } = await admin
        .from("voiceup_supporter_media")
        .select("id,media_type,caption,moderation_status,created_at,storage_path")
        .eq("supporter_account_id", account.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (listError) return jsonResponse({ error: "media_list_unavailable" }, 503);
      const result = [];
      for (const item of items ?? []) {
        let url: string | null = null;
        if (item.storage_path) {
          const signed = await admin.storage.from("campaign-private")
            .createSignedUrl(item.storage_path, 300);
          if (!signed.error) url = signed.data?.signedUrl ?? null;
        }
        result.push({ id: item.id, mediaType: item.media_type, caption: item.caption,
          moderationStatus: item.moderation_status, createdAt: item.created_at, url });
      }
      return jsonResponse({ items: result });
    }

    if (action === "finalize_upload") {
      const mediaId = body.mediaId;
      const contentType = body.contentType;
      const caption = body.caption;
      const consent = body.consentGiven;
      if (typeof mediaId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaId) ||
          typeof contentType !== "string" || !MEDIA_TYPES[contentType] ||
          typeof caption !== "string" || caption.length > 500 || consent !== true) {
        return jsonResponse({ error: "invalid_media_submission" }, 400);
      }
      const allowed = MEDIA_TYPES[contentType];
      const storagePath = `${account.workspace_id}/supporter-media/${account.id}/${mediaId}.${allowed.extension}`;
      const folder = `${account.workspace_id}/supporter-media/${account.id}`;
      const filename = `${mediaId}.${allowed.extension}`;
      const { data: objects, error: storageError } = await admin.storage
        .from("campaign-private").list(folder, { search: filename, limit: 100 });
      if (storageError) return jsonResponse({ error: "media_storage_unavailable" }, 503);
      const object = (objects ?? []).find((entry) => entry.name === filename);
      if (!object) return jsonResponse({ error: "uploaded_file_not_found" }, 404);
      const size = Number(object.metadata?.size);
      const actualMime = String(object.metadata?.mimetype ?? "");
      if (!Number.isSafeInteger(size) || size <= 0 || size > allowed.maxBytes ||
          actualMime !== contentType) {
        await admin.storage.from("campaign-private").remove([storagePath]);
        return jsonResponse({ error: "uploaded_file_validation_failed" }, 400);
      }
      const { data: existing, error: existingError } = await admin
        .from("voiceup_supporter_media")
        .select("id").eq("id", mediaId).maybeSingle();
      if (existingError) return jsonResponse({ error: "media_service_unavailable" }, 503);
      if (existing) return jsonResponse({ error: "media_already_finalized" }, 409);
      const { error: insertError } = await admin.from("voiceup_supporter_media").insert({
        id: mediaId, supporter_account_id: account.id,
        workspace_id: account.workspace_id, campaign_id: account.campaign_id,
        supporter_id: account.supporter_id, storage_bucket: "campaign-private",
        storage_path: storagePath, media_type: allowed.kind, caption,
        consent_given: true, consent_at: new Date().toISOString(), moderation_status: "pending"
      });
      if (insertError) return jsonResponse({ error: "media_finalize_failed" }, 503);
      return jsonResponse({ status: "pending", mediaId });
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