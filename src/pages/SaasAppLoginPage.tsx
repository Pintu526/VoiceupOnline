import type { FormEvent } from "react";
import { Building2, CheckCircle2, LockKeyhole, Megaphone, ShieldCheck } from "lucide-react";
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
    <main className="login-shell">
      <section className="login-layout" aria-labelledby="saas-login-title">
        <div className="login-hero-panel">
          <div className="brand login-brand">
            <div className="brand-mark">
              <Megaphone size={24} />
            </div>
            <div>
              <strong>Voiceup Bharat</strong>
              <span>Enterprise campaign operations</span>
            </div>
          </div>

          <div className="login-copy">
            <span className="eyebrow">Protected SaaS workspace</span>
            <h1 id="saas-login-title">Manage organizations with enterprise-grade control.</h1>
            <p>
              Access subscription controls, integrations, campaign operations, and production
              workspace settings from a focused admin console.
            </p>
          </div>

          <div className="login-value-grid" aria-label="Workspace capabilities">
            <div>
              <Building2 size={18} />
              <span>Organizations</span>
              <strong>Tenant-ready</strong>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>Access</span>
              <strong>Protected</strong>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>Operations</span>
              <strong>Demo-ready</strong>
            </div>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-header">
            <span className="login-lock-icon" aria-hidden="true">
              <LockKeyhole size={20} />
            </span>
            <div>
              <span className="eyebrow">SaaS admin access</span>
              <h2>Sign in to workspace</h2>
            </div>
          </div>

          <form className="form-stack login-form" onSubmit={onSubmit}>
            <label className="field" htmlFor="saas-admin-email">
              <span className="label">Email address</span>
              <input
                id="saas-admin-email"
                name="email"
                type="email"
                placeholder="SaaS admin email"
                autoComplete="email"
                value={appLogin.email}
                onChange={(event) => setAppLogin({ ...appLogin, email: event.target.value })}
              />
            </label>
            <label className="field" htmlFor="saas-admin-passcode">
              <span className="label">Passcode</span>
              <PasswordField
                id="saas-admin-passcode"
                name="password"
                placeholder="SaaS admin passcode"
                autoComplete="current-password"
                value={appLogin.passcode}
                onChange={(event) => setAppLogin({ ...appLogin, passcode: event.target.value })}
              />
            </label>
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
        </div>
      </section>
    </main>
  );
}
