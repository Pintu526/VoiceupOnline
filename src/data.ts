import type { AuthorityRule, Campaign, IntegrationSettings, Organization, Signer, SubscriptionPlan, SuggestedFeature } from "./types";

export const initialCampaigns: Campaign[] = [];

export const initialSigners: Signer[] = [];

export const initialAuthorities: AuthorityRule[] = [];

export const initialOrganization: Organization = {
  id: "org-current",
  name: "",
  plan: "Starter",
  subscriptionStatus: "Trial",
  trialEndsAt: "",
  monthlySignatureLimit: 1000,
  monthlyScanLimit: 100,
  customBranding: false,
  customDomain: "",
  ownerEmail: "",
  billingEmail: "",
  seats: 2,
  paymentReference: ""
};

export const initialIntegrationSettings: IntegrationSettings = {
  razorpayKeyId: "",
  razorpayPlanReference: "",
  whatsappProvider: "Not configured",
  whatsappSenderId: "",
  smsProvider: "Not configured",
  smsSenderId: "",
  emailProvider: "Not configured",
  emailSender: "",
  storageProvider: "Supabase Storage",
  storageBucket: "voiceup-campaign-media",
  analyticsProvider: "Vercel Analytics",
  analyticsKey: ""
};

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    name: "Starter",
    price: "₹999/month",
    monthlySignatureLimit: 1000,
    monthlyScanLimit: 100,
    campaignLimit: 1,
    features: ["1 active campaign", "Online signing page", "CSV export", "Basic ward/district dashboard"]
  },
  {
    name: "Professional",
    price: "₹4,999/month",
    monthlySignatureLimit: 25000,
    monthlyScanLimit: 2000,
    campaignLimit: "Unlimited",
    features: [
      "Unlimited campaigns",
      "OCR scan review",
      "PDF reports",
      "Authority routing by PIN code",
      "Custom branding"
    ],
    recommended: true
  },
  {
    name: "Enterprise",
    price: "Custom INR quote",
    monthlySignatureLimit: 100000,
    monthlyScanLimit: 10000,
    campaignLimit: "Unlimited",
    features: ["White-label SaaS portal", "Custom domain", "Audit logs", "API access", "Priority support in India"]
  }
];

export const suggestedFeatures: SuggestedFeature[] = [
  {
    title: "Field volunteer mobile mode",
    benefit: "Collect signatures offline during mohalla, ward, college, or village visits and sync when internet is available.",
    tier: "Professional"
  },
  {
    title: "WhatsApp and SMS supporter updates",
    benefit: "Send milestone updates to supporters through India-friendly WhatsApp, SMS, or email channels.",
    tier: "Professional"
  },
  {
    title: "White-label Indian campaign portals",
    benefit: "Let NGOs, associations, unions, RWAs, and campaign agencies use their own logo, theme, and domain.",
    tier: "Enterprise"
  },
  {
    title: "Audit log and legal evidence pack",
    benefit: "Export a submission bundle with consent, timestamps, scans, reviewer actions, and authority details.",
    tier: "Enterprise"
  },
  {
    title: "AI campaign assistant",
    benefit: "Generate campaign copy, supporter updates, authority submission letters, and regional-language social posts.",
    tier: "Professional"
  },
  {
    title: "Influencer and ambassador tracking",
    benefit: "Track which volunteer, RWA leader, creator, or field team brought each supporter into the campaign.",
    tier: "Enterprise"
  },
  {
    title: "Multilingual campaign pages",
    benefit: "Publish the same campaign in English, Hindi, and local Indian languages for higher participation.",
    tier: "Professional"
  },
  {
    title: "Automated milestone journeys",
    benefit: "Trigger thank-you, 25%, 50%, final submission, and victory messages through WhatsApp, SMS, and email.",
    tier: "Enterprise"
  }
];
