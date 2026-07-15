import type { GrowthWallet } from "../wallet/types";
import type { RecognitionTreeModel, SupporterGrowthPortalModel, SupporterPortalShareAction } from "./types";
import { getPublicCampaignUrlForOrigin } from "../../utils/links";

function encode(value: string) {
  return encodeURIComponent(value);
}

function buildShareActions(referralLink: string): SupporterPortalShareAction[] {
  const encodedLink = encode(referralLink);
  return [
    { id: "native", label: "Share", channel: "native", url: referralLink },
    { id: "whatsapp", label: "WhatsApp", channel: "whatsapp", url: `https://wa.me/?text=${encodedLink}` },
    { id: "sms", label: "SMS", channel: "sms", url: `sms:?&body=${encodedLink}` },
    { id: "facebook", label: "Facebook", channel: "facebook", url: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}` },
    { id: "x", label: "X", channel: "x", url: `https://twitter.com/intent/tweet?url=${encodedLink}` },
    { id: "linkedin", label: "LinkedIn", channel: "linkedin", url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedLink}` },
    { id: "telegram", label: "Telegram", channel: "telegram", url: `https://t.me/share/url?url=${encodedLink}` },
    { id: "email", label: "Email", channel: "email", url: `mailto:?body=${encodedLink}` },
    { id: "copy", label: "Copy Link", channel: "copy", url: referralLink },
    { id: "poster", label: "Poster", channel: "poster" }
  ];
}

export function buildSupporterGrowthPortal(
  supporterCode: string,
  baseUrl: string,
  campaignSlug: string,
  tree: RecognitionTreeModel,
  wallet: GrowthWallet
): SupporterGrowthPortalModel {
  const publicPath = `/r/${supporterCode}`;
  const publicCampaignUrl = getPublicCampaignUrlForOrigin(campaignSlug, { runtimeOrigin: baseUrl });
  const referralLink = publicCampaignUrl ? `${publicCampaignUrl}?ref=${encodeURIComponent(supporterCode)}` : "";

  return {
    routePattern: "/r/:supporterCode",
    supporterCode,
    publicPath,
    campaignId: tree.campaignId,
    supporterId: tree.supporterId,
    referralLink,
    qrPayload: referralLink,
    tree,
    wallet,
    shareActions: buildShareActions(referralLink),
    accessibleWithoutAdminLogin: true
  };
}
