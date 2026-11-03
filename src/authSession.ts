/**
 * One Supabase Auth session namespace for the integrated VoiceUp / Business OS
 * experience. Authorization continues to come from server-side memberships,
 * assignments, ownership mappings, and RPC checks; this key is only session storage.
 */
export const VOICEUP_AUTH_STORAGE_KEY = "voiceup-auth-session-v2";
