import { EmailCodePasswordRecovery } from "../components/EmailCodePasswordRecovery";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, BriefcaseBusiness, KeyRound, LockKeyhole, Mail, Megaphone, ShieldCheck, UserPlus } from "lucide-react";
import { LanguageSwitcher } from "../i18n";
import { useTranslation } from "../i18n/useTranslation";
import { PasswordField } from "../ui/PasswordField";
import {
  getCurrentSupporterIdentity,
  loginSupporterWithEmail,
  logoutSupporter,
  registerSupporterWithEmail,
  registerSupporterWithEmailForContext,
  requestSupporterEmailOtp,
  requestSupporterPasswordRecovery,
  SupporterAuthError,
  verifySupporterEmailOtp
} from "../supporterAuth.ts";
import {
  AccountAccessError,
  getAuthorizedDestinations,
  loadVoiceupAccessManifest,
  resolveCampaignSupporterDestination,
  selectVoiceupWorkspace,
  writeUnifiedLoginHandoff,
  type AccessDestination,
  type VoiceupAccessManifest
} from "../accountAccess.ts";
import { getCampaignLoginPath, getCampaignPublicPath, readCampaignAuthContext } from "../campaignAuthContext.ts";

type LoginMode = "sign_in" | "register";
type SignInMethod = "password" | "email_otp";

function safeLoginMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof SupporterAuthError) {
    if (error.code === "supporter_email_not_confirmed") return t("account.login.confirmEmail");
    if (error.code === "supporter_email_confirmation_not_enforced") return t("account.login.configurationError");
    if (error.code === "supporter_registration_failed") return t("account.login.registrationFailed");
    if (error.code === "supporter_otp_request_failed") return t("account.login.otpRequestFailed");
    if (error.code === "supporter_otp_verification_failed") return t("account.login.otpVerificationFailed");
  }
  if (error instanceof AccountAccessError) {
    if (error.code === "email_confirmation_required") return t("account.login.confirmEmail");
    return t("account.login.accessUnavailable");
  }
  return t("account.login.failed");
}

