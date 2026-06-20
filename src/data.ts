import type { AuthorityRule, Campaign, Organization, Signer, SubscriptionPlan, SuggestedFeature } from "./types";

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

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    name: "Starter",
    price: "$29/month",
    monthlySignatureLimit: 1000,
    monthlyScanLimit: 100,
    campaignLimit: 1,
    features: ["1 active campaign", "Online signing page", "CSV export", "Basic campaign dashboard"]
  },
  {
    name: "Professional",
    price: "$99/month",
    monthlySignatureLimit: 25000,
    monthlyScanLimit: 2000,
    campaignLimit: "Unlimited",
    features: ["Unlimited campaigns", "OCR scan review", "PDF reports", "Authority routing", "Custom branding"],
    recommended: true
  },
  {
    name: "Enterprise",
    price: "Custom",
    monthlySignatureLimit: 100000,
    monthlyScanLimit: 10000,
    campaignLimit: "Unlimited",
    features: ["White-label SaaS portal", "Custom domain", "Audit logs", "API access", "Priority support"]
  }
];

export const suggestedFeatures: SuggestedFeature[] = [
  {
    title: "Volunteer/canvasser mobile mode",
    benefit: "Collect signatures offline during field visits and sync them when internet is available.",
    tier: "Professional"
  },
  {
    title: "Automated supporter updates",
    benefit: "Send SMS, WhatsApp, or email updates when milestones are reached or submissions are made.",
    tier: "Professional"
  },
  {
    title: "White-label portals",
    benefit: "Let client organizations use their own logo, color theme, and domain.",
    tier: "Enterprise"
  },
  {
    title: "Audit log and legal evidence pack",
    benefit: "Export a defensible submission bundle with consent, timestamps, scans, and reviewer actions.",
    tier: "Enterprise"
  }
];
