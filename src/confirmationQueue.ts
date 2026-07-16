import type {
  Campaign,
  ConfirmationChannel,
  ConfirmationQueueItem,
  ScanReviewItem,
  Signer
} from "./types";

export const confirmationUrlFormat =
  "https://voiceup.live/c/{campaignSlug}?confirm=<opaque-one-time-token>";

export interface SecureConfirmationLinkDesign {
  campaignId: string;
  supporterId: string;
  tokenType: "opaque";
  expiresInSeconds: number;
  oneTime: true;
  confirmsOnOpen: false;
  requiresExplicitSupportConfirmation: true;
  reviewsMaskedDetails: true;
  backendIssuanceRequired: true;
}

export function createSecureConfirmationLinkDesign(
  campaignId: string,
  supporterId: string
): SecureConfirmationLinkDesign {
  return {
    campaignId,
    supporterId,
    tokenType: "opaque",
    expiresInSeconds: 24 * 60 * 60,
    oneTime: true,
    confirmsOnOpen: false,
    requiresExplicitSupportConfirmation: true,
    reviewsMaskedDetails: true,
    backendIssuanceRequired: true
  };
}

export const confirmationTemplatePreviews = {
  en: "VoiceUp: Your paper support for {campaignName} has been recorded. Confirm your details and communication preferences: {confirmationUrl}",
  hi: "VoiceUp: {campaignName} के लिए आपका कागज़ी समर्थन दर्ज हो गया है। अपने विवरण और संचार प्राथमिकताओं की पुष्टि करें: {confirmationUrl}",
  or: "VoiceUp: {campaignName} ପାଇଁ ଆପଣଙ୍କ କାଗଜ ସମର୍ଥନ ରେକର୍ଡ ହୋଇଛି। ଆପଣଙ୍କ ବିବରଣୀ ଏବଂ ଯୋଗାଯୋଗ ପସନ୍ଦ ନିଶ୍ଚିତ କରନ୍ତୁ: {confirmationUrl}"
} as const;

export interface ConfirmationProviderMessage {
  campaignName: string;
  confirmationUrl: string;
  destination: string;
  templateKey: "paper_support_confirmation";
}

export interface ConfirmationProviderResult {
  providerMessageId: string;
}

export interface ConfirmationProviderAdapter {
  channel: ConfirmationChannel;
  enabled: boolean;
  send: (message: ConfirmationProviderMessage) => Promise<ConfirmationProviderResult>;
}

function disabledAdapter(channel: ConfirmationChannel): ConfirmationProviderAdapter {
  return {
    channel,
    enabled: false,
    async send() {
      throw new Error(`${channel} confirmation provider is disabled.`);
    }
  };
}

export const smsConfirmationAdapter = disabledAdapter("sms");
export const whatsappConfirmationAdapter = disabledAdapter("whatsapp");

export function hasValidConfirmationPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function maskConfirmationDestination(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `${"•".repeat(Math.min(8, digits.length - 4))}${digits.slice(-4)}`;
}

interface QueueConfirmationInput {
  workspaceId: string;
  campaign: Campaign;
  signer: Signer;
  currentQueue: ConfirmationQueueItem[];
  createId: (prefix: string) => string;
  now?: string;
}

export function createConfirmationQueueItems({
  workspaceId,
  campaign,
  signer,
  currentQueue,
  createId,
  now = new Date().toISOString()
}: QueueConfirmationInput): ConfirmationQueueItem[] {
  if (!hasValidConfirmationPhone(signer.phone) || signer.noOngoingCommunications) return [];

  const consentedChannels: ConfirmationChannel[] = [];
  if (signer.smsConsent) consentedChannels.push("sms");
  if (signer.whatsappConsent) consentedChannels.push("whatsapp");

  return consentedChannels
    .filter(
      (channel) =>
        !currentQueue.some(
          (item) =>
            item.workspaceId === workspaceId &&
            item.campaignId === campaign.id &&
            item.supporterId === signer.id &&
            item.channel === channel &&
            item.templateKey === "paper_support_confirmation"
        )
    )
    .map((channel) => ({
      id: createId("confirm"),
      workspaceId,
      campaignId: campaign.id,
      supporterId: signer.id,
      channel,
      templateKey: "paper_support_confirmation" as const,
      destinationMasked: maskConfirmationDestination(signer.phone),
      status: "queued" as const,
      attemptCount: 0,
      createdAt: now
    }));
}

export function scanHasApplicableConfirmationConsent(scan: ScanReviewItem) {
  return Boolean(
    !scan.noOngoingCommunications &&
      hasValidConfirmationPhone(scan.parsedSigner.phone) &&
      (scan.smsConsent || scan.whatsappConsent)
  );
}

export function getPaperSupporterConfirmationStatus(scan: ScanReviewItem, isDuplicate: boolean) {
  if (isDuplicate) return "suppressed" as const;
  return scanHasApplicableConfirmationConsent(scan)
    ? "pending_confirmation" as const
    : "not_requested" as const;
}
