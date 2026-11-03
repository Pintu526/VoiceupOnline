import { createClient } from "@supabase/supabase-js";
import { VOICEUP_AUTH_STORAGE_KEY } from "./authSession.ts";
import { sanitizeVoiceupLoginReturnPath } from "./campaignAuthContext.ts";

export const SUPPORTER_AUTH_STORAGE_KEY = VOICEUP_AUTH_STORAGE_KEY;
export const SUPPORTER_EMAIL_CONFIRMATION_PATH = "/supporter-email-confirmed.html";
export const SUPPORTER_PASSWORD_RESET_PATH = "/supporter-reset-password.html";

export type SupporterAuthErrorCode =
  | "supporter_auth_unavailable"
  | "supporter_registration_failed"
  | "supporter_email_confirmation_not_enforced"
  | "supporter_login_failed"
  | "supporter_email_not_confirmed"
  | "supporter_otp_request_failed"
  | "supporter_otp_verification_failed"
  | "supporter_recovery_request_failed";

export class SupporterAuthError extends Error {
  readonly code: SupporterAuthErrorCode;

  constructor(code: SupporterAuthErrorCode) {
    super(code);
    this.name = "SupporterAuthError";
    this.code = code;
  }
}

export interface SupporterAuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}

export interface SupporterAuthSession {
  user?: SupporterAuthUser;
}

export interface SupporterAuthClient {
  auth: {
    signUp(input: {
      email: string;
      password: string;
      options: { emailRedirectTo: string };
    }): Promise<{
      data: { user: SupporterAuthUser | null; session: SupporterAuthSession | null };
      error: unknown | null;
    }>;
    signInWithPassword(input: { email: string; password: string }): Promise<{
      data: { user: SupporterAuthUser | null; session: SupporterAuthSession | null };
      error: unknown | null;
    }>;
    signInWithOtp(input: {
      email: string;
      options: { emailRedirectTo: string; shouldCreateUser: false };
    }): Promise<{ data: unknown | null; error: unknown | null }>;
    verifyOtp(input: { email: string; token: string; type: "email" }): Promise<{
      data: { user: SupporterAuthUser | null; session: SupporterAuthSession | null };
      error: unknown | null;
    }>;
    exchangeCodeForSession(code: string): Promise<{
      data: {
        user: SupporterAuthUser | null;
        session: SupporterAuthSession | null;
        redirectType?: string | null;
      };
      error: unknown | null;
    }>;
    getSession(): Promise<{
      data: { session: SupporterAuthSession | null };
      error: unknown | null;
    }>;
    getUser(): Promise<{
      data: { user: SupporterAuthUser | null };
      error: unknown | null;
    }>;
    resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{
      data: unknown | null;
      error: unknown | null;
    }>;
    updateUser(input: { password: string }): Promise<{
      data: { user: SupporterAuthUser | null };
      error: unknown | null;
    }>;
    onAuthStateChange(callback: (
      event: string,
      session: SupporterAuthSession | null
    ) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
    signOut(options?: { scope?: "global" | "local" | "others" }): Promise<{ error: unknown | null }>;
  };
}

export interface SupporterIdentity {
  id: string;
  email: string;
}

export interface SupporterRegistrationResult {
  status: "confirmation_required";
  email: string;
}

let supporterClient: SupporterAuthClient | null | undefined;

export function createSupporterAuthClient(
  supabaseUrl: string,
  supabaseAnonKey: string
): SupporterAuthClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: SUPPORTER_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  }) as unknown as SupporterAuthClient;
}

