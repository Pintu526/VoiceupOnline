import type {
  Campaign,
  CampaignCategory,
  Organization,
  SignerRequiredField
} from "../types";
import type { CoordinatorRole } from "../coordinators/types";
import {
  getCampaignAdminUrl,
  getPublicCampaignUrl
} from "../utils/links.ts";

export interface ProductionCampaignBlueprint {
  id: string;
  branding: {
    brandName: string;
    logoUrl: string;
    heroBannerUrl: string;
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      surface: string;
    };
    slogan: string;
  };
  campaign: {
    title: string;
    slug: string;
    category: CampaignCategory;
    description: string;
    appealContent: string;
    startDate: string;
    endDate: string;
    supporterGoal: number;
    status: Campaign["status"];
    consentText: string;
    socialShareText: string;
    thankYouMessage: string;
    participantUpdateMessage: string;
    qrLabel: string;
  };
  joinFlow: {
    requiredFields: SignerRequiredField[];
    optionalFields: Array<SignerRequiredField | "photo" | "village">;
    otpMode: "production";
    photoTiming: "post_sign_private";
    duplicatePolicy: "one_supporter_per_campaign_phone";
  };
  geography: {
    country: string;
    scope: "national";
    levels: string[];
    villageField: "ward_or_address";
  };
  hierarchy: Array<{
    label: string;
    role: CoordinatorRole;
  }>;
  capabilities: {
    publicLandingPage: true;
    referralLinks: true;
    qrGeneration: true;
    whatsappSharing: true;
    personalProfiles: true;
    coordinatorWorkflow: true;
    reports: Array<"team" | "supporters" | "growth" | "pdf" | "csv">;
  };
  hiddenModules: string[];
}

export function instantiateProductionCampaign(
  blueprint: ProductionCampaignBlueprint,
  organization: Organization,
  overrides: Partial<Campaign> = {}
): Campaign {
  const { branding, campaign, joinFlow, geography } = blueprint;

  return {
    id: `cmp-${blueprint.id}`,
    title: campaign.title,
    slug: campaign.slug,
    category: campaign.category,
    description: campaign.description,
    appealContent: campaign.appealContent,
    authorityTargetLevel: "country",
    authoritySelectionMode: "admin_enforced",
    selectedAuthorityId: "",
    geographyMode: "global",
    campaignScope: geography.scope,
    country: geography.country,
    donationEnabled: false,
    donationLockedBySaas: false,
    donationCaption: "",
    donationUpiId: "",
    donationQrImage: "",
    donationPaymentDetails: "",
    donationAllowOneTime: false,
    donationAllowRecurring: false,
    state: "",
    district: "",
    block: "",
    panchayat: "",
    location: geography.country,
    postalCode: "",
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    goal: campaign.supporterGoal,
    status: campaign.status,
    consentText: campaign.consentText,
    requiredFields: joinFlow.requiredFields,
    requiredFieldsLockedBySaas: false,
    authorityLockedBySaas: false,
    publishingLockedBySaas: false,
    goalLockedBySaas: false,
    datesLockedBySaas: false,
    maxSignersAllowed: 0,
    maxScansAllowed: 0,
    shareUrl: getPublicCampaignUrl(campaign.slug),
    adminUrl: getCampaignAdminUrl(campaign.slug),
    adminEmail: organization.ownerEmail,
    adminPasscode: "",
    adminProvisioningStatus: "unprovisioned",
    qrLabel: campaign.qrLabel,
    heroImage: branding.heroBannerUrl,
    heroImagePosition: "center center",
    heroImageZoom: 100,
    campaignVideoUrl: "",
    socialShareText: campaign.socialShareText,
    thankYouMessage: campaign.thankYouMessage,
    participantUpdateMessage: campaign.participantUpdateMessage,
    signerLocationRestrictionLevel: "none",
    ...overrides
  };
}
