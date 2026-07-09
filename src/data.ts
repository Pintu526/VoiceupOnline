import type {
  AuthorityRule,
  Campaign,
  CommercialPackage,
  IntegrationSettings,
  Organization,
  Signer,
  SubscriptionPlan,
  SuggestedFeature
} from "./types";

export const initialCampaigns: Campaign[] = [];

export const initialSigners: Signer[] = [];

export const initialAuthorities: AuthorityRule[] = [];

export const initialOrganization: Organization = {
  id: "org-current",
  name: "",
  plan: "Free Trial",
  subscriptionStatus: "Trial",
  trialEndsAt: "",
  monthlySignatureLimit: 100,
  monthlyScanLimit: 10,
  monthlyMessageLimit: 0,
  bonusSignatureCredits: 0,
  bonusScanCredits: 0,
  bonusMessageCredits: 0,
  customBranding: false,
  customDomain: "",
  ownerEmail: "",
  billingEmail: "",
  seats: 2,
  paymentReference: "",
  billingCadence: "monthly",
  campaignDurationDays: 30,
  supporterCountEstimate: 1000,
  enabledFeatureKeys: [],
  prepaidWalletEnabled: false,
  prepaidWalletMode: "online_payment",
  signaturePriceInr: 1,
  signatureWalletBalanceInr: 0,
  signaturePinPrefix: "VUP"
};

