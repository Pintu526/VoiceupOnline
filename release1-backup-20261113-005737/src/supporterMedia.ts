import { getSupporterAuthClient, getCurrentSupporterIdentity } from "./supporterAuth.ts";

export interface SupporterMediaItem {
  id: string;
  supporter_account_id: string;
  workspace_id: string;
  campaign_id: string;
  supporter_id: string;
  storage_bucket: string;
  storage_path: string | null;
  media_type: "photo" | "video";
  caption: string;
  consent_given: boolean;
  consent_at: string | null;
  moderation_status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

export async function loadOwnSupporterMedia(
  supporterAccountId: string
): Promise<SupporterMediaItem[]> {
  const identity = await getCurrentSupporterIdentity();

  if (!identity) {
    throw new Error("supporter_media_authentication_required");
  }

  const client = getSupporterAuthClient() as unknown as {
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{
            data: { id: string } | null;
            error: unknown | null;
          }>;
          order(column: string, options: { ascending: boolean }): {
            limit(count: number): Promise<{
              data: SupporterMediaItem[] | null;
              error: unknown | null;
            }>;
          };
        };
      };
    };
  };

  const { data: ownership, error: ownershipError } = await client
    .from("voiceup_supporter_accounts")
    .select("id")
    .eq("id", supporterAccountId)
    .maybeSingle();

  if (ownershipError || !ownership) {
    throw new Error("supporter_media_not_authorized");
  }

  const { data, error } = await client
    .from("voiceup_supporter_media")
    .select(
      "id,supporter_account_id,workspace_id,campaign_id,supporter_id," +
      "storage_bucket,storage_path,media_type,caption,consent_given," +
      "consent_at,moderation_status,created_at,updated_at"
    )
    .eq("supporter_account_id", supporterAccountId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error("supporter_media_read_failed");
  }

  return (data ?? []) as SupporterMediaItem[];
}

export interface SupporterMediaGalleryItem {
  id: string;
  mediaType: "photo" | "video";
  caption: string;
  moderationStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  url: string | null;
}

type MediaResponse = {
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
};

function mediaClient() {
  return getSupporterAuthClient() as unknown as {
    functions: {
      invoke(name: string, options: { body: Record<string, unknown> }): Promise<MediaResponse>;
    };
    storage: {
      from(bucket: string): {
        uploadToSignedUrl(path: string, token: string, file: File,
          options?: { contentType?: string }): Promise<{ error: { message?: string } | null }>;
      };
    };
  };
}

async function invokeMedia(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await mediaClient().functions.invoke("voiceup-supporter-media", { body });
  if (error || !data || data.error) {
    throw new Error(String(data?.error ?? error?.message ?? "media_service_unavailable"));
  }
  return data;
}

export async function listSupporterMedia(accountId: string): Promise<SupporterMediaGalleryItem[]> {
  if (!(await getCurrentSupporterIdentity())) throw new Error("authentication_required");
  const data = await invokeMedia({ action: "list_media", supporterAccountId: accountId });
  return (data.items ?? []) as SupporterMediaGalleryItem[];
}

export async function submitSupporterMedia(
  accountId: string, file: File, caption: string, consentGiven: boolean
): Promise<void> {
  if (!(await getCurrentSupporterIdentity())) throw new Error("authentication_required");
  if (!consentGiven || caption.length > 500) throw new Error("consent_or_caption_invalid");
  const prepared = await invokeMedia({
    action: "prepare_upload", supporterAccountId: accountId,
    contentType: file.type, fileSize: file.size, caption, consentGiven
  });
  if (prepared.status !== "prepared" || prepared.storageBucket !== "campaign-private" ||
      typeof prepared.storagePath !== "string" || typeof prepared.uploadToken !== "string" ||
      typeof prepared.mediaId !== "string") throw new Error("upload_not_authorized");
  const { error } = await mediaClient().storage.from("campaign-private").uploadToSignedUrl(
    prepared.storagePath, prepared.uploadToken, file, { contentType: file.type }
  );
  if (error) throw new Error(error.message ?? "upload_failed");
  await invokeMedia({
    action: "finalize_upload", supporterAccountId: accountId, mediaId: prepared.mediaId,
    contentType: file.type, caption, consentGiven
  });
}


// Profile photos are private account assets, separate from moderated campaign media.
export async function getSupporterProfilePhoto(accountId: string): Promise<string | null> {
  if (!(await getCurrentSupporterIdentity())) throw new Error("authentication_required");
  const result = await invokeMedia({ action: "profile_get", supporterAccountId: accountId });
  return typeof result.url === "string" ? result.url : null;
}

export async function saveSupporterProfilePhoto(accountId: string, file: File): Promise<string> {
  if (!(await getCurrentSupporterIdentity())) throw new Error("authentication_required");
  if (file.type !== "image/jpeg" || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("profile_photo_must_be_jpeg_under_5mb");
  }
  const prepared = await invokeMedia({
    action: "profile_prepare", supporterAccountId: accountId,
    contentType: file.type, fileSize: file.size
  });
  if (prepared.storageBucket !== "campaign-private" ||
      typeof prepared.storagePath !== "string" || typeof prepared.uploadToken !== "string") {
    throw new Error("profile_upload_not_authorized");
  }
  const { error } = await mediaClient().storage.from("campaign-private").uploadToSignedUrl(
    prepared.storagePath, prepared.uploadToken, file, { contentType: file.type }
  );
  if (error) throw new Error(error.message ?? "profile_upload_failed");
  const saved = await invokeMedia({
    action: "profile_finalize", supporterAccountId: accountId,
    storagePath: prepared.storagePath
  });
  if (typeof saved.url !== "string") throw new Error("profile_photo_confirmation_failed");
  return saved.url;
}
