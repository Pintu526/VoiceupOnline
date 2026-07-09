import { createClient } from "@supabase/supabase-js";
import type {
  AuditLogEntry,
  AuthorityRule,
  Campaign,
  CommercialPackage,
  IntegrationSettings,
  Organization,
  ScanReviewItem,
  Signer
} from "./types";
import type { LocationDeletions, LocationOverrides } from "./geography";

export interface VoiceupRemoteState {
  campaigns: Campaign[];
  signers: Signer[];
  authorities: AuthorityRule[];
  organization: Organization;
  scanItems: ScanReviewItem[];
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  auditLogs?: AuditLogEntry[];
  integrations?: IntegrationSettings;
  commercialPackages?: CommercialPackage[];
}

export interface VoiceupAccessContext {
  platformAdmin: boolean;
  workspaceMember: boolean;
  customerWorkspace: boolean;
  role: string;
  email: string;
  workspaceId: string;
}

export interface PublicCampaignPayload {
  campaign: Campaign;
  organization?: Organization;
  authorities: AuthorityRule[];
  metrics: {
    total: number;
    verified: number;
    pending: number;
    duplicates: number;
    online: number;
    scanned: number;
    progress: number;
  };
}

export interface OtpRequestResult {
  challengeId: string;
  resendAfterSeconds: number;
  message: string;
}

export interface OtpVerifyResult {
  verified: boolean;
  verificationToken: string;
  customerSessionToken?: string;
  workspaceId?: string;
  message: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const fallbackWorkspaceId = (import.meta.env.VITE_VOICEUP_WORKSPACE_ID as string | undefined) || "default";
const customerSessionKey = "voiceup-customer-session-v1";
const customerWorkspaceKey = "voiceup-customer-workspace-v1";

export const isBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = isBackendConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export const isSupabaseAuthAvailable = Boolean(supabase);
export const isSupabaseStorageAvailable = Boolean(supabase);

function readCustomerSessionToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(customerSessionKey) ?? "";
}

function readWorkspaceId(): string {
  if (typeof window === "undefined") return fallbackWorkspaceId;
  return window.localStorage.getItem(customerWorkspaceKey) || fallbackWorkspaceId;
}

export function clearCustomerSessionToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(customerSessionKey);
  window.localStorage.removeItem(customerWorkspaceKey);
}

function writeCustomerSessionToken(token: string, workspaceId?: string): void {
  if (typeof window === "undefined" || !token) return;
  window.localStorage.setItem(customerSessionKey, token);
  if (workspaceId) window.localStorage.setItem(customerWorkspaceKey, workspaceId);
}

async function invokeVoiceupFunction<T>(
  functionName: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body: {
      workspaceId: readWorkspaceId(),
      customerSessionToken: readCustomerSessionToken(),
      ...body
    }
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${functionName} returned no data.`);
  return data;
}

export async function getCurrentAuthUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getAuthContext(): Promise<VoiceupAccessContext> {
  if (!supabase) {
    return {
      platformAdmin: false,
      workspaceMember: false,
      customerWorkspace: false,
      role: "",
      email: "",
      workspaceId: fallbackWorkspaceId
    };
  }

  return invokeVoiceupFunction<VoiceupAccessContext>("voiceup-auth-context");
}

export async function signInWithSupabase(email: string, password: string) {
  if (!supabase) {
    throw new Error("Supabase Auth is required for platform administration.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return data.user;
}

export async function signOutSupabase() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function loadRemoteState() {
  if (!supabase) return null;
  const result = await invokeVoiceupFunction<{ state: VoiceupRemoteState | null }>(
    "voiceup-workspace-state",
    { action: "load" }
  );
  return result.state;
}

export async function saveRemoteState(state: VoiceupRemoteState) {
  if (!supabase) return;
  await invokeVoiceupFunction<{ ok: boolean }>("voiceup-workspace-state", {
    action: "save",
    state
  });
}

export async function loadPublicCampaign(slug: string): Promise<PublicCampaignPayload | null> {
  if (!supabase) return null;
  const result = await invokeVoiceupFunction<{ campaign: PublicCampaignPayload | null }>(
    "voiceup-public-campaign",
    { slug }
  );
  return result.campaign;
}

export async function requestOtp(
  phone: string,
  purpose: "public-signing" | "onboarding",
  metadata: Record<string, unknown> = {}
): Promise<OtpRequestResult> {
  return invokeVoiceupFunction<OtpRequestResult>("voiceup-otp", {
    action: "send",
    phone,
    purpose,
    metadata
  });
}

export async function verifyOtp(
  challengeId: string,
  phone: string,
  code: string,
  purpose: "public-signing" | "onboarding",
  metadata: Record<string, unknown> = {}
): Promise<OtpVerifyResult> {
  const result = await invokeVoiceupFunction<OtpVerifyResult>("voiceup-otp", {
    action: "verify",
    challengeId,
    phone,
    code,
    purpose,
    metadata
  });
  if (result.customerSessionToken) writeCustomerSessionToken(result.customerSessionToken, result.workspaceId);
  return result;
}

export async function createTrialWorkspace(payload: unknown): Promise<{
  result: {
    campaign: Campaign;
    organization: Organization;
    userId: string;
    tenantId: string;
    workspaceId: string;
    shareUrl: string;
    shortUrl: string;
    qrValue: string;
    trialEndsAt: string;
    restored: boolean;
  };
  state: VoiceupRemoteState;
  customerSessionToken: string;
}> {
  const response = await invokeVoiceupFunction<{
    result: {
      campaign: Campaign;
      organization: Organization;
      userId: string;
      tenantId: string;
      workspaceId: string;
      shareUrl: string;
      shortUrl: string;
      qrValue: string;
      trialEndsAt: string;
      restored: boolean;
    };
    state: VoiceupRemoteState;
    customerSessionToken: string;
  }>("voiceup-trial-onboarding", { payload });
  writeCustomerSessionToken(response.customerSessionToken, response.result.workspaceId);
  return response;
}

export async function submitPublicSignatureSecure(
  slug: string,
  signer: unknown
): Promise<{ signer: Signer; message: string; metrics: PublicCampaignPayload["metrics"] }> {
  return invokeVoiceupFunction<{ signer: Signer; message: string; metrics: PublicCampaignPayload["metrics"] }>(
    "voiceup-public-signing",
    { slug, signer }
  );
}

export async function uploadFileToStorage(bucket: string, path: string, file: File) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    throw new Error("Authenticated workspace access is required before uploading files.");
  }

  const workspaceScopedPath = path.startsWith(`${readWorkspaceId()}/`)
    ? path
    : `${readWorkspaceId()}/${path}`;

  const { error } = await supabase.storage.from(bucket).upload(workspaceScopedPath, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: false
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(workspaceScopedPath);

  return {
    path: workspaceScopedPath,
    publicUrl: data.publicUrl
  };
}