export const initialCommercialPackages: CommercialPackage[] = [
  {
    id: "pkg-signatures-1000",
    name: "1,000 extra signatures",
    type: "signatures",
    priceInr: 499,
    signatureCredits: 1000,
    scanCredits: 0,
    messageCredits: 0,
    description: "Recharge pack for campaigns nearing signer limit.",
    active: true
  },
  {
    id: "pkg-scans-250",
    name: "250 extra scans",
    type: "scans",
    priceInr: 399,
    signatureCredits: 0,
    scanCredits: 250,
    messageCredits: 0,
    description: "Extra hard-copy scan processing allowance.",
    active: true
  },
  {
    id: "pkg-messages-1000",
    name: "1,000 message credits",
    type: "messages",
    priceInr: 799,
    signatureCredits: 0,
    scanCredits: 0,
    messageCredits: 1000,
    description: "Credits for WhatsApp/SMS/email provider usage tracking.",
    active: true
  },
  {
    id: "pkg-growth-bundle",
    name: "Campaign growth bundle",
    type: "bundle",
    priceInr: 1499,
    signatureCredits: 3000,
    scanCredits: 500,
    messageCredits: 2000,
    description: "Combined recharge for growing campaigns.",
    active: true
  }
];

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
    name: "Free Trial",
    price: "Free for 1 day",
    description: "Try one campaign with limited supporters and Voiceup branding.",
    monthlyPriceInr: 0,
    quarterlyPriceInr: 0,
    yearlyPriceInr: 0,
    campaignDurationPriceInr: 0,
    supporterPriceInr: 0,
    pricePerSignatureInr: 0,
    monthlySignatureLimit: 100,
    monthlyScanLimit: 10,
    monthlyMessageLimit: 0,
    campaignLimit: 1,
    supporterLimit: 100,
    features: [
      "1-day free trial",
      "1 campaign",
      "Limited supporters",
      "Voiceup branding",
      "Provider-ready integrations disabled"
    ],
    featureKeys: ["public_signing", "basic_reports"],
    voiceupBranding: true,
    providerReadyIntegrations: false
  },
  {
    name: "Starter",
    price: "INR 999/month",
    description: "Small campaigns with basic templates, public signing, and basic reports.",
    monthlyPriceInr: 999,
    quarterlyPriceInr: 2697,
    yearlyPriceInr: 9990,
    campaignDurationPriceInr: 49,
    supporterPriceInr: 1.2,
    pricePerSignatureInr: 1,
    monthlySignatureLimit: 1000,
    monthlyScanLimit: 100,
    monthlyMessageLimit: 500,
    campaignLimit: 1,
    supporterLimit: 1000,
    features: ["Small campaigns", "Basic templates", "Public signing", "Basic reports"],
    featureKeys: ["basic_templates", "public_signing", "basic_reports", "csv_export"],
    voiceupBranding: true,
    providerReadyIntegrations: false
  },
  {
    name: "Growth",
    price: "INR 4,999/month",
    description: "AI-assisted campaign operations with authority intelligence and communication readiness.",
    monthlyPriceInr: 4999,
    quarterlyPriceInr: 13497,
    yearlyPriceInr: 49990,
    campaignDurationPriceInr: 149,
    supporterPriceInr: 0.65,
    pricePerSignatureInr: 0.75,
    monthlySignatureLimit: 25000,
    monthlyScanLimit: 2000,
    monthlyMessageLimit: 10000,
    campaignLimit: 5,
    supporterLimit: 25000,
    features: [
      "AI Copilot",
      "Templates",
      "Authority intelligence",
      "Field collection",
      "Communication hub provider-ready"
    ],
    featureKeys: [
      "basic_templates",
      "advanced_templates",
      "public_signing",
      "basic_reports",
      "ai_copilot",
      "authority_intelligence",
      "field_collection",
      "communication_hub"
    ],
    voiceupBranding: true,
    providerReadyIntegrations: true,
    recommended: true
  },
  {
    name: "Pro Movement",
    price: "INR 14,999/month",
    description: "Movement-grade operations, imports, command center, reports, and branding.",
    monthlyPriceInr: 14999,
    quarterlyPriceInr: 40497,
    yearlyPriceInr: 149990,
    campaignDurationPriceInr: 349,
    supporterPriceInr: 0.35,
    pricePerSignatureInr: 0.5,
    monthlySignatureLimit: 100000,
    monthlyScanLimit: 10000,
    monthlyMessageLimit: 50000,
    campaignLimit: "Unlimited",
    supporterLimit: 100000,
    features: [
      "Movement CRM",
      "Command Center",
      "Bulk import",
      "Advanced reports",
      "Custom branding"
    ],
    featureKeys: [
      "basic_templates",
      "advanced_templates",
      "public_signing",
      "basic_reports",
      "advanced_reports",
      "ai_copilot",
      "authority_intelligence",
      "field_collection",
      "communication_hub",
      "growth_engine",
      "movement_crm",
      "command_center",
      "bulk_import",
      "custom_branding"
    ],
    voiceupBranding: false,
    providerReadyIntegrations: true
  },
  {
    name: "Enterprise",
    price: "Custom INR quote",
    description: "Custom limits, roles, integrations, priority support, and multi-organization controls.",
    monthlyPriceInr: null,
    quarterlyPriceInr: null,
    yearlyPriceInr: null,
    campaignDurationPriceInr: null,
    supporterPriceInr: null,
    pricePerSignatureInr: null,
    monthlySignatureLimit: 500000,
    monthlyScanLimit: 50000,
    monthlyMessageLimit: 250000,
    campaignLimit: "Unlimited",
    supporterLimit: "Unlimited",
    features: [
      "Multi-organization",
      "Roles",
      "Integrations",
      "Custom limits",
      "Priority support"
    ],
    featureKeys: [
      "basic_templates",
      "advanced_templates",
      "public_signing",
      "basic_reports",
      "advanced_reports",
      "ai_copilot",
      "authority_intelligence",
      "field_collection",
      "communication_hub",
      "growth_engine",
      "movement_crm",
      "command_center",
      "bulk_import",
      "custom_branding",
      "multi_organization",
      "roles",
      "integrations",
      "custom_limits",
      "priority_support"
    ],
    voiceupBranding: false,
    providerReadyIntegrations: true
  }
];

export const suggestedFeatures: SuggestedFeature[] = [
  {
    title: "Field volunteer mobile mode",
    benefit: "Collect signatures offline during mohalla, ward, college, or village visits and sync when internet is available.",
    tier: "Growth"
  },
  {
    title: "WhatsApp and SMS supporter updates",
    benefit: "Send milestone updates to supporters through WhatsApp, SMS, or email channels.",
    tier: "Growth"
  },
  {
    title: "White-label campaign portals",
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
    tier: "Growth"
  },
  {
    title: "Influencer and ambassador tracking",
    benefit: "Track which volunteer, RWA leader, creator, or field team brought each supporter into the campaign.",
    tier: "Enterprise"
  },
  {
    title: "Multilingual campaign pages",
    benefit: "Publish the same campaign in English, Hindi, and other local languages for higher participation.",
    tier: "Growth"
  },
  {
    title: "Automated milestone journeys",
    benefit: "Trigger thank-you, 25%, 50%, final submission, and victory messages through WhatsApp, SMS, and email.",
    tier: "Enterprise"
  }
];
