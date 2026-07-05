import { useMemo, useState } from "react";
import { BellRing, Mail, MessageCircle, Send, Share2, Smartphone, Users } from "lucide-react";
import type { Campaign, IntegrationSettings, Organization, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { Panel } from "../../ui/Panel";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { getCampaignPublicUrl, renderCampaignMessage } from "../../utils/campaign";
import { whatsAppLink, smsLink } from "../../utils/links";

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

  const publicUrl = getCampaignPublicUrl(organization, activeCampaign);
  const campaignForMessages = { ...activeCampaign, shareUrl: publicUrl };
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

  function toggleChannel(channel: string) {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    );
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
                  `${activeCampaign.socialShareText} ${publicUrl}`
                )}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp share
              </a>
              <a
                className="secondary-link-button"
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`}
                target="_blank"
                rel="noreferrer"
              >
                Facebook
              </a>
              <a
                className="secondary-link-button"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${activeCampaign.socialShareText} ${publicUrl}`)}`}
                target="_blank"
                rel="noreferrer"
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
