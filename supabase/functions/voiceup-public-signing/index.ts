import {
  calculateMetrics,
  corsHeaders,
  createAdminClient,
  getSigners,
  hasDuplicateSigner,
  jsonResponse,
  normalizePhone,
  parseJson,
  readWorkspace,
  refreshPublicCampaignIndex,
  subscriptionBlockReason,
  writeWorkspace
} from "../_shared/voiceup.ts";

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 20;

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function createId(prefix: string) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${Date.now()}-${random}`;
}

function createReferralCode(campaignId: string, seed: string) {
  const clean = `${campaignId}-${seed}-${Date.now()}`.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return clean.slice(-10) || createId("ref").slice(-10).toUpperCase();
}

function getClientFingerprint(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function enforceRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  campaignId: string,
  fingerprint: string
) {
  const rateKey = `${campaignId}:${fingerprint}`;
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("voiceup_public_rate_limits")
    .select("id")
    .eq("rate_key", rateKey)
    .eq("action", "public-signing")
    .gte("created_at", windowStart);
  if (error) throw error;
  if ((data?.length ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    throw new HttpError("Too many signing attempts. Please try again later.", 429);
  }
  const { error: insertError } = await admin.from("voiceup_public_rate_limits").insert({
    workspace_id: workspaceId,
    rate_key: rateKey,
    action: "public-signing",
    count: 1,
    reset_at: new Date(Date.now() + RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString()
  });
  if (insertError) throw insertError;
}

function getRequiredValue(signer: any, field: string) {
  return String(signer?.[field] ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await parseJson(req);
    const slug = String(body?.slug ?? "").trim();
    const signerInput = body?.signer ?? {};
    if (!slug) return jsonResponse({ error: "Campaign slug is required." }, 400);

    const admin = createAdminClient();
    const { data: indexRow, error: indexError } = await admin
      .from("voiceup_public_campaign_index")
      .select("workspace_id, campaign_id, campaign")
      .eq("slug", slug)
      .eq("status", "Published")
      .limit(1)
      .maybeSingle();
    if (indexError) throw indexError;
    if (!indexRow?.workspace_id || !indexRow?.campaign) {
      return jsonResponse({ error: "Campaign is not available for signing." }, 404);
    }

    const workspaceId = indexRow.workspace_id;
    await enforceRateLimit(admin, workspaceId, indexRow.campaign_id, getClientFingerprint(req));
    const state = await readWorkspace(admin, workspaceId);
    const campaign = Array.isArray(state?.campaigns)
      ? state.campaigns.find((item: any) => item.id === indexRow.campaign_id && item.slug === slug)
      : null;
    if (!campaign || campaign.status !== "Published") {
      return jsonResponse({ error: "Campaign is not available for signing." }, 404);
    }

    const subscriptionReason = subscriptionBlockReason(state?.organization);
    if (subscriptionReason) return jsonResponse({ error: subscriptionReason }, 402);

    const phone = normalizePhone(String(signerInput.phone ?? ""));

    const requiredFields = Array.isArray(campaign.requiredFields) ? campaign.requiredFields : ["name", "phone"];
    const missingField = requiredFields.find((field: string) => !getRequiredValue(signerInput, field));
    if (missingField) return jsonResponse({ error: `${missingField} is required.` }, 400);

    const signers = getSigners(state);
    if (campaign.maxSignersAllowed > 0 && signers.filter((item: any) => item.campaignId === campaign.id).length >= campaign.maxSignersAllowed) {
      return jsonResponse({ error: "This campaign has reached its signer limit." }, 402);
    }
    const monthlyKey = new Date().toISOString().slice(0, 7);
    const monthlySigners = signers.filter((item: any) => String(item.signedAt ?? "").slice(0, 7) === monthlyKey);
    const monthlyLimit = Number(state?.organization?.monthlySignatureLimit ?? 0) + Number(state?.organization?.bonusSignatureCredits ?? 0);
    if (monthlyLimit > 0 && monthlySigners.length >= monthlyLimit) {
      return jsonResponse({ error: "This campaign owner has reached the monthly signer limit." }, 402);
    }

    const authority =
      (Array.isArray(state?.authorities)
        ? state.authorities.find((item: any) => item.id === signerInput.selectedAuthorityId || item.id === campaign.selectedAuthorityId)
        : null) ?? {
        id: campaign.selectedAuthorityId ?? "",
        name: signerInput.selectedAuthorityName || "Selected authority"
      };
    const duplicate = hasDuplicateSigner(signerInput, signers, campaign.id);
    const signer = {
      id: createId("sig"),
      campaignId: campaign.id,
      name: String(signerInput.name ?? "").trim(),
      email: String(signerInput.email ?? "").trim(),
      phone,
      whatsappNumber: String(signerInput.whatsappNumber ?? "").trim(),
      telegramHandle: String(signerInput.telegramHandle ?? "").trim(),
      otpVerified: true,
      selectedAuthorityId: authority.id ?? "",
      selectedAuthorityName: authority.name ?? "",
      country: String(signerInput.country ?? "").trim(),
      state: String(signerInput.state ?? "").trim(),
      district: String(signerInput.district ?? "").trim(),
      block: String(signerInput.block ?? "").trim(),
      panchayat: String(signerInput.panchayat ?? "").trim(),
      address: String(signerInput.address ?? "").trim(),
      postalCode: String(signerInput.postalCode ?? "").trim(),
      comment: String(signerInput.comment ?? "").trim() || `Accepted published appeal: ${campaign.appealContent || campaign.description}`,
      referralCode: createReferralCode(campaign.id, phone || signerInput.email || signerInput.name),
      referredBy: String(signerInput.referredBy ?? "").trim(),
      referredByPhoneOrCode: String(signerInput.referredByPhoneOrCode ?? "").trim(),
      referralSource: signerInput.referralSource || undefined,
      source: "online",
      status: duplicate ? "duplicate" : "verified",
      signedAt: new Date().toISOString(),
      reviewerNote: duplicate ? "Possible duplicate signature." : undefined
    };

    const nextState = {
      ...state,
      signers: [signer, ...signers],
      auditLogs: [
        {
          id: createId("audit"),
          action: "campaign.signed",
          actor: signer.name || signer.phone,
          campaignId: campaign.id,
          description: `${signer.name || "Supporter"} signed "${campaign.title}"`,
          createdAt: new Date().toISOString(),
          metadata: { source: "public-edge-function" }
        },
        ...(Array.isArray(state?.auditLogs) ? state.auditLogs : [])
      ].slice(0, 500)
    };
    await writeWorkspace(admin, workspaceId, nextState);
    await refreshPublicCampaignIndex(admin, workspaceId, nextState);

    return jsonResponse({
      signer,
      message: duplicate
        ? "Thanks. This looks like a duplicate, so it was sent to review."
        : "Thank you. Your signature has been recorded.",
      metrics: calculateMetrics(campaign, nextState.signers)
    });
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: error instanceof Error ? error.message : "Signature submission failed." }, 500);
  }
});
