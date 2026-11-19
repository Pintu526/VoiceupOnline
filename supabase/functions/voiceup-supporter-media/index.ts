import {
  corsHeaders,
  createAdminClient,
  createUserClient,
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

    // Campaign-specific moderation: authorization occurs inside the authenticated RPC.
    if (action === "moderation_list" || action === "moderation_decide") {
      const workspaceId = body.workspaceId;
      const campaignId = body.campaignId;
      const campaignSlug = body.campaignSlug;
      const mediaId = body.mediaId;
      const decision = body.decision;
      const reason = body.reason ?? "";
      const safeScope = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9._:-]{2,160}$/.test(v);
      if (!safeScope(workspaceId) || !safeScope(campaignId) ||
          typeof campaignSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(campaignSlug) ||
          (action === "moderation_decide" && (
            typeof mediaId !== "string" || !/^[0-9a-f-]{36}$/i.test(mediaId) ||
            !["approved", "rejected"].includes(decision) ||
            typeof reason !== "string" || reason.length > 500
          ))) return jsonResponse({ error: "invalid_moderation_request" }, 400);
      const userClient = createUserClient(req);
      const { data, error } = await userClient.rpc("voiceup_moderate_supporter_media", {
        p_workspace_id: workspaceId,
        p_campaign_id: campaignId,
        p_campaign_slug: campaignSlug,
        p_action: action === "moderation_list" ? "list" : decision,
        p_media_id: action === "moderation_list" ? null : mediaId,
        p_reason: action === "moderation_list" ? "" : reason
      });
      if (error) {
        const message = String(error.message ?? "");
        const forbidden = message.includes("campaign_admin_required");
        const invalid = message.includes("invalid_moderation_request");
        return jsonResponse({ error: forbidden ? "campaign_admin_required" : invalid ? "invalid_moderation_request" : "moderation_unavailable" }, forbidden ? 403 : invalid ? 400 : 503);
      }
      if (action === "moderation_list") {
        const items = [];
        for (const item of (data?.items ?? [])) {
          let url: string | null = null;
          if (typeof item.storage_path === "string") {
            const signed = await createAdminClient().storage.from("campaign-private")
              .createSignedUrl(item.storage_path, 120);
            if (!signed.error) url = signed.data?.signedUrl ?? null;
          }
          items.push({ id: item.id, mediaType: item.media_type, caption: item.caption,
            moderationStatus: item.moderation_status, createdAt: item.created_at, url });
        }
        return jsonResponse({ items });
      }
      return jsonResponse(data);
    }
    const accountId = body.supporterAccountId;

    if (
      !["prepare_upload", "finalize_upload", "list_media", "profile_get", "profile_prepare", "profile_finalize", "download_media", "share_media", "delete_media"].includes(action) ||
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

    // Account-owned profile photo: private storage, independent of campaign moderation.
    const profileFolder = `${account.workspace_id}/supporter-profiles/${account.id}`;
    if (action === "profile_get") {
      const { data: files, error } = await admin.storage.from("campaign-private")
        .list(profileFolder, { limit: 100, sortBy: { column: "name", order: "desc" } });
      if (error) return jsonResponse({ error: "profile_photo_unavailable" }, 503);
      const latest = (files ?? []).find((file) => /^p-[0-9]{13}-[0-9a-f-]{36}\.jpg$/i.test(file.name));
      if (!latest) return jsonResponse({ url: null });
      const signed = await admin.storage.from("campaign-private")
        .createSignedUrl(`${profileFolder}/${latest.name}`, 3600);
      if (signed.error) return jsonResponse({ error: "profile_photo_unavailable" }, 503);
      return jsonResponse({ url: signed.data.signedUrl });
    }
    if (action === "profile_prepare") {
      if (body.contentType !== "image/jpeg" ||
          !Number.isSafeInteger(body.fileSize) || body.fileSize <= 0 ||
          body.fileSize > MAX_PHOTO_BYTES) {
        return jsonResponse({ error: "invalid_profile_photo" }, 400);
      }
      const storagePath = `${profileFolder}/p-${Date.now()}-${crypto.randomUUID()}.jpg`;
      const { data: upload, error } = await admin.storage.from("campaign-private")
        .createSignedUploadUrl(storagePath);
      if (error || !upload?.token) return jsonResponse({ error: "profile_upload_unavailable" }, 503);
      return jsonResponse({ storageBucket: "campaign-private", storagePath, uploadToken: upload.token });
    }
    if (action === "profile_finalize") {
      const storagePath = body.storagePath;
      if (typeof storagePath !== "string" ||
          !storagePath.startsWith(`${profileFolder}/p-`) ||
          !/^p-[0-9]{13}-[0-9a-f-]{36}\.jpg$/i.test(storagePath.slice(profileFolder.length + 1))) {
        return jsonResponse({ error: "invalid_profile_path" }, 400);
      }
      const filename = storagePath.slice(profileFolder.length + 1);
      const { data: objects, error } = await admin.storage.from("campaign-private")
        .list(profileFolder, { search: filename, limit: 100 });
      if (error) return jsonResponse({ error: "profile_photo_unavailable" }, 503);
      const object = (objects ?? []).find((item) => item.name === filename);
      if (!object || Number(object.metadata?.size) <= 0 ||
          Number(object.metadata?.size) > MAX_PHOTO_BYTES ||
          String(object.metadata?.mimetype ?? "") !== "image/jpeg") {
        return jsonResponse({ error: "invalid_uploaded_profile_photo" }, 400);
      }
      const signed = await admin.storage.from("campaign-private").createSignedUrl(storagePath, 3600);
      if (signed.error) return jsonResponse({ error: "profile_photo_unavailable" }, 503);
      return jsonResponse({ url: signed.data.signedUrl });
    }

    if (["download_media", "share_media", "delete_media"].includes(action)) {
      if (typeof body.mediaId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.mediaId))
        return jsonResponse({ error: "invalid_media_id" }, 400);
      const { data: item, error } = await admin.from("voiceup_supporter_media")
        .select("id,storage_path,storage_bucket,moderation_status,deleted_at")
        .eq("id", body.mediaId).eq("supporter_account_id", account.id).maybeSingle();
      if (error) return jsonResponse({ error: "media_service_unavailable" }, 503);
      if (!item || item.deleted_at) return jsonResponse({ error: "media_not_found" }, 404);
      if (action === "delete_media") {
        // Mark deleted first, so no new gallery/download/share URLs are issued.
        const { error: updateError } = await admin.from("voiceup_supporter_media")
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", item.id).eq("supporter_account_id", account.id).is("deleted_at", null);
        if (updateError) return jsonResponse({ error: "delete_failed" }, 503);
        if (item.storage_path) {
          const removed = await admin.storage.from("campaign-private").remove([item.storage_path]);
          if (removed.error) return jsonResponse({ status: "deleted", storageCleanupPending: true });
        }
        return jsonResponse({ status: "deleted" });
      }
      if (action === "share_media" && item.moderation_status !== "approved")
        return jsonResponse({ error: "media_not_approved_for_sharing" }, 403);
      if (!item.storage_path || item.storage_bucket !== "campaign-private")
        return jsonResponse({ error: "media_unavailable" }, 404);
      if (action === "share_media") {
        const { data: existing, error: existingError } = await admin.from("voiceup_media_share_links")
          .select("code").eq("media_id", item.id).is("revoked_at", null)
          .order("created_at", { ascending: false }).limit(1);
        if (existingError) return jsonResponse({ error: "share_unavailable" }, 503);
        let code = existing?.[0]?.code;
        if (!code) {
          const created = await admin.from("voiceup_media_share_links")
            .insert({ media_id: item.id }).select("code").single();
          if (created.error || !created.data?.code) return jsonResponse({ error: "share_unavailable" }, 503);
          code = created.data.code;
        }
        return jsonResponse({ code });
      }
      // Owner-only downloads remain short-lived.
      const expiresIn = 120;
      const signed = await admin.storage.from("campaign-private").createSignedUrl(item.storage_path, expiresIn);
      if (signed.error) return jsonResponse({ error: "media_unavailable" }, 503);
      return jsonResponse({ url: signed.data.signedUrl, expiresIn });
    }

    if (action === "list_media") {
      const { data: items, error: listError } = await admin
        .from("voiceup_supporter_media")
        .select("id,media_type,caption,moderation_status,created_at,storage_path")
        .eq("supporter_account_id", account.id)
        .is("deleted_at", null)
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
        const { data: reasonRow } = item.moderation_status === "rejected"
          ? await admin.from("voiceup_supporter_media_moderation_audit")
              .select("reason").eq("media_id", item.id).eq("new_status", "rejected")
              .order("created_at", { ascending: false }).limit(1).maybeSingle()
          : { data: null };
        result.push({ id: item.id, mediaType: item.media_type, caption: item.caption,
          moderationStatus: item.moderation_status, createdAt: item.created_at, url,
          rejectionReason: reasonRow?.reason ?? null });
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