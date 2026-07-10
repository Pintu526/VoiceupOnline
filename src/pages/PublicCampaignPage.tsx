import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardList,
  LockKeyhole,
  QrCode,
  Share2,
  ShieldCheck
} from "lucide-react";
import type { AuthorityRule, Campaign, Organization, Signer, SignerRequiredField } from "../types";
import { getConfiguredGrowthShareMessages } from "../growth/configuration";
import type { GrowthShareContext, GrowthSupporterSnapshot } from "../growth/lifecycle";
import type { SupporterGrowthPortalModel } from "../growth/tree";
import { ViralPostSignExperience } from "../growth/supporter";
import type { LocationDeletions, LocationOverrides } from "../geography";
import type { getCampaignMetrics } from "../lib";
import { Panel } from "../ui/Panel";
import { Field } from "../ui/Field";
import { DonationCard } from "../components/DonationCard";
import { IndiaLocationFields } from "../components/IndiaLocationFields";
import { GlobalLocationFields } from "../components/GlobalLocationFields";
import { blankSigner } from "../constants";
import {
  getAppealAuthority,
  getPublicAuthorityOptions,
  formatAuthorityDisplay
} from "../utils/authority";
import {
  applySignerLocationRestriction,
  formatLocationForCampaign,
  getCampaignGoalValue,
  getCampaignGeographyMode,
  getCampaignLocationLabels,
  getCampaignPublicUrl,
  getCampaignScope,
  getEffectiveSignerLocationRestrictionLevel,
  getLocationRestrictionMessage,
  getLockedLocationValues
} from "../utils/campaign";
import {
  downloadQrPosterSvg,
  findReferrer,
  getCampaignReferralUrl,
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
  growthSnapshot?: GrowthSupporterSnapshot;
  growthPortal?: SupporterGrowthPortalModel;
  otpInput: string;
  setOtpInput: React.Dispatch<React.SetStateAction<string>>;
  otpMessage: string;
  developmentOtpCode: string;
  isDevelopmentOtpMode: boolean;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  onGrowthShare?: (share: GrowthShareContext) => void;
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
  growthSnapshot,
  growthPortal,
  otpInput,
  setOtpInput,
  otpMessage,
  developmentOtpCode,
  isDevelopmentOtpMode,
  onSendOtp,
  onVerifyOtp,
  locationOverrides,
  locationDeletions,
  onGrowthShare,
  onSubmit
}: PublicCampaignPageProps) {
  const publicAuthorityOptions = getPublicAuthorityOptions(campaign, authorities);
  const resolvedAuthority = authority ?? getAppealAuthority(campaign);
  const isGlobalMode = getCampaignGeographyMode(campaign) === "global";
  const locationLabels = getCampaignLocationLabels(campaign);
  const signerRestrictionLevel = getEffectiveSignerLocationRestrictionLevel(campaign, organization);
  const restrictedPublicForm = applySignerLocationRestriction(campaign, publicForm, organization);
  const publicLocationForm =
    isGlobalMode && getCampaignScope(campaign) !== "global" && campaign.country && !restrictedPublicForm.country
      ? { ...restrictedPublicForm, country: campaign.country }
      : restrictedPublicForm;
  const restrictionMessage = getLocationRestrictionMessage(campaign, organization);
  const lockedLocation = {
    ...(isGlobalMode && getCampaignScope(campaign) !== "global" && campaign.country
      ? { country: campaign.country }
      : {}),
    ...getLockedLocationValues(campaign, signerRestrictionLevel)
  };
  const lockedLocationParts = formatLocationForCampaign(campaign, lockedLocation).split(", ").filter(Boolean);
  const participationLabel = isGlobalMode ? `${locationLabels.district} participation` : "District participation";
  const locationParticipation = campaign.district || restrictedPublicForm.district || "Not captured yet";
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
  const shareMessages = getConfiguredGrowthShareMessages({
    campaign,
    organization,
    signer: lastSignedSigner,
    referralLink: personalReferralUrl,
    walletCredits: growthPortal?.wallet.balance.walletCredits ?? growthSnapshot?.lifetimeGrowth,
    recognitionLevel: growthSnapshot?.currentRecognitionLevelName ?? growthPortal?.tree.currentRecognition,
    campaignProgress: metrics.progress,
    supporterCount: metrics.total,
    verifiedSupporters: metrics.verified
  });
  const [copiedReferral, setCopiedReferral] = useState("");
  const [shareClicks, setShareClicks] = useState(0);
  const isRequired = (field: SignerRequiredField) => requiredFields.includes(field);
  const locationRequired = requiredFields.some((field) =>
    ["country", "state", "district", "block", "panchayat", "postalCode"].includes(field)
  );
  const locationFields = isGlobalMode ? (
    <GlobalLocationFields
      idPrefix="public-signer-location"
      values={publicLocationForm}
      onChange={(values) =>
        setPublicForm(applySignerLocationRestriction(campaign, { ...publicForm, ...values }, organization))
      }
      allowedLocation={lockedLocation}
      hiddenLockedLevel={signerRestrictionLevel}
      requiredFields={requiredFields}
    />
  ) : (
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
  );

  useEffect(() => {
    if (!incomingReferralCode) return;
    setPublicForm((current) =>
      current.referredByPhoneOrCode
        ? current
        : { ...current, referredByPhoneOrCode: incomingReferralCode, referralSource: "url" }
    );
  }, [incomingReferralCode, setPublicForm]);

  async function copyReferralText(
    label: string,
    value: string,
    channel: GrowthShareContext["channel"] = "copy"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedReferral(`${label} copied.`);
      onGrowthShare?.({ channel, url: value });
    } catch {
      setCopiedReferral("Copy failed. Select and copy the link manually.");
    }
  }

  function trackShareClick(channel: GrowthShareContext["channel"]) {
    setShareClicks((current) => current + 1);
    onGrowthShare?.({ channel, url: personalReferralUrl });
  }

  async function shareNatively() {
    trackShareClick("native");
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
            <span>{participationLabel}</span>
            <strong>{locationParticipation}</strong>
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
          {isRequired("email") && (
            <Field label={signerFieldLabel("Email", "email")}>
              <input
                aria-label="Email"
                placeholder="Email"
                type="email"
                value={publicForm.email}
                onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
              />
            </Field>
          )}
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
            <p className="helper-text">
              OTP helps prevent spam, duplicate signatures, and misuse of campaign support.
            </p>
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
            {isDevelopmentOtpMode && developmentOtpCode && (
              <div>
                <span className="status-pill">Development Mode</span>
                <p className="info-message">
                  Development OTP
                  <strong>{developmentOtpCode}</strong>
                </p>
              </div>
            )}
            {publicForm.otpVerified && <span className="status-pill">Phone verified</span>}
            {otpMessage && <p className="info-message">{otpMessage}</p>}
          </div>
          {(restrictionMessage || locationRequired) && (
            <div className="public-location-limit" aria-live="polite">
              <span aria-hidden="true">Location</span>
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
          {(restrictionMessage || locationRequired) && locationFields}
          {isRequired("address") && (
            <Field label={signerFieldLabel("Address", "address")}>
              <input
                aria-label="Address"
                placeholder="House, street, locality"
                value={publicForm.address}
                onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
              />
            </Field>
          )}
          <details className="optional-details">
            <summary>Additional Details (Optional)</summary>
            {!isRequired("email") && (
              <Field label="Email">
                <input
                  aria-label="Email"
                  placeholder="Email"
                  type="email"
                  value={publicForm.email}
                  onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
                />
              </Field>
            )}
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
              <small>Use a referrer phone, name, or code if someone invited you.</small>
            </Field>
            {!restrictionMessage && !locationRequired && locationFields}
            {!isRequired("address") && (
              <Field label="Address">
                <input
                  aria-label="Address"
                  placeholder="House, street, locality"
                  value={publicForm.address}
                  onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
                />
              </Field>
            )}
          </details>
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
          {lastSignedSigner?.campaignId !== campaign.id && (
            <a className="mobile-sticky-sign" href="#public-sign-form">
              <CheckCircle2 size={18} /> Sign campaign
            </a>
          )}
          {publicMessage && <p className="success-message">{publicMessage}</p>}
          {lastSignedSigner?.campaignId === campaign.id && (
            <ViralPostSignExperience
              campaign={campaign}
              organization={organization}
              signer={lastSignedSigner}
              campaignSigners={campaignSigners}
              metrics={metrics}
              growthSnapshot={growthSnapshot}
              growthPortal={growthPortal}
              personalReferralUrl={personalReferralUrl}
              personalReferralCode={personalReferralCode}
              shareMessages={shareMessages}
              shareClicks={shareClicks}
              copiedReferral={copiedReferral}
              publicMessage={publicMessage}
              onTrackShareClick={trackShareClick}
              onCopyReferralText={copyReferralText}
              onShareNatively={shareNatively}
              onDownloadQrPoster={() => {
                trackShareClick("qr");
                downloadQrPosterSvg({
                  campaign,
                  organizationName: organization?.name ?? "Voiceup",
                  url: personalReferralUrl,
                  referralCode: personalReferralCode
                });
              }}
              onPrintPoster={() => {
                trackShareClick("poster");
                window.print();
              }}
              onDownloadAppealPdf={async () => {
                const { exportSignerAppealPdf } = await import("../pdfExports");
                exportSignerAppealPdf(campaign, lastSignedSigner, resolvedAuthority);
              }}
            />
          )}
        </form>
      </Panel>
    </section>
  );
}

export function PublicCampaignNotFound({ onRetry }: { onRetry?: () => void }) {
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
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
          >
            Retry loading campaign
          </button>
          <a className="secondary-link-button" href="/">
            Go to Voiceup
          </a>
        </div>
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
