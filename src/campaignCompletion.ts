import type { CampaignReadinessStatus, CampaignShowcaseModule, CampaignShowcaseTrack } from "./campaignShowcaseCatalog.ts";
import { campaignShowcaseModules, campaignShowcaseTracks } from "./campaignShowcaseCatalog.ts";
import type { Language } from "./i18n/provider.tsx";

export type CriterionResult = "verified" | "notMet" | "notAssessed";

export interface WeightedAcceptanceCriterion {
  id: string;
  label: Record<Language, string>;
  weight: number;
  result: CriterionResult;
  evidence: string[];
}

export interface CapabilityStatusHistoryEntry {
  status: CampaignReadinessStatus;
  phase: "beforeVerification" | "afterVerification";
  date: string;
  rationale: string;
}

export interface CampaignCapabilityAssessment {
  id: string;
  previousStatus: CampaignReadinessStatus;
  actualStatus: CampaignReadinessStatus;
  statusHistory: CapabilityStatusHistoryEntry[];
  capabilityWeight: number;
  completionPercent: number | null;
  criteria: WeightedAcceptanceCriterion[];
  evidence: string[];
  workingFunctionality: Record<Language, string>;
  remainingFunctionality: Record<Language, string>;
  blocker: Record<Language, string> | null;
  statusRationale: Record<Language, string>;
  lastVerified: string;
  productionReadiness: WeightedAcceptanceCriterion;
}

type AssessmentSpec = {
  actualStatus: CampaignReadinessStatus;
  capabilityWeight: number;
  sourceEvidence?: string[];
  testEvidence: string[];
  unavailableTestEvidence?: string[];
  coreResult: CriterionResult;
  scopeResult: CriterionResult;
  regressionResult: CriterionResult;
  accessResult: CriterionResult;
  workingFunctionality?: Record<Language, string>;
  remainingFunctionality?: Record<Language, string>;
  blocker?: Record<Language, string>;
};

const verificationDate = "2026-11-03";
const releaseEvidence = "CAMPAIGN_SHOWCASE_RELEASE.md";
const unavailableEvidencePrefix = "Unavailable in this release base: ";
const accessEvidence = [
  "src/layouts/AppShell.tsx",
  "tests/campaignShowcaseCatalog.test.mjs"
];

const componentByTab: Record<string, string> = {
  command: "src/pages/app/CommandCenterTab.tsx",
  coordinators: "src/pages/app/CoordinatorNetworkTab.tsx",
  campaigns: "src/pages/app/CampaignsTab.tsx",
  public: "src/pages/PublicCampaignPage.tsx",
  fund: "src/pages/app/VbossModulePlaceholder.tsx",
  prove: "src/pages/app/VbossModulePlaceholder.tsx",
  growth: "src/pages/app/GrowthDashboardTab.tsx",
  movement: "src/pages/app/MovementCrmTab.tsx",
  scans: "src/pages/app/ScansTab.tsx",
  reports: "src/pages/app/ReportsTab.tsx",
  engagement: "src/pages/app/EngagementTab.tsx",
  activity: "src/pages/app/ActivityTab.tsx",
  saas: "src/pages/app/SaasTab.tsx"
};

const words = (en: string, hi: string, or: string): Record<Language, string> => ({ en, hi, or });

