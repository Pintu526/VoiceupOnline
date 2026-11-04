import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BriefcaseBusiness, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import {
  AccountAccessError,
  getAuthorizedDestinations,
  loadVoiceupAccessManifest,
  resolveCampaignAutomaticDestination,
  selectVoiceupWorkspace,
  writeUnifiedLoginHandoff,
  type AccessDestination,
  type VoiceupAccessManifest
} from "../accountAccess.ts";
import {
  getCampaignLoginPath,
  type CampaignAuthContext
} from "../campaignAuthContext.ts";
import { useTranslation } from "../i18n/useTranslation";
import {
  getCurrentSupporterIdentity,
  loginSupporterWithEmail,
  logoutSupporter,
  registerSupporterWithEmailForContext,
  requestSupporterEmailOtp,
  requestSupporterPasswordRecovery,
  SupporterAuthError,
  verifySupporterEmailOtp
} from "../supporterAuth.ts";
import {
  claimHistoricalSupporterRoutingGrant,
  resolveAuthenticatedSupporterRouting
} from "../supporterRouting.ts";
import { PasswordField } from "../ui/PasswordField";

type SignInMethod = "password" | "email_otp" | "register";

interface CampaignInlineAuthPanelProps {
  active: boolean;
  context: CampaignAuthContext;
  routingToken?: string;
  onContinueSigning?: () => void;
}

function safeMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof SupporterAuthError) {
    if (error.code === "supporter_email_not_confirmed") return t("account.login.confirmEmail");
    if (error.code === "supporter_otp_request_failed") return t("account.login.otpRequestFailed");
    if (error.code === "supporter_otp_verification_failed") return t("account.login.otpVerificationFailed");
  }
  if (error instanceof AccountAccessError) {
    return error.code === "email_confirmation_required"
      ? t("account.login.confirmEmail")
      : t("account.login.accessUnavailable");
  }
  return t("account.login.failed");
}

