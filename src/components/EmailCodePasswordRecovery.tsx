import { useState, type FormEvent } from "react";
import { completeSupporterPasswordRecovery, requestSupporterPasswordRecovery } from "../supporterAuth.ts";
import { PasswordField } from "../ui/PasswordField";

interface Props {
  email: string;
  onClose: () => void;
}

export function EmailCodePasswordRecovery({ email, onClose }: Props) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 12 || password !== confirm) {
      setError(true);
      setMessage(password.length < 12 ? "Use at least 12 characters." : "Passwords do not match.");
      return;
    }
    setBusy(true); setError(false);
    try {
      await completeSupporterPasswordRecovery(email, code, password);
      setComplete(true);
      setMessage("Password updated. Sign in using your new password.");
    } catch {
      setError(true);
      setMessage("Unable to reset password. Check the code or request a new one.");
    } finally {
      setCode(""); setPassword(""); setConfirm(""); setBusy(false);
    }
  }
  async function resend() {
    setBusy(true); setError(false);
    try {
      await requestSupporterPasswordRecovery(email);
      setMessage("If this email has an account, a new recovery code has been sent.");
    } catch {
      setError(true); setMessage("Could not request a new code. Try again later.");
    } finally { setBusy(false); }
  }
  return (
    <section className="form-stack" aria-label="Reset password using email code">
      <h3>Reset password</h3>
      <p>Enter the verification code sent to {email}.</p>
      {!complete && <form className="form-stack" onSubmit={submit} aria-busy={busy}>
        <label className="field" htmlFor="recovery-code"><span className="label">Email verification code</span>
          <input id="recovery-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))} />
        </label>
        <label className="field" htmlFor="recovery-new-password"><span className="label">New password (12+ characters)</span>
          <PasswordField id="recovery-new-password" name="newPassword" autoComplete="new-password" required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} showLabel="Show password" hideLabel="Hide password" />
        </label>
        <label className="field" htmlFor="recovery-confirm-password"><span className="label">Confirm new password</span>
          <PasswordField id="recovery-confirm-password" name="confirmPassword" autoComplete="new-password" required disabled={busy} value={confirm} onChange={e => setConfirm(e.target.value)} showLabel="Show password" hideLabel="Hide password" />
        </label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Updating…" : "Verify code and reset password"}</button>
      </form>}
      {message && <p className={error ? "error-message" : "info-message"} role="status" aria-live="polite">{message}</p>}
      {!complete && <button className="secondary-button" type="button" disabled={busy} onClick={() => void resend()}>Resend recovery code</button>}
      <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Back to sign in</button>
    </section>
  );
}
