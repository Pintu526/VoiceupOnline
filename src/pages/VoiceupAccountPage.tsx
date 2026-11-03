import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Copy,
  LogOut,
  MapPin,
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
  const [copied, setCopied] = useState(false);

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
  const currentVolunteer = dashboard && manifest
    ? manifest.volunteerAssignments.find((item) => item.accountId === dashboard.account.accountId)
    : undefined;
  const currentCoordinator = dashboard && manifest
    ? manifest.coordinatorBindings.find((item) => item.workspaceId === dashboard.account.workspaceId)
    : undefined;

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

  async function copyReferralLink() {
    if (!dashboard?.referralPath) return;
    try {
      await navigator.clipboard.writeText(new URL(dashboard.referralPath, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
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
    <main className="account-shell">
      <header className="account-header">
        <a className="brand" href="/account" aria-label="VoiceUp account">
          <span className="brand-mark"><Megaphone size={22} /></span>
          <span><strong>VoiceUp</strong><small>Business OS</small></span>
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
        <section className="account-dashboard" aria-labelledby="supporter-dashboard-title">
          <div className="account-dashboard-hero">
            <div>
              <span className="eyebrow">{t("account.dashboard.supporterEyebrow")}</span>
              <h1 id="supporter-dashboard-title">{dashboard.supporter.name || t("account.dashboard.supporter")}</h1>
              <p>{dashboard.campaign.title}</p>
            </div>
            <div className="account-role-badges" aria-label={t("account.dashboard.roles")}>
              <span><CheckCircle2 size={15} /> {t("account.dashboard.supporter")}</span>
              {currentVolunteer && <span><UsersRound size={15} /> {t("account.dashboard.volunteer")}</span>}
              {currentCoordinator && <span><BriefcaseBusiness size={15} /> {t("account.dashboard.coordinator")}</span>}
            </div>
          </div>

          <div className="account-dashboard-grid">
            <article className="account-panel">
              <h2><UserRound size={20} /> {t("account.dashboard.profile")}</h2>
              <dl className="account-profile-list">
                <div><dt>{t("account.dashboard.supporterId")}</dt><dd><code>{dashboard.supporter.id}</code></dd></div>
                <div><dt>{t("account.dashboard.signingEmail")}</dt><dd>{dashboard.supporter.email}</dd></div>
                <div><dt>{t("account.dashboard.accountEmail")}</dt><dd>{manifest.user.email}</dd></div>
                <div><dt>{t("account.dashboard.signedAt")}</dt><dd>{dashboard.supporter.signedAt ? new Date(dashboard.supporter.signedAt).toLocaleString() : "—"}</dd></div>
                <div><dt>{t("account.dashboard.status")}</dt><dd>{dashboard.supporter.status || "—"}</dd></div>
              </dl>
            </article>

            <article className="account-panel">
              <h2><MapPin size={20} /> {t("account.dashboard.location")}</h2>
              <p>{compactLocation(dashboard.supporter.location) || t("account.dashboard.locationUnavailable")}</p>
              <h3>{t("account.dashboard.workspace")}</h3>
              <p>{dashboard.workspace.name}</p>
            </article>

            <article className="account-panel account-referral-panel">
              <h2>{t("account.dashboard.referral")}</h2>
              <strong className="account-referral-code">{dashboard.supporter.referralCode || "—"}</strong>
              <p>{t("account.dashboard.referralHelp")}</p>
              <div className="account-card-actions">
                {dashboard.referralPath && (
                  <a className="primary-link-button" href={dashboard.referralPath}>
                    {t("account.dashboard.openReferral")} <ArrowRight size={16} />
                  </a>
                )}
                {dashboard.referralPath && (
                  <button className="secondary-button" type="button" onClick={() => void copyReferralLink()}>
                    <Copy size={16} /> {copied ? t("account.dashboard.copied") : t("account.dashboard.copy")}
                  </button>
                )}
                {dashboard.campaignPath && (
                  <a className="secondary-link-button" href={dashboard.campaignPath}>{t("account.dashboard.openCampaign")}</a>
                )}
              </div>
            </article>

            <article className="account-panel">
              <h2>{t("account.dashboard.participation")}</h2>
              {dashboard.participationRequests.length ? (
                <div className="account-request-list">
                  {dashboard.participationRequests.map((request) => (
                    <div key={request.requestId}>
                      <strong>{t(request.type === "volunteer" ? "account.dashboard.volunteer" : "account.dashboard.coordinator")}</strong>
                      <span>{request.status}</span>
                    </div>
                  ))}
                </div>
              ) : <p>{t("account.dashboard.noParticipation")}</p>}
            </article>
          </div>

          {destinations.length > 1 && (
            <button className="secondary-button" type="button" onClick={() => window.location.assign("/account")}>
              {t("account.dashboard.switchWorkspace")}
            </button>
          )}
        </section>
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
