import { BellRing, Mail, MessageCircle, Send, Share2, Smartphone, Users } from "lucide-react";
import type { Campaign, Organization, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { Panel } from "../../ui/Panel";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { getCampaignPublicUrl, renderCampaignMessage } from "../../utils/campaign";
import { whatsAppLink, smsLink } from "../../utils/links";

interface EngagementTabProps {
  activeCampaign: Campaign | undefined;
  organization: Organization;
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
  const communicationChannels = [
    ["SMS", "Provider ready", Smartphone],
    ["WhatsApp", "Link sharing active / API provider ready", MessageCircle],
    ["Email", "Provider ready", Mail],
    ["IVR", "Provider ready", BellRing],
    ["Telegram", "Provider ready", Send],
    ["Social Media", "Share links active", Share2],
    ["Push", "Provider ready", BellRing]
  ] as const;

  return (
    <section className="page-stack">
      <Panel title="Communication Hub" icon={<Send />}>
        <div className="communication-hub-grid">
          <div className="communication-audience-card">
            <span className="eyebrow">Audience selector</span>
            <strong>{campaignSigners.length.toLocaleString()} campaign supporters</strong>
            <p>{campaignSigners.filter((signer) => signer.phone).length.toLocaleString()} phone-ready, {campaignSigners.filter((signer) => signer.email).length.toLocaleString()} email-ready.</p>
            <p className="info-message">Consent-aware sending is provider-ready. Do not send messages without consent verification.</p>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">Message preview</span>
            <p>{effectiveMessage}</p>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => onCopyText(effectiveMessage)}>
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
              <span className="label">Send window</span>
              <input type="datetime-local" disabled />
            </label>
            <p>Scheduling is disabled until a real communication provider is connected.</p>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">Delivery history</span>
            <strong>No provider delivery records yet</strong>
            <p>Future sends will show queued, delivered, failed, opted-out, and consent-blocked statuses here.</p>
          </div>
        </div>
        <div className="engagement-channel-grid">
          {communicationChannels.map(([label, status, Icon]) => (
            <article className="engagement-channel-card" key={label}>
              <Icon size={20} />
              <strong>{label}</strong>
              <small>{status}</small>
              <p>Template library, scheduling, configuration, and delivery history foundations are UI-only.</p>
            </article>
          ))}
        </div>
        <div className="template-chip-row">
          {["Campaign launch", "Authority follow-up", "Volunteer call", "Thank-you", "Field collection reminder"].map((template) => (
            <span key={template}>{template}</span>
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
