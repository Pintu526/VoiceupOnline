import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  LogOut,
  Megaphone,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import { LanguageSwitcher } from "../i18n";
import { useTranslation } from "../i18n/useTranslation";
import {
  AccountAccessError,
  getAuthorizedDestinations,
  loadOwnedSupporterDashboard,
  loadVoiceupAccessManifest,
  resolveAutomaticDestination,
  selectVoiceupWorkspace,
  writeUnifiedLoginHandoff,
  type AccessDestination,
  type SupporterDashboardModel,
  type VoiceupAccessManifest
} from "../accountAccess.ts";
import { getCurrentSupporterIdentity, logoutSupporter } from "../supporterAuth.ts";
import { SupporterDashboardV2 } from "./SupporterDashboardV2";

interface VoiceupAccountPageProps {
  supporterAccountId?: string;
}

function compactLocation(location: Record<string, string>): string {
  return ["village", "ward", "panchayat", "block", "district", "state", "country"]
    .map((key) => location[key]?.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
}

export function VoiceupAccountPage({ supporterAccountId }: VoiceupAccountPageProps) {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<VoiceupAccessManifest | null>(null);
  const [dashboard, setDashboard] = useState<SupporterDashboardModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const identity = await getCurrentSupporterIdentity();
        if (!identity) throw new AccountAccessError("authentication_required");
        const nextManifest = await loadVoiceupAccessManifest();
        if (!active) return;
        setManifest(nextManifest);
        if (supporterAccountId) {
          const nextDashboard = await loadOwnedSupporterDashboard(supporterAccountId);
          if (!active) return;
          setDashboard(nextDashboard);
        } else {
          const destination = resolveAutomaticDestination(nextManifest);
          if (destination && destination.path !== "/account") {
            if (destination.workspaceId) selectVoiceupWorkspace(destination.workspaceId);
            writeUnifiedLoginHandoff(nextManifest, destination);
            window.location.replace(destination.path);
            return;
          }
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof AccountAccessError) {
          if (error.code === "authentication_required" || error.code === "email_confirmation_required") {
            setMessage(t("account.dashboard.sessionExpired"));
          } else if (error.code === "supporter_dashboard_not_authorized") {
            setMessage(t("account.dashboard.unauthorized"));
          } else {
            setMessage(t("account.dashboard.unavailable"));
          }
        } else {
          setMessage(t("account.dashboard.unavailable"));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [supporterAccountId, t]);

  const destinations = useMemo(() => manifest ? getAuthorizedDestinations(manifest) : [], [manifest]);
  const supporterLocation = dashboard ? compactLocation(dashboard.supporter.location) : "";

  function openDestination(destination: AccessDestination) {
    if (!manifest) return;
    if (destination.workspaceId) selectVoiceupWorkspace(destination.workspaceId);
    writeUnifiedLoginHandoff(manifest, destination);
    window.location.assign(destination.path);
  }

  async function signOut() {
    await logoutSupporter();
    window.location.assign("/login");
  }

  if (loading) {
    return (
      <main className="account-shell"><section className="account-state-card" aria-live="polite">
        <div className="app-loading-spinner" aria-hidden="true" />
        <h1>{t("account.dashboard.loading")}</h1>
      </section></main>
    );
  }
  if (message || !manifest) {
    return (
      <main className="account-shell"><section className="account-state-card">
        <ShieldCheck size={34} aria-hidden="true" />
        <h1>{t("account.dashboard.accessTitle")}</h1>
        <p>{message || t("account.dashboard.unavailable")}</p>
        <a className="primary-link-button" href="/login">{t("account.dashboard.signIn")}</a>
      </section></main>
    );
  }

  return (
    <main className="account-shell account-supporter-v2-shell">
      <header className="account-header account-supporter-v2-header">
        <a className="brand" href="/account" aria-label="VoiceUp account">
          <span className="brand-mark"><Megaphone size={22} /></span>
          <span><strong>VoiceUp</strong><small>{t("account.dashboard.portal.productName")}</small></span>
        </a>
        <div className="account-header-actions">
          <LanguageSwitcher />
          <span className="account-identity">{manifest.user.email}</span>
          <button className="secondary-button" type="button" onClick={() => void signOut()}>
            <LogOut size={16} /> {t("account.dashboard.signOut")}
          </button>
        </div>
      </header>

      {dashboard ? (
        <SupporterDashboardV2
          key={dashboard.account.accountId}
          dashboard={dashboard}
          manifest={manifest}
          supporterLocation={supporterLocation}
          authorizedDestinationCount={destinations.length}
          onSwitchWorkspace={() => window.location.assign("/account")}
        />
      ) : (
        <section className="account-switcher" aria-labelledby="account-switcher-title">
          <span className="eyebrow">{t("account.dashboard.authorizedAccess")}</span>
          <h1 id="account-switcher-title">{t("account.dashboard.chooseWorkspace")}</h1>
          <p>{t("account.dashboard.chooseHelp")}</p>
          {destinations.length ? (
            <div className="account-destination-grid">
              {destinations.map((destination) => (
                <button key={destination.id} type="button" onClick={() => openDestination(destination)}>
                  <span className="account-destination-icon">
                    {destination.kind === "supporter" ? <UserRound size={22} /> : destination.kind === "coordinator" ? <UsersRound size={22} /> : <BriefcaseBusiness size={22} />}
                  </span>
                  <span><strong>{destination.title}</strong><small>{destination.detail}</small></span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <div className="account-state-card account-no-access">
              <ShieldCheck size={30} />
              <h2>{t("account.dashboard.noAccessTitle")}</h2>
              <p>{t("account.dashboard.noAccess")}</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
