import {
  corsHeaders,
  createAdminClient,
  createSecureToken,
  jsonResponse,
  normalizePhone,
  parseJson,
  readWorkspace,
  refreshPublicCampaignIndex,
  sha256Hex,
  writeWorkspace
} from "../_shared/voiceup.ts";

function createId(prefix: string) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${Date.now()}-${random}`;
}

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "voice-campaign";
}

function titleCase(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "New Voiceup Campaign";
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}

function inferGoal(goalText: string) {
  const numberMatch = String(goalText || "").replace(/,/g, "").match(/\d{2,}/);
  if (!numberMatch) return 100;
  const parsed = Number(numberMatch[0]);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 25), 1000000);
}

function inferCategory(text: string) {
  const normalized = text.toLowerCase();
  if (/cow|forest|tree|river|water|pollution|climate|animal|environment/.test(normalized)) return "Environment";
  if (/school|student|college|education|teacher/.test(normalized)) return "Education";
  if (/blood|health|hospital|doctor|medicine|clinic/.test(normalized)) return "Health";
  if (/road|bus|train|traffic|transport|metro/.test(normalized)) return "Transport";
  if (/house|housing|rent|slum|apartment/.test(normalized)) return "Housing";
  return "Civic";
}

function buildPublicUrl(slug: string) {
  const origin = Deno.env.get("VOICEUP_PUBLIC_ORIGIN") || "https://voiceup.in";
  return `${origin.replace(/\/$/, "")}/c/${slug}`;
}

function buildState(payload: any, workspaceId: string, existingSlugs: string[]) {
  const campaignId = createId("cmp");
  const userId = createId("guest");
  const tenantId = createId("tenant");
  const title = titleCase(payload.campaignName);
  const baseSlug = slugify(payload.campaignName || payload.campaignGoal);
  const slugSet = new Set(existingSlugs);
  let slug = baseSlug;
  let suffix = 2;
  while (slugSet.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  const goal = inferGoal(payload.campaignGoal);
  const trialEndsAt = addDaysIso(1);
  const country = String(payload.country || "India");
  const ownerEmail = String(payload.email || "").trim();
  const organization = {
    id: tenantId,
    name: String(payload.businessName || "Voiceup campaign").trim(),
    plan: "Free Trial",
    subscriptionStatus: "Trial",
    trialEndsAt,
    monthlySignatureLimit: 100,
    monthlyScanLimit: 10,
    monthlyMessageLimit: 0,
    bonusSignatureCredits: 0,
    bonusScanCredits: 0,
    bonusMessageCredits: 0,
    customBranding: false,
    customDomain: "",
    ownerEmail,
    billingEmail: ownerEmail,
    seats: 1,
    paymentReference: "",
    billingCadence: "monthly",
    campaignDurationDays: 30,
    supporterCountEstimate: Math.min(goal, 100),
    enabledFeatureKeys: ["public_signing", "basic_reports"],
    prepaidWalletEnabled: false,
    prepaidWalletMode: "online_payment",
    signaturePriceInr: 0,
    signatureWalletBalanceInr: 0,
    signaturePinPrefix: "VUP"
  };
  const campaign = {
    id: campaignId,
    title,
    slug,
    category: inferCategory(`${payload.campaignName} ${payload.campaignGoal}`),
    description: `${organization.name} is launching a public campaign in ${country} to ${String(payload.campaignGoal || "").trim()} Add your voice and help build visible support.`,
    appealContent: `I support "${title}" and request the relevant authority, community leaders, and stakeholders to take timely action. ${String(payload.campaignGoal || "").trim()}`,
    authorityTargetLevel: "country",
    authoritySelectionMode: "admin_enforced",
    selectedAuthorityId: "",
    geographyMode: "global",
    campaignScope: country === "Other" ? "global" : "national",
    country,
    donationEnabled: false,
    donationLockedBySaas: false,
    donationCaption: "Support this campaign with a voluntary contribution.",
    donationUpiId: "",
    donationQrImage: "",
    donationPaymentDetails: "",
    donationAllowOneTime: true,
    donationAllowRecurring: false,
    state: "",
    district: "",
    block: "",
    panchayat: "",
    location: country,
    postalCode: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: addDaysIso(30),
    goal,
    status: "Published",
    consentText: "I consent to this organization storing my details and using them only for this campaign.",
    requiredFields: ["name", "phone"],
    requiredFieldsLockedBySaas: false,
    authorityLockedBySaas: false,
    publishingLockedBySaas: false,
    goalLockedBySaas: false,
    datesLockedBySaas: false,
    maxSignersAllowed: Math.min(goal, 100),
    maxScansAllowed: 10,
    shareUrl: buildPublicUrl(slug),
    adminUrl: `${buildPublicUrl(slug)}/admin`,
    adminEmail: ownerEmail,
    adminPasscode: createSecureToken("camp").slice(0, 18),
    qrLabel: "VOICEUP-GLOBAL-TRIAL",
    heroImage: "",
    heroImagePosition: "center center",
    heroImageZoom: 120,
    campaignVideoUrl: "",
    socialShareText: `Add your voice to ${title}.`,
    thankYouMessage: `Thank you for signing ${title}. Share this campaign: {{url}}`,
    participantUpdateMessage: `{{campaign}} update: {{verified}} verified supporters have joined. Share this campaign: {{url}}`,
    signerLocationRestrictionLevel: "none"
  };
  const auditLogs = [
    {
      id: createId("audit"),
      action: "campaign.created",
      actor: ownerEmail || String(payload.mobileNumber || ""),
      campaignId,
      description: `Created public onboarding campaign "${title}"`,
      createdAt: new Date().toISOString(),
      metadata: {
        userId,
        tenantId,
        workspaceId,
        source: payload.tracking?.utmSource || "direct",
        deviceId: payload.tracking?.deviceId || ""
      }
    },
    {
      id: createId("audit"),
      action: "campaign.published",
      actor: ownerEmail || String(payload.mobileNumber || ""),
      campaignId,
      description: "Published campaign from 60-second onboarding",
      createdAt: new Date().toISOString(),
      metadata: { shareUrl: campaign.shareUrl, trialEndsAt }
    }
  ];
  return {
    result: {
      campaign,
      organization,
      userId,
      tenantId,
      workspaceId,
      shareUrl: campaign.shareUrl,
      shortUrl: campaign.shareUrl,
      qrValue: campaign.shareUrl,
      trialEndsAt,
      restored: false
    },
    state: {
      campaigns: [campaign],
      signers: [],
      authorities: [],
      organization,
      scanItems: [],
      locationOverrides: {},
      locationDeletions: { state: [], district: [], block: [], panchayat: [] },
      auditLogs,
      integrations: {
        razorpayKeyId: "",
        razorpayPlanReference: "",
        whatsappProvider: "Not configured",
        whatsappSenderId: "",
        smsProvider: "Not configured",
        smsSenderId: "",
        emailProvider: "Not configured",
        emailSender: "",
        storageProvider: "Supabase Storage",
        storageBucket: "voiceup-campaign-media",
        analyticsProvider: "Vercel Analytics",
        analyticsKey: ""
      },
      commercialPackages: []
    }
  };
}

async function issueCustomerSession(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  phoneHash: string,
  campaignId: string
) {
  const token = createSecureToken("cust");
  const { error } = await admin.from("voiceup_customer_sessions").insert({
    workspace_id: workspaceId,
    token_hash: await sha256Hex(token),
    mobile_hash: phoneHash,
    role: "organization_admin",
    campaign_id: campaignId,
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString()
  });
  if (error) throw error;
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await parseJson(req);
    const payload = body?.payload ?? {};
    const seedWorkspaceId = String(body?.workspaceId ?? "default");
    const phone = normalizePhone(String(payload?.mobileNumber ?? ""));
    if (!phone) {
      return jsonResponse({ error: "Mobile verification is required." }, 400);
    }

    const admin = createAdminClient();
    const phoneHash = await sha256Hex(`${seedWorkspaceId}:${phone}`);
    const { data: previousSessions, error: sessionError } = await admin
      .from("voiceup_customer_sessions")
      .select("workspace_id, campaign_id, created_at")
      .eq("mobile_hash", phoneHash)
      .order("created_at", { ascending: false })
      .limit(5);
    if (sessionError) throw sessionError;

    for (const session of previousSessions ?? []) {
      const state = await readWorkspace(admin, session.workspace_id);
      const campaign = Array.isArray(state?.campaigns)
        ? state.campaigns.find((item: any) => item.id === session.campaign_id) ?? state.campaigns[0]
        : null;
      if (!state?.organization || !campaign) continue;
      const token = await issueCustomerSession(admin, session.workspace_id, phoneHash, campaign.id);
      return jsonResponse({
        result: {
          campaign,
          organization: state.organization,
          userId: String(state.auditLogs?.[0]?.metadata?.userId ?? createId("guest")),
          tenantId: state.organization.id,
          workspaceId: session.workspace_id,
          shareUrl: campaign.shareUrl,
          shortUrl: campaign.shareUrl,
          qrValue: campaign.shareUrl,
          trialEndsAt: state.organization.trialEndsAt,
          restored: true
        },
        state,
        customerSessionToken: token
      });
    }

    const existingSlugRows = await admin
      .from("voiceup_public_campaign_index")
      .select("slug");
    if (existingSlugRows.error) throw existingSlugRows.error;
    const workspaceId = createId("workspace");
    const built = buildState(payload, workspaceId, (existingSlugRows.data ?? []).map((item: any) => item.slug));
    await writeWorkspace(admin, workspaceId, built.state);
    await refreshPublicCampaignIndex(admin, workspaceId, built.state);
    const token = await issueCustomerSession(admin, workspaceId, phoneHash, built.result.campaign.id);

    return jsonResponse({
      ...built,
      customerSessionToken: token
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Trial onboarding failed." }, 500);
  }
});
