import {
  getSupporterAuthClient,
  type SupporterAuthClient
} from "./supporterAuth.ts";
import { sanitizeVoiceupLoginReturnPath } from "./campaignAuthContext.ts";

export interface SupporterEmailConfirmationRequest {
  code: string | null;
  implicitTokens?: { accessToken: string; refreshToken: string } | null;
  invalid: boolean;
  returnPath: string;
}

export type SupporterEmailConfirmationResult = "confirmed" | "invalid";

export function getSupporterLoginPath(hostname: string, returnPath?: string): string {
  void hostname;
  return sanitizeVoiceupLoginReturnPath(returnPath);
}

declare global {
  interface Window {
    __voiceupSupporterConfirmationRequest?: {
      search: string;
      hash: string;
    };
  }
}

const errorParameterNames = ["error", "error_code", "error_description"];
const forbiddenCredentialNames = ["token", "token_hash"];

function hasAnyParameter(
  search: URLSearchParams,
  hash: URLSearchParams,
  names: string[]
): boolean {
  return names.some((name) => search.has(name) || hash.has(name));
}

function isWellFormedAuthorizationCode(code: string): boolean {
  return code.length >= 16
    && code.length <= 4096
    && code === code.trim()
    && /^[A-Za-z0-9._~-]+$/.test(code);
}

export function readSupporterEmailConfirmationRequest(
  rawSearch: string,
  rawHash: string
): SupporterEmailConfirmationRequest {
  const search = new URLSearchParams(rawSearch.replace(/^\?/, ""));
  const hash = new URLSearchParams(rawHash.replace(/^#/, ""));
  const codes = search.getAll("code");
  const code = codes.length === 1 ? codes[0] : null;
  const returnPaths = search.getAll("return_to");
  const returnPath = returnPaths.length === 1
    ? sanitizeVoiceupLoginReturnPath(returnPaths[0])
    : "/login";
  // Supabase's hosted magic-link template may redirect with an implicit session
  // fragment rather than a PKCE code. Only accept a complete pair in the hash;
  // the session is validated remotely before the page reports success.
  const accessTokens = hash.getAll("access_token");
  const refreshTokens = hash.getAll("refresh_token");
  const hasImplicitCredentials = accessTokens.length > 0 || refreshTokens.length > 0;
  const implicitTokens = accessTokens.length === 1 && refreshTokens.length === 1
    && accessTokens[0].length >= 16 && refreshTokens[0].length >= 16
    && accessTokens[0].length <= 8192 && refreshTokens[0].length <= 8192
    ? { accessToken: accessTokens[0], refreshToken: refreshTokens[0] }
    : null;
  const invalid = hasAnyParameter(search, hash, errorParameterNames)
    || hasAnyParameter(search, hash, forbiddenCredentialNames)
    || search.has("access_token") || search.has("refresh_token")
    || (hasImplicitCredentials && !implicitTokens)
    || (hasImplicitCredentials && code !== null)
    || (hasImplicitCredentials && ![null, "magiclink", "signup", "email"].includes(hash.get("type")))
    || (hasImplicitCredentials && search.has("type"))
    || hash.getAll("access_token").length > 1
    || hash.getAll("refresh_token").length > 1
    || codes.length > 1
    || returnPaths.length > 1
    || (code !== null && !isWellFormedAuthorizationCode(code));

  return { code, invalid, returnPath, ...(implicitTokens ? { implicitTokens } : {}) };
}

async function clearInvalidSession(client: SupporterAuthClient): Promise<void> {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // The invalid result remains fail-closed even if no local session exists.
  }
}

export async function confirmSupporterEmail(
  request: SupporterEmailConfirmationRequest,
  client: SupporterAuthClient
): Promise<SupporterEmailConfirmationResult> {
  if (request.invalid) return "invalid";

  if (request.code) {
    const { data, error } = await client.auth.exchangeCodeForSession(request.code);
    if (error || !data.session) {
      await clearInvalidSession(client);
      return "invalid";
    }
  } else if (request.implicitTokens) {
    const { data, error } = await client.auth.setSession({
      access_token: request.implicitTokens.accessToken,
      refresh_token: request.implicitTokens.refreshToken
    });
    if (error || !data.session) {
      await clearInvalidSession(client);
      return "invalid";
    }
  } else {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) return "invalid";
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.id || !data.user.email_confirmed_at) {
    await clearInvalidSession(client);
    return "invalid";
  }

  return "confirmed";
}

function showResult(result: SupporterEmailConfirmationResult, returnPath: string): void {
  const checking = document.getElementById("confirmation-checking");
  const success = document.getElementById("confirmation-success");
  const invalid = document.getElementById("confirmation-invalid");
  const main = document.querySelector("main");
  const loginPath = getSupporterLoginPath(window.location.hostname, returnPath);

  document.querySelectorAll<HTMLAnchorElement>("[data-supporter-login-link]")
    .forEach((link) => { link.href = loginPath; });

  if (checking instanceof HTMLElement) checking.hidden = true;
  if (success instanceof HTMLElement) success.hidden = result !== "confirmed";
  if (invalid instanceof HTMLElement) invalid.hidden = result !== "invalid";
  main?.setAttribute("aria-busy", "false");
  document.documentElement.classList.remove("confirmation-pending");

  if (result === "confirmed" && loginPath !== "/login") {
    window.setTimeout(() => window.location.replace(loginPath), 700);
  }
}

async function initializeSupporterEmailConfirmation(): Promise<void> {
  const captured = window.__voiceupSupporterConfirmationRequest ?? {
    search: window.location.search,
    hash: window.location.hash
  };
  delete window.__voiceupSupporterConfirmationRequest;

  // The blocking external bootstrap normally clears this before body parsing.
  // Clear again before the first await so a missing bootstrap still fails safe.
  window.history.replaceState(null, "", window.location.pathname);
  const request = readSupporterEmailConfirmationRequest(captured.search, captured.hash);

  try {
    showResult(await confirmSupporterEmail(request, getSupporterAuthClient()), request.returnPath);
  } catch {
    showResult("invalid", request.returnPath);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void initializeSupporterEmailConfirmation();
}
