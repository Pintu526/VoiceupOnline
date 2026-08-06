import {
  corsHeaders,
  createAdminClient,
  jsonResponse,
  normalizePhone,
  sha256Hex
} from "../_shared/voiceup.ts";
import {
  buildCanonicalSubmitSupportConsents,
  CONSENT_REQUIRED_CODE,
  hasBase64Image,
  hasUnsupportedSignerFields,
  isPublicParticipationAction,
  profileFromSigner,
  validateProfileFields
} from "./logic.ts";
import { fetchCanonicalPublishedCampaignBySlug } from "../_shared/publicCampaignIndex.ts";
import { normalizePublicCampaignSlug } from "../_shared/publicCampaignSlug.ts";

const MAX_PUBLIC_BODY_BYTES = 64 * 1024;

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function publicError(code: string) {
  const errors: Record<string, { status: number; message: string }> = {
    unsupported_action: { status: 400, message: "This participation action is not supported." },
    invalid_payload: { status: 400, message: "Check the submitted participation details." },
    payload_too_large: { status: 413, message: "The participation request is too large." },
    protected_patch_field: { status: 400, message: "Protected campaign data cannot be changed here." },
    unsupported_profile_field: { status: 400, message: "One or more profile fields cannot be updated." },
    unsupported_consent_field: { status: 400, message: "One or more consent fields cannot be updated." },
    unsupported_application_field: { status: 400, message: "One or more application fields cannot be updated." },
    coordinator_authority_protected: { status: 403, message: "Coordinator approval can only be changed by an authorized manager." },
    base64_not_allowed: { status: 400, message: "Upload the image separately instead of embedding it in the profile." },
    invalid_phone: { status: 400, message: "Enter a valid phone number." },
    invalid_idempotency_key: { status: 400, message: "Refresh the page and retry this action." },
    otp_verification_required: { status: 401, message: "Verify your phone with a fresh OTP before continuing." },
    campaign_unavailable: { status: 404, message: "Campaign is not available for participation." },
    supporter_not_found: { status: 404, message: "No verified supporter profile was found." },
    idempotency_conflict: { status: 409, message: "This request key was already used for another action." },
    consent_required: { status: 400, message: "Campaign-support consent is required before submitting." },
    required_fields_missing: { status: 400, message: "Complete all required campaign fields before submitting." },
    campaign_limit_reached: { status: 402, message: "This campaign has reached its supporter limit." },
    monthly_limit_reached: { status: 402, message: "This campaign owner has reached the monthly supporter limit." },
    invalid_consent: { status: 400, message: "Consent evidence is incomplete." },
    invalid_geography: { status: 400, message: "Structured geography is incomplete or invalid." },
    invalid_request_payload: { status: 400, message: "Check the application details and retry." },
    unsupported_request_field: { status: 400, message: "One or more application fields cannot be submitted." },
    invalid_request_type: { status: 400, message: "Choose a supported application type." },
    invalid_requested_role: { status: 400, message: "The requested role does not match this application." },
    invalid_coordinator_level: { status: 400, message: "Choose a valid coordinator level." },
    invalid_minimum_level: { status: 400, message: "Choose a valid minimum service level." },
    incomplete_request_geography: { status: 400, message: "Complete the required geographic area for this level." },
    request_consent_required: { status: 400, message: "Consent is required to submit this application." },
    support_completion_required: { status: 400, message: "Complete campaign support before applying." },
    active_participation_request_exists: { status: 409, message: "An active application of this type already exists." },
    invalid_photo_reference: { status: 400, message: "Private photo reference is invalid." },
    coordinator_consent_required: { status: 400, message: "Coordinator contact consent is required to apply." },
    active_coordinator_application_exists: { status: 409, message: "An active coordinator application already exists." },
    coordinator_application_not_found: { status: 404, message: "No coordinator application was found." },
    busy: { status: 503, message: "Participation is busy. Please retry safely." }
  };
  return errors[code] ?? { status: 500, message: "Participation could not be completed. Please retry." };
}

function rpcErrorCode(error: unknown): string {
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: string }).message ?? "")
    : "";
  const matched = message.match(/voiceup:([a-z_]+)/);
  return matched?.[1] ?? "server_error";
}

async function parseBoundedJson(req: Request) {
  const declaredSize = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > MAX_PUBLIC_BODY_BYTES) {
    throw new Response("payload_too_large", { status: 413 });
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PUBLIC_BODY_BYTES) {
    throw new Response("payload_too_large", { status: 413 });
  }
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid");
    }
    return value as Record<string, any>;
  } catch {
    throw new Response("invalid_payload", { status: 400 });
  }
}

