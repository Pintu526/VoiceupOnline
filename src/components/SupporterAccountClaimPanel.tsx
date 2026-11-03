import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole, UserRound } from "lucide-react";
import {
  getCurrentSupporterIdentity,
  loginSupporterWithEmail,
  logoutSupporter,
  registerSupporterWithEmailForContext,
  requestSupporterPasswordRecovery,
  SupporterAuthError,
  type SupporterIdentity
} from "../supporterAuth.ts";
import {
  claimSupporterAccount,
  findLinkedSupporterAccount,
  isUsableSupporterClaimGrant,
  readOwnSupporterAccountLinks,
  SupporterAccountClaimError,
  type SupporterAccountClaimGrant,
  type SupporterAccountLink
} from "../supporterAccountClaim.ts";
import { getCampaignLoginPath } from "../campaignAuthContext.ts";
import { PasswordField } from "../ui/PasswordField";

type ClaimAuthMode = "register" | "sign_in";

export interface SupporterAccountClaimCopy {
  eyebrow: string;
  title: string;
  help: string;
  email: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  register: string;
  loginAndClaim: string;
  claim: string;
  useAnotherAccount: string;
  registrationSent: string;
  signedInAs: string;
  signingEmail: string;
  accountEmail: string;
  emailMismatch: string;
  linkedTitle: string;
  linkedHelp: string;
  profileName: string;
  supporterId: string;
  campaign: string;
  openProfile: string;
  working: string;
  authFailed: string;
  confirmationRequired: string;
  claimInvalid: string;
  claimExpired: string;
  claimFailed: string;
  skip: string;
  openingDashboard: string;
  forgotPassword: string;
  recoverySent: string;
  recoveryFailed: string;
}

interface SupporterAccountClaimPanelProps {
  grant: SupporterAccountClaimGrant | null;
  linkedAccount: SupporterAccountLink | null;
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  supporterId: string;
  supporterName: string;
  supporterEmail: string;
  copy: SupporterAccountClaimCopy;
  onLinked: (link: SupporterAccountLink) => void;
}

