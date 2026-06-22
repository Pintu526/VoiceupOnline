import { createClient } from "@supabase/supabase-js";
import type { AuthorityRule, Campaign, Organization, ScanReviewItem, Signer } from "./types";
import type { LocationDeletions, LocationOverrides } from "./geography";

export interface VoiceupRemoteState {
  campaigns: Campaign[];
  signers: Signer[];
  authorities: AuthorityRule[];
  organization: Organization;
  scanItems: ScanReviewItem[];
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const workspaceId = (import.meta.env.VITE_VOICEUP_WORKSPACE_ID as string | undefined) || "default";

export const isBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = isBackendConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

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