function hasValidActionEnvelope(body: Record<string, any>, action: string) {
  const protectedFields = [
    "workspace", "workspaceData", "campaigns", "signers", "auditLogs",
    "organization", "authorities", "scanItems", "coordinators"
  ];
  if (protectedFields.some((key) => key in body)) return false;
  if (
    action === "read_participation_requests"
    && (
      body.payload !== undefined
      || ["requestId", "supporterId", "requesterSupporterId"].some((key) => key in body)
    )
  ) {
    return false;
  }
  if (body.payload !== undefined) {
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return false;
    if (Object.keys(body.payload).some((key) =>
      !["profile", "consents", "application", "request", "baseUpdatedAt", "idempotencyKey"].includes(key)
    )) return false;
  }
  const consents = body.payload?.consents ?? body.consents;
  if (consents !== undefined && (!consents || typeof consents !== "object" || Array.isArray(consents))) return false;
  const application = body.payload?.application ?? body.application;
  if (application !== undefined && (!application || typeof application !== "object" || Array.isArray(application))) {
    return false;
  }
  if (action === "record_consents" && (!consents || Object.keys(consents).length === 0)) return false;
  if (action === "submit_coordinator_application" && (!application || Object.keys(application).length === 0)) {
    return false;
  }
  const participationRequest = body.payload?.request ?? body.request;
  if (
    action === "submit_participation_request"
    && (
      !participationRequest
      || typeof participationRequest !== "object"
      || Array.isArray(participationRequest)
      || Object.keys(participationRequest).length === 0
    )
  ) {
    return false;
  }
  return true;
}

function consentPayload(
  body: Record<string, any>,
  action: string,
  campaign: Record<string, any>
) {
  const supplied = body.payload?.consents ?? body.consents;
  if (action !== "submit_support") return supplied ?? {};
  const canonical = buildCanonicalSubmitSupportConsents(
    body.consent,
    String(campaign.consentText ?? ""),
    supplied,
    body.communicationConsent === true
  );
  if (!canonical.ok) {
    throw new Response(CONSENT_REQUIRED_CODE, { status: 400 });
  }
  return canonical.consents;
}

