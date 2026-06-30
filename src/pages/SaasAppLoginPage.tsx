import type { FormEvent } from "react";
import { Megaphone } from "lucide-react";
import { PasswordField } from "../ui/PasswordField";
import { blankAppLogin } from "../constants";
import { areAppAdminCredentialsConfigured } from "../utils/auth";

interface SaasAppLoginPageProps {
  appLogin: typeof blankAppLogin;
  setAppLogin: React.Dispatch<React.SetStateAction<typeof blankAppLogin>>;
  message: string;
  onSubmit: (event: FormEvent) => void;
}

export function SaasAppLoginPage({
  appLogin,
  setAppLogin,
  message,
  onSubmit
}: SaasAppLoginPageProps) {
  const adminCredentialsConfigured = areAppAdminCredentialsConfigured();

  return (
    <main className="public-only-shell">
      <section className="campaign-admin-login">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>SaaS admin access</span>
          </div>
        </div>
        <span className="eyebrow">Protected SaaS workspace</span>
        <h1>Login to manage campaign organizations.</h1>
        <p>
          Use this protected workspace to create campaigns, configure subscriptions, manage public
          links, and view reports.
        </p>
        <form className="form-stack" onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="SaaS admin email"
            value={appLogin.email}
            onChange={(event) => setAppLogin({ ...appLogin, email: event.target.value })}
          />
          <PasswordField
            placeholder="SaaS admin passcode"
            value={appLogin.passcode}
            onChange={(event) => setAppLogin({ ...appLogin, passcode: event.target.value })}
          />
          <div className="login-role-note">
            <strong>Login role: SaaS / Platform Admin</strong>
            <span>
              Use this only for platform owner tasks such as subscriptions, packages, global
              campaign controls, and integrations.
            </span>
          </div>
          {!adminCredentialsConfigured && (
            <p className="error-message">
              SaaS admin login is disabled until VITE_VOICEUP_APP_ADMIN_EMAIL and
              VITE_VOICEUP_APP_ADMIN_PASSCODE are configured.
            </p>
          )}
          <button className="primary-button" type="submit">
            Login to SaaS admin
          </button>
          {message && <p className="info-message">{message}</p>}
          <p className="helper-text">
            Configure production credentials with Vercel environment variables
            VITE_VOICEUP_APP_ADMIN_EMAIL and VITE_VOICEUP_APP_ADMIN_PASSCODE. For real production,
            replace this with Supabase Auth.
          </p>
        </form>
      </section>
    </main>
  );
}
