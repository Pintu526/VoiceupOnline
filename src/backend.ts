import { createClient } from "@supabase/supabase-js";
import type { AuditLogEntry, AuthorityRule, Campaign, IntegrationSettings, Organization, ScanReviewItem, Signer } from "./types";
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
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const workspaceId = (import.meta.env.VITE_VOICEUP_WORKSPACE_ID as string | undefined) || "default";

export const isBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = isBackendConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export const isSupabaseAuthAvailable = Boolean(supabase);
export const isSupabaseStorageAvailable = Boolean(supabase);

export async function getCurrentAuthUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signInWithSupabase(email: string, password: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
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

  const { data, error } = await supabase
    .from("voiceup_workspaces")
    .select("data")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.data as VoiceupRemoteState | undefined) ?? null;
}

export async function saveRemoteState(state: VoiceupRemoteState) {
  if (!supabase) return;

  const { error } = await supabase.from("voiceup_workspaces").upsert(
    {
      id: workspaceId,
      data: state,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function uploadFileToStorage(bucket: string, path: string, file: File) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: true
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    path,
    publicUrl: data.publicUrl
  };
}
