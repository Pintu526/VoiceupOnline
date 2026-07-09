import type { FormEvent } from "react";
import { Building2, CheckCircle2, LockKeyhole, Megaphone, ShieldCheck } from "lucide-react";
import { PasswordField } from "../ui/PasswordField";
import { blankAppLogin } from "../constants";

interface SaasAppLoginPageProps {
  mode?: "platform" | "workspace";
  appLogin: typeof blankAppLogin;
  setAppLogin: React.Dispatch<React.SetStateAction<typeof blankAppLogin>>;
  message: string;
  onSubmit: (event: FormEvent) => void;
}

export function SaasAppLoginPage({
  mode = "platform",
  appLogin,
  setAppLogin,
  message,
  onSubmit
}: SaasAppLoginPageProps) {
  const isWorkspaceMode = mode === "workspace";

  return (
    <main className="login-shell">
      <section className="login-layout" aria-labelledby="saas-login-title">
        <div className="login-hero-panel">
          <div className="brand login-brand">
            <div className="brand-mark">
              <Megaphone size={24} />
            </div>
            <div>
              <strong>Voiceup Global</strong>
              <span>Enterprise campaign operations</span>
            </div>
          </div>

          <div className="login-copy">
            <span className="eyebrow">
              {isWorkspaceMode ? "Protected customer workspace" : "Protected platform administration"}
            </span>
            <h1 id="saas-login-title">
              {isWorkspaceMode
                ? "Restore your campaign workspace after mobile verification."
                : "Manage organizations with enterprise-grade control."}
            </h1>
            <p>
              {isWorkspaceMode
                ? "Customer workspace access is created by the public onboarding OTP flow. Platform credentials can also access this workspace for support."
                : "Access subscription controls, integrations, campaign operations, and production workspace settings from a focused admin console."}
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
              <strong>Production-ready</strong>
            </div>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-header">
            <span className="login-lock-icon" aria-hidden="true">
              <LockKeyhole size={20} />
            </span>
            <div>
              <span className="eyebrow">
                {isWorkspaceMode ? "Customer workspace access" : "SaaS admin access"}
              </span>
              <h2>{isWorkspaceMode ? "Verify or use support credentials" : "Sign in to workspace"}</h2>
            </div>
          </div>

          {isWorkspaceMode && (
            <a className="primary-link-button" href="/start">
              Verify mobile and restore workspace
            </a>
          )}

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
            <strong>
              Login role: {isWorkspaceMode ? "Customer Workspace or Platform Support" : "SaaS / Platform Admin"}
            </strong>
            <span>
              {isWorkspaceMode
                ? "Visitors create customer workspace access from /start. Platform credentials are reserved for support and production operations."
                : "Use this only for platform owner tasks such as subscriptions, packages, global campaign controls, and integrations."}
            </span>
          </div>
          <button className="primary-button" type="submit">
            {isWorkspaceMode ? "Login with platform support credentials" : "Login to SaaS admin"}
          </button>
          {message && <p className="info-message">{message}</p>}
          <p className="helper-text">
            {isWorkspaceMode
              ? "Customer sessions are restored through mobile OTP. Platform support access requires an authenticated server-side role."
              : "Platform administration requires Supabase Auth plus a server-side platform_owner role."}
          </p>
          </form>
        </div>
      </section>
    </main>
  );
}
