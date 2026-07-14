import type { FormEvent } from "react";
import { Building2, CheckCircle2, LockKeyhole, Megaphone, ShieldCheck } from "lucide-react";
import { PasswordField } from "../ui/PasswordField";
import { blankAppLogin } from "../constants";
import { useTranslation } from "../i18n/useTranslation";

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
  const { t } = useTranslation();
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
              <span>{t("workspace.login.enterpriseOperations")}</span>
            </div>
          </div>

          <div className="login-copy">
            <span className="eyebrow">
              {t(isWorkspaceMode ? "workspace.login.protectedWorkspace" : "workspace.login.protectedPlatform")}
            </span>
            <h1 id="saas-login-title">
              {isWorkspaceMode
                ? t("workspace.login.restoreTitle")
                : t("workspace.login.manageTitle")}
            </h1>
            <p>
              {isWorkspaceMode
                ? t("workspace.login.workspaceIntro")
                : t("workspace.login.platformIntro")}
            </p>
          </div>

          <div className="login-value-grid" aria-label={t("workspace.login.capabilitiesAria")}>
            <div>
              <Building2 size={18} />
              <span>{t("workspace.login.organizations")}</span>
              <strong>{t("workspace.login.tenantReady")}</strong>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>{t("workspace.login.access")}</span>
              <strong>{t("workspace.login.protected")}</strong>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>{t("workspace.login.operations")}</span>
              <strong>{t("workspace.login.productionReady")}</strong>
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
                {t(isWorkspaceMode ? "workspace.login.customerAccess" : "workspace.login.saasAccess")}
              </span>
              <h2>{t(isWorkspaceMode ? "workspace.login.verifySupport" : "workspace.login.signIn")}</h2>
            </div>
          </div>

          {isWorkspaceMode && (
            <a className="primary-link-button" href="/start">
              {t("workspace.login.verifyMobile")}
            </a>
          )}

          <form className="form-stack login-form" onSubmit={onSubmit}>
            <label className="field" htmlFor="saas-admin-email">
              <span className="label">{t("login.email")}</span>
              <input
                id="saas-admin-email"
                name="email"
                type="email"
                placeholder={t("workspace.login.emailPlaceholder")}
                autoComplete="email"
                value={appLogin.email}
                onChange={(event) => setAppLogin({ ...appLogin, email: event.target.value })}
              />
            </label>
            <label className="field" htmlFor="saas-admin-passcode">
              <span className="label">{t("workspace.login.passcode")}</span>
              <PasswordField
                id="saas-admin-passcode"
                name="password"
                placeholder={t("workspace.login.passcodePlaceholder")}
                autoComplete="current-password"
                value={appLogin.passcode}
                onChange={(event) => setAppLogin({ ...appLogin, passcode: event.target.value })}
              />
            </label>
          <div className="login-role-note">
            <strong>
              {t("workspace.login.role")}: {t(isWorkspaceMode ? "workspace.login.customerRole" : "workspace.login.platformRole")}
            </strong>
            <span>
              {isWorkspaceMode
                ? t("workspace.login.customerRoleHelp")
                : t("workspace.login.platformRoleHelp")}
            </span>
          </div>
          <button className="primary-button" type="submit">
            {t(isWorkspaceMode ? "workspace.login.supportLogin" : "workspace.login.adminLogin")}
          </button>
          {message && <p className="info-message">{message}</p>}
          <p className="helper-text">
            {isWorkspaceMode
              ? t("workspace.login.customerSessionHelp")
              : t("workspace.login.platformSessionHelp")}
          </p>
          </form>
        </div>
      </section>
    </main>
  );
}
