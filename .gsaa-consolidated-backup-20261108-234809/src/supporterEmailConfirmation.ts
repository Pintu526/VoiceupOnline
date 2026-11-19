import {
  getSupporterAuthClient,
  type SupporterAuthClient
} from "./supporterAuth.ts";
import { sanitizeVoiceupLoginReturnPath } from "./campaignAuthContext.ts";

export interface SupporterEmailConfirmationRequest {
  code: string | null;
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
const credentialParameterNames = [
  "access_token",
  "refresh_token",
  "token",
  "token_hash"
];

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
  const invalid = hasAnyParameter(search, hash, errorParameterNames)
    || hasAnyParameter(search, hash, credentialParameterNames)
    || codes.length > 1
    || returnPaths.length > 1
    || (code !== null && !isWellFormedAuthorizationCode(code));

  return { code, invalid, returnPath };
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
