import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  LockKeyhole,
  Mail,
  Printer,
  QrCode,
  Share2,
  ShieldCheck,
} from "lucide-react";
import type { AuthorityRule, Campaign, Organization, Signer, SignerRequiredField } from "../types";
import type { LocationDeletions, LocationOverrides } from "../geography";
import type { getCampaignMetrics } from "../lib";
import { Panel } from "../ui/Panel";
import { Field } from "../ui/Field";
import { DonationCard } from "../components/DonationCard";
import { IndiaLocationFields } from "../components/IndiaLocationFields";
import { ReferralQrPreview } from "../components/ReferralQrPreview";
import { blankSigner } from "../constants";
import {
  getAppealAuthority,
  getPublicAuthorityOptions,
  formatAuthorityDisplay
} from "../utils/authority";
import {
  applySignerLocationRestriction,
  getCampaignGoalValue,
  getCampaignPublicUrl,
  getEffectiveSignerLocationRestrictionLevel,
  getLocationRestrictionMessage,
  getLockedLocationValues
} from "../utils/campaign";
import { whatsAppLink } from "../utils/links";
import {
  REFERRAL_SHARE_POINTS,
  downloadQrPosterSvg,
  findReferrer,
  getCampaignReferralUrl,
  getProfessionalShareMessages,
  getReferralBadge,
  getSafeReferrerLabel,
  getSupporterReferralCode,
  normalizeReferralCode
} from "../utils/referrals";

interface PublicCampaignPageProps {
  campaign: Campaign;
  organization?: Organization;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authority?: AuthorityRule;
  authorities: AuthorityRule[];
  campaignSigners: Signer[];
  publicForm: typeof blankSigner;
  setPublicForm: React.Dispatch<React.SetStateAction<typeof blankSigner>>;
  publicMessage: string;
  lastSignedSigner: Signer | null;
  otpInput: string;
  setOtpInput: React.Dispatch<React.SetStateAction<string>>;
  otpMessage: string;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  onSubmit: (event: FormEvent) => void;
}