export function getSupporterAuthClient(): SupporterAuthClient {
  if (supporterClient !== undefined) {
    if (!supporterClient) throw new SupporterAuthError("supporter_auth_unavailable");
    return supporterClient;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  supporterClient = supabaseUrl && supabaseAnonKey
    ? createSupporterAuthClient(supabaseUrl, supabaseAnonKey)
    : null;

  if (!supporterClient) throw new SupporterAuthError("supporter_auth_unavailable");
  return supporterClient;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function confirmationRedirectUrl(origin: string, returnPath = "/login"): string {
  const redirect = new URL(SUPPORTER_EMAIL_CONFIRMATION_PATH, origin);
  const safeReturnPath = sanitizeVoiceupLoginReturnPath(returnPath);
  if (safeReturnPath !== "/login") redirect.searchParams.set("return_to", safeReturnPath);
  return redirect.toString();
}

function passwordResetRedirectUrl(origin: string): string {
  return new URL(SUPPORTER_PASSWORD_RESET_PATH, origin).toString();
}

async function clearLocalSupporterSession(client: SupporterAuthClient): Promise<void> {
  await client.auth.signOut({ scope: "local" });
}

export async function registerSupporterWithEmail(
  email: string,
  password: string,
  origin = window.location.origin,
  client = getSupporterAuthClient()
): Promise<SupporterRegistrationResult> {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: { emailRedirectTo: confirmationRedirectUrl(origin) }
  });

  if (error) throw new SupporterAuthError("supporter_registration_failed");

  // Supporter accounts must never become usable before mailbox ownership is
  // confirmed. Supabase returns a session here only when email confirmation is
  // disabled, which is a deployment configuration error for this flow.
  if (data.session || data.user?.email_confirmed_at) {
    await clearLocalSupporterSession(client);
    throw new SupporterAuthError("supporter_email_confirmation_not_enforced");
  }

  return { status: "confirmation_required", email: normalizedEmail };
}

export async function registerSupporterWithEmailForContext(
  email: string,
  password: string,
  returnPath: string,
  origin = window.location.origin,
  client = getSupporterAuthClient()
): Promise<SupporterRegistrationResult> {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: { emailRedirectTo: confirmationRedirectUrl(origin, returnPath) }
  });

  if (error) throw new SupporterAuthError("supporter_registration_failed");
  if (data.session || data.user?.email_confirmed_at) {
    await clearLocalSupporterSession(client);
    throw new SupporterAuthError("supporter_email_confirmation_not_enforced");
  }
  return { status: "confirmation_required", email: normalizedEmail };
}

export async function loginSupporterWithEmail(
  email: string,
  password: string,
  client = getSupporterAuthClient()
): Promise<SupporterIdentity> {
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeEmail(email),
    password
  });

  if (error || !data.session || !data.user) {
    throw new SupporterAuthError("supporter_login_failed");
  }

  if (!data.user.email_confirmed_at) {
    await clearLocalSupporterSession(client);
    throw new SupporterAuthError("supporter_email_not_confirmed");
  }

  return {
    id: data.user.id,
    email: normalizeEmail(data.user.email ?? email)
  };
}

export async function getCurrentSupporterIdentity(
  client = getSupporterAuthClient()
): Promise<SupporterIdentity | null> {
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  if (error || !user?.id || !user.email) return null;
  if (!user.email_confirmed_at) {
    await clearLocalSupporterSession(client);
    return null;
  }
  return { id: user.id, email: normalizeEmail(user.email) };
}

export async function requestSupporterEmailOtp(
  email: string,
  returnPath = "/login",
  origin = window.location.origin,
  client = getSupporterAuthClient()
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: confirmationRedirectUrl(origin, returnPath),
      shouldCreateUser: false
    }
  });
  if (error) throw new SupporterAuthError("supporter_otp_request_failed");
}

export async function verifySupporterEmailOtp(
  email: string,
  token: string,
  client = getSupporterAuthClient()
): Promise<SupporterIdentity> {
  const normalizedToken = token.trim();
  if (!/^\d{6,10}$/.test(normalizedToken)) {
    throw new SupporterAuthError("supporter_otp_verification_failed");
  }
  const { data, error } = await client.auth.verifyOtp({
    email: normalizeEmail(email),
    token: normalizedToken,
    type: "email"
  });
  if (error || !data.session || !data.user?.id || !data.user.email || !data.user.email_confirmed_at) {
    await clearLocalSupporterSession(client);
    throw new SupporterAuthError("supporter_otp_verification_failed");
  }
  return { id: data.user.id, email: normalizeEmail(data.user.email) };
}

export async function requestSupporterPasswordRecovery(
  email: string,
  origin = window.location.origin,
  client = getSupporterAuthClient()
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: passwordResetRedirectUrl(origin)
  });
  if (error) throw new SupporterAuthError("supporter_recovery_request_failed");
}

export async function logoutSupporter(client = getSupporterAuthClient()): Promise<void> {
  await clearLocalSupporterSession(client);
}
