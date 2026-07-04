import type { FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  LockKeyhole,
  QrCode,
  Share2,
  ShieldCheck,
} from "lucide-react";
import type { AuthorityRule, Campaign, Organization, Signer, SignerRequiredField } from "../types";
import type { LocationDeletions, LocationOverrides } from "../geography";
import type { getCampaignMetrics } from "../lib";
import { exportSignerAppealPdf } from "../lib";
import { Panel } from "../ui/Panel";
import { Field } from "../ui/Field";
import { DonationCard } from "../components/DonationCard";
import { IndiaLocationFields } from "../components/IndiaLocationFields";
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
  getLockedLocationValues,
  renderCampaignMessage
} from "../utils/campaign";
import { whatsAppLink } from "../utils/links";

interface PublicCampaignPageProps {
  campaign: Campaign;
  organization?: Organization;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authority?: AuthorityRule;
  authorities: AuthorityRule[];
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
  const shareText = encodeURIComponent(campaign.socialShareText || campaign.title);
  const publicUrl = getCampaignPublicUrl(organization, campaign);
  const shareUrl = encodeURIComponent(publicUrl);
  const campaignForMessages = { ...campaign, shareUrl: publicUrl };

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
              <strong>Share this campaign</strong>
              <span className="status-pill">Provider Ready</span>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  exportSignerAppealPdf(campaign, lastSignedSigner, resolvedAuthority)
                }
              >
                Download signed appeal PDF
              </button>
              <div className="public-share-grid">
                <a
                  className="secondary-link-button"
                  href={whatsAppLink("", renderCampaignMessage(campaign.thankYouMessage, campaignForMessages, metrics))}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                <a
                  className="secondary-link-button"
                  href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Share2 size={16} /> Facebook
                </a>
                <a
                  className="secondary-link-button"
                  href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Share2 size={16} /> Twitter/X
                </a>
                <button className="secondary-button" type="button">
                  <Copy size={16} /> Copy Link
                </button>
                <span className="secondary-link-button provider-ready-share">
                  <QrCode size={16} /> QR Code
                </span>
              </div>
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
