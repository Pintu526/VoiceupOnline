import type { CampaignGrowthConfiguration } from "./growth/configuration";

export type SignatureSource = "online" | "scan" | "field";

export type VerificationStatus = "verified" | "pending" | "duplicate" | "rejected";

export type SupporterConfirmationStatus =
  | "pending_confirmation"
  | "not_requested"
  | "confirmed"
  | "expired"
  | "suppressed";

export type ConfirmationChannel = "sms" | "whatsapp";

export type ConfirmationQueueStatus =
  | "queued"
  | "blocked_no_consent"
  | "blocked_invalid_mobile"
  | "ready"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "suppressed";

export type CampaignCategory =
  | "Civic"
  | "Environment"
  | "Education"
  | "Health"
  | "Transport"
  | "Housing"
  | "Other";

export type BillingPlan =
  | "Free Trial"
  | "Starter"
  | "Growth"
  | "Pro Movement"
  | "Enterprise"
  | "Professional";

export type SubscriptionStatus = "Trial" | "Active" | "Past due" | "Cancelled" | "Suspended";
export type BillingCadence =
  | "monthly"
  | "quarterly"
  | "yearly"
  | "campaign_duration"
  | "supporter_count"
  | "feature_based"
  | "enterprise_quote";
export type PrepaidWalletMode = "online_payment" | "cash" | "donation" | "manual";

// ─── Plan/subscription entitlement engine ──────────────────────────────────
// These types back the centralized entitlement engine in `src/entitlements/`.
// Never add plan-name comparisons elsewhere in the app; extend these types
// and `src/entitlements/featureKeys.ts` instead.
export type EntitlementAddOnKind =
  | "storage_mb"
  | "operator_seats"
  | "sms_credits"
  | "whatsapp_credits"
  | "ocr_pages"
  | "ai_credits"
  | "feature";

export interface PurchasedEntitlementAddOn {
  id: string;
  kind: EntitlementAddOnKind;
  featureKey?: string;
  quantity: number;
  priceInr: number;
  purchasedAt: string;
  expiresAt?: string;
}

export type EntitlementLifecycleAction =
  | "plan_upgraded"
  | "plan_downgrade_scheduled"
  | "plan_downgrade_applied"
  | "subscription_renewed"
  | "subscription_extended"
  | "subscription_suspended"
  | "subscription_reactivated"
  | "subscription_cancelled"
  | "billing_cycle_changed"
  | "add_on_purchased"
  | "entitlements_backfilled";

export interface EntitlementAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: EntitlementLifecycleAction;
  fromPlan?: BillingPlan;
  toPlan?: BillingPlan;
  fromStatus?: SubscriptionStatus;
  toStatus?: SubscriptionStatus;
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ScheduledPlanChange {
  toPlan: BillingPlan;
  effectiveAt: string;
  requestedAt: string;
}

export type AuthorityTargetLevel = "district" | "state" | "country";
export type AuthoritySelectionMode = "admin_enforced" | "public_choice";
export type LocationGovernanceLevel = "none" | "state" | "district" | "block" | "panchayat";
export type CampaignGeographyMode = "india_detailed" | "global";
export type CampaignScope = "local" | "city" | "state_province" | "national" | "global";

export type UserRole = "platform_owner" | "organization_admin" | "campaign_admin" | "reviewer" | "viewer";

export type AuditAction =
  | "campaign.created"
  | "campaign.saved"
  | "campaign.cloned"
  | "campaign.archived"
  | "campaign.published"
  | "campaign.signed"
  | "campaign.admin_provisioned"
  | "location.added"
  | "location.deleted"
  | "scan.approved"
  | "scan.approval_requested"
  | "scan.approval_retried"
  | "scan.approval_conflict"
  | "scan.duplicate_blocked"
  | "scan.validation_failed"
  | "scan.consent_missing"
  | "scan.batch_started"
  | "scan.batch_completed"
  | "scan.batch_partial_failure"
  | "signer.status_updated"
  | "integration.updated"
  | "auth.login";

