import { useMemo, useState } from "react";
import { BellRing, Copy, Download, Mail, MessageCircle, Printer, QrCode, Send, Share2, Smartphone, Users } from "lucide-react";
import type { Campaign, IntegrationSettings, Organization, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { Panel } from "../../ui/Panel";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { ReferralQrPreview } from "../../components/ReferralQrPreview";
import { getConfiguredGrowthShareMessages } from "../../growth/configuration";
import { getCampaignPublicUrl, renderCampaignMessage } from "../../utils/campaign";
import { whatsAppLink, smsLink } from "../../utils/links";
import {
  REFERRAL_SHARE_POINTS,
  REFERRAL_SIGNATURE_POINTS,
  downloadQrPosterSvg,
  getCampaignReferralUrl,
  getReferralBadge,
  getReferralLeaderboard
} from "../../utils/referrals";
import { useTranslation } from "../../i18n/useTranslation";

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
  onCopyText
}: EngagementTabProps) {
  const { t } = useTranslation();
  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title={t("crm.engagement.noCampaign")}
        description={t("crm.engagement.noCampaignHelp")}
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
        displayLabel: t("crm.engagement.segments.all"),
        count: campaignSigners.length,
        detail: t("crm.engagement.segments.allHelp")
      },
      {
        label: "Verified supporters",
        displayLabel: t("crm.engagement.segments.verified"),
        count: campaignSigners.filter((signer) => signer.status === "verified" || signer.otpVerified).length,
        detail: t("crm.engagement.segments.verifiedHelp")
      },
      {
        label: "Phone reachable",
        displayLabel: t("crm.engagement.segments.phone"),
        count: campaignSigners.filter((signer) => signer.phone).length,
        detail: t("crm.engagement.segments.phoneHelp")
      },
      {
        label: "Email reachable",
        displayLabel: t("crm.engagement.segments.email"),
        count: campaignSigners.filter((signer) => signer.email).length,
        detail: t("crm.engagement.segments.emailHelp")
      },
      {
        label: "Field collection supporters",
        displayLabel: t("crm.engagement.segments.field"),
        count: campaignSigners.filter((signer) => signer.source === "scan" || signer.source === "field").length,
        detail: t("crm.engagement.segments.fieldHelp")
      },
      {
        label: "Pending verification",
        displayLabel: t("crm.engagement.segments.pending"),
        count: campaignSigners.filter((signer) => signer.status === "pending" && !signer.otpVerified).length,
        detail: t("crm.engagement.segments.pendingHelp")
      }
    ],
    [campaignSigners, t]
  );
  const activeSegment = supporterSegments.find((segment) => segment.label === selectedSegment) ?? supporterSegments[0];
  const messageTemplates = [
    {
      label: "Campaign update",
      displayLabel: t("crm.engagement.templates.update"),
      message: reportMessage
    },
    {
      label: "Campaign launch",
      displayLabel: t("crm.engagement.templates.launch"),
      message: `${activeCampaign.socialShareText || `Support ${activeCampaign.title}`} ${publicUrl}`
    },
    {
      label: "Authority follow-up",
      displayLabel: t("crm.engagement.templates.authority"),
      message: `Update on ${activeCampaign.title}: we are preparing the supporter petition for authority follow-up. Track and share: ${publicUrl}`
    },
    {
      label: "Volunteer call",
      displayLabel: t("crm.engagement.templates.volunteer"),
      message: `We need volunteers for ${activeCampaign.title}. Help with sharing, field collection, and local follow-up: ${publicUrl}`
    },
    {
      label: "Thank-you",
      displayLabel: t("crm.engagement.templates.thankYou"),
      message: renderCampaignMessage(activeCampaign.thankYouMessage, campaignForMessages, metrics)
    },
    {
      label: "Field collection reminder",
      displayLabel: t("crm.engagement.templates.fieldReminder"),
      message: `Field team reminder for ${activeCampaign.title}: collect supporter details carefully and route paper sheets for review.`
    }
  ];
  const activeTemplate = messageTemplates.find((template) => template.label === selectedTemplate) ?? messageTemplates[0];
  const providerSettings = [
    ["SMS", integrations.smsProvider, integrations.smsSenderId || "Sender ID not set"],
    ["WhatsApp", integrations.whatsappProvider, integrations.whatsappSenderId || "Sender ID not set"],
    ["Email", integrations.emailProvider, integrations.emailSender || "Sender email not set"],
    ["IVR", "Not configured", "Available after setup"],
    ["Telegram", "Not configured", "Available after setup"],
    ["Social Media", "Manual share", "Scheduling available after setup"],
    ["Push", "Not configured", "Available after setup"]
  ];
  const communicationChannels = [
    ["SMS", "Setup needed", Smartphone],
    ["WhatsApp", "Link sharing active / API setup needed", MessageCircle],
    ["Email", "Setup needed", Mail],
    ["IVR", "Setup needed", BellRing],
    ["Telegram", "Setup needed", Send],
    ["Social Media", "Share links active", Share2],
    ["Push", "Setup needed", BellRing]
  ] as const;
  const previewMessage = broadcastMessage || activeTemplate.message;
  const selectedProviderCount = selectedChannels.length;
  const campaignReferralCode = `ADMIN-${activeCampaign.slug.toUpperCase().slice(0, 8)}`;
  const campaignReferralUrl = getCampaignReferralUrl(organization, activeCampaign, campaignReferralCode);
  const referralShareMessages = getConfiguredGrowthShareMessages({
    campaign: activeCampaign,
    organization,
    referralLink: campaignReferralUrl
  });
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
      <Panel title={t("crm.engagement.communicationHub")} icon={<Send />}>
        <div className="communication-hub-grid">
          <div className="communication-audience-card">
            <span className="eyebrow">{t("crm.engagement.audienceSelector")}</span>
            <strong>{activeSegment.count.toLocaleString()} {activeSegment.displayLabel.toLowerCase()}</strong>
            <p>{activeSegment.detail}</p>
            <div className="communication-segment-grid">
              {supporterSegments.map((segment) => (
                <button
                  className={selectedSegment === segment.label ? "active" : ""}
                  key={segment.label}
                  type="button"
                  onClick={() => setSelectedSegment(segment.label)}
                >
                  <span>{segment.displayLabel}</span>
                  <strong>{segment.count.toLocaleString()}</strong>
                </button>
              ))}
            </div>
            <p className="info-message">{t("crm.engagement.consentSendingHelp")}</p>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">{t("crm.engagement.messagePreview")}</span>
            <label className="field">
              <span className="label">{t("crm.engagement.template")}</span>
              <select value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}>
                {messageTemplates.map((template) => (
                  <option key={template.label} value={template.label}>{template.displayLabel}</option>
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
                {t("crm.engagement.copyPreview")}
              </button>
              <button className="secondary-button" type="button" disabled>
                {t("crm.engagement.scheduleAfterSetup")}
              </button>
            </div>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">{t("crm.engagement.schedulingUi")}</span>
            <label className="field">
              <span className="label">{t("crm.engagement.sendWindow")}</span>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">{t("crm.engagement.priority")}</span>
              <select value={deliveryPriority} onChange={(event) => setDeliveryPriority(event.target.value)}>
                <option value="Low">{t("crm.engagement.priorityLow")}</option>
                <option value="Normal">{t("crm.engagement.priorityNormal")}</option>
                <option value="High">{t("crm.engagement.priorityHigh")}</option>
              </select>
            </label>
            <p>
              {t("crm.engagement.scheduleUiOnly")} {scheduledFor ? `${t("crm.engagement.preparedFor")} ${new Date(scheduledFor).toLocaleString()}.` : t("crm.engagement.chooseWindow")}
            </p>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">{t("crm.engagement.deliveryHistory")}</span>
            <strong>{t("crm.engagement.noDelivery")}</strong>
            <p>{t("crm.engagement.deliveryHelp")}</p>
            <div className="delivery-status-row">
              {["queued", "delivered", "failed", "optedOut", "consentBlocked"].map((statusKey) => (
                <span key={statusKey}>{t(`crm.engagement.status.${statusKey}`)}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="consent-compliance-card">
          <BellRing size={22} />
          <div>
            <strong>{t("crm.engagement.consentWarning")}</strong>
            <p>{t("crm.engagement.consentWarningHelp")}</p>
          </div>
        </div>
        <div className="engagement-channel-grid">
          {communicationChannels.map(([label, status, Icon]) => (
            <article className={selectedChannels.includes(label) ? "engagement-channel-card selected" : "engagement-channel-card"} key={label}>
              <Icon size={20} />
              <strong>{label}</strong>
              <small>{t(`crm.engagement.channelStatus.${label.replace(/\s/g, "").toLowerCase()}`)}</small>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(label)}
                  onChange={() => toggleChannel(label)}
                />
                {t("crm.engagement.includeSetup")}
              </label>
              <p>{t("crm.engagement.foundationHelp")}</p>
            </article>
          ))}
        </div>
        <p className="info-message">
          {t("crm.engagement.preparedAudience")}: {activeSegment.count.toLocaleString()} {t("crm.common.supporters").toLowerCase()} - {selectedProviderCount} {t("crm.engagement.selectedChannels")} - {t("crm.engagement.priority").toLowerCase()} {t(`crm.engagement.priority${deliveryPriority}`)}. {t("crm.engagement.planningOnly")}
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
              <strong>{template.displayLabel}</strong>
              <span>{template.message}</span>
            </button>
          ))}
        </div>
        <div className="provider-settings-grid">
          {providerSettings.map(([channel, provider, detail]) => (
            <article className="provider-settings-card" key={channel}>
              <span className="eyebrow">{channel}</span>
              <strong>{provider === "Not configured" ? t("crm.status.setupNeeded") : provider}</strong>
              <small>{detail}</small>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title={t("referrals.dashboard.title")} icon={<QrCode />}>
        <div className="referral-dashboard-grid">
          <div className="referral-metric-card">
            <span>{t("referrals.dashboard.totalSignatures")}</span>
            <strong>{referredSignatures.toLocaleString()}</strong>
            <small>{t("referrals.dashboard.realCount")}</small>
          </div>
          <div className="referral-metric-card">
            <span>{t("referrals.dashboard.shareClicks")}</span>
            <strong>{sessionShareClicks.toLocaleString()}</strong>
            <small>{t("referrals.dashboard.sessionOnly")}</small>
          </div>
          <div className="referral-metric-card">
            <span>{t("referrals.dashboard.conversionRate")}</span>
            <strong>{referralConversionRate}%</strong>
            <small>{t("referrals.dashboard.conversionHelp")}</small>
          </div>
          <div className="referral-metric-card">
            <span>{t("referrals.dashboard.points")}</span>
            <strong>{referralPoints.toLocaleString()}</strong>
            <small>{getReferralBadge(referralPoints)}</small>
          </div>
        </div>

        <div className="qr-sharing-grid">
          <ReferralQrPreview
            value={publicUrl}
            label={t("referrals.dashboard.publicQr")}
            caption={t("referrals.dashboard.publicUrl")}
          />
          <ReferralQrPreview
            value={campaignReferralUrl}
            label={t("referrals.dashboard.starterQr")}
            caption={`${t("referrals.dashboard.code")} ${campaignReferralCode}`}
          />
          <div className="qr-poster-preview">
            <span className="eyebrow">{t("referrals.dashboard.printablePoster")}</span>
            <strong>{activeCampaign.title}</strong>
            <p>{activeCampaign.description}</p>
            <code>{campaignReferralUrl}</code>
            <small>{organization.name || "Voiceup"} · {activeCampaign.category} · {t("referrals.dashboard.scanToSign")}</small>
          </div>
        </div>

        <div className="campaign-link-row referral-route">
          <span>{t("referrals.dashboard.campaignUrl")}</span>
          <code>{campaignReferralUrl}</code>
          <button className="secondary-button" type="button" onClick={() => onCopyText(campaignReferralUrl)}>
            <Copy size={16} /> {t("referrals.dashboard.copyLink")}
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
            <Share2 size={16} /> {t("referrals.dashboard.nativeShare")}
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
            <Download size={16} /> {t("referrals.dashboard.downloadPoster")}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              trackReferralShare();
              window.print();
            }}
          >
            <Printer size={16} /> {t("referrals.dashboard.print")}
          </button>
        </div>

        <div className="referral-dashboard-grid">
          <div className="communication-preview-card">
            <span className="eyebrow">{t("referrals.dashboard.leaderboard")}</span>
            <label className="field">
              <span className="label">{t("referrals.dashboard.searchLabel")}</span>
              <input
                value={referrerSearch}
                onChange={(event) => setReferrerSearch(event.target.value)}
                placeholder={t("referrals.dashboard.searchPlaceholder")}
              />
            </label>
            <div className="referral-leaderboard">
              {filteredReferralLeaders.length > 0 ? (
                filteredReferralLeaders.slice(0, 6).map((leader) => (
                  <div key={leader.code}>
                    <strong>{leader.label}</strong>
                    <span>{leader.referredSignatures.toLocaleString()} {t("referrals.dashboard.referredSignatures")} · {leader.points} {t("growth.common.points")}</span>
                    <small>{leader.code} · {leader.location}</small>
                  </div>
                ))
              ) : (
                <p className="info-message">{t("referrals.dashboard.emptyLeaderboard")}</p>
              )}
            </div>
          </div>
          <div className="communication-preview-card">
            <span className="eyebrow">{t("referrals.dashboard.intelligence")}</span>
            <strong>{referralLeaders[0]?.label ?? t("referrals.dashboard.noTopReferrer")}</strong>
            <p>{t("referrals.dashboard.intelligenceHelp")}</p>
            <div className="delivery-status-row">
              <span>{t("referrals.badges.starter")}</span>
              <span>{t("referrals.badges.promoter")}</span>
              <span>{t("referrals.badges.topReferrer")}</span>
              <span>{t("referrals.badges.districtChampion")}</span>
              <span>{t("referrals.badges.ambassador")}</span>
            </div>
            <p className="info-message">
              {t("referrals.dashboard.privacyHelp")}
            </p>
          </div>
        </div>
        {copiedMessage && <p className="success-message">{copiedMessage}</p>}
      </Panel>

      <Panel title={t("crm.engagement.socialPublishing")} icon={<MessageCircle />}>
        <div className="engagement-grid">
          <div className="engagement-card">
            <Share2 size={24} />
            <h3>{t("crm.engagement.publishSocial")}</h3>
            <p>{t("crm.engagement.publishSocialHelp")}</p>
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
                {t("crm.engagement.whatsappShare")}
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
            <h3>{t("crm.engagement.participantReport")}</h3>
            <p>{t("crm.engagement.participantReportHelp")}</p>
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
                {t("crm.engagement.copyUpdate")}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setBroadcastMessage(reportMessage)}
              >
                {t("crm.engagement.refreshReport")}
              </button>
            </div>
            {copiedMessage && <p className="success-message">{copiedMessage}</p>}
          </div>
        </div>
      </Panel>

      <Panel title={t("crm.engagement.sendParticipants")} icon={<Users />}>
        {campaignSigners.length === 0 ? (
          <p>{t("crm.engagement.noParticipants")}</p>
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
          {t("crm.engagement.bulkDeliveryHelp")}
        </p>
      </Panel>
    </section>
  );
}
