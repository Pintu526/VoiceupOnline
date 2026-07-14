import type { FormEvent } from "react";
import { ClipboardList, FileScan, LockKeyhole, Megaphone, MessageCircle, ShieldCheck } from "lucide-react";
import { PasswordField } from "../ui/PasswordField";
import type { Campaign } from "../types";
import { blankAdminLogin } from "../constants";
import { useTranslation } from "../i18n";

interface CampaignAdminLoginPageProps {
  campaign: Campaign;
  adminLogin: typeof blankAdminLogin;
  setAdminLogin: React.Dispatch<React.SetStateAction<typeof blankAdminLogin>>;
  message: string;
  onSubmit: (event: FormEvent) => void;
}

export function CampaignAdminLoginPage({
  campaign,
  adminLogin,
  setAdminLogin,
  message,
  onSubmit
}: CampaignAdminLoginPageProps) {
  const { t } = useTranslation();
  return (
    <main className="login-shell">
      <section className="login-layout" aria-labelledby="campaign-admin-login-title">
        <div className="login-hero-panel">
          <div className="brand login-brand">
            <div className="brand-mark">
              <Megaphone size={24} />
            </div>
            <div>
              <strong>Voiceup Bharat</strong>
              <span>{t("campaignAdmin.login.commandCenter")}</span>
            </div>
          </div>

          <div className="login-copy">
            <span className="eyebrow">{t("campaignAdmin.login.administration")}</span>
            <h1 id="campaign-admin-login-title">{campaign.title}</h1>
            <small className="route-context">/{campaign.slug}</small>
            <p>{t("campaignAdmin.login.intro")}</p>
          </div>

          <div className="login-value-grid" aria-label={t("campaignAdmin.login.capabilitiesAria")}>
            <div>
              <ClipboardList size={18} />
              <span>{t("campaignAdmin.login.signers")}</span>
              <strong>{t("campaignAdmin.login.review")}</strong>
            </div>
            <div>
              <FileScan size={18} />
              <span>{t("campaignAdmin.login.hardCopies")}</span>
              <strong>{t("campaignAdmin.login.scan")}</strong>
            </div>
            <div>
              <MessageCircle size={18} />
              <span>{t("campaignAdmin.login.updates")}</span>
              <strong>{t("campaignAdmin.login.engage")}</strong>
            </div>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-header">
            <span className="login-lock-icon" aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <div>
              <span className="eyebrow">{t("campaignAdmin.login.access")}</span>
              <h2>{t("campaignAdmin.login.signInManage")}</h2>
            </div>
          </div>

          <form className="form-stack login-form" onSubmit={onSubmit}>
            <label className="field" htmlFor="campaign-admin-email">
              <span className="label">{t("campaignAdmin.login.emailAddress")}</span>
              <input
                id="campaign-admin-email"
                name="email"
                type="email"
                placeholder={t("campaignAdmin.login.emailPlaceholder")}
                autoComplete="email"
                value={adminLogin.email}
                onChange={(event) => setAdminLogin({ ...adminLogin, email: event.target.value })}
              />
            </label>
            <label className="field" htmlFor="campaign-admin-passcode">
              <span className="label">{t("campaignAdmin.login.passcode")}</span>
              <PasswordField
                id="campaign-admin-passcode"
                name="password"
                placeholder={t("campaignAdmin.login.passcodePlaceholder")}
                autoComplete="current-password"
                value={adminLogin.passcode}
                onChange={(event) => setAdminLogin({ ...adminLogin, passcode: event.target.value })}
              />
            </label>
            <div className="login-role-note">
              <LockKeyhole size={18} />
              <div>
                <strong>{t("campaignAdmin.login.campaignAccess")}</strong>
                <span>{t("campaignAdmin.login.credentialsHelp")}</span>
              </div>
            </div>
            <button className="primary-button" type="submit">
              {t("campaignAdmin.login.submit")}
            </button>
            {message && <p className="info-message">{message}</p>}
          </form>
        </div>
      </section>
    </main>
  );
}

export function CampaignAdminNotFound() {
  const { t } = useTranslation();
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">{t("campaignAdmin.notFound.eyebrow")}</span>
        <h1>{t("campaignAdmin.notFound.title")}</h1>
        <p>{t("campaignAdmin.notFound.description")}</p>
      </section>
    </main>
  );
}
