import type { FormEvent } from "react";
import { CheckCircle2, ClipboardList, QrCode } from "lucide-react";
import type { AuthorityRule, Campaign, Signer } from "../types";
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
import { getCampaignGoalValue, renderCampaignMessage } from "../utils/campaign";
import { whatsAppLink, smsLink } from "../utils/links";

interface PublicCampaignPageProps {
  campaign: Campaign;
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
        <span className="status-pill" data-status={campaign.status}>{campaign.status}</span>
        <h1>{campaign.title}</h1>
        <p>{campaign.description}</p>
        <div className="appeal-card">
          <span className="eyebrow">Appeal to {resolvedAuthority.name}</span>
          <p>{campaign.appealContent || campaign.description}</p>
        </div>
        <div className="public-progress">
          <div className="progress">
            <div style={{ width: `${metrics.progress}%` }} />
          </div>
          <strong>{metrics.verified.toLocaleString()}</strong> of{" "}
          {getCampaignGoalValue(campaign).toLocaleString()} verified signatures
        </div>
        {campaign.donationEnabled && <DonationCard campaign={campaign} compact />}
        <div className="qr-box">
          <QrCode size={40} />
          <div>
            <strong>{campaign.qrLabel}</strong>
            <span>{campaign.shareUrl}</span>
          </div>
        </div>
        {campaign.campaignVideoUrl && (
          <a className="video-link" href={campaign.campaignVideoUrl} target="_blank" rel="noreferrer">
            Watch campaign video
          </a>
        )}
      </div>

      <Panel title="Support this campaign" icon={<ClipboardList />}>
        <form className="form-stack" onSubmit={onSubmit}>
          <input
            aria-label="Full name"
            placeholder="Full name"
            value={publicForm.name}
            onChange={(event) => setPublicForm({ ...publicForm, name: event.target.value })}
          />
          <input
            aria-label="Email"
            placeholder="Email"
            type="email"
            value={publicForm.email}
            onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
          />
          <input
            aria-label="Phone"
            placeholder="Phone"
            value={publicForm.phone}
            onChange={(event) => setPublicForm({ ...publicForm, phone: event.target.value })}
          />
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
          <input
            aria-label="WhatsApp number"
            placeholder="WhatsApp number (optional, if different)"
            value={publicForm.whatsappNumber}
            onChange={(event) =>
              setPublicForm({ ...publicForm, whatsappNumber: event.target.value })
            }
          />
          <input
            aria-label="Telegram handle or number"
            placeholder="Telegram handle or number (optional)"
            value={publicForm.telegramHandle}
            onChange={(event) =>
              setPublicForm({ ...publicForm, telegramHandle: event.target.value })
            }
          />
          <IndiaLocationFields
            idPrefix="public-signer-location"
            values={publicForm}
            onChange={(values) => setPublicForm({ ...publicForm, ...values })}
            locationOverrides={locationOverrides}
            locationDeletions={locationDeletions}
          />
          <input
            aria-label="Address"
            placeholder="Address"
            value={publicForm.address}
            onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
          />
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
          {publicMessage && <p className="success-message">{publicMessage}</p>}
          {lastSignedSigner?.campaignId === campaign.id && (
            <div className="participant-actions">
              <strong>Send thank-you message</strong>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  exportSignerAppealPdf(campaign, lastSignedSigner, resolvedAuthority)
                }
              >
                Download signed appeal PDF
              </button>
              <div className="button-row">
                <a
                  className="secondary-link-button"
                  href={whatsAppLink(
                    lastSignedSigner.phone,
                    renderCampaignMessage(campaign.thankYouMessage, campaign, metrics)
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                <a
                  className="secondary-link-button"
                  href={smsLink(
                    lastSignedSigner.phone,
                    renderCampaignMessage(campaign.thankYouMessage, campaign, metrics)
                  )}
                >
                  SMS
                </a>
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
