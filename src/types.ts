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

export type AuthorityTargetLevel = "district" | "state" | "country";
export type AuthoritySelectionMode = "admin_enforced" | "public_choice";
export type LocationGovernanceLevel = "none" | "state" | "district" | "block" | "panchayat";

export type UserRole = "platform_owner" | "organization_admin" | "campaign_admin" | "reviewer" | "viewer";

export type AuditAction =
  | "campaign.created"
  | "campaign.saved"
  | "campaign.published"
  | "campaign.signed"
  | "location.added"
  | "location.deleted"
  | "scan.approved"
  | "signer.status_updated"
  | "integration.updated"
  | "auth.login";

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
  appealContent: string;
  authorityTargetLevel: AuthorityTargetLevel;
  authoritySelectionMode: AuthoritySelectionMode;
  selectedAuthorityId: string;
  donationEnabled: boolean;
  donationLockedBySaas: boolean;
  donationCaption: string;
  donationUpiId: string;
  donationQrImage: string;
  donationPaymentDetails: string;
  donationAllowOneTime: boolean;
  donationAllowRecurring: boolean;
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
  requiredFieldsLockedBySaas: boolean;
  authorityLockedBySaas: boolean;
  publishingLockedBySaas: boolean;
  goalLockedBySaas: boolean;
  datesLockedBySaas: boolean;
  maxSignersAllowed: number;
  maxScansAllowed: number;
  shareUrl: string;
  adminUrl: string;
  adminEmail: string;
  adminPasscode: string;
  qrLabel: string;
  heroImage: string;
  heroImagePosition: string;
  heroImageZoom: number;
  campaignVideoUrl: string;
  socialShareText: string;
  thankYouMessage: string;
  participantUpdateMessage: string;
  signerLocationRestrictionLevel?: LocationGovernanceLevel;
}

export interface Signer {
  id: string;
  campaignId: string;
  name: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  telegramHandle: string;
  otpVerified: boolean;
  selectedAuthorityId: string;
  selectedAuthorityName: string;
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
  scanFileUrl?: string;
}

export interface AuthorityRule {
  id: string;
  name: string;
  department: string;
  position: string;
  level: AuthorityTargetLevel | "any";
  state: string;
  district: string;
  block?: string;
  panchayat?: string;
  address: string;
  phone: string;
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
  monthlyMessageLimit: number;
  bonusSignatureCredits: number;
  bonusScanCredits: number;
  bonusMessageCredits: number;
  customBranding: boolean;
  customDomain: string;
  ownerEmail: string;
  billingEmail: string;
  seats: number;
  paymentReference: string;
  locationGovernance?: {
    state?: string;
    district?: string;
    block?: string;
    panchayat?: string;
    lockLevel?: LocationGovernanceLevel;
  };
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actor: string;
  campaignId?: string;
  description: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface IntegrationSettings {
  razorpayKeyId: string;
  razorpayPlanReference: string;
  whatsappProvider: "Not configured" | "Gupshup" | "MSG91" | "Interakt" | "AiSensy" | "Twilio" | "Airtel IQ";
  whatsappSenderId: string;
  smsProvider: "Not configured" | "MSG91" | "Gupshup" | "Twilio" | "Airtel IQ";
  smsSenderId: string;
  emailProvider: "Not configured" | "Resend" | "SendGrid" | "Amazon SES";
  emailSender: string;
  storageProvider: "Supabase Storage" | "AWS S3" | "Not configured";
  storageBucket: string;
  analyticsProvider: "Not configured" | "Vercel Analytics" | "PostHog" | "Plausible";
  analyticsKey: string;
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

export type CommercialPackageType = "signatures" | "scans" | "messages" | "bundle";

export interface CommercialPackage {
  id: string;
  name: string;
  type: CommercialPackageType;
  priceInr: number;
  signatureCredits: number;
  scanCredits: number;
  messageCredits: number;
  description: string;
  active: boolean;
}

export interface ScanReviewItem {
  id: string;
  campaignId: string;
  fileName: string;
  fileUrl?: string;
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
