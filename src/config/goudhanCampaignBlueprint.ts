import type { Organization } from "../types";
import {
  instantiateProductionCampaign,
  type ProductionCampaignBlueprint
} from "./productionCampaignBlueprint.ts";

export const goudhanProductionOrganization: Organization = {
  id: "org-goudhan-production",
  name: "Goudhan.com",
  plan: "Enterprise",
  subscriptionStatus: "Active",
  trialEndsAt: "",
  monthlySignatureLimit: 500000,
  monthlyScanLimit: 0,
  monthlyMessageLimit: 250000,
  bonusSignatureCredits: 0,
  bonusScanCredits: 0,
  bonusMessageCredits: 0,
  customBranding: true,
  customDomain: "gaumata.cloud",
  ownerEmail: "",
  billingEmail: "",
  seats: 25,
  paymentReference: "",
  billingCadence: "enterprise_quote",
  campaignDurationDays: 0,
  supporterCountEstimate: 1000000,
  enabledFeatureKeys: [
    "public_signing",
    "basic_reports",
    "advanced_reports",
    "movement_crm",
    "command_center",
    "communication_hub",
    "roles",
    "custom_branding"
  ],
  prepaidWalletEnabled: false,
  prepaidWalletMode: "online_payment",
  signaturePriceInr: 0,
  signatureWalletBalanceInr: 0,
  signaturePinPrefix: "GSAA"
};

export const goudhanCampaignBlueprint: ProductionCampaignBlueprint = {
  id: "goudhan-gau-samman",
  branding: {
    brandName: "Goudhan.com",
    logoUrl: "/brands/goudhan/logo.svg",
    heroBannerUrl: "/brands/goudhan/gau-samman-hero.svg",
    colors: {
      primary: "#1f5b35",
      secondary: "#8a4b16",
      accent: "#facc15",
      surface: "#fffaf0"
    },
    slogan: "गौ सम्मान। गांवों की शक्ति।"
  },
  campaign: {
    title: "गौ सम्मान आह्वान अभियान",
    slug: "gau-samman-ahvaan-abhiyan",
    category: "Other",
    description:
      "सम्मानजनक गौ-सेवा, विधिसम्मत संरक्षण और सशक्त ग्राम उत्तरदायित्व के लिए एक नागरिक अभियान।",
    appealContent:
      "करुणामयी गौ-सेवा, जिम्मेदार स्थानीय पहल और भारत के गांवों से जुड़ी आजीविका के लिए अपना सत्यापित समर्थन दें। हर सत्यापित आवाज़ एक पारदर्शी जन-आह्वान को मजबूत करती है।",
    startDate: "2026-07-27",
    endDate: "2027-12-31",
    supporterGoal: 1000000,
    status: "Published",
    consentText:
      "मैं इस अभियान में अपना सत्यापित समर्थन जोड़ने और केवल अभियान से संबंधित उद्देश्यों के लिए अपने विवरण के सुरक्षित उपयोग की सहमति देता/देती हूं।",
    socialShareText:
      "मैंने गौ सम्मान आह्वान अभियान का समर्थन किया है। अपना सत्यापित समर्थन दें और इसे दूसरों के साथ साझा करें।",
    thankYouMessage:
      "गौ सम्मान आह्वान अभियान में अपना सत्यापित समर्थन जोड़ने के लिए धन्यवाद।",
    participantUpdateMessage:
      "{{campaign}} में अब तक {{verified}} सत्यापित समर्थक जुड़े हैं। अभियान साझा करें: {{url}}",
    qrLabel: "गौ सम्मान आह्वान अभियान का समर्थन करने के लिए स्कैन करें"
  },
  joinFlow: {
    requiredFields: ["phone", "name", "state", "district", "block", "panchayat"],
    optionalFields: ["photo", "village", "address", "postalCode"],
    otpMode: "production",
    photoTiming: "post_sign_private",
    duplicatePolicy: "one_supporter_per_campaign_phone"
  },
  geography: {
    country: "India",
    scope: "national",
    levels: ["country", "state", "district", "block", "panchayat", "ward_or_village"],
    villageField: "ward_or_address"
  },
  hierarchy: [
    { label: "National", role: "national_coordinator" },
    { label: "State", role: "state_coordinator" },
    { label: "District", role: "district_coordinator" },
    { label: "Block", role: "block_coordinator" },
    { label: "Panchayat", role: "panchayat_coordinator" },
    { label: "Village", role: "ward_coordinator" },
    { label: "Volunteer", role: "field_coordinator" }
  ],
  capabilities: {
    publicLandingPage: true,
    referralLinks: true,
    qrGeneration: true,
    whatsappSharing: true,
    personalProfiles: true,
    coordinatorWorkflow: true,
    reports: ["team", "supporters", "growth", "pdf", "csv"]
  },
  hiddenModules: [
    "document_intelligence",
    "ocr",
    "field_collection",
    "growth_experiments",
    "ai_experiments",
    "developer_pages",
    "demo_pages"
  ]
};

export const goudhanGauSammanCampaign = instantiateProductionCampaign(
  goudhanCampaignBlueprint,
  goudhanProductionOrganization
);
