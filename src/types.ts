export type SignatureSource = "online" | "scan" | "field";

export type VerificationStatus = "verified" | "pending" | "duplicate" | "rejected";

export type CampaignCategory =
  | "Civic"
  | "Environment"
  | "Education"
  | "Health"
  | "Transport"
  | "Housing"
  | "Other";

export type BillingPlan = "Starter" | "Professional" | "Enterprise";

export type SubscriptionStatus = "Trial" | "Active" | "Past due" | "Cancelled";

export type SignerRequiredField = keyof Pick<
  Signer,
  "name" | "email" | "phone" | "address" | "postalCode" | "state" | "district" | "block" | "panchayat"
>;

export interface Campaign {
  id: string;
  title: string;
  slug: string;
  category: CampaignCategory;
  description: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  location: string;
  postalCode: string;
  startDate: string;
  endDate: string;
  goal: number;
  status: "Draft" | "Published" | "Paused" | "Closed";
  consentText: string;
  requiredFields: SignerRequiredField[];
  shareUrl: string;
  qrLabel: string;
}

export interface Signer {
  id: string;
  campaignId: string;
  name: string;
  email: string;
  phone: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  address: string;
  postalCode: string;
  comment: string;
  source: SignatureSource;
  status: VerificationStatus;
  signedAt: string;
  reviewerNote?: string;
  scanFileName?: string;
}

export interface AuthorityRule {
  id: string;
  name: string;
  department: string;
  category: CampaignCategory | "Any";
  locationKeyword: string;
  postalPrefix: string;
  email: string;
  submissionMethod: "Email" | "Portal" | "Physical office";
  confidence: number;
}

export interface Organization {
  id: string;
  name: string;
  plan: BillingPlan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string;
  monthlySignatureLimit: number;
  monthlyScanLimit: number;
  customBranding: boolean;
  customDomain: string;
  ownerEmail: string;
  billingEmail: string;
  seats: number;
  paymentReference: string;
}

export interface SubscriptionPlan {
  name: BillingPlan;
  price: string;
  monthlySignatureLimit: number;
  monthlyScanLimit: number;
  campaignLimit: number | "Unlimited";
  features: string[];
  recommended?: boolean;
}

export interface ScanReviewItem {
  id: string;
  campaignId: string;
  fileName: string;
  extractedText: string;
  parsedSigner: Omit<Signer, "id" | "campaignId" | "source" | "status" | "signedAt">;
  status: "Needs review" | "Approved" | "Rejected";
  createdAt: string;
}

export interface SuggestedFeature {
  title: string;
  benefit: string;
  tier: BillingPlan;
}
