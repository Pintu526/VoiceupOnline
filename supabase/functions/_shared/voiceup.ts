import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Missing Supabase service configuration.");
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createUserClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Missing Supabase anon configuration.");
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? ""
      }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function parseJson(req: Request) {
  if (req.method === "OPTIONS") return null;
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function createSecureToken(prefix: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${random}`;
}

export async function getUser(req: Request) {
  const userClient = createUserClient(req);
  const { data, error } = await userClient.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function isPlatformAdmin(admin: ReturnType<typeof createAdminClient>, userId: string | null) {
  if (!userId) return false;
  const [workspaceResult, orgResult] = await Promise.all([
    admin
      .from("voiceup_workspace_members")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "platform_owner")
      .maybeSingle(),
    admin
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "platform_owner")
      .maybeSingle()
  ]);
  return Boolean(workspaceResult.data || orgResult.data);
}

export async function getWorkspaceRole(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  userId: string | null
) {
  if (!userId) return "";
  const { data } = await admin
    .from("voiceup_workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? "";
}

export async function validateCustomerSession(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  token: string | undefined
) {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { data } = await admin
    .from("voiceup_customer_sessions")
    .select("id, workspace_id, role, campaign_id, expires_at, revoked_at")
    .eq("workspace_id", workspaceId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
}

export async function requireWorkspaceAccess(
  req: Request,
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  customerSessionToken?: string
) {
  const user = await getUser(req);
  const platformAdmin = await isPlatformAdmin(admin, user?.id ?? null);
  const role = await getWorkspaceRole(admin, workspaceId, user?.id ?? null);
  const customerSession = await validateCustomerSession(admin, workspaceId, customerSessionToken);
  if (!platformAdmin && !role && !customerSession) {
    throw new Response("Workspace access denied.", { status: 403 });
  }
  return {
    user,
    platformAdmin,
    role: platformAdmin ? "platform_owner" : role || customerSession?.role || "",
    customerSession
  };
}

export async function readWorkspace(admin: ReturnType<typeof createAdminClient>, workspaceId: string) {
  const { data, error } = await admin
    .from("voiceup_workspaces")
    .select("data")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function writeWorkspace(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  data: unknown
) {
  const { error } = await admin
    .from("voiceup_workspaces")
    .upsert({ id: workspaceId, data, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}

export function getCampaigns(state: any) {
  return Array.isArray(state?.campaigns) ? state.campaigns : [];
}

export function getSigners(state: any) {
  return Array.isArray(state?.signers) ? state.signers : [];
}

export function calculateMetrics(campaign: any, signers: any[]) {
  const campaignSigners = signers.filter((signer) => signer.campaignId === campaign.id);
  const verified = campaignSigners.filter((signer) => signer.status === "verified").length;
  const pending = campaignSigners.filter((signer) => signer.status === "pending").length;
  const duplicates = campaignSigners.filter((signer) => signer.status === "duplicate").length;
  const online = campaignSigners.filter((signer) => signer.source === "online").length;
  const scanned = campaignSigners.filter((signer) => signer.source === "scan").length;
  const target = campaign.maxSignersAllowed > 0 ? campaign.maxSignersAllowed : campaign.goal;
  return {
    total: campaignSigners.length,
    verified,
    pending,
    duplicates,
    online,
    scanned,
    progress: target > 0 ? Math.min(Math.round((verified / target) * 100), 100) : 0
  };
}

export function sanitizePublicOrganization(organization: any) {
  if (!organization) return null;
  return {
    id: organization.id,
    name: organization.name,
    plan: organization.plan,
    subscriptionStatus: organization.subscriptionStatus,
    trialEndsAt: organization.trialEndsAt,
    monthlySignatureLimit: organization.monthlySignatureLimit,
    monthlyScanLimit: organization.monthlyScanLimit,
    monthlyMessageLimit: organization.monthlyMessageLimit,
    bonusSignatureCredits: organization.bonusSignatureCredits ?? 0,
    bonusScanCredits: organization.bonusScanCredits ?? 0,
    bonusMessageCredits: organization.bonusMessageCredits ?? 0,
    customBranding: Boolean(organization.customBranding),
    customDomain: organization.customDomain ?? "",
    ownerEmail: "",
    billingEmail: "",
    seats: organization.seats ?? 1,
    paymentReference: "",
    enabledFeatureKeys: organization.enabledFeatureKeys ?? []
  };
}

export function publicAuthoritiesForCampaign(state: any, campaign: any) {
  return Array.isArray(state?.authorities)
    ? state.authorities.filter((authority: any) => {
        if (authority.category && authority.category !== "Any" && authority.category !== campaign.category) return false;
        if (authority.state && campaign.state && authority.state !== campaign.state) return false;
        if (authority.district && campaign.district && authority.district !== campaign.district) return false;
        return true;
      })
    : [];
}

export async function refreshPublicCampaignIndex(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  state: any
) {
  const { error: deleteError } = await admin
    .from("voiceup_public_campaign_index")
    .delete()
    .eq("workspace_id", workspaceId);
  if (deleteError) throw deleteError;

  const publishedRows = getCampaigns(state)
    .filter((campaign: any) => campaign.slug && campaign.status === "Published")
    .map((campaign: any) => ({
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      slug: campaign.slug,
      status: campaign.status,
      campaign,
      organization: sanitizePublicOrganization(state?.organization),
      authorities: publicAuthoritiesForCampaign(state, campaign),
      metrics: calculateMetrics(campaign, getSigners(state)),
      updated_at: new Date().toISOString()
    }));

  if (publishedRows.length === 0) return;
  const { error } = await admin.from("voiceup_public_campaign_index").upsert(publishedRows, {
    onConflict: "workspace_id,campaign_id"
  });
  if (error) throw error;
}

export function getPlanLimit(plan: string): number | "Unlimited" {
  if (plan === "Free Trial") return 1;
  if (plan === "Starter") return 1;
  if (plan === "Growth") return 5;
  return "Unlimited";
}

export function getSignatureLimit(plan: string): number {
  if (plan === "Free Trial") return 100;
  if (plan === "Starter") return 1000;
  if (plan === "Growth") return 25000;
  if (plan === "Pro Movement") return 100000;
  return 500000;
}

export function subscriptionBlockReason(organization: any): string {
  if (!organization) return "Workspace subscription is not configured.";
  if (organization.subscriptionStatus === "Active") return "";
  if (organization.subscriptionStatus === "Trial") {
    if (!organization.trialEndsAt) return "";
    const trialEnd = new Date(`${organization.trialEndsAt}T23:59:59`).getTime();
    return trialEnd >= Date.now() ? "" : "The trial has ended. Upgrade before continuing.";
  }
  return `Subscription is ${organization.subscriptionStatus || "not active"}.`;
}

export function hasDuplicateSigner(candidate: any, signers: any[], campaignId: string) {
  const email = String(candidate.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(candidate.phone ?? ""));
  return signers.some((signer) => {
    if (signer.campaignId !== campaignId) return false;
    const signerEmail = String(signer.email ?? "").trim().toLowerCase();
    const signerPhone = normalizePhone(String(signer.phone ?? ""));
    return Boolean((email && signerEmail === email) || (phone && signerPhone === phone));
  });
}
