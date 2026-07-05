import { useMemo, useState } from "react";
import { BellRing, Copy, Download, Mail, MessageCircle, Printer, QrCode, Send, Share2, Smartphone, Users } from "lucide-react";
import type { Campaign, IntegrationSettings, Organization, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { Panel } from "../../ui/Panel";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { ReferralQrPreview } from "../../components/ReferralQrPreview";
import { getCampaignPublicUrl, renderCampaignMessage } from "../../utils/campaign";
import { whatsAppLink, smsLink } from "../../utils/links";
import {
  REFERRAL_SHARE_POINTS,
  REFERRAL_SIGNATURE_POINTS,
  downloadQrPosterSvg,
  getCampaignReferralUrl,
  getProfessionalShareMessages,
  getReferralBadge,
  getReferralLeaderboard
} from "../../utils/referrals";

interface EngagementTabProps {
  activeCampaign: Campaign | undefined;
  organization: Organization;
  integrations: IntegrationSettings;
  campaignSigners: Signer[];
  metrics: ReturnType<typeof getCampaignMetrics>;
  broadcastMessage: string;
  setBroadcastMessage: React.Dispatch<React.SetStateAction<string>>;
  copiedMessage: string;
  onCopyText: (text: string) => void;
  onCreateCampaign: () => void;
}

export function EngagementTab({
  activeCampaign,
  organization,
  integrations,
  campaignSigners,
  metrics,
  broadcastMessage,
  setBroadcastMessage,
  copiedMessage,
  onCopyText,
  onCreateCampaign
}: EngagementTabProps) {
  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title="Engagement tools need a campaign"
        description="Create and publish a campaign before sending WhatsApp, SMS, or social updates."
        onCreateCampaign={onCreateCampaign}
      />
    );
  }

  const campaign = activeCampaign;
  const publicUrl = getCampaignPublicUrl(organization, campaign);
  const campaignForMessages = { ...campaign, shareUrl: publicUrl };
  const reportMessage = renderCampaignMessage(
    activeCampaign.participantUpdateMessage,
    campaignForMessages,
    metrics
  );
  const effectiveMessage = broadcastMessage || reportMessage;
  const [selectedSegment, setSelectedSegment] = useState("All supporters");
  const [selectedTemplate, setSelectedTemplate] = useState("Campaign update");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["WhatsApp", "SMS"]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [deliveryPriority, setDeliveryPriority] = useState("Normal");
  const [referrerSearch, setReferrerSearch] = useState("");
  const [sessionShareClicks, setSessionShareClicks] = useState(0);
  const supporterSegments = useMemo(
    () => [
      {
        label: "All supporters",
        count: campaignSigners.length,
        detail: "Every supporter for this campaign"
      },
      {
        label: "Verified supporters",
        count: campaignSigners.filter((signer) => signer.status === "verified" || signer.otpVerified).length,
        detail: "Verified or OTP-confirmed supporters"
      },
      {
        label: "Phone reachable",
        count: campaignSigners.filter((signer) => signer.phone).length,
        detail: "Eligible for SMS/WhatsApp after consent checks"
      },
      {
        label: "Email reachable",
        count: campaignSigners.filter((signer) => signer.email).length,
        detail: "Eligible for email after consent checks"
      },
      {
        label: "Field collection supporters",
        count: campaignSigners.filter((signer) => signer.source === "scan" || signer.source === "field").length,
        detail: "Imported from paper/manual collection"
      },
      {
        label: "Pending verification",
        count: campaignSigners.filter((signer) => signer.status === "pending" && !signer.otpVerified).length,
        detail: "Needs verification or review"
      }
    ],
    [campaignSigners]
  );
  const activeSegment = supporterSegments.find((segment) => segment.label === selectedSegment) ?? supporterSegments[0];
  const messageTemplates = [
    {
      label: "Campaign update",
      message: reportMessage
    },
    {
      label: "Campaign launch",
      message: `${activeCampaign.socialShareText || `Support ${activeCampaign.title}`} ${publicUrl}`
    },
    {
      label: "Authority follow-up",
      message: `Update on ${activeCampaign.title}: we are preparing the supporter petition for authority follow-up. Track and share: ${publicUrl}`
    },
    {
      label: "Volunteer call",
      message: `We need volunteers for ${activeCampaign.title}. Help with sharing, field collection, and local follow-up: ${publicUrl}`
    },
    {
      label: "Thank-you",
      message: renderCampaignMessage(activeCampaign.thankYouMessage, campaignForMessages, metrics)
    },
    {
      label: "Field collection reminder",
      message: `Field team reminder for ${activeCampaign.title}: collect supporter details carefully and route paper sheets for review.`
    }
  ];
  const activeTemplate = messageTemplates.find((template) => template.label === selectedTemplate) ?? messageTemplates[0];
  const providerSettings = [
    ["SMS", integrations.smsProvider, integrations.smsSenderId || "Sender ID not set"],
    ["WhatsApp", integrations.whatsappProvider, integrations.whatsappSenderId || "Sender ID not set"],
    ["Email", integrations.emailProvider, integrations.emailSender || "Sender email not set"],
    ["IVR", "Not configured", "Provider-ready"],
    ["Telegram", "Not configured", "Provider-ready"],
    ["Social Media", "Manual share", "Provider-ready for scheduling/publishing APIs"],
    ["Push", "Not configured", "Provider-ready"]
  ];
  const communicationChannels = [
    ["SMS", "Provider ready", Smartphone],
    ["WhatsApp", "Link sharing active / API provider ready", MessageCircle],
    ["Email", "Provider ready", Mail],
    ["IVR", "Provider ready", BellRing],
    ["Telegram", "Provider ready", Send],
    ["Social Media", "Share links active", Share2],
    ["Push", "Provider ready", BellRing]
  ] as const;
  const previewMessage = broadcastMessage || activeTemplate.message;
  const selectedProviderCount = selectedChannels.length;
  const campaignReferralCode = `ADMIN-${activeCampaign.slug.toUpperCase().slice(0, 8)}`;
  const campaignReferralUrl = getCampaignReferralUrl(organization, activeCampaign, campaignReferralCode);
  const referralShareMessages = getProfessionalShareMessages(activeCampaign, campaignReferralUrl);
  const referralLeaders = useMemo(() => getReferralLeaderboard(campaignSigners), [campaignSigners]);
  const referredSignatures = campaignSigners.filter((signer) => signer.referredBy || signer.referredByPhoneOrCode).length;
  const referralConversionRate = campaignSigners.length
    ? Math.round((referredSignatures / campaignSigners.length) * 100)
    : 0;
  const referralPoints = referredSignatures * REFERRAL_SIGNATURE_POINTS + sessionShareClicks * REFERRAL_SHARE_POINTS;
  const filteredReferralLeaders = referralLeaders.filter((leader) =>
    `${leader.label} ${leader.code} ${leader.location}`.toLowerCase().includes(referrerSearch.toLowerCase())
  );

  function toggleChannel(channel: string) {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    );
  }

  function trackReferralShare() {
    setSessionShareClicks((current) => current + 1);
  }

  async function shareReferralNatively() {
    trackReferralShare();
    if (navigator.share) {
      try {
        await navigator.share({
          title: campaign.title,
          text: referralShareMessages.social,
          url: campaignReferralUrl
        });
        return;
      } catch {
        // Native share was cancelled or unavailable; fall back to copying.
      }
    }
    onCopyText(campaignReferralUrl);
  }

  return (
    <section className="page-stack">
      <Panel title="Communication Hub" icon={<Send />}>
        <div className="communication-hub-grid">
          <div className="communication-audience-card">
            <span className="eyebrow">Audience selector</span>
            <strong>{activeSegment.count.toLocaleString()} {activeSegment.label.toLowerCase()}</strong>
            <p>{activeSegment.detail}</p>
            <div className="communication-segment-grid">
              {supporterSegments.map((segment) => (
                <button
                  className={selectedSegment === segment.label ? "active" : ""}
                  key={segment.label}
                  type="button"
                  onClick={() => setSelectedSegment(segment.label)}
                >
                  <span>{segment.label}</span>
                  <strong>{segment.count.toLocaleString()}</strong>
                </button>
              ))}
            </div>
            <p className="info-message">Consent-aware sending is provider-ready. Do not send messages without consent verification.</p>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">Message preview</span>
            <label className="field">
              <span className="label">Template</span>
              <select value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}>
                {messageTemplates.map((template) => (
                  <option key={template.label}>{template.label}</option>
                ))}
              </select>
            </label>
            <textarea
              rows={5}
              value={previewMessage}
              onChange={(event) => setBroadcastMessage(event.target.value)}
            />
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => onCopyText(previewMessage)}>
                Copy preview
              </button>
              <button className="secondary-button" type="button" disabled>
                Schedule provider-ready
              </button>
            </div>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">Scheduling UI</span>
            <label className="field">
              <span className="label">Planned send window</span>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Priority</span>
              <select value={deliveryPriority} onChange={(event) => setDeliveryPriority(event.target.value)}>
                <option>Low</option>
                <option>Normal</option>
                <option>High</option>
              </select>
            </label>
            <p>
              Schedule is UI-only. {scheduledFor ? `Prepared for ${new Date(scheduledFor).toLocaleString()}.` : "Choose a future window for planning."}
            </p>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">Delivery history</span>
            <strong>No provider delivery records yet</strong>
            <p>Future sends will show queued, delivered, failed, opted-out, and consent-blocked statuses here.</p>
            <div className="delivery-status-row">
              {["Queued", "Delivered", "Failed", "Opted-out", "Consent-blocked"].map((status) => (
                <span key={status}>{status}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="consent-compliance-card">
          <BellRing size={22} />
          <div>
            <strong>Consent warning</strong>
            <p>
              No bulk sending is enabled. Verify supporter consent, opt-out rules, and provider compliance before using
              SMS, WhatsApp, Email, IVR, Telegram, Social Media, or Push delivery.
            </p>
          </div>
        </div>
        <div className="engagement-channel-grid">
          {communicationChannels.map(([label, status, Icon]) => (
            <article className={selectedChannels.includes(label) ? "engagement-channel-card selected" : "engagement-channel-card"} key={label}>
              <Icon size={20} />
              <strong>{label}</strong>
              <small>{status}</small>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(label)}
                  onChange={() => toggleChannel(label)}
                />
                Include in provider-ready plan
              </label>
              <p>Template library, scheduling, configuration, and delivery history foundations are UI-only.</p>
            </article>
          ))}
        </div>
        <p className="info-message">
          Prepared audience: {activeSegment.count.toLocaleString()} supporters - {selectedProviderCount} selected channels - priority {deliveryPriority}. This is a planning preview only.
        </p>
        <div className="communication-library-grid">
          {messageTemplates.map((template) => (
            <button
              className={selectedTemplate === template.label ? "active" : ""}
              key={template.label}
              type="button"
              onClick={() => {
                setSelectedTemplate(template.label);
                setBroadcastMessage(template.message);
              }}
            >
              <strong>{template.label}</strong>
              <span>{template.message}</span>
            </button>
          ))}
        </div>
        <div className="provider-settings-grid">
          {providerSettings.map(([channel, provider, detail]) => (
            <article className="provider-settings-card" key={channel}>
              <span className="eyebrow">{channel}</span>
              <strong>{provider === "Not configured" ? "Provider-ready" : provider}</strong>
              <small>{detail}</small>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="QR & Referral Dashboard" icon={<QrCode />}>
        <div className="referral-dashboard-grid">
          <div className="referral-metric-card">
            <span>Total referral signatures</span>
            <strong>{referredSignatures.toLocaleString()}</strong>
            <small>Real count from existing signer referral fields</small>
          </div>
          <div className="referral-metric-card">
            <span>Share clicks</span>
            <strong>{sessionShareClicks.toLocaleString()}</strong>
            <small>Session-only until provider tracking is connected</small>
          </div>
          <div className="referral-metric-card">
            <span>Conversion rate</span>
            <strong>{referralConversionRate}%</strong>
            <small>Referral signatures divided by total supporters</small>
          </div>
          <div className="referral-metric-card">
            <span>Referral points</span>
            <strong>{referralPoints.toLocaleString()}</strong>
            <small>{getReferralBadge(referralPoints)}</small>
          </div>
        </div>

        <div className="qr-sharing-grid">
          <ReferralQrPreview
            value={publicUrl}
            label="Public campaign QR"
            caption="Public signer URL"
          />
          <ReferralQrPreview
            value={campaignReferralUrl}
            label="Starter referral QR"
            caption={`Referral code ${campaignReferralCode}`}
          />
          <div className="qr-poster-preview">
            <span className="eyebrow">Printable QR poster</span>
            <strong>{activeCampaign.title}</strong>
            <p>{activeCampaign.description}</p>
            <code>{campaignReferralUrl}</code>
            <small>{organization.name || "Voiceup"} · {activeCampaign.category} · Scan to sign</small>
          </div>
        </div>

        <div className="campaign-link-row referral-route">
          <span>Campaign referral URL</span>
          <code>{campaignReferralUrl}</code>
          <button className="secondary-button" type="button" onClick={() => onCopyText(campaignReferralUrl)}>
            <Copy size={16} /> Copy referral link
          </button>
        </div>

        <div className="public-share-grid referral-admin-share-grid">
          <a
            className="secondary-link-button"
            href={whatsAppLink("", referralShareMessages.whatsapp)}
            target="_blank"
            rel="noreferrer"
            onClick={trackReferralShare}
          >
            WhatsApp
          </a>
          <a
            className="secondary-link-button"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(campaignReferralUrl)}`}
            target="_blank"
            rel="noreferrer"
            onClick={trackReferralShare}
          >
            Facebook
          </a>
          <a
            className="secondary-link-button"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(referralShareMessages.social)}`}
            target="_blank"
            rel="noreferrer"
            onClick={trackReferralShare}
          >
            X / Twitter
          </a>
          <a
            className="secondary-link-button"
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(campaignReferralUrl)}`}
            target="_blank"
            rel="noreferrer"
            onClick={trackReferralShare}
          >
            LinkedIn
          </a>
          <a
            className="secondary-link-button"
            href={`https://t.me/share/url?url=${encodeURIComponent(campaignReferralUrl)}&text=${encodeURIComponent(referralShareMessages.social)}`}
            target="_blank"
            rel="noreferrer"
            onClick={trackReferralShare}
          >
            Telegram
          </a>
          <a
            className="secondary-link-button"
            href={`mailto:?subject=${encodeURIComponent(referralShareMessages.emailSubject)}&body=${encodeURIComponent(referralShareMessages.emailBody)}`}
            onClick={trackReferralShare}
          >
            Email
          </a>
          <button className="secondary-button" type="button" onClick={shareReferralNatively}>
            <Share2 size={16} /> Native share
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              trackReferralShare();
              downloadQrPosterSvg({
                campaign: activeCampaign,
                organizationName: organization.name,
                url: campaignReferralUrl,
                referralCode: campaignReferralCode
              });
            }}
          >
            <Download size={16} /> Download poster
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              trackReferralShare();
              window.print();
            }}
          >
            <Printer size={16} /> Print
          </button>
        </div>

        <div className="referral-dashboard-grid">
          <div className="communication-preview-card">
            <span className="eyebrow">Referral leaderboard</span>
            <label className="field">
              <span className="label">Search referrer by safe label or code</span>
              <input
                value={referrerSearch}
                onChange={(event) => setReferrerSearch(event.target.value)}
                placeholder="Search name, code, or location"
              />
            </label>
            <div className="referral-leaderboard">
              {filteredReferralLeaders.length > 0 ? (
                filteredReferralLeaders.slice(0, 6).map((leader) => (
                  <div key={leader.code}>
                    <strong>{leader.label}</strong>
                    <span>{leader.referredSignatures.toLocaleString()} referred signatures · {leader.points} points</span>
                    <small>{leader.code} · {leader.location}</small>
                  </div>
                ))
              ) : (
                <p className="info-message">No referred signatures yet. Leaderboard export is provider-ready.</p>
              )}
            </div>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">Referral intelligence</span>
            <strong>{referralLeaders[0]?.label ?? "Top referrer not available yet"}</strong>
            <p>
              Visits, share-click attribution, downloadable leaderboard export, and location-level referral analytics are
              provider-ready. Successful referred signatures are counted when signer records include referral metadata.
            </p>
            <div className="delivery-status-row">
              <span>Campaign Starter</span>
              <span>Community Promoter</span>
              <span>Top Referrer</span>
              <span>District Champion</span>
              <span>Movement Ambassador</span>
            </div>
            <p className="info-message">
              Privacy respected: public views mask phone numbers and do not expose full referrer identity.
            </p>
          </div>
        </div>
        {copiedMessage && <p className="success-message">{copiedMessage}</p>}
      </Panel>

      <Panel title="Social publishing and participant engagement" icon={<MessageCircle />}>
        <div className="engagement-grid">
          <div className="engagement-card">
            <Share2 size={24} />
            <h3>Publish campaign to social networks</h3>
            <p>
              Share the same campaign URL. The campaign is published as a slug under your main
              domain.
            </p>
            <div className="button-row">
              <a
                className="secondary-link-button"
                href={whatsAppLink(
                  "",
                  referralShareMessages.whatsapp
                )}
                target="_blank"
                rel="noreferrer"
                onClick={trackReferralShare}
              >
                WhatsApp share
              </a>
              <a
                className="secondary-link-button"
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`}
                target="_blank"
                rel="noreferrer"
                onClick={trackReferralShare}
              >
                Facebook
              </a>
              <a
                className="secondary-link-button"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(referralShareMessages.social)}`}
                target="_blank"
                rel="noreferrer"
                onClick={trackReferralShare}
              >
                X / Twitter
              </a>
            </div>
          </div>

          <div className="engagement-card">
            <MessageCircle size={24} />
            <h3>Participant report message</h3>
            <p>Send a current progress update to keep supporters engaged after signup.</p>
            <textarea
              rows={5}
              value={effectiveMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
            />
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => onCopyText(effectiveMessage)}
              >
                Copy update
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setBroadcastMessage(reportMessage)}
              >
                Refresh report
              </button>
            </div>
            {copiedMessage && <p className="success-message">{copiedMessage}</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Send message to participants" icon={<Users />}>
        {campaignSigners.length === 0 ? (
          <p>No participants yet. Once people sign, WhatsApp and SMS actions appear here.</p>
        ) : (
          <div className="participant-message-list">
            {campaignSigners.map((signer) => (
              <div className="participant-message-card" key={signer.id}>
                <div>
                  <strong>{signer.name}</strong>
                  <span>{signer.phone}</span>
                  <small>
                    {[signer.panchayat, signer.block, signer.district, signer.state]
                      .filter(Boolean)
                      .join(", ")}
                  </small>
                </div>
                <div className="button-row">
                  <a
                    className="secondary-link-button"
                    href={whatsAppLink(signer.phone, effectiveMessage)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                  <a
                    className="secondary-link-button"
                    href={smsLink(signer.phone, effectiveMessage)}
                  >
                    SMS
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="info-message">
          Production bulk delivery should connect WhatsApp Business API and an Indian SMS provider
          such as MSG91, Gupshup, Twilio, or Airtel IQ.
        </p>
      </Panel>
    </section>
  );
}