const specs: Record<string, AssessmentSpec> = {
  "organizations-workspaces": {
    actualStatus: "inProgress",
    capabilityWeight: 2,
    testEvidence: ["tests/workspaceResourceAccess.test.mjs", "tests/provisionWorkspaceMember.test.mjs"],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "volunteers-coordinators": {
    actualStatus: "inProgress",
    capabilityWeight: 2,
    testEvidence: ["tests/coordinatorNetwork.test.mjs", "tests/provisionWorkspaceMember.test.mjs"],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "roles-permissions": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/campaignAdminScopeEnforcement.test.mjs", "tests/workspaceResourceAccess.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "resources-locations": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/campaignLocationManager.test.mjs", "tests/persistedLocationReferenceValidator.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "campaign-lifecycle": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/campaignCreatorAssignment.test.mjs", "tests/campaignAdminProvisioningFrontend.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "campaign-settings-branding": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/publicCampaignBranding.test.mjs", "tests/publicCampaignPresentation.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "objectives-milestones": {
    actualStatus: "inProgress",
    capabilityWeight: 3,
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  "task-resource-allocation": {
    actualStatus: "inProgress",
    capabilityWeight: 3,
    testEvidence: ["tests/coordinatorNetwork.test.mjs", "tests/campaignLocationManager.test.mjs"],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "gsaa-public-campaign": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/publicCampaignExperienceV2.test.mjs", "tests/publicCampaignJourneyLookup.test.mjs", "tests/goudhanProductionExperience.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "six-step-signing": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/screenOtpPublicSigning.test.mjs", "tests/publicSigningConsentEnforcement.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "otp-verification": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/screenOtpPublicSigning.test.mjs", "tests/publicSignupVerificationMethod.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "duplicate-prevention": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/atomicPublicParticipation.test.mjs", "tests/publicSigningBrowserState.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "field-collection": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/fieldCollectionAtomicApproval.test.mjs", "tests/participationRequests.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "field-evidence": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/mobileFieldConfirmation.test.mjs", "tests/documentCameraFallback.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "offline-paper-signatures": {
    actualStatus: "inProgress",
    capabilityWeight: 2,
    testEvidence: ["tests/scanApproval.test.mjs", "tests/mobileFieldConfirmation.test.mjs"],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "supporter-registration-claim": {
    actualStatus: "blocked",
    capabilityWeight: 2,
    testEvidence: [],
    unavailableTestEvidence: ["tests/supporterAccountClaimFlow.test.mjs", "tests/supporterAccountOwnership.test.mjs"],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified",
    blocker: words(
      "The account-claim/auth implementation and required migrations from the validated candidate are absent from this release base. Compatible implementation and authenticated Preview acceptance are still required; the administrator-confirmed Auth URL allowlist is not the blocker.",
      "सत्यापित candidate का account-claim/auth implementation और आवश्यक migrations इस release base में नहीं हैं। संगत implementation और authenticated Preview acceptance अभी आवश्यक हैं; administrator द्वारा पुष्टि की गई Auth URL allowlist blocker नहीं है।",
      "ଯାଞ୍ଚିତ candidate ର account-claim/auth implementation ଏବଂ ଆବଶ୍ୟକ migrations ଏହି release base ରେ ନାହିଁ। ସୁସଙ୍ଗତ implementation ଏବଂ authenticated Preview acceptance ଏବେ ମଧ୍ୟ ଆବଶ୍ୟକ; administrator ଙ୍କ ଦ୍ୱାରା ନିଶ୍ଚିତ Auth URL allowlist blocker ନୁହେଁ।"
    ),
    remainingFunctionality: words(
      "Reconcile the missing account-claim/auth implementation and required migrations with the release base, then complete authenticated Preview acceptance. No database changes are part of this recovery.",
      "गुम account-claim/auth implementation और आवश्यक migrations को release base के साथ संगत करें, फिर authenticated Preview acceptance पूरी करें। इस recovery में कोई database परिवर्तन शामिल नहीं है।",
      "ଅନୁପସ୍ଥିତ account-claim/auth implementation ଏବଂ ଆବଶ୍ୟକ migrations କୁ release base ସହିତ ସୁସଙ୍ଗତ କରନ୍ତୁ, ପରେ authenticated Preview acceptance ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ। ଏହି recovery ରେ କୌଣସି database ପରିବର୍ତ୍ତନ ହେଉନାହିଁ।"
    )
  },
  "supporter-dashboard": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: [],
    unavailableTestEvidence: ["tests/supporterAccountOwnership.test.mjs", "tests/accountAccessExperience.test.mjs"],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  "participation-receipts": {
    actualStatus: "notStarted",
    capabilityWeight: 1,
    sourceEvidence: [releaseEvidence],
    testEvidence: ["tests/campaignShowcaseCatalog.test.mjs"],
    coreResult: "notMet",
    scopeResult: "notMet",
    regressionResult: "notMet",
    accessResult: "notMet"
  },
  "crowdfunding-budget": {
    actualStatus: "notStarted",
    capabilityWeight: 1,
    testEvidence: ["tests/campaignShowcaseCatalog.test.mjs"],
    coreResult: "notMet",
    scopeResult: "notMet",
    regressionResult: "notMet",
    accessResult: "verified"
  },
  "donation-management": {
    actualStatus: "notStarted",
    capabilityWeight: 1,
    testEvidence: ["tests/campaignShowcaseCatalog.test.mjs"],
    coreResult: "notMet",
    scopeResult: "notMet",
    regressionResult: "notMet",
    accessResult: "verified"
  },
  "financial-reporting": {
    actualStatus: "notStarted",
    capabilityWeight: 1,
    testEvidence: ["tests/campaignShowcaseCatalog.test.mjs"],
    coreResult: "notMet",
    scopeResult: "notMet",
    regressionResult: "notMet",
    accessResult: "verified"
  },
  "expenses-reconciliation": {
    actualStatus: "notStarted",
    capabilityWeight: 1,
    testEvidence: ["tests/campaignShowcaseCatalog.test.mjs"],
    coreResult: "notMet",
    scopeResult: "notMet",
    regressionResult: "notMet",
    accessResult: "verified"
  },
  "fundraising-transparency": {
    actualStatus: "notStarted",
    capabilityWeight: 1,
    testEvidence: ["tests/campaignShowcaseCatalog.test.mjs"],
    coreResult: "notMet",
    scopeResult: "notMet",
    regressionResult: "notMet",
    accessResult: "verified"
  },
  "paper-signature-scanning": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/scanApproval.test.mjs", "tests/documentCameraFallback.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "ocr-processing": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/documentIntelligence.test.mjs", "tests/ocrPipelineDiagnostics.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "manual-transcription": {
    actualStatus: "inProgress",
    capabilityWeight: 3,
    testEvidence: ["tests/scanApproval.test.mjs"],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "review-approval": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/scanApproval.test.mjs", "tests/fieldCollectionAtomicApproval.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "evidence-management": {
    actualStatus: "inProgress",
    capabilityWeight: 2,
    sourceEvidence: ["src/pages/app/ScansTab.tsx"],
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "notAssessed",
    accessResult: "verified",
    workingFunctionality: words(
      "Field evidence capture is available through Scans/Field Collection; the dedicated Prove evidence-management route remains a placeholder.",
      "Scans/Field Collection के माध्यम से फील्ड साक्ष्य दर्ज होते हैं; समर्पित Prove evidence-management route अभी placeholder है।",
      "Scans/Field Collection ମାଧ୍ୟମରେ କ୍ଷେତ୍ର ପ୍ରମାଣ ଧରାଯାଏ; ସମର୍ପିତ Prove evidence-management route ଏବେ placeholder ଅଛି।"
    ),
    remainingFunctionality: words(
      "Implement and test the dedicated evidence library, organization, and privacy workflow; complete authenticated Preview acceptance.",
      "समर्पित evidence library, संगठन और गोपनीयता workflow लागू व परीक्षण करें; authenticated Preview acceptance पूरी करें।",
      "ସମର୍ପିତ evidence library, ସଂଗଠନ ଏବଂ ଗୋପନୀୟତା workflow କାର୍ଯ୍ୟକାରୀ ଏବଂ ପରୀକ୍ଷା କରନ୍ତୁ; authenticated Preview acceptance ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ।"
    )
  },
  "progress-analytics": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/signerAnalytics.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "audit-trails": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  referrals: {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/supporterOwnerReferralPersistence.test.mjs", "tests/publicCampaignExperienceV2.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "qr-whatsapp-social": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/publicCampaignExperienceV2.test.mjs", "tests/publicCampaignBranding.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "growth-dashboard": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  "rewards-recognition": {
    actualStatus: "inProgress",
    capabilityWeight: 2,
    sourceEvidence: [
      "src/pages/app/GrowthDashboardTab.tsx",
      "src/growth/rewards/rewardRuntimeService.ts",
      "src/growth/merchant/components/MerchantDashboard.tsx"
    ],
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified",
    workingFunctionality: words(
      "Growth Dashboard renders reward/recognition metrics and merchant redemption actions through the campaign growth runtime.",
      "Growth Dashboard में campaign growth runtime के माध्यम से reward/recognition metrics और merchant redemption actions दिखते हैं।",
      "Growth Dashboard campaign growth runtime ମାଧ୍ୟମରେ reward/recognition metrics ଏବଂ merchant redemption actions ଦେଖାଏ।"
    ),
    remainingFunctionality: words(
      "Add direct reward/recognition workflow regression tests and complete authenticated Preview acceptance; verify the full merchant and redemption lifecycle.",
      "Reward/recognition workflow के सीधे regression tests जोड़ें और authenticated Preview acceptance पूरी करें; merchant और redemption lifecycle सत्यापित करें।",
      "Reward/recognition workflow ପାଇଁ ସିଧା regression tests ଯୋଡ଼ନ୍ତୁ ଏବଂ authenticated Preview acceptance ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ; merchant ଏବଂ redemption lifecycle ଯାଞ୍ଚ କରନ୍ତୁ।"
    )
  },
  "movement-crm": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  "volunteer-mobilization": {
    actualStatus: "inProgress",
    capabilityWeight: 2,
    testEvidence: ["tests/coordinatorNetwork.test.mjs"],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "engagement-hub": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  "action-center": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/vbossCampaignFramework.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "saas-administration": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/saasAdminSupabaseSession.test.mjs", "tests/platformAdminPrerequisiteMigration.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "subscriptions-trials": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/entitlementEngine.test.mjs", "tests/campaignAdminSessionMarkerAndEntitlements.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  authentication: {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: [],
    unavailableTestEvidence: ["tests/supporterAuth.test.mjs", "tests/supporterEmailConfirmation.test.mjs", "tests/supporterPasswordRecovery.test.mjs"],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  "multilingual-localization": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/publicActTranslations.test.mjs", "tests/publicCampaignPresentation.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "ai-copilot": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/campaignShowcaseCatalog.test.mjs"],
    coreResult: "verified",
    scopeResult: "notAssessed",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "content-studio": {
    actualStatus: "notStarted",
    capabilityWeight: 1,
    testEvidence: [],
    coreResult: "notMet",
    scopeResult: "notMet",
    regressionResult: "notAssessed",
    accessResult: "notMet"
  },
  "shared-reporting": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 3,
    testEvidence: ["tests/signerAnalytics.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  },
  "communications-integrations": {
    actualStatus: "inProgress",
    capabilityWeight: 2,
    testEvidence: [],
    coreResult: "verified",
    scopeResult: "notMet",
    regressionResult: "notAssessed",
    accessResult: "verified"
  },
  "document-intelligence": {
    actualStatus: "pendingFinalReview",
    capabilityWeight: 2,
    testEvidence: ["tests/documentIntelligence.test.mjs", "tests/ocrPipelineDiagnostics.test.mjs"],
    coreResult: "verified",
    scopeResult: "verified",
    regressionResult: "verified",
    accessResult: "verified"
  }
};

const criteriaWeights = {
  core: 25,
  scope: 20,
  regression: 25,
  access: 15,
  preview: 15
} as const;

const capabilityPriorityIds = new Set([
  "campaign-lifecycle",
  "campaign-settings-branding",
  "objectives-milestones",
  "task-resource-allocation",
  "gsaa-public-campaign",
  "six-step-signing",
  "otp-verification",
  "duplicate-prevention",
  "field-collection",
  "field-evidence",
  "paper-signature-scanning",
  "ocr-processing",
  "manual-transcription",
  "review-approval",
  "movement-crm",
  "progress-analytics",
  "referrals",
  "saas-administration",
  "shared-reporting"
]);

const assessmentCopy = {
  totalCapabilities: words("Total capabilities", "कुल क्षमताएँ", "ମୋଟ କ୍ଷମତା"),
  developmentCompletion: words("Evidence-based development completion", "साक्ष्य-आधारित विकास पूर्णता", "ପ୍ରମାଣ-ଆଧାରିତ ବିକାଶ ସମ୍ପୂର୍ଣ୍ଣତା"),
  productionReadiness: words("Verified production readiness", "सत्यापित उत्पादन तैयारी", "ଯାଞ୍ଚିତ ଉତ୍ପାଦନ ପ୍ରସ୍ତୁତି"),
  unassessedCapabilities: words("Capabilities not assessed", "अभी आकलित नहीं क्षमताएँ", "ଏପର୍ଯ୍ୟନ୍ତ ମୂଲ୍ୟାଙ୍କନ ହୋଇନଥିବା କ୍ଷମତା"),
  unassessedCriteria: words("Criteria not assessed", "आकलित नहीं मानदंड", "ମୂଲ୍ୟାଙ୍କନ ହୋଇନଥିବା ମାନଦଣ୍ଡ"),
  completed: words("Completed", "पूरा", "ସମ୍ପୂର୍ଣ୍ଣ"),
  pendingFinalReview: words("Pending Final Review", "अंतिम समीक्षा लंबित", "ଅନ୍ତିମ ସମୀକ୍ଷା ବାକି"),
  inProgress: words("In Progress", "प्रगति में", "ଚାଲିଛି"),
  notStarted: words("Not Started", "शुरू नहीं हुआ", "ଆରମ୍ଭ ହୋଇନାହିଁ"),
  blocked: words("Blocked", "अवरुद्ध", "ଅଟକିଛି"),
  trackCompletion: words("Track completion", "ट्रैक पूर्णता", "ଟ୍ରାକ୍ ସମ୍ପୂର୍ଣ୍ଣତା"),
  previousStatus: words("Existing status (before verification)", "सत्यापन से पहले की स्थिति", "ଯାଞ୍ଚ ପୂର୍ବରୁ ସ୍ଥିତି"),
  actualStatus: words("Actual verified status", "वास्तविक सत्यापित स्थिति", "ପ୍ରକୃତ ଯାଞ୍ଚିତ ସ୍ଥିତି"),
  completion: words("Evidence-based completion", "साक्ष्य-आधारित पूर्णता", "ପ୍ରମାଣ-ଆଧାରିତ ସମ୍ପୂର୍ଣ୍ଣତା"),
  working: words("Working functionality", "कार्यरत कार्यक्षमता", "କାର୍ଯ୍ୟରତ କାର୍ଯ୍ୟକ୍ଷମତା"),
  remaining: words("Remaining functionality / acceptance", "शेष कार्यक्षमता / स्वीकृति", "ବାକି କାର୍ଯ୍ୟକ୍ଷମତା / ଗ୍ରହଣ"),
  blockers: words("Blockers", "अवरोध", "ପ୍ରତିବନ୍ଧକ"),
  noKnownBlockers: words("No additional blocker recorded.", "कोई अतिरिक्त अवरोध दर्ज नहीं है।", "ଅତିରିକ୍ତ ପ୍ରତିବନ୍ଧକ ରେକର୍ଡ ହୋଇନାହିଁ।"),
  lastVerified: words("Last verified", "अंतिम सत्यापन", "ଶେଷ ଯାଞ୍ଚ"),
  criteria: words("Weighted acceptance criteria", "भारित स्वीकृति मानदंड", "ଓଜନିତ ଗ୍ରହଣ ମାନଦଣ୍ଡ"),
  evidence: words("Evidence", "साक्ष्य", "ପ୍ରମାଣ"),
  criterionWeight: words("Weight", "भार", "ଓଜନ"),
  capabilityWeight: words("Overall weight", "कुल भार", "ମୋଟ ଓଜନ"),
  verified: words("Verified", "सत्यापित", "ଯାଞ୍ଚିତ"),
  notMet: words("Not met", "पूरा नहीं", "ପୂରଣ ହୋଇନାହିଁ"),
  notAssessed: words("Not assessed", "आकलित नहीं", "ମୂଲ୍ୟାଙ୍କନ ହୋଇନାହିଁ"),
  productionNote: words(
    "Production was not accessed or changed; release evidence covers Preview only.",
    "Production को न तो एक्सेस किया गया और न बदला गया; रिलीज़ साक्ष्य केवल Preview का है।",
    "Production କୁ ପ୍ରବେଶ କିମ୍ବା ପରିବର୍ତ୍ତନ କରାଯାଇନାହିଁ; ରିଲିଜ୍ ପ୍ରମାଣ କେବଳ Preview ପାଇଁ।"
  ),
  scoreMethod: words(
    "Each criterion has an explicit weight. Only verified criteria earn credit; known gaps are Not met and missing interactive evidence is Not assessed. A 100% score requires every criterion to pass. Overall development uses capability weights: release-priority capabilities weigh 3, standard capabilities 2, and preview-only/unimplemented items 1.",
    "हर मानदंड का स्पष्ट भार है। केवल सत्यापित मानदंड को अंक मिलते हैं; ज्ञात कमियाँ पूरी नहीं और अनुपलब्ध इंटरैक्टिव साक्ष्य आकलित नहीं है। 100% के लिए सभी मानदंड पास होने चाहिए। कुल विकास में क्षमता भार लागू हैं: रिलीज़-प्राथमिकता क्षमताएँ 3, सामान्य क्षमताएँ 2, और केवल पूर्वावलोकन/अकार्यान्वित मदें 1।",
    "ପ୍ରତ୍ୟେକ ମାନଦଣ୍ଡର ସ୍ପଷ୍ଟ ଓଜନ ଅଛି। କେବଳ ଯାଞ୍ଚିତ ମାନଦଣ୍ଡକୁ ଅଙ୍କ ମିଳେ; ଜଣାଶୁଣା ଅଭାବ ପୂରଣ ହୋଇନାହିଁ ଏବଂ ନଥିବା ଇଣ୍ଟରାକ୍ଟିଭ୍ ପ୍ରମାଣ ମୂଲ୍ୟାଙ୍କନ ହୋଇନାହିଁ। 100% ପାଇଁ ସମସ୍ତ ମାନଦଣ୍ଡ ପାସ୍ ହେବା ଆବଶ୍ୟକ। ମୋଟ ବିକାଶରେ କ୍ଷମତା ଓଜନ: ରିଲିଜ୍-ପ୍ରାଥମିକତା କ୍ଷମତା 3, ସାଧାରଣ କ୍ଷମତା 2 ଏବଂ କେବଳ ପୂର୍ବଦର୍ଶନ/ଅକାର୍ଯ୍ୟକାରୀ ଆଇଟମ୍ 1।"
  ),
  coreCriterion: words("An implementation slice for the described capability exists", "ବର୍ଣ୍ଣିତ କ୍ଷମତାର କାର୍ଯ୍ୟକାରୀ ଅଂଶ ଅଛି", "ବର୍ଣ୍ଣିତ କ୍ଷମତା ପାଇଁ ଏକ କାର୍ଯ୍ୟକାରୀ ଅଂଶ ଅଛି"),
  scopeCriterion: words("The full described capability scope is implemented", "ବର୍ଣ୍ଣିତ ସମ୍ପୂର୍ଣ୍ଣ କ୍ଷମତା କାର୍ଯ୍ୟକାରୀ", "ବର୍ଣ୍ଣିତ ସମ୍ପୂର୍ଣ୍ଣ କ୍ଷମତା କାର୍ଯ୍ୟକାରୀ"),
  regressionCriterion: words("Capability-specific automated regression behavior passes", "କ୍ଷମତା-ନିର୍ଦ୍ଦିଷ୍ଟ ସ୍ୱୟଂଚାଳିତ regression ବ୍ୟବହାର ପାସ୍", "କ୍ଷମତା-ନିର୍ଦ୍ଦିଷ୍ଟ ସ୍ୱୟଂଚାଳିତ regression ବ୍ୟବହାର ପାସ୍"),
  accessCriterion: words("Existing route and role/entitlement guard are wired", "ବର୍ତ୍ତମାନର route ଏବଂ role/entitlement guard ଯୋଡ଼ାଯାଇଛି", "ବର୍ତ୍ତମାନର route ଏବଂ role/entitlement guard ଯୋଡ଼ାଯାଇଛି"),
  previewCriterion: words("Authenticated Preview and live-backend acceptance passes", "Authenticated Preview ଏବଂ live-backend ସ୍ୱୀକୃତି ପାସ୍", "Authenticated Preview ଏବଂ live-backend ଗ୍ରହଣ ପାସ୍"),
  statusReason: {
    pending: words(
      "Implementation and available automated evidence remain in the final-review category; authenticated Preview acceptance was not available.",
      "कार्यान्वयन और उपलब्ध स्वचालित साक्ष्य अंतिम समीक्षा श्रेणी में हैं; authenticated Preview acceptance उपलब्ध नहीं था।",
      "କାର୍ଯ୍ୟାନ୍ୱୟନ ଏବଂ ଉପଲବ୍ଧ ସ୍ୱୟଂଚାଳିତ ପ୍ରମାଣ ଅନ୍ତିମ ସମୀକ୍ଷା ଶ୍ରେଣୀରେ ଅଛି; authenticated Preview acceptance ଉପଲବ୍ଧ ନଥିଲା।"
    ),
    inProgress: words(
      "Code evidence confirms an implemented slice; a defined remaining-scope criterion is not met.",
      "कोड साक्ष्य कार्यान्वित हिस्से की पुष्टि करता है; शेष दायरे का मानदंड पूरा नहीं है।",
      "କୋଡ୍ ପ୍ରମାଣ କାର୍ଯ୍ୟକାରୀ ଅଂଶକୁ ନିଶ୍ଚିତ କରେ; ବାକି ପରିସର ମାନଦଣ୍ଡ ପୂରଣ ହୋଇନାହିଁ।"
    ),
    notStarted: words(
      "Release scope and implementation evidence identify no functional workflow for this capability.",
      "रिलीज़ दायरा और कार्यान्वयन साक्ष्य इस क्षमता के लिए कोई कार्यात्मक workflow नहीं दिखाते।",
      "ରିଲିଜ୍ ପରିସର ଏବଂ କାର୍ଯ୍ୟାନ୍ୱୟନ ପ୍ରମାଣ ଏହି କ୍ଷମତା ପାଇଁ କୌଣସି କାର୍ଯ୍ୟକ୍ଷମ workflow ଦେଖାଏ ନାହିଁ।"
    ),
    blocked: words(
      "The code and regression flow exist, but the documented Development Auth configuration dependency remains unresolved.",
      "कोड और regression flow मौजूद हैं, लेकिन दस्तावेज़ित Development Auth configuration dependency अनसुलझी है।",
      "କୋଡ୍ ଏବଂ regression flow ଅଛି, କିନ୍ତୁ ଦଲିଲଭୁକ୍ତ Development Auth configuration ନିର୍ଭରତା ଅସମାଧାନ ରହିଛି।"
    )
  }
} as const;

function sumCriteriaWeights(criteria: readonly WeightedAcceptanceCriterion[]) {
  return criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
}

export function calculateCapabilityCompletion(criteria: readonly WeightedAcceptanceCriterion[]): number | null {
  const totalWeight = sumCriteriaWeights(criteria);
  if (totalWeight <= 0 || !criteria.some((criterion) => criterion.result !== "notAssessed")) return null;
  const verifiedWeight = criteria.reduce(
    (sum, criterion) => sum + (criterion.result === "verified" ? criterion.weight : 0),
    0
  );
  return Math.round((verifiedWeight / totalWeight) * 100);
}

export function calculateWeightedCompletion(
  items: ReadonlyArray<{ completionPercent: number | null; weight: number }>
): number | null {
  const assessed = items.filter(
    (item): item is { completionPercent: number; weight: number } =>
      item.completionPercent !== null && item.weight > 0
  );
  const totalWeight = assessed.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return null;
  return Math.round(
    assessed.reduce((sum, item) => sum + item.completionPercent * item.weight, 0) / totalWeight
  );
}

function getCriterionLabel(
  module: CampaignShowcaseModule,
  key: keyof typeof assessmentCopy,
  language: Language
) {
  const label = assessmentCopy[key];
  if (typeof label === "object" && label && "en" in label) return label[language];
  return module.title[language];
}

function criterion(
  module: CampaignShowcaseModule,
  key: string,
  labelKey: keyof typeof assessmentCopy,
  weight: number,
  result: CriterionResult,
  evidence: string[]
): WeightedAcceptanceCriterion {
  const label = key === "core" || key === "scope"
    ? {
        en: `${module.title.en}: ${getCriterionLabel(module, labelKey, "en")} — ${module.description.en}`,
        hi: `${module.title.hi}: ${getCriterionLabel(module, labelKey, "hi")} — ${module.description.hi}`,
        or: `${module.title.or}: ${getCriterionLabel(module, labelKey, "or")} — ${module.description.or}`
      }
    : {
        en: `${module.title.en}: ${getCriterionLabel(module, labelKey, "en")}`,
        hi: `${module.title.hi}: ${getCriterionLabel(module, labelKey, "hi")}`,
        or: `${module.title.or}: ${getCriterionLabel(module, labelKey, "or")}`
      };
  return {
    id: `${module.id}-${key}`,
    label,
    weight,
    result,
    evidence
  };
}

function statusRationale(status: CampaignReadinessStatus) {
  const key = status === "pendingFinalReview"
    ? "pending"
    : status === "inProgress"
      ? "inProgress"
      : status === "notStarted"
        ? "notStarted"
        : status === "blocked"
          ? "blocked"
          : "pending";
  return assessmentCopy.statusReason[key];
}

function getAssessment(module: CampaignShowcaseModule): CampaignCapabilityAssessment {
  const spec = specs[module.id];
  if (!spec) throw new Error(`Missing completion assessment for capability ${module.id}`);
  const tabSource = module.tab ? componentByTab[module.tab] : undefined;
  const actionSource = module.action === "aiCopilot" ? "src/pages/app/AiCampaignCopilot.tsx" : undefined;
  if (module.tab && !tabSource) throw new Error(`Missing source evidence mapping for tab ${module.tab}`);
  const sourceEvidence = [...new Set([
    ...(spec.sourceEvidence ?? []),
    ...(tabSource ? [tabSource] : []),
    ...(actionSource ? [actionSource] : [])
  ])];
  const testEvidence = [...spec.testEvidence];
  const unavailableTestEvidence = (spec.unavailableTestEvidence ?? [])
    .map((path) => `${unavailableEvidencePrefix}${path}`);
  const allEvidence = [...new Set([
    ...sourceEvidence,
    ...testEvidence,
    ...unavailableTestEvidence,
    releaseEvidence
  ])];
  const criteria: WeightedAcceptanceCriterion[] = [
    criterion(
      module,
      "core",
      "coreCriterion",
      criteriaWeights.core,
      spec.coreResult,
      sourceEvidence.length ? sourceEvidence : [releaseEvidence, "src/campaignShowcaseCatalog.ts"]
    ),
    criterion(
      module,
      "scope",
      "scopeCriterion",
      criteriaWeights.scope,
      spec.scopeResult,
      testEvidence.length || unavailableTestEvidence.length
        ? [...sourceEvidence, ...testEvidence, ...unavailableTestEvidence]
        : [releaseEvidence, ...sourceEvidence]
    ),
    criterion(
      module,
      "regression",
      "regressionCriterion",
      criteriaWeights.regression,
      spec.regressionResult,
      testEvidence.length || unavailableTestEvidence.length
        ? [...testEvidence, ...unavailableTestEvidence]
        : [releaseEvidence, "tests/campaignShowcaseCatalog.test.mjs"]
    ),
    criterion(
      module,
      "access",
      "accessCriterion",
      criteriaWeights.access,
      spec.accessResult,
      [...sourceEvidence.filter((path) => path === "src/layouts/AppShell.tsx"), ...accessEvidence]
    ),
    criterion(
      module,
      "preview",
      "previewCriterion",
      criteriaWeights.preview,
      "notAssessed",
      [releaseEvidence]
    )
  ];
  if (sumCriteriaWeights(criteria) !== 100) throw new Error(`Acceptance criteria for ${module.id} must total 100`);

  const previousStatus = module.status;
  const rationale = spec.actualStatus === "inProgress" && module.id === "rewards-recognition"
    ? words(
        "The original Not Started status is retained as history. Growth Dashboard and merchant runtime code now support reward/recognition behavior, so the verified status is In Progress; direct regression and Preview acceptance remain outstanding.",
        "मूल Not Started स्थिति इतिहास के रूप में सुरक्षित है। Growth Dashboard और merchant runtime code reward/recognition व्यवहार का समर्थन करते हैं, इसलिए सत्यापित स्थिति In Progress है; सीधे regression और Preview acceptance बाकी हैं।",
        "ମୂଳ Not Started ସ୍ଥିତି ଇତିହାସ ଭାବେ ରଖାଯାଇଛି। Growth Dashboard ଏବଂ merchant runtime code reward/recognition ବ୍ୟବହାରକୁ ସମର୍ଥନ କରେ, ତେଣୁ ଯାଞ୍ଚିତ ସ୍ଥିତି In Progress; ସିଧା regression ଏବଂ Preview acceptance ବାକି ଅଛି।"
      )
    : statusRationale(spec.actualStatus);
  const workingFunctionality = spec.workingFunctionality ?? (
    spec.coreResult === "notMet"
      ? words(
          "No capability workflow is implemented; any linked destination is an informational preview only.",
          "इस क्षमता का कोई workflow लागू नहीं है; जुड़ा destination केवल जानकारी पूर्वावलोकन है।",
          "ଏହି କ୍ଷମତାର କୌଣସି workflow କାର୍ଯ୍ୟକାରୀ ନୁହେଁ; ସଂଯୁକ୍ତ destination କେବଳ ସୂଚନା ପୂର୍ବଦର୍ଶନ।"
        )
      : words(
          `Implementation is present in ${sourceEvidence.join(", ") || "the linked module"}. The capability description identifies the current functional scope.`,
          `${sourceEvidence.join(", ") || "लिंक किए गए मॉड्यूल"} में कार्यान्वयन मौजूद है। क्षमता विवरण वर्तमान कार्यात्मक दायरा बताता है।`,
          `${sourceEvidence.join(", ") || "ସଂଯୁକ୍ତ ମଡ୍ୟୁଲ୍"} ରେ କାର୍ଯ୍ୟାନ୍ୱୟନ ଅଛି। କ୍ଷମତା ବର୍ଣ୍ଣନା ବର୍ତ୍ତମାନର କାର୍ଯ୍ୟକ୍ଷମ ପରିସରକୁ ଚିହ୍ନଟ କରେ।`
        )
  );
  const remainingFunctionality = spec.remainingFunctionality ?? (
    spec.actualStatus === "blocked"
      ? words(
          "Verify the documented Development Auth URL allowlist, then complete authenticated Preview acceptance of account claiming.",
          "दस्तावेज़ित Development Auth URL allowlist सत्यापित करें, फिर account claiming की authenticated Preview acceptance पूरी करें।",
          "ଦଲିଲଭୁକ୍ତ Development Auth URL allowlist ଯାଞ୍ଚ କରନ୍ତୁ, ପରେ account claiming ପାଇଁ authenticated Preview acceptance ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ।"
        )
      : spec.actualStatus === "notStarted"
      ? words(
          `Implement the described workflow; the current preview does not provide it. ${module.description.en}`,
          `वर्णित workflow लागू करें; वर्तमान पूर्वावलोकन यह सुविधा नहीं देता। ${module.description.hi}`,
          `ବର୍ଣ୍ଣିତ workflow କାର୍ଯ୍ୟକାରୀ କରନ୍ତୁ; ବର୍ତ୍ତମାନର preview ଏହା ପ୍ରଦାନ କରେନାହିଁ। ${module.description.or}`
        )
      : spec.actualStatus === "inProgress"
        ? words(
            `Complete the remaining described scope and authenticated Preview acceptance. ${module.description.en}`,
            `ବର୍ଣ୍ଣିତ ବାକି ପରିସର ଏବଂ authenticated Preview acceptance ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ। ${module.description.hi}`,
            `ବର୍ଣ୍ଣିତ ବାକି ପରିସର ଏବଂ authenticated Preview acceptance ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ। ${module.description.or}`
          )
        : words(
            "Complete signed-in Preview acceptance against the live Development backend and verify the actual role/entitlement experience.",
            "Live Development backend पर signed-in Preview acceptance पूरी करें और वास्तविक role/entitlement अनुभव सत्यापित करें।",
            "Live Development backend ବିପକ୍ଷରେ signed-in Preview acceptance ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ ଏବଂ ପ୍ରକୃତ role/entitlement ଅନୁଭୂତି ଯାଞ୍ଚ କରନ୍ତୁ।"
          )
  );
  const productionReadiness: WeightedAcceptanceCriterion = {
    id: `${module.id}-production-readiness`,
    label: words(
      `${module.title.en}: production deployment, data, and user acceptance verified`,
      `${module.title.hi}: production deployment, data, और user acceptance सत्यापित`,
      `${module.title.or}: production deployment, data, ଏବଂ user acceptance ଯାଞ୍ଚିତ`
    ),
    weight: 100,
    result: "notAssessed",
    evidence: [releaseEvidence]
  };

  return {
    id: module.id,
    previousStatus,
    actualStatus: spec.actualStatus,
    statusHistory: [
      {
        status: previousStatus,
        phase: "beforeVerification",
        date: verificationDate,
        rationale: "Original release-candidate catalogue status; retained without mutation."
      },
      {
        status: spec.actualStatus,
        phase: "afterVerification",
        date: verificationDate,
        rationale: rationale.en
      }
    ],
    capabilityWeight: spec.capabilityWeight,
    completionPercent: calculateCapabilityCompletion(criteria),
    criteria,
    evidence: allEvidence,
    workingFunctionality,
    remainingFunctionality,
    blocker: spec.blocker ?? null,
    statusRationale: rationale,
    lastVerified: verificationDate,
    productionReadiness
  };
}

export const campaignCapabilityAssessments: ReadonlyArray<CampaignCapabilityAssessment> = campaignShowcaseModules.map(getAssessment);

if (campaignCapabilityAssessments.length !== 47 || Object.keys(specs).length !== 47) {
  throw new Error("Campaign capability assessment must cover exactly the existing 47 capabilities");
}

export function getCampaignCompletionSummary(
  assessments: ReadonlyArray<CampaignCapabilityAssessment> = campaignCapabilityAssessments
) {
  const statusCounts = Object.fromEntries(
    (["completed", "pendingFinalReview", "inProgress", "notStarted", "blocked"] as const).map((status) => [
      status,
      assessments.filter((assessment) => assessment.actualStatus === status).length
    ])
  ) as Record<CampaignReadinessStatus, number>;
  const previousStatusCounts = Object.fromEntries(
    (["completed", "pendingFinalReview", "inProgress", "notStarted", "blocked"] as const).map((status) => [
      status,
      assessments.filter((assessment) => assessment.previousStatus === status).length
    ])
  ) as Record<CampaignReadinessStatus, number>;
  const trackCompletion = Object.fromEntries(
    campaignShowcaseTracks.map((track) => {
      const modules = assessments.filter((assessment) =>
        campaignShowcaseModules.find((module) => module.id === assessment.id)?.track === track.id
      );
      return [
        track.id,
        calculateWeightedCompletion(modules.map(({ completionPercent, capabilityWeight }) => ({
          completionPercent,
          weight: capabilityWeight
        })))
      ];
    })
  ) as Record<CampaignShowcaseTrack, number | null>;

  return {
    totalCapabilities: assessments.length,
    developmentCompletionPercent: calculateWeightedCompletion(assessments.map(({ completionPercent, capabilityWeight }) => ({
      completionPercent,
      weight: capabilityWeight
    }))),
    productionReadinessPercent: calculateWeightedCompletion(assessments.map(({ productionReadiness, capabilityWeight }) => ({
      completionPercent: productionReadiness.result === "verified" ? 100 : null,
      weight: capabilityWeight
    }))),
    statusCounts,
    previousStatusCounts,
    trackCompletion,
    unassessedCapabilityCount: assessments.filter((assessment) => assessment.completionPercent === null).length,
    unassessedCriterionCount: assessments.reduce(
      (sum, assessment) => sum + assessment.criteria.filter((criterion) => criterion.result === "notAssessed").length,
      0
    ),
    productionUnassessedCapabilityCount: assessments.filter(
      (assessment) => assessment.productionReadiness.result === "notAssessed"
    ).length
  };
}

export const campaignCompletionLabels = assessmentCopy;
