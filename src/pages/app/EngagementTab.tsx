import { MessageCircle, Share2, Users } from "lucide-react";
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

  return (
    <section className="page-stack">
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