export function VoiceupLoginPage() {
  const { t } = useTranslation();
  const campaignContext = useMemo(() => readCampaignAuthContext(window.location.search), []);
  const returnPath = campaignContext ? getCampaignLoginPath(campaignContext) : "/login";
  const campaignPath = campaignContext ? getCampaignPublicPath(campaignContext) : "/";
  const [mode, setMode] = useState<LoginMode>("sign_in");
  const [signInMethod, setSignInMethod] = useState<SignInMethod>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [authenticatedManifest, setAuthenticatedManifest] = useState<VoiceupAccessManifest | null>(null);
  const [campaignAccessMissing, setCampaignAccessMissing] = useState(false);

  function openDestination(manifest: VoiceupAccessManifest, destination: AccessDestination) {
    if (destination.workspaceId) selectVoiceupWorkspace(destination.workspaceId);
    writeUnifiedLoginHandoff(manifest, destination);
    if (destination.kind === "supporter") {
      // With noopener, window.open may return null even when the tab opens.
      // Do not treat that return value as evidence of a blocked popup.
      window.open(destination.path, "_blank", "noopener,noreferrer");
      setIsError(false);
      setMessage("Supporter dashboard requested in a new tab. If it did not open, allow pop-ups for this site and try again.");
      return;
    }
    window.location.assign(destination.path);
  }

  function routeAuthenticatedManifest(manifest: VoiceupAccessManifest) {
    if (campaignContext) {
      const campaignDestination = resolveCampaignSupporterDestination(manifest, campaignContext);
      if (campaignDestination) {
        setMessage(t("account.login.campaignAccessFound"));
        openDestination(manifest, campaignDestination);
        return;
      }
      setAuthenticatedManifest(manifest);
      setCampaignAccessMissing(true);
      setIsError(false);
      setMessage(t("account.login.noCampaignAccess"));
      return;
    }

    const supporterDestination = getAuthorizedDestinations(manifest)
      .find((destination) => destination.kind === "supporter");
    if (supporterDestination) {
      openDestination(manifest, supporterDestination);
      return;
    }
    // A supporter entry point never silently chooses an admin/workspace role.
    // Server-authorized alternatives remain available for explicit selection.
    setAuthenticatedManifest(manifest);
    setCampaignAccessMissing(true);
    setIsError(!manifest.hasAuthorizedAccess);
    setMessage(t(manifest.hasAuthorizedAccess ? "account.login.noCampaignAccess" : "account.login.noAccess"));
  }

  async function finishAuthentication() {
    setMessage(t("account.login.checking"));
    routeAuthenticatedManifest(await loadVoiceupAccessManifest());
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const identity = await getCurrentSupporterIdentity();
        if (!active || !identity) return;
        setEmail(identity.email);
        setBusy(true);
        const manifest = await loadVoiceupAccessManifest();
        if (active) routeAuthenticatedManifest(manifest);
      } catch {
        // An absent or expired session leaves the normal sign-in form available.
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
    // Campaign context is immutable for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setIsError(false);
    setCampaignAccessMissing(false);
    try {
      if (signInMethod === "email_otp") {
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
      await finishAuthentication();
    } catch (error) {
      setPassword("");
      setIsError(true);
      setMessage(safeLoginMessage(error, t));
    } finally {
      setBusy(false);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setIsError(false);
    setMessage(t("account.login.creating"));
    try {
      if (signInMethod === "email_otp") {
        if (!otpSent) {
          await requestSupporterEmailOtp(email, returnPath, window.location.origin, undefined, true);
          setOtpSent(true);
          setMessage(t("account.login.otpSent"));
          return;
        }
        await verifySupporterEmailOtp(email, otp);
        setOtp("");
        await finishAuthentication();
        return;
      }
      if (password !== confirmPassword) {
        setIsError(true);
        setMessage(t("account.login.passwordMismatch"));
        return;
      }
      if (campaignContext) await registerSupporterWithEmailForContext(email, password, returnPath);
      else await registerSupporterWithEmail(email, password);
      setPassword("");
      setConfirmPassword("");
      setMessage(t("account.login.registrationSent"));
    } catch (error) {
      setPassword("");
      setConfirmPassword("");
      setIsError(true);
      setMessage(safeLoginMessage(error, t));
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
      setRecovering(true);
      setMessage("");
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
      setAuthenticatedManifest(null);
      setCampaignAccessMissing(false);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setOtpSent(false);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  const alternatives = authenticatedManifest ? getAuthorizedDestinations(authenticatedManifest) : [];

  return (
    <main className="login-shell account-login-shell">
      <section className="login-layout" aria-labelledby="voiceup-login-title">
        <div className="login-hero-panel">
          <div className="account-login-toolbar">
            <div className="brand login-brand">
              <div className="brand-mark"><Megaphone size={24} /></div>
              <div><strong>VoiceUp</strong><span>Business OS</span></div>
            </div>
            <LanguageSwitcher />
          </div>
          <div className="login-copy">
            <span className="eyebrow">{t("account.login.eyebrow")}</span>
            <h1 id="voiceup-login-title">{campaignContext ? t("account.login.campaignTitle") : t("account.login.title")}</h1>
            <p>{campaignContext ? t("account.login.campaignHelp") : t("account.login.help")}</p>
          </div>
          {campaignContext && (
            <div className="account-campaign-context" role="status">
              <Megaphone size={20} aria-hidden="true" />
              <div><strong>{t("account.login.campaignContext")}</strong><span>{campaignContext.campaignSlug}</span></div>
            </div>
          )}
          <div className="account-login-assurance">
            <ShieldCheck size={22} aria-hidden="true" />
            <p>{t("account.login.authorizationHelp")}</p>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-header">
            <span className="login-lock-icon" aria-hidden="true">
              {mode === "sign_in" ? <LockKeyhole size={20} /> : <UserPlus size={20} />}
            </span>
            <div><span className="eyebrow">{t("account.login.secureAccess")}</span><h2>{t(mode === "sign_in" ? "account.login.signIn" : "account.login.create")}</h2></div>
          </div>

          {campaignAccessMissing && authenticatedManifest ? (
            <section className="account-campaign-no-access" aria-live="polite">
              <ShieldCheck size={30} aria-hidden="true" />
              <h3>{t("account.login.noCampaignAccessTitle")}</h3>
              <p>{message}</p>
              {alternatives.length > 0 && (
                <div className="account-login-alternatives" aria-label={t("account.login.authorizedAlternatives")}>
                  <strong>{t("account.login.authorizedAlternatives")}</strong>
                  {alternatives.map((destination) => (
                    <button key={destination.id} type="button" onClick={() => openDestination(authenticatedManifest, destination)}>
                      <BriefcaseBusiness size={18} aria-hidden="true" />
                      <span>{destination.title}<small>{destination.detail}</small></span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
              <div className="account-card-actions">
                <a className="secondary-link-button" href={campaignPath}>{t("account.login.returnCampaign")}</a>
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void switchAccount()}>{t("account.login.useAnotherAccount")}</button>
              </div>
            </section>
          ) : (
            <>
              {!campaignContext && (
                <div className="account-login-tabs" role="tablist" aria-label={t("account.login.mode")}>
                  <button type="button" role="tab" aria-selected={mode === "sign_in"} onClick={() => { setMode("sign_in"); setMessage(""); }}>{t("account.login.signIn")}</button>
                  <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setMessage(""); setOtpSent(false); }}>{t("account.login.create")}</button>
                </div>
              )}
              {recovering ? <EmailCodePasswordRecovery email={email.trim()} onClose={() => { setRecovering(false); setMessage(""); }} /> : <>
              <div className="account-login-methods" role="group" aria-label={t("account.login.signInMethod")}>
                  <button type="button" aria-pressed={signInMethod === "password"} onClick={() => { setSignInMethod("password"); setOtpSent(false); setMessage(""); }}><KeyRound size={16} /> {t("account.login.passwordMethod")}</button>
                  <button type="button" aria-pressed={signInMethod === "email_otp"} onClick={() => { setSignInMethod("email_otp"); setMessage(""); }}><Mail size={16} /> {t("account.login.emailOtpMethod")}</button>
              </div>
              <form className="form-stack login-form" onSubmit={mode === "sign_in" ? signIn : register} aria-busy={busy}>
                <label className="field" htmlFor="voiceup-account-email">
                  <span className="label">{t("account.login.email")}</span>
                  <input id="voiceup-account-email" type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setOtpSent(false); setOtp(""); }} />
                </label>
                {signInMethod === "password" && (
                  <label className="field" htmlFor="voiceup-account-password">
                    <span className="label">{t("account.login.password")}</span>
                    <PasswordField
                      id="voiceup-account-password"
                      name="password"
                      autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                      required
                      disabled={busy}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      showLabel={t("account.login.showPassword")}
                      hideLabel={t("account.login.hidePassword")}
                    />
                  </label>
                )}
                {mode === "register" && signInMethod === "password" && (
                  <label className="field" htmlFor="voiceup-account-confirm-password">
                    <span className="label">{t("account.login.confirmPassword")}</span>
                    <PasswordField id="voiceup-account-confirm-password" name="confirmPassword" autoComplete="new-password" required disabled={busy} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} showLabel={t("account.login.showPassword")} hideLabel={t("account.login.hidePassword")} />
                  </label>
                )}
                {signInMethod === "email_otp" && otpSent && (
                  <label className="field" htmlFor="voiceup-account-otp">
                    <span className="label">{t("account.login.emailOtp")}</span>
                    <input id="voiceup-account-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 10))} />
                  </label>
                )}
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? t("account.login.working") : signInMethod === "email_otp" ? t(otpSent ? "account.login.verifyOtp" : "account.login.sendOtp") : mode === "register" ? t("account.login.create") : t("account.login.continue")}
                  {!busy && <ArrowRight size={17} />}
                </button>
                {signInMethod === "email_otp" && otpSent && (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => { setOtpSent(false); setOtp(""); setMessage(""); }}>{t("account.login.resendOtp")}</button>
                )}
                {mode === "sign_in" && signInMethod === "password" && (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => void recoverPassword()}>{t("account.login.forgotPassword")}</button>
                )}
                {message && <p className={isError ? "error-message" : "info-message"} role="status" aria-live="polite">{message}</p>}
              </form>
              </>}
              <a className="secondary-link-button" href={campaignContext ? campaignPath : "/"}>{campaignContext ? t("account.login.returnCampaign") : t("account.login.back")}</a>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
