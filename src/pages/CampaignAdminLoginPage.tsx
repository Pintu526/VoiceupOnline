import type { FormEvent } from "react";
import { Megaphone } from "lucide-react";
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
    <main className="public-only-shell">
      <section className="campaign-admin-login">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>Campaign admin access</span>
          </div>
        </div>
        <span className="eyebrow">Protected campaign admin</span>
        <h1>{campaign.title}</h1>
        <p>
          Login to manage this campaign, review signers, scan hard copies, send updates, and view
          reports.
        </p>
        <form className="form-stack" onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="Campaign admin email"
            value={adminLogin.email}
            onChange={(event) => setAdminLogin({ ...adminLogin, email: event.target.value })}
          />
          <PasswordField
            placeholder="Campaign admin passcode"
            value={adminLogin.passcode}
            onChange={(event) => setAdminLogin({ ...adminLogin, passcode: event.target.value })}
          />
          <button className="primary-button" type="submit">
            Login to campaign admin
          </button>
          {message && <p className="info-message">{message}</p>}
        </form>
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
