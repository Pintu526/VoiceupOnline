import {
  SupporterAuthError,
  loginSupporterWithEmail,
  registerSupporterWithEmail,
  requestSupporterPasswordRecovery
} from "./supporterAuth.ts";
import { bindPasswordVisibilityToggle } from "./passwordVisibility.ts";

type SupporterAuthTestAction = "register" | "login" | "recover";

export function isLocalSupporterAuthTestHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function safeSupporterAuthTestError(
  action: SupporterAuthTestAction,
  error: unknown
): string {
  if (error instanceof SupporterAuthError) {
    if (error.code === "supporter_auth_unavailable") {
      return "Supporter authentication is not configured for this Development workspace.";
    }
    if (error.code === "supporter_email_confirmation_not_enforced") {
      return "Registration is unavailable because email confirmation is not enabled.";
    }
    if (error.code === "supporter_email_not_confirmed") {
      return "Confirm your email before signing in.";
    }
  }

  return action === "register"
    ? "Registration could not be completed. Check the email and password and try again."
    : action === "login"
      ? "Login failed. Check your credentials and confirmation status."
      : "Password recovery could not be started. Try again later.";
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error("supporter_auth_test_page_invalid");
  return element as T;
}

function initializeSupporterAuthTestPage(): void {
  if (!isLocalSupporterAuthTestHost(window.location.hostname)) {
    document.body.replaceChildren();
    return;
  }

  const form = requireElement<HTMLFormElement>("supporter-auth-test-form");
  const email = requireElement<HTMLInputElement>("supporter-auth-email");
  const password = requireElement<HTMLInputElement>("supporter-auth-password");
  const passwordToggle = requireElement<HTMLButtonElement>("supporter-auth-password-toggle");
  const registerButton = requireElement<HTMLButtonElement>("supporter-auth-register");
  const loginButton = requireElement<HTMLButtonElement>("supporter-auth-login");
  const recoverButton = requireElement<HTMLButtonElement>("supporter-auth-recover");
  const message = requireElement<HTMLParagraphElement>("supporter-auth-message");
  bindPasswordVisibilityToggle(password, passwordToggle);

  const run = async (action: SupporterAuthTestAction) => {
    registerButton.disabled = true;
    loginButton.disabled = true;
    recoverButton.disabled = true;
    message.textContent = action === "register"
      ? "Registering…"
      : action === "login"
        ? "Signing in…"
        : "Sending recovery email…";

    try {
      if (action === "register") {
        const result = await registerSupporterWithEmail(email.value, password.value);
        message.textContent = result.status === "confirmation_required"
          ? "Registration received. Check your email to confirm the account before logging in."
          : "Registration received.";
      } else if (action === "login") {
        const identity = await loginSupporterWithEmail(email.value, password.value);
        message.textContent = `Signed in as ${identity.email}.`;
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          message.textContent = "Enter a valid supporter email address first.";
          return;
        }
        await requestSupporterPasswordRecovery(email.value);
        message.textContent = "If the account exists, a password recovery link has been sent.";
      }
    } catch (error) {
      message.textContent = safeSupporterAuthTestError(action, error);
    } finally {
      password.value = "";
      registerButton.disabled = false;
      loginButton.disabled = false;
      recoverButton.disabled = false;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run("register");
  });
  loginButton.addEventListener("click", () => void run("login"));
  recoverButton.addEventListener("click", () => void run("recover"));
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeSupporterAuthTestPage();
}
