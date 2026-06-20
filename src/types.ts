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

export interface Campaign {
  id: string;
  title: string;
  slug: string;
  category: CampaignCategory;
  description: string;
  location: string;
  postalCode: string;
  startDate: string;
  endDate: string;
  goal: number;
  status: "Draft" | "Published" | "Paused" | "Closed";
  consentText: string;
  requiredFields: Array<keyof Pick<Signer, "name" | "email" | "phone" | "address" | "postalCode">>;
  shareUrl: string;
  qrLabel: string;
}

export interface Signer {
  id: string;
  campaignId: string;
  name: string;
  email: string;
  phone: string;
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
  name: string;
  plan: BillingPlan;
  trialEndsAt: string;
  monthlySignatureLimit: number;
  monthlyScanLimit: number;
  customBranding: boolean;
  customDomain: string;
  ownerEmail: string;
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
