import {
  getSupporterAuthClient,
  type SupporterAuthClient
} from "./supporterAuth.ts";
import { bindPasswordVisibilityToggle } from "./passwordVisibility.ts";

export interface SupporterRecoveryRequest {
  code: string | null;
  invalid: boolean;
}

export type SupporterRecoveryStatus = "ready" | "invalid";

declare global {
  interface Window {
    __voiceupSupporterRecoveryRequest?: {
      search: string;
      hash: string;
    };
  }
}

function isLocalRecoveryHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function hasAnyParameter(
  search: URLSearchParams,
  hash: URLSearchParams,
  names: string[]
): boolean {
  return names.some((name) => search.has(name) || hash.has(name));
}

export function readSupporterRecoveryRequest(
  rawSearch: string,
  rawHash: string
): SupporterRecoveryRequest {
  const search = new URLSearchParams(rawSearch.replace(/^\?/, ""));
  const hash = new URLSearchParams(rawHash.replace(/^#/, ""));
  const codes = search.getAll("code");
  const code = codes.length === 1 ? codes[0] : null;
  const invalid = hasAnyParameter(search, hash, ["error", "error_code", "error_description"])
    || hasAnyParameter(search, hash, ["access_token", "refresh_token", "token", "token_hash"])
    || codes.length !== 1
    || code === null
    || code.length < 16
    || code.length > 4096
    || code !== code.trim()
    || !/^[A-Za-z0-9._~-]+$/.test(code);
  return { code, invalid };
}

async function clearLocalSession(client: SupporterAuthClient): Promise<void> {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Recovery remains invalid even when there is no local supporter session.
  }
}

export function createSupporterRecoveryController(client: SupporterAuthClient) {
  let recoveryUserId = "";

  return {
    async establish(request: SupporterRecoveryRequest): Promise<SupporterRecoveryStatus> {
      recoveryUserId = "";
      if (request.invalid || !request.code) return "invalid";

      let eventRecoveryUserId = "";
      const { data: listenerData } = client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" && session?.user?.id) {
          eventRecoveryUserId = session.user.id;
        }
      });

      try {
        const { data, error } = await client.auth.exchangeCodeForSession(request.code);
        if (
          error
          || data.redirectType !== "recovery"
          || !data.session
          || !data.user?.id
          || eventRecoveryUserId !== data.user.id
        ) {
          await clearLocalSession(client);
          return "invalid";
        }

        const { data: verified, error: verifyError } = await client.auth.getUser();
        if (verifyError || verified.user?.id !== data.user.id) {
          await clearLocalSession(client);
          return "invalid";
        }

        recoveryUserId = data.user.id;
        return "ready";
      } catch {
        await clearLocalSession(client);
        return "invalid";
      } finally {
        listenerData.subscription.unsubscribe();
      }
    },

    async updatePassword(newPassword: string): Promise<boolean> {
      if (!recoveryUserId) return false;
      const { data: verified, error: verifyError } = await client.auth.getUser();
      if (verifyError || verified.user?.id !== recoveryUserId) {
        recoveryUserId = "";
        await clearLocalSession(client);
        return false;
      }

      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) return false;

      recoveryUserId = "";
      await clearLocalSession(client);
      return true;
    }
  };
}

function showSection(id: string): void {
  for (const sectionId of [
    "supporter-reset-checking",
    "supporter-reset-invalid",
    "supporter-reset-ready",
    "supporter-reset-success"
  ]) {
    const section = document.getElementById(sectionId);
    if (section instanceof HTMLElement) section.hidden = sectionId !== id;
  }
  document.querySelector("main")?.setAttribute("aria-busy", "false");
  document.documentElement.classList.remove("recovery-pending");
}

async function initializeSupporterPasswordResetPage(): Promise<void> {
  if (!isLocalRecoveryHost(window.location.hostname)) {
    document.body.replaceChildren();
    document.documentElement.classList.remove("recovery-pending");
    return;
  }

  const captured = window.__voiceupSupporterRecoveryRequest ?? {
    search: window.location.search,
    hash: window.location.hash
  };
  delete window.__voiceupSupporterRecoveryRequest;
  window.history.replaceState(null, "", window.location.pathname);

  const controller = createSupporterRecoveryController(getSupporterAuthClient());
  const status = await controller.establish(
    readSupporterRecoveryRequest(captured.search, captured.hash)
  );
  if (status !== "ready") {
    showSection("supporter-reset-invalid");
    return;
  }

  showSection("supporter-reset-ready");
  const form = document.getElementById("supporter-reset-form");
  const password = document.getElementById("supporter-reset-password");
  const confirmation = document.getElementById("supporter-reset-confirm");
  const passwordToggle = document.getElementById("supporter-reset-password-toggle");
  const confirmationToggle = document.getElementById("supporter-reset-confirm-toggle");
  const submit = document.getElementById("supporter-reset-submit");
  const message = document.getElementById("supporter-reset-message");
  if (
    !(form instanceof HTMLFormElement)
    || !(password instanceof HTMLInputElement)
    || !(confirmation instanceof HTMLInputElement)
    || !(passwordToggle instanceof HTMLButtonElement)
    || !(confirmationToggle instanceof HTMLButtonElement)
    || !(submit instanceof HTMLButtonElement)
    || !(message instanceof HTMLParagraphElement)
  ) {
    showSection("supporter-reset-invalid");
    return;
  }

  bindPasswordVisibilityToggle(password, passwordToggle);
  bindPasswordVisibilityToggle(confirmation, confirmationToggle);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      if (password.value.length < 12) {
        message.textContent = "Use at least 12 characters.";
        return;
      }
      if (password.value !== confirmation.value) {
        message.textContent = "The password confirmation does not match.";
        return;
      }

      submit.disabled = true;
      message.textContent = "Updating password…";
      const updated = await controller.updatePassword(password.value);
      password.value = "";
      confirmation.value = "";
      submit.disabled = false;
      if (updated) {
        showSection("supporter-reset-success");
      } else {
        message.textContent = "Password could not be updated. Request a new recovery link and try again.";
      }
    })();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void initializeSupporterPasswordResetPage().catch(() => {
    showSection("supporter-reset-invalid");
  });
}