export function CampaignInlineAuthPanel({
  active,
  context,
  routingToken = "",
  onContinueSigning
}: CampaignInlineAuthPanelProps) {
  const { t } = useTranslation();
  const returnPath = getCampaignLoginPath(context);
  const [method, setMethod] = useState<SignInMethod>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [manifest, setManifest] = useState<VoiceupAccessManifest | null>(null);
  const [accessMissing, setAccessMissing] = useState(false);
  const [canContinueSigning, setCanContinueSigning] = useState(false);

  function openDestination(value: VoiceupAccessManifest, destination: AccessDestination) {
    if (destination.workspaceId) selectVoiceupWorkspace(destination.workspaceId);
    writeUnifiedLoginHandoff(value, destination);
    window.location.assign(destination.path);
  }

  function resolveManifest(value: VoiceupAccessManifest) {
    const destination = resolveCampaignAutomaticDestination(value, context);
    if (destination) {
      setMessage(t("account.login.campaignAccessFound"));
      openDestination(value, destination);
      return;
    }
    setManifest(value);
    setAccessMissing(true);
    setIsError(false);
    setMessage(t("account.login.noCampaignAccess"));
  }

  async function finishAuthenticatedRouting() {
    if (routingToken) {
      const routing = await resolveAuthenticatedSupporterRouting(
        context.campaignSlug,
        routingToken
      );
      if (routing.route === "claim_available" && routing.claimGrant) {
        await claimHistoricalSupporterRoutingGrant(routing.claimGrant);
      } else if (routing.route === "eligible_to_sign") {
        setManifest(await loadVoiceupAccessManifest());
        setAccessMissing(true);
        setCanContinueSigning(true);
        setIsError(false);
        setMessage(t("account.login.noCampaignAccess"));
        return;
      } else if (routing.route === "identity_not_linked") {
        setManifest(await loadVoiceupAccessManifest());
        setAccessMissing(true);
        setCanContinueSigning(false);
        setIsError(false);
        setMessage(t("account.login.accessUnavailable"));
        return;
      }
    }
    setCanContinueSigning(false);
    resolveManifest(await loadVoiceupAccessManifest());
  }

  useEffect(() => {
    if (!active) return;
    let current = true;
    void (async () => {
      try {
        const identity = await getCurrentSupporterIdentity();
        if (!current || !identity) return;
        setEmail(identity.email);
        setBusy(true);
        await finishAuthenticatedRouting();
      } catch {
        // Missing or expired sessions leave the normal sign-in controls available.
      } finally {
        if (current) setBusy(false);
      }
    })();
    return () => { current = false; };
    // Re-run when a debounced precheck arrives for an already authenticated user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, context.campaignId, context.campaignSlug, routingToken]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setIsError(false);
    setAccessMissing(false);
    try {
      if (method === "register") {
        setMessage(t("account.login.creating"));
        await registerSupporterWithEmailForContext(email, password, returnPath);
        setPassword("");
        setMethod("password");
        setMessage(t("account.login.registrationSent"));
        return;
      }
      if (method === "email_otp") {
        if (!otpSent) {
          await requestSupporterEmailOtp(email, returnPath);
          setOtpSent(true);
          setMessage(t("account.login.otpSent"));
          return;
        }
        setMessage(t("account.login.verifyingOtp"));
        await verifySupporterEmailOtp(email, otp);
        setOtp("");
      } else {
        setMessage(t("account.login.checking"));
        await loginSupporterWithEmail(email, password);
        setPassword("");
      }
      await finishAuthenticatedRouting();
    } catch (error) {
      setPassword("");
      setIsError(true);
      setMessage(safeMessage(error, t));
    } finally {
      setBusy(false);
    }
  }

  async function recoverPassword() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setIsError(true);
      setMessage(t("account.login.enterEmail"));
      return;
    }
    setBusy(true);
    setIsError(false);
    try {
      await requestSupporterPasswordRecovery(email);
      setMessage(t("account.login.recoverySent"));
    } catch {
      setIsError(true);
      setMessage(t("account.login.recoveryFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    try {
      await logoutSupporter();
      setManifest(null);
      setAccessMissing(false);
      setCanContinueSigning(false);
      setEmail("");
      setPassword("");
      setOtp("");
      setOtpSent(false);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;
  const alternatives = manifest ? getAuthorizedDestinations(manifest) : [];

  return (
    <section id="campaign-sign-in-panel" className="campaign-inline-auth" aria-labelledby="campaign-inline-auth-heading">
      <div className="public-section-heading">
        <span className="eyebrow">{t("account.login.secureAccess")}</span>
        <h3 id="campaign-inline-auth-heading">{t("account.login.campaignTitle")}</h3>
        <p>{t("account.login.inlineHelp")}</p>
      </div>

      {accessMissing && manifest ? (
        <div className="campaign-inline-auth-no-access" aria-live="polite">
          <ShieldCheck size={28} aria-hidden="true" />
          <strong>{t("account.login.noCampaignAccessTitle")}</strong>
          <p>{message}</p>
          {alternatives.length > 0 && (
            <div className="account-login-alternatives" aria-label={t("account.login.authorizedAlternatives")}>
              {alternatives.map((destination) => (
                <button key={destination.id} type="button" onClick={() => openDestination(manifest, destination)}>
                  <BriefcaseBusiness size={18} aria-hidden="true" />
                  <span>{destination.title}<small>{destination.detail}</small></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void switchAccount()}>
            {t("account.login.useAnotherAccount")}
          </button>
          {canContinueSigning && onContinueSigning && (
            <button className="primary-button" type="button" disabled={busy} onClick={onContinueSigning}>
              {t("account.login.supportTab")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="account-login-methods" role="group" aria-label={t("account.login.signInMethod")}>
            <button type="button" aria-pressed={method === "password"} onClick={() => { setMethod("password"); setOtpSent(false); setMessage(""); }}>
              <KeyRound size={16} aria-hidden="true" /> {t("account.login.passwordMethod")}
            </button>
            <button type="button" aria-pressed={method === "email_otp"} onClick={() => { setMethod("email_otp"); setMessage(""); }}>
              <Mail size={16} aria-hidden="true" /> {t("account.login.emailOtpMethod")}
            </button>
            <button type="button" aria-pressed={method === "register"} onClick={() => { setMethod("register"); setOtpSent(false); setMessage(""); }}>
              <UserRound size={16} aria-hidden="true" /> {t("account.login.create")}
            </button>
          </div>
          <form className="form-stack campaign-inline-auth-form" onSubmit={submit} aria-busy={busy}>
            <label className="field" htmlFor="campaign-account-email">
              <span className="label">{t("account.login.email")}</span>
              <input id="campaign-account-email" type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setOtpSent(false); setOtp(""); }} />
            </label>
            {(method === "password" || method === "register") && (
              <label className="field" htmlFor="campaign-account-password">
                <span className="label">{t("account.login.password")}</span>
                <PasswordField
                  id="campaign-account-password"
                  name="password"
                  autoComplete={method === "register" ? "new-password" : "current-password"}
                  required
                  disabled={busy}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  showLabel={t("account.login.showPassword")}
                  hideLabel={t("account.login.hidePassword")}
                />
              </label>
            )}
            {method === "email_otp" && otpSent && (
              <label className="field" htmlFor="campaign-account-otp">
                <span className="label">{t("account.login.emailOtp")}</span>
                <input id="campaign-account-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 10))} />
              </label>
            )}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? t("account.login.working") : method === "register" ? t("account.login.create") : method === "email_otp" ? t(otpSent ? "account.login.verifyOtp" : "account.login.sendOtp") : t("account.login.continue")}
              {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>
            {method === "email_otp" && otpSent && (
              <button className="secondary-button" type="button" disabled={busy} onClick={() => { setOtpSent(false); setOtp(""); setMessage(""); }}>
                {t("account.login.resendOtp")}
              </button>
            )}
            {method === "password" && (
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void recoverPassword()}>
                {t("account.login.forgotPassword")}
              </button>
            )}
            {message && <p className={isError ? "error-message" : "info-message"} role="status" aria-live="polite">{message}</p>}
          </form>
        </>
      )}
      <a className="secondary-link-button campaign-inline-auth-fallback" href={returnPath}>
        {t("account.login.openFullLogin")}
      </a>
    </section>
  );
}