export type SignerRequiredField = keyof Pick<
  Signer,
  | "name"
  | "email"
  | "phone"
  | "address"
  | "postalCode"
  | "country"
  | "state"
  | "district"
  | "block"
  | "panchayat"
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
  geographyMode?: CampaignGeographyMode;
  campaignScope?: CampaignScope;
  country?: string;
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
  /**
   * Backward-compatible, optional provisioning status for the real Supabase
   * Auth-backed Campaign Admin assignment. Undefined (legacy campaigns saved
   * before this field existed) is treated the same as "unprovisioned" by the
   * UI. Never itself a credential -- purely a display/workflow state.
   */
  adminProvisioningStatus?: "unprovisioned" | "provisioned" | "provisioning_failed";
  qrLabel: string;
  heroImage: string;
  heroImagePosition: string;
  heroImageZoom: number;
  campaignVideoUrl: string;
  socialShareText: string;
  thankYouMessage: string;
  participantUpdateMessage: string;
  signerLocationRestrictionLevel?: LocationGovernanceLevel;
  growthConfiguration?: CampaignGrowthConfiguration;
  archivedAt?: string;
  clonedFromCampaignId?: string;
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
  country?: string;
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
  referralCode?: string;
  referredBy?: string;
  referredByPhoneOrCode?: string;
  referralSource?: "url" | "manual";
  reviewerNote?: string;
  scanFileName?: string;
  scanFileUrl?: string;
  scanFilePath?: string;
  sourceScanItemId?: string;
  sourceBatchId?: string;
  collectorId?: string;
  collectorName?: string;
  capturedAt?: string;
  paperConsentRecorded?: boolean;
  smsConsent?: boolean;
  whatsappConsent?: boolean;
  noOngoingCommunications?: boolean;
  consentPurpose?: string;
  consentCapturedAt?: string;
  consentCapturedBy?: string;
  confirmationStatus?: SupporterConfirmationStatus;
  approvalKey?: string;
  sourceRowFingerprint?: string;
}

export interface ConfirmationQueueItem {
  id: string;
  workspaceId: string;
  campaignId: string;
  supporterId: string;
  channel: ConfirmationChannel;
  templateKey: "paper_support_confirmation";
  destinationMasked: string;
  status: ConfirmationQueueStatus;
  attemptCount: number;
  createdAt: string;
  sentAt?: string;
  failedAt?: string;
  failureReason?: string;
  providerMessageId?: string;
}

export interface ScanCaptureMetadata {
  ocrDiagnosticId?: string;
  sourceBatchId: string;
  collectorId: string;
  collectorName: string;
  capturedAt: string;
  paperConsentRecorded: boolean;
  smsConsent: boolean;
  whatsappConsent: boolean;
  noOngoingCommunications: boolean;
  consentPurpose: string;
  consentCapturedAt?: string;
  consentCapturedBy?: string;
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
  billingCadence?: BillingCadence;
  campaignDurationDays?: number;
  supporterCountEstimate?: number;
  enabledFeatureKeys?: string[];
  prepaidWalletEnabled?: boolean;
  prepaidWalletMode?: PrepaidWalletMode;
  signaturePriceInr?: number;
  signatureWalletBalanceInr?: number;
  signaturePinPrefix?: string;
  lastSignaturePin?: string;
  locationGovernance?: {
    state?: string;
    district?: string;
    block?: string;
    panchayat?: string;
    lockLevel?: LocationGovernanceLevel;
  };
  // Entitlement engine bookkeeping. All optional/backfillable so campaigns and
  // organizations created before this architecture keep working unchanged --
  // see `src/entitlements/migration.ts`.
  subscriptionId?: string;
  renewsAt?: string;
  billingCycleAnchor?: string;
  suspendedAt?: string;
  suspendedReason?: string;
  cancelledAt?: string;
  cancelAtPeriodEnd?: boolean;
  scheduledPlanChange?: ScheduledPlanChange | null;
  addOns?: PurchasedEntitlementAddOn[];
  entitlementAuditLog?: EntitlementAuditEntry[];
  bonusStorageMb?: number;
  bonusOperatorSeats?: number;
  bonusSmsCredits?: number;
  bonusWhatsappCredits?: number;
  bonusOcrPages?: number;
  bonusAiCredits?: number;
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
  description?: string;
  monthlyPriceInr: number | null;
  quarterlyPriceInr?: number | null;
  yearlyPriceInr?: number | null;
  campaignDurationPriceInr?: number | null;
  supporterPriceInr?: number | null;
  pricePerSignatureInr?: number | null;
  monthlySignatureLimit: number;
  monthlyScanLimit: number;
  monthlyMessageLimit: number;
  campaignLimit: number | "Unlimited";
  supporterLimit: number | "Unlimited";
  features: string[];
  featureKeys: string[];
  voiceupBranding: boolean;
  providerReadyIntegrations: boolean;
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
  filePath?: string;
  sourceBatchId?: string;
  collectorId?: string;
  collectorName?: string;
  capturedAt?: string;
  paperConsentRecorded?: boolean;
  smsConsent?: boolean;
  whatsappConsent?: boolean;
  noOngoingCommunications?: boolean;
  consentPurpose?: string;
  consentCapturedAt?: string;
  consentCapturedBy?: string;
  uploadFingerprint?: string;
  sourceRowFingerprint?: string;
  approvalKey?: string;
  supporterId?: string;
  reviewVersion?: number;
  historicalLinkUncertain?: boolean;
}

export interface SuggestedFeature {
  title: string;
  benefit: string;
  tier: BillingPlan;
}