async function invokeMutation(
  admin: any,
  resolved: any,
  body: Record<string, any>,
  action: string,
  overrides: Record<string, unknown> = {}
) {
  const signer = body.signer && typeof body.signer === "object" ? body.signer : {};
  if (hasUnsupportedSignerFields(signer)) {
    const code = "unsupported_profile_field";
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }
  const profile = body.payload?.profile ?? (Object.keys(signer).length ? profileFromSigner(signer) : {});
  if (!validateProfileFields(profile) || hasBase64Image(body)) {
    const code = hasBase64Image(body) ? "base64_not_allowed" : "unsupported_profile_field";
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }

  const phone = normalizePhone(String(overrides.phone ?? body.phone ?? signer.phone ?? ""));
  const verificationToken = String(
    overrides.verificationToken
      ?? body.otpVerificationToken
      ?? signer.otpVerificationToken
      ?? ""
  ).trim();
  const idempotencyKey = String(
    overrides.idempotencyKey
      ?? body.idempotencyKey
      ?? body.payload?.idempotencyKey
      ?? ""
  ).trim();
  if (!phone || !verificationToken || !idempotencyKey) {
    const code = !phone ? "invalid_phone" : !verificationToken ? "otp_verification_required" : "invalid_idempotency_key";
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }

  let consents: Record<string, unknown>;
  try {
    consents = consentPayload(body, action, resolved.row.campaign ?? {});
  } catch (error) {
    if (error instanceof Response) {
      const code = await error.text();
      const mapped = publicError(code);
      return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
    }
    throw error;
  }

  const clientFingerprint = await sha256Hex([
    body.clientVersion ?? "",
    resolved.row.workspace_id,
    resolved.row.campaign_id
  ].join(":"));
  const payload = {
    profile,
    consents,
    application: body.payload?.application ?? body.application ?? {},
    baseUpdatedAt: body.payload?.baseUpdatedAt ?? body.baseUpdatedAt ?? null
  };
  const { data, error } = await admin.rpc("mutate_voiceup_public_participation", {
    p_workspace_id: resolved.row.workspace_id,
    p_campaign_id: resolved.row.campaign_id,
    p_campaign_slug: resolved.row.slug,
    p_action: action,
    p_phone: phone,
    p_verification_token: verificationToken,
    p_idempotency_key: idempotencyKey,
    p_payload: payload,
    p_server_metadata: {
      source: "public-web-edge",
      requestId: createId("req"),
      clientHash: clientFingerprint
    }
  });
  if (error) {
    console.error("voiceup-public-signing RPC failure", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    const code = rpcErrorCode(error);
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }
  if (!data?.ok) {
    const code = String(data?.code ?? "server_error");
    const mapped = publicError(code);
    return {
      response: jsonResponse(
        { error: data?.message || mapped.message, code, retryable: Boolean(data?.retryable) },
        mapped.status
      )
    };
  }
  return { data };
}

async function invokeParticipationRequest(
  admin: any,
  resolved: any,
  body: Record<string, any>
) {
  const phone = normalizePhone(String(body.phone ?? ""));
  const verificationToken = String(body.otpVerificationToken ?? "").trim();
  const idempotencyKey = String(
    body.idempotencyKey ?? body.payload?.idempotencyKey ?? ""
  ).trim();
  if (!phone || !verificationToken || !idempotencyKey) {
    const code = !phone
      ? "invalid_phone"
      : !verificationToken
        ? "otp_verification_required"
        : "invalid_idempotency_key";
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }

  const request = body.payload?.request ?? body.request;
  const protectedRequestFields = new Set([
    "id",
    "workspaceId",
    "applicationKey",
    "resourceType",
    "resourceId",
    "requesterSupporterId",
    "status",
    "routingMetadata",
    "escalationState",
    "submittedAt",
    "updatedAt",
    "auditMetadata"
  ]);
  if (
    !request
    || typeof request !== "object"
    || Array.isArray(request)
    || Object.keys(request).some((key) => protectedRequestFields.has(key))
    || hasBase64Image(request)
  ) {
    const code = hasBase64Image(request) ? "base64_not_allowed" : "invalid_request_payload";
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }

  const clientFingerprint = await sha256Hex([
    body.clientVersion ?? "",
    resolved.row.workspace_id,
    resolved.row.campaign_id,
    "submit_participation_request"
  ].join(":"));
  const { data, error } = await admin.rpc("voiceup_submit_participation_request", {
    p_workspace_id: resolved.row.workspace_id,
    p_campaign_id: resolved.row.campaign_id,
    p_campaign_slug: resolved.row.slug,
    p_phone: phone,
    p_verification_token: verificationToken,
    p_idempotency_key: idempotencyKey,
    p_request: request,
    p_server_metadata: {
      source: "public-web-edge",
      requestId: createId("req"),
      clientHash: clientFingerprint
    }
  });
  if (error) {
    console.error("voiceup-public-signing request RPC failure", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    const code = rpcErrorCode(error);
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }
  if (!data?.ok) {
    const code = String(data?.code ?? "server_error");
    const mapped = publicError(code);
    return {
      response: jsonResponse(
        { error: data?.message || mapped.message, code, retryable: Boolean(data?.retryable) },
        mapped.status
      )
    };
  }
  return { data };
}

async function invokeParticipationRequestRead(
  admin: any,
  resolved: any,
  body: Record<string, any>
) {
  const phone = normalizePhone(String(body.phone ?? ""));
  const verificationToken = String(body.otpVerificationToken ?? "").trim();
  if (!phone || !verificationToken) {
    const code = !phone ? "invalid_phone" : "otp_verification_required";
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }

  const { data, error } = await admin.rpc("voiceup_read_own_participation_requests", {
    p_workspace_id: resolved.row.workspace_id,
    p_campaign_id: resolved.row.campaign_id,
    p_campaign_slug: resolved.row.slug,
    p_phone: phone,
    p_verification_token: verificationToken
  });
  if (error) {
    console.error("voiceup-public-signing request read RPC failure", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    const code = rpcErrorCode(error);
    const mapped = publicError(code);
    return { response: jsonResponse({ error: mapped.message, code }, mapped.status) };
  }
  if (!data?.ok || !Array.isArray(data.requests)) {
    const code = String(data?.code ?? "server_error");
    const mapped = publicError(code);
    return {
      response: jsonResponse(
        { error: data?.message || mapped.message, code },
        mapped.status
      )
    };
  }
  return { data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await parseBoundedJson(req);
    const rawAction = String(body.action ?? "submit_support");
    const action = rawAction === "submit" ? "submit_support" : rawAction;
    const slug = String(body.slug ?? "").trim();
    if (!normalizePublicCampaignSlug(slug)) {
      return jsonResponse({ error: "Campaign identifier is invalid.", code: "invalid_payload" }, 400);
    }
    if (!hasValidActionEnvelope(body, action)) {
      return jsonResponse({ error: "Check the submitted participation details.", code: "invalid_payload" }, 400);
    }

    const admin = createAdminClient();
    const resolved = await fetchCanonicalPublishedCampaignBySlug(admin, slug);
    if (!resolved.ok) {
      return jsonResponse({ error: "Campaign is not available for participation.", code: "campaign_unavailable" }, 404);
    }

    if (rawAction === "prepare_supporter_photo") {
      const contentType = String(body.contentType ?? "").toLowerCase();
      const fileSize = Number(body.fileSize ?? 0);
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        return jsonResponse({ error: "Choose a JPEG, PNG, or WebP photo." }, 400);
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
        return jsonResponse({ error: "Supporter photos must be 5 MB or smaller." }, 400);
      }
      const resume = await invokeMutation(
        admin,
        resolved,
        body,
        "resume_verified_supporter",
        { idempotencyKey: body.idempotencyKey }
      );
      if (resume.response) return resume.response;
      const supporterId = String(body.supporterId ?? "");
      if (!resume.data?.signer || resume.data.signer.id !== supporterId) {
        return jsonResponse({ error: "Verified supporter was not found." }, 404);
      }
      const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      const path = `${resolved.row.workspace_id}/supporters/${supporterId}/profile-${Date.now()}.${extension}`;
      const { data, error } = await admin.storage.from("campaign-private").createSignedUploadUrl(path);
      if (error || !data?.token) {
        return jsonResponse({ error: "Private photo upload could not be prepared." }, 500);
      }
      return jsonResponse({ path, token: data.token });
    }

    if (rawAction === "attach_supporter_photo") {
      const supporterId = String(body.supporterId ?? "");
      const path = String(body.path ?? "").trim();
      const expectedPrefix = `${resolved.row.workspace_id}/supporters/${supporterId}/`;
      if (!path.startsWith(expectedPrefix) || path.includes("..")) {
        return jsonResponse({ error: "Private photo path is invalid." }, 400);
      }
      const fileName = path.slice(expectedPrefix.length);
      const { data: storedFiles, error: storageError } = await admin.storage
        .from("campaign-private")
        .list(expectedPrefix.replace(/\/$/, ""), { search: fileName, limit: 1 });
      if (storageError || !(storedFiles ?? []).some((file: any) => file.name === fileName)) {
        return jsonResponse({ error: "Private photo upload was not found." }, 404);
      }
      body.payload = {
        profile: {
          profilePhotoPath: path,
          profilePhotoUpdatedAt: new Date().toISOString()
        }
      };
      const updated = await invokeMutation(admin, resolved, body, "update_profile");
      if (updated.response) return updated.response;
      if (updated.data?.signer?.id !== supporterId) {
        return jsonResponse({ error: "Verified supporter was not found." }, 404);
      }
      return jsonResponse({
        signer: updated.data.signer,
        profile: updated.data.profile,
        metrics: updated.data.metrics,
        message: "Private profile photo saved."
      });
    }

    if (!isPublicParticipationAction(action)) {
      return jsonResponse({ error: "This participation action is not supported.", code: "unsupported_action" }, 400);
    }

    if (action === "submit_participation_request") {
      const requestMutation = await invokeParticipationRequest(admin, resolved, body);
      if (requestMutation.response) return requestMutation.response;
      return jsonResponse(requestMutation.data);
    }

    if (action === "read_participation_requests") {
      const requestRead = await invokeParticipationRequestRead(admin, resolved, body);
      if (requestRead.response) return requestRead.response;
      return jsonResponse({ requests: requestRead.data.requests });
    }

    const mutation = await invokeMutation(admin, resolved, body, action);
    if (mutation.response) return mutation.response;
    return jsonResponse({
      ...mutation.data,
      signer: mutation.data.signer,
      message: mutation.data.message,
      metrics: mutation.data.metrics
    });
  } catch (error) {
    if (error instanceof Response) {
      const code = await error.text();
      const mapped = publicError(code);
      return jsonResponse({ error: mapped.message, code }, error.status || mapped.status);
    }
    console.error("voiceup-public-signing unexpected failure", error);
    return jsonResponse({
      error: "Participation could not be completed. Please retry.",
      code: "server_error"
    }, 500);
  }
});
