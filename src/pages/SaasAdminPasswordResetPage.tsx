import { FormEvent, useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import {
  signOutSupabase,
  updatePasswordFromRecovery,
  waitForPasswordRecoverySession
} from "../backend";
import { PasswordField } from "../ui/PasswordField";

type RecoveryStatus = "checking" | "ready" | "expired" | "invalid" | "success";

const MINIMUM_PASSWORD_LENGTH = 12;

function readRecoveryLinkError(): "expired" | "invalid" | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const error = query.get("error") || hash.get("error");
  const errorCode = query.get("error_code") || hash.get("error_code");
  if (!error && !errorCode) return null;
  return errorCode === "otp_expired" || errorCode?.includes("expired") ? "expired" : "invalid";
}

function clearRecoveryParameters(): void {
  window.history.replaceState(null, "", "/admin/reset-password");
}

export function SaasAdminPasswordResetPage() {
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const linkError = readRecoveryLinkError();
    if (linkError) {
      setStatus(linkError);
      clearRecoveryParameters();
      return () => {
        cancelled = true;
      };
    }

    async function validateRecoverySession() {
      const valid = await waitForPasswordRecoverySession();
      if (cancelled) return;
      setStatus(valid ? "ready" : "invalid");
      clearRecoveryParameters();
    }

    void validateRecoverySession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    if (status !== "ready" || saving) return;
    if (newPassword.length < MINIMUM_PASSWORD_LENGTH) {
      setMessage(`Use at least ${MINIMUM_PASSWORD_LENGTH} characters for the new password.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("The password confirmation does not match.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await updatePasswordFromRecovery(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setStatus("success");
      setMessage("Password updated successfully. Returning to SaaS Admin sign in.");
      await signOutSupabase();
      window.setTimeout(() => {
        window.location.replace("/admin?passwordReset=success");
      }, 900);
    } catch (error) {
      if (error instanceof Error && error.message === "recovery_session_invalid") {
        setStatus("invalid");
        setMessage("");
      } else {
        setMessage("Password could not be updated. Use a stronger password or request a new recovery link.");
      }
    } finally {
      setSaving(false);
    }
  }

  const statusMessage = status === "expired"
    ? "This password recovery link has expired. Return to SaaS Admin sign in and request a new link."
    : status === "invalid"
      ? "This password recovery link is invalid or has already been used. Return to SaaS Admin sign in and request a new link."
      : "";

  return (
    <main className="login-shell">
      <section className="login-layout" aria-labelledby="saas-reset-title">
        <div className="login-hero-panel">
          <div className="brand login-brand">
            <div className="brand-mark">
              <ShieldCheck size={24} />
            </div>
            <div>
              <strong>Voiceup Global</strong>
              <span>Protected platform access</span>
            </div>
          </div>
          <div className="login-copy">
            <span className="eyebrow">SaaS Admin recovery</span>
            <h1 id="saas-reset-title">Choose a new password</h1>
            <p>A valid Supabase recovery session is required before any password can be changed.</p>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-header">
            <span className="login-lock-icon" aria-hidden="true">
              <LockKeyhole size={20} />
            </span>
            <div>
              <span className="eyebrow">Account recovery</span>
              <h2>Reset password</h2>
            </div>
          </div>

          {status === "checking" && (
            <p className="info-message" role="status">Validating your recovery link...</p>
          )}

          {(status === "expired" || status === "invalid") && (
            <div className="form-stack login-form">
              <p className="error-message" role="alert">{statusMessage}</p>
              <a className="primary-link-button" href="/admin">Return to SaaS Admin sign in</a>
            </div>
          )}

          {(status === "ready" || status === "success") && (
            <form className="form-stack login-form" onSubmit={submitNewPassword}>
              {status === "ready" && (
                <>
                  <label className="field" htmlFor="saas-admin-new-password">
                    <span className="label">New Password</span>
                    <PasswordField
                      id="saas-admin-new-password"
                      name="new-password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="saas-admin-confirm-password">
                    <span className="label">Confirm Password</span>
                    <PasswordField
                      id="saas-admin-confirm-password"
                      name="confirm-password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </label>
                  <p className="helper-text">Use at least {MINIMUM_PASSWORD_LENGTH} characters.</p>
                  <button className="primary-button" type="submit" disabled={saving}>
                    {saving ? "Updating password..." : "Update password"}
                  </button>
                </>
              )}
              {message && (
                <p className={status === "success" ? "info-message" : "error-message"} role="status">
                  {message}
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