function safeMessage(error: unknown, copy: SupporterAccountClaimCopy): string {
  if (error instanceof SupporterAuthError) {
    if (error.code === "supporter_email_not_confirmed") return copy.confirmationRequired;
    return copy.authFailed;
  }
  if (error instanceof SupporterAccountClaimError) {
    if (error.code === "supporter_claim_email_confirmation_required") {
      return copy.confirmationRequired;
    }
    if (error.code === "supporter_claim_invalid") return copy.claimInvalid;
  }
  return copy.claimFailed;
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function SupporterAccountClaimPanel({
  grant,
  linkedAccount,
  campaignId,
  campaignSlug,
  campaignTitle,
  supporterId,
  supporterName,
  supporterEmail,
  copy,
  onLinked
}: SupporterAccountClaimPanelProps) {
  const [identity, setIdentity] = useState<SupporterIdentity | null>(null);
  const [linked, setLinked] = useState<SupporterAccountLink | null>(linkedAccount);
  const signingEmail = normalizedEmail(supporterEmail);
  const email = signingEmail;
  const campaignLoginPath = getCampaignLoginPath({ campaignId, campaignSlug });
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<ClaimAuthMode>("register");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const onLinkedRef = useRef(onLinked);
  const identityMatchesSigningEmail = Boolean(
    identity && normalizedEmail(identity.email) === signingEmail
  );

  useEffect(() => setLinked(linkedAccount), [linkedAccount]);
  useEffect(() => {
    onLinkedRef.current = onLinked;
  }, [onLinked]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const currentIdentity = await getCurrentSupporterIdentity();
        if (!active || !currentIdentity) return;
        setIdentity(currentIdentity);
        if (normalizedEmail(currentIdentity.email) !== signingEmail) {
          setIsError(true);
          setMessage(copy.emailMismatch);
          return;
        }
        const existing = findLinkedSupporterAccount(
          await readOwnSupporterAccountLinks(),
          campaignId,
          supporterId
        );
        if (active && existing) {
          setLinked(existing);
          onLinkedRef.current(existing);
        }
      } catch {
        if (active) {
          setIsError(true);
          setMessage(copy.authFailed);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [campaignId, copy.authFailed, copy.emailMismatch, signingEmail, supporterId]);

  useEffect(() => {
    if (grant && !isUsableSupporterClaimGrant(grant) && !linkedAccount) {
      setIsError(true);
      setMessage(copy.claimExpired);
    }
  }, [copy.claimExpired, grant, linkedAccount]);

  const finishLink = (link: SupporterAccountLink, openDashboard: boolean) => {
    if (link.campaignId !== campaignId || link.supporterId !== supporterId) {
      throw new SupporterAccountClaimError("supporter_claim_failed");
    }
    setLinked(link);
    setPassword("");
    setIsError(false);
    setMessage(openDashboard ? copy.openingDashboard : "");
    onLinked(link);
    if (openDashboard) {
      window.setTimeout(() => {
        window.location.assign(`/account/supporter/${encodeURIComponent(link.accountId)}`);
      }, 700);
    }
  };

  const linkForIdentity = async (accountEmail: string) => {
    if (normalizedEmail(accountEmail) !== signingEmail) {
      throw new SupporterAccountClaimError("supporter_claim_invalid");
    }
    const existing = findLinkedSupporterAccount(
      await readOwnSupporterAccountLinks(),
      campaignId,
      supporterId
    );
    if (existing) {
      finishLink(existing, true);
      return;
    }
    if (!grant) throw new SupporterAccountClaimError("supporter_claim_invalid");
    finishLink(await claimSupporterAccount(grant), true);
  };

  const signInAndLink = async () => {
    if (normalizedEmail(email) !== signingEmail) {
      setIsError(true);
      setMessage(copy.emailMismatch);
      return;
    }
    setBusy(true);
    setIsError(false);
    setMessage(copy.working);
    try {
      const nextIdentity = await loginSupporterWithEmail(email, password);
      setIdentity(nextIdentity);
      if (normalizedEmail(nextIdentity.email) !== signingEmail) {
        setIsError(true);
        setMessage(copy.emailMismatch);
        return;
      }
      await linkForIdentity(nextIdentity.email);
    } catch (error) {
      setIsError(true);
      setMessage(safeMessage(error, copy));
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  const register = async () => {
    if (normalizedEmail(email) !== signingEmail) {
      setIsError(true);
      setMessage(copy.emailMismatch);
      return;
    }
    setBusy(true);
    setIsError(false);
    setMessage(copy.working);
    try {
      await registerSupporterWithEmailForContext(email, password, campaignLoginPath);
      setPassword("");
      setAuthMode("sign_in");
      setMessage(copy.registrationSent);
    } catch (error) {
      setIsError(true);
      setMessage(safeMessage(error, copy));
    } finally {
      setBusy(false);
    }
  };

  const linkCurrentIdentity = async () => {
    if (!identity || !identityMatchesSigningEmail) {
      setIsError(true);
      setMessage(copy.emailMismatch);
      return;
    }
    setBusy(true);
    setIsError(false);
    setMessage(copy.working);
    try {
      await linkForIdentity(identity.email);
    } catch (error) {
      setIsError(true);
      setMessage(safeMessage(error, copy));
    } finally {
      setBusy(false);
    }
  };

  const useAnotherAccount = async () => {
    setBusy(true);
    try {
      await logoutSupporter();
      setIdentity(null);
      setPassword("");
      setAuthMode("sign_in");
      setIsError(false);
      setMessage("");
    } catch {
      setIsError(true);
      setMessage(copy.authFailed);
    } finally {
      setBusy(false);
    }
  };

  const recoverPassword = async () => {
    setBusy(true);
    setIsError(false);
    setMessage(copy.working);
    try {
      await requestSupporterPasswordRecovery(signingEmail);
      setMessage(copy.recoverySent);
    } catch {
      setIsError(true);
      setMessage(copy.recoveryFailed);
    } finally {
      setBusy(false);
    }
  };

  if (skipped) return null;

  if (linked) {
    return (
      <section className="public-supporter-account public-supporter-account-linked" aria-labelledby="supporter-linked-profile-heading">
        <CheckCircle2 size={26} aria-hidden="true" />
        <div className="public-section-heading">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h4 id="supporter-linked-profile-heading">{copy.linkedTitle}</h4>
          <p>{copy.linkedHelp}</p>
        </div>
        <dl className="public-supporter-account-profile">
          <div><dt>{copy.profileName}</dt><dd>{supporterName}</dd></div>
          <div><dt>{copy.supporterId}</dt><dd><code>{supporterId}</code></dd></div>
          <div><dt>{copy.campaign}</dt><dd>{campaignTitle}</dd></div>
        </dl>
        <a className="secondary-link-button" href={`/account/supporter/${encodeURIComponent(linked.accountId)}`}>
          <UserRound size={18} /> {copy.openProfile}
        </a>
        {message && <p className="public-supporter-account-message" data-tone={isError ? "error" : "status"} role="status" aria-live="polite">{message}</p>}
      </section>
    );
  }

  return (
    <section className="public-supporter-account" aria-labelledby="supporter-account-heading">
      <div className="public-section-heading">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h4 id="supporter-account-heading"><LockKeyhole size={20} /> {copy.title}</h4>
        <p>{copy.help}</p>
      </div>
      <dl className="public-supporter-account-identities">
        <div><dt>{copy.signingEmail}</dt><dd>{signingEmail}</dd></div>
        {identity && <div><dt>{copy.accountEmail}</dt><dd>{identity.email}</dd></div>}
      </dl>
      {identity ? (
        <div className="public-supporter-account-session">
          <p>{copy.signedInAs} <strong>{identity.email}</strong></p>
          <div className="public-post-sign-actions">
            {identityMatchesSigningEmail && (
              <button className="primary-button" type="button" disabled={busy} onClick={() => void linkCurrentIdentity()}>
                {copy.claim}
              </button>
            )}
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void useAnotherAccount()}>
              {copy.useAnotherAccount}
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => setSkipped(true)}>
              {copy.skip}
            </button>
          </div>
        </div>
      ) : (
        <div className="public-supporter-account-form" aria-busy={busy}>
          <div className="account-login-tabs" role="tablist" aria-label={copy.title}>
            <button type="button" role="tab" aria-selected={authMode === "register"} disabled={busy} onClick={() => { setAuthMode("register"); setPassword(""); setIsError(false); setMessage(""); }}>
              {copy.register}
            </button>
            <button type="button" role="tab" aria-selected={authMode === "sign_in"} disabled={busy} onClick={() => { setAuthMode("sign_in"); setPassword(""); setIsError(false); setMessage(""); }}>
              {copy.loginAndClaim}
            </button>
          </div>
          <label htmlFor="supporter-account-password">
            <span>{copy.password}</span>
            <PasswordField
              id="supporter-account-password"
              name="password"
              autoComplete={authMode === "register" ? "new-password" : "current-password"}
              required
              disabled={busy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              showLabel={copy.showPassword}
              hideLabel={copy.hidePassword}
            />
          </label>
          <div className="public-post-sign-actions">
            <button className="primary-button" type="button" disabled={busy || password.length === 0} onClick={() => void (authMode === "register" ? register() : signInAndLink())}>
              {authMode === "register" ? copy.register : copy.loginAndClaim}
            </button>
            {authMode === "sign_in" && (
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void recoverPassword()}>
                {copy.forgotPassword}
              </button>
            )}
            <button className="secondary-button" type="button" disabled={busy} onClick={() => setSkipped(true)}>
              {copy.skip}
            </button>
          </div>
          <a
            className="secondary-link-button"
            href={campaignLoginPath}
          >
            {copy.useAnotherAccount}
          </a>
        </div>
      )}
      {message && <p className="public-supporter-account-message" data-tone={isError ? "error" : "status"} role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
