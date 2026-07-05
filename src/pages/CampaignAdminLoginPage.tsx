import type { FormEvent } from "react";
import { ClipboardList, FileScan, LockKeyhole, Megaphone, MessageCircle, ShieldCheck } from "lucide-react";
import { PasswordField } from "../ui/PasswordField";
import type { Campaign } from "../types";
import { blankAdminLogin } from "../constants";

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
              <span>Campaign command center</span>
            </div>
          </div>

          <div className="login-copy">
            <span className="eyebrow">Campaign Administration</span>
            <h1 id="campaign-admin-login-title">{campaign.title}</h1>
            <small className="route-context">/{campaign.slug}</small>
            <p>
              Sign in to review supporters, process scanned forms, send participant updates, and
              keep campaign operations moving.
            </p>
          </div>

          <div className="login-value-grid" aria-label="Campaign admin capabilities">
            <div>
              <ClipboardList size={18} />
              <span>Signers</span>
              <strong>Review</strong>
            </div>
            <div>
              <FileScan size={18} />
              <span>Hard copies</span>
              <strong>Scan</strong>
            </div>
            <div>
              <MessageCircle size={18} />
              <span>Updates</span>
              <strong>Engage</strong>
            </div>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-header">
            <span className="login-lock-icon" aria-hidden="true">
              <ShieldCheck size={20} />
            </span>
            <div>
              <span className="eyebrow">Campaign admin access</span>
              <h2>Sign in to manage</h2>
            </div>
          </div>

          <form className="form-stack login-form" onSubmit={onSubmit}>
            <label className="field" htmlFor="campaign-admin-email">
              <span className="label">Email address</span>
              <input
                id="campaign-admin-email"
                name="email"
                type="email"
                placeholder="Campaign admin email"
                autoComplete="email"
                value={adminLogin.email}
                onChange={(event) => setAdminLogin({ ...adminLogin, email: event.target.value })}
              />
            </label>
            <label className="field" htmlFor="campaign-admin-passcode">
              <span className="label">Passcode</span>
              <PasswordField
                id="campaign-admin-passcode"
                name="password"
                placeholder="Campaign admin passcode"
                autoComplete="current-password"
                value={adminLogin.passcode}
                onChange={(event) => setAdminLogin({ ...adminLogin, passcode: event.target.value })}
              />
            </label>
            <div className="login-role-note">
              <LockKeyhole size={18} />
              <div>
                <strong>Campaign-level access</strong>
                <span>Use the private admin credentials shared for this campaign.</span>
              </div>
            </div>
            <button className="primary-button" type="submit">
              Login to campaign admin
            </button>
            {message && <p className="info-message">{message}</p>}
          </form>
        </div>
      </section>
    </main>
  );
}

export function CampaignAdminNotFound() {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Campaign admin</span>
        <h1>Campaign admin page not found.</h1>
        <p>
          Please check the admin link or ask the campaign owner to share the correct campaign admin
          URL.
        </p>
      </section>
    </main>
  );
}