export function PublicCampaignPage({
  campaign,
  organization,
  metrics,
  authority,
  authorities,
  campaignSigners,
  publicForm,
  setPublicForm,
  publicMessage,
  lastSignedSigner,
  otpInput,
  setOtpInput,
  otpMessage,
  onSendOtp,
  onVerifyOtp,
  locationOverrides,
  locationDeletions,
  onSubmit
}: PublicCampaignPageProps) {
  const publicAuthorityOptions = getPublicAuthorityOptions(campaign, authorities);
  const resolvedAuthority = authority ?? getAppealAuthority(campaign);
  const signerRestrictionLevel = getEffectiveSignerLocationRestrictionLevel(campaign, organization);
  const restrictedPublicForm = applySignerLocationRestriction(campaign, publicForm, organization);
  const restrictionMessage = getLocationRestrictionMessage(campaign, organization);
  const lockedLocation = getLockedLocationValues(campaign, signerRestrictionLevel);
  const lockedLocationParts = [
    lockedLocation.state,
    lockedLocation.district,
    lockedLocation.block,
    lockedLocation.panchayat
  ].filter(Boolean);
  const districtParticipation = campaign.district || restrictedPublicForm.district || "Not captured yet";
  const requiredFields = campaign.requiredFields ?? [];
  const signerFieldLabel = (label: string, field: SignerRequiredField) =>
    requiredFields.includes(field) ? `${label} *` : label;
  const publicUrl = getCampaignPublicUrl(organization, campaign);
  const incomingReferralCode = useMemo(() => {
    if (typeof window === "undefined") return "";
    return normalizeReferralCode(new URLSearchParams(window.location.search).get("ref") ?? "");
  }, [campaign.id]);
  const incomingReferrer = findReferrer(campaignSigners, campaign.id, incomingReferralCode);
  const personalReferralCode =
    lastSignedSigner?.campaignId === campaign.id ? getSupporterReferralCode(lastSignedSigner) : "";
  const personalReferralUrl = personalReferralCode
    ? getCampaignReferralUrl(organization, campaign, personalReferralCode)
    : publicUrl;
  const shareMessages = getProfessionalShareMessages(campaign, personalReferralUrl);
  const shareUrl = encodeURIComponent(personalReferralUrl);
  const shareText = encodeURIComponent(shareMessages.social);
  const [copiedReferral, setCopiedReferral] = useState("");
  const [shareClicks, setShareClicks] = useState(0);

  useEffect(() => {
    if (!incomingReferralCode) return;
    setPublicForm((current) =>
      current.referredByPhoneOrCode
        ? current
        : { ...current, referredByPhoneOrCode: incomingReferralCode, referralSource: "url" }
    );
  }, [incomingReferralCode, setPublicForm]);

  async function copyReferralText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedReferral(`${label} copied.`);
    } catch {
      setCopiedReferral("Copy failed. Select and copy the link manually.");
    }
  }

  function trackShareClick() {
    setShareClicks((current) => current + 1);
  }

  async function shareNatively() {
    trackShareClick();
    if (navigator.share) {
      try {
        await navigator.share({
          title: campaign.title,
          text: shareMessages.social,
          url: personalReferralUrl
        });
        return;
      } catch {
        // User cancelled or native share failed; keep the copied fallback available.
      }
    }
    await copyReferralText("Referral link", personalReferralUrl);
  }

  return (
    <section className="public-layout">
      <div
        className={
          campaign.heroImage ? "campaign-page campaign-page-with-media" : "campaign-page"
        }
        style={{
          backgroundImage: campaign.heroImage
            ? `linear-gradient(135deg, rgba(15, 23, 42, 0.74), rgba(15, 23, 42, 0.34)), url(${campaign.heroImage})`
            : undefined,
          backgroundPosition: campaign.heroImagePosition,
          backgroundSize: `${campaign.heroImageZoom}%`
        }}
      >
        <div className="public-hero-content">
          <span className="eyebrow">Public Campaign Page</span>
          <span className="status-pill" data-status={campaign.status}>{campaign.status}</span>
          <h1>{campaign.title}</h1>
          <p className="public-summary">{campaign.description}</p>
        </div>
        <div className="public-hero-grid">
          <div className="appeal-card">
            <span className="eyebrow">Why your signature matters</span>
            <p>{campaign.appealContent || campaign.description}</p>
          </div>
          <div className="appeal-card authority-receiver">
            <span className="eyebrow">Authority receiving petition</span>
            <strong>{resolvedAuthority.name}</strong>
            <p>{formatAuthorityDisplay(resolvedAuthority)}</p>
          </div>
        </div>
        <div className="public-progress">
          <div className="progress">
            <div style={{ width: `${metrics.progress}%` }} />
          </div>
          <div>
            <strong>{metrics.verified.toLocaleString()}</strong>
            <span>of {getCampaignGoalValue(campaign).toLocaleString()} verified signatures</span>
          </div>
        </div>
        <div className="supporter-counter">
          <div>
            <span>Total supporters</span>
            <strong>{metrics.total.toLocaleString()}</strong>
          </div>
          <div>
            <span>Verified supporters</span>
            <strong>{metrics.verified.toLocaleString()}</strong>
          </div>
          <div>
            <span>District participation</span>
            <strong>{districtParticipation}</strong>
          </div>
        </div>
        {campaign.donationEnabled && <DonationCard campaign={campaign} compact />}
        <div className="qr-box">
          <QrCode size={40} />
          <div>
            <strong>{campaign.qrLabel}</strong>
            <span>{publicUrl}</span>
          </div>
        </div>
        {campaign.campaignVideoUrl && (
          <a className="video-link" href={campaign.campaignVideoUrl} target="_blank" rel="noreferrer">
            Watch campaign video
          </a>
        )}
      </div>

      <Panel title="Add your signature" icon={<ClipboardList />}>
        <form id="public-sign-form" className="form-stack public-sign-form" onSubmit={onSubmit}>
          <p className="required-note">Fields marked * are required.</p>
          {incomingReferralCode && (
            <div className="referral-invite-note">
              <Share2 size={18} />
              <div>
                <strong>
                  You were invited by {incomingReferrer ? getSafeReferrerLabel(incomingReferrer) : "a campaign supporter"}.
                </strong>
                <span>Referral is optional and never affects your ability to sign.</span>
              </div>
            </div>
          )}
          <Field label={signerFieldLabel("Full name", "name")}>
            <input
              aria-label="Full name"
              placeholder="Full name"
              value={publicForm.name}
              onChange={(event) => setPublicForm({ ...publicForm, name: event.target.value })}
            />
          </Field>
          <Field label={signerFieldLabel("Email", "email")}>
            <input
              aria-label="Email"
              placeholder="Email"
              type="email"
              value={publicForm.email}
              onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
            />
          </Field>
          <Field label={signerFieldLabel("Phone", "phone")}>
            <input
              aria-label="Phone"
              placeholder="Phone"
              value={publicForm.phone}
              onChange={(event) => setPublicForm({ ...publicForm, phone: event.target.value })}
            />
          </Field>
          {campaign.authoritySelectionMode === "public_choice" && (
            <Field label="Choose authority for your appeal">
              <select
                value={publicForm.selectedAuthorityId || publicAuthorityOptions[0]?.id || ""}
                onChange={(event) => {
                  const selected = publicAuthorityOptions.find(
                    (item) => item.id === event.target.value
                  );
                  setPublicForm({
                    ...publicForm,
                    selectedAuthorityId: event.target.value,
                    selectedAuthorityName: selected?.name ?? ""
                  });
                }}
              >
                {publicAuthorityOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {formatAuthorityDisplay(option)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="otp-box">
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={onSendOtp}>
                Send OTP
              </button>
              <input
                aria-label="Enter OTP"
                placeholder="Enter OTP"
                value={otpInput}
                onChange={(event) => setOtpInput(event.target.value)}
              />
              <button className="secondary-button" type="button" onClick={onVerifyOtp}>
                Verify OTP
              </button>
            </div>
            {publicForm.otpVerified && <span className="status-pill">Phone verified</span>}
            {otpMessage && <p className="info-message">{otpMessage}</p>}
          </div>
          <Field label="WhatsApp number">
            <input
              aria-label="WhatsApp number"
              placeholder="If different from phone"
              value={publicForm.whatsappNumber}
              onChange={(event) =>
                setPublicForm({ ...publicForm, whatsappNumber: event.target.value })
              }
            />
          </Field>
          <Field label="Telegram handle or number">
            <input
              aria-label="Telegram handle or number"
              placeholder="@handle or number"
              value={publicForm.telegramHandle}
              onChange={(event) =>
                setPublicForm({ ...publicForm, telegramHandle: event.target.value })
              }
            />
          </Field>
          <Field label="Referred by phone, name, or referral code">
            <input
              aria-label="Referred by phone, name, or referral code"
              placeholder="Optional"
              value={publicForm.referredByPhoneOrCode ?? ""}
              onChange={(event) =>
                setPublicForm({
                  ...publicForm,
                  referredByPhoneOrCode: event.target.value,
                  referralSource: event.target.value.trim() ? "manual" : undefined
                })
              }
            />
            <small>Optional. Use a referrer phone, name, or code if someone invited you.</small>
          </Field>
          {restrictionMessage && (
            <div className="public-location-limit" aria-live="polite">
              <span aria-hidden="true">📍</span>
              <div>
                <strong>This campaign is limited to</strong>
                {lockedLocationParts.length > 0 ? (
                  <ul>
                    {lockedLocationParts.map((location) => (
                      <li key={location}>{location}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{restrictionMessage}</p>
                )}
              </div>
            </div>
          )}
          <IndiaLocationFields
            idPrefix="public-signer-location"
            values={restrictedPublicForm}
            onChange={(values) =>
              setPublicForm(applySignerLocationRestriction(campaign, { ...publicForm, ...values }, organization))
            }
            locationOverrides={locationOverrides}
            locationDeletions={locationDeletions}
            allowedLocation={lockedLocation}
            hiddenLockedLevel={signerRestrictionLevel}
            requiredFields={requiredFields}
          />
          <Field label={signerFieldLabel("Address", "address")}>
            <input
              aria-label="Address"
              placeholder="House, street, locality"
              value={publicForm.address}
              onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
            />
          </Field>
          <div className="trust-section" aria-label="Trust and privacy">
            <span><ShieldCheck size={18} /> Privacy respected</span>
            <span><LockKeyhole size={18} /> Signature stored securely</span>
            <span><CheckCircle2 size={18} /> Petition routed to selected authority</span>
          </div>
          <label className="check-row">
            <input required type="checkbox" /> I have read and support the campaign appeal/cause
            shown above.
          </label>
          <label className="check-row">
            <input required type="checkbox" /> {campaign.consentText}
          </label>
          {campaign.donationEnabled && <DonationCard campaign={campaign} />}
          <button className="primary-button" type="submit">
            <CheckCircle2 size={18} /> Sign campaign
          </button>
          <a className="mobile-sticky-sign" href="#public-sign-form">
            <CheckCircle2 size={18} /> Sign campaign
          </a>
          {publicMessage && <p className="success-message">{publicMessage}</p>}
          {lastSignedSigner?.campaignId === campaign.id && (
            <div className="participant-actions">
              <div className="referral-thank-you">
                <div>
                  <span className="eyebrow">Thank you for supporting</span>
                  <strong>{campaign.title}</strong>
                  <p>Your personal referral link is ready. Share it with friends so the campaign can grow.</p>
                </div>
                <div className="referral-score-card">
                  <span>Session points</span>
                  <strong>{(shareClicks * REFERRAL_SHARE_POINTS).toLocaleString()}</strong>
                  <small>{getReferralBadge(shareClicks * REFERRAL_SHARE_POINTS)}</small>
                </div>
              </div>
              <div className="personal-referral-card">
                <ReferralQrPreview
                  value={personalReferralUrl}
                  label="Personal referral QR"
                  caption={personalReferralCode ? `Referral code ${personalReferralCode}` : "Referral code will appear after signing."}
                />
                <div>
                  <span className="label">Personal referral link</span>
                  <code>{personalReferralUrl}</code>
                  <p className="helper-text">
                    QR rendering, share-click points, and poster export are provider-ready/session-only until a production
                    referral provider is connected.
                  </p>
                </div>
              </div>
              {copiedReferral && <p className="success-message">{copiedReferral}</p>}
              <button
                className="secondary-button"
                type="button"
                onClick={async () => {
                  const { exportSignerAppealPdf } = await import("../pdfExports");
                  exportSignerAppealPdf(campaign, lastSignedSigner, resolvedAuthority);
                }}
              >
                Download signed appeal PDF
              </button>
              <div className="public-share-grid">
                <a
                  className="secondary-link-button"
                  href={whatsAppLink("", shareMessages.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={trackShareClick}
                >
                  WhatsApp
                </a>
                <a
                  className="secondary-link-button"
                  href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={trackShareClick}
                >
                  <Share2 size={16} /> Facebook
                </a>
                <a
                  className="secondary-link-button"
                  href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={trackShareClick}
                >
                  <Share2 size={16} /> Twitter/X
                </a>
                <a
                  className="secondary-link-button"
                  href={`mailto:?subject=${encodeURIComponent(shareMessages.emailSubject)}&body=${encodeURIComponent(shareMessages.emailBody)}`}
                  onClick={trackShareClick}
                >
                  <Mail size={16} /> Email
                </a>
                <button className="secondary-button" type="button" onClick={() => copyReferralText("Referral link", personalReferralUrl)}>
                  <Copy size={16} /> Copy Link
                </button>
                <button className="secondary-button" type="button" onClick={shareNatively}>
                  <Share2 size={16} /> Native Share
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    trackShareClick();
                    downloadQrPosterSvg({
                      campaign,
                      organizationName: organization?.name ?? "Voiceup",
                      url: personalReferralUrl,
                      referralCode: personalReferralCode
                    });
                  }}
                >
                  <Download size={16} /> Download QR
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    trackShareClick();
                    window.print();
                  }}
                >
                  <Printer size={16} /> Print Poster
                </button>
                <span className="secondary-link-button provider-ready-share">
                  <QrCode size={16} /> Instagram: copy caption + poster
                </span>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => copyReferralText("Instagram caption", shareMessages.instagramCaption)}
              >
                <Copy size={16} /> Copy Instagram Caption
              </button>
            </div>
          )}
        </form>
      </Panel>
    </section>
  );
}

export function PublicCampaignNotFound() {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Campaign link</span>
        <h1>This campaign is not available.</h1>
        <p>
          Please check the campaign link or ask the campaign organizer to publish the campaign
          again. The public signing page shows only campaign content when a published campaign is
          available.
        </p>
      </section>
    </main>
  );
}

export function PublicCampaignLoading({ message }: { message: string }) {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Loading campaign</span>
        <h1>Loading campaign details...</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
