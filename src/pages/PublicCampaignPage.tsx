import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  HeartHandshake,
  Landmark,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  QrCode,
  Share2,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users
} from "lucide-react";
import type {
  AuthorityRule,
  Campaign,
  Organization,
  ParticipationRequestLevel,
  ParticipationRequestSubmission,
  PublicParticipationRequest,
  Signer,
  SignerRequiredField
} from "../types";
import { getConfiguredGrowthShareMessages } from "../growth/configuration";
import type { GrowthShareContext, GrowthSupporterSnapshot } from "../growth/lifecycle";
import type { SupporterGrowthPortalModel } from "../growth/tree";
import {
  indiaGeographyService,
  type LocationDeletions,
  type LocationOverrides,
  type LocationWithPin
} from "../geography";
import type { getCampaignMetrics } from "../lib";
import { Panel } from "../ui/Panel";
import { Field } from "../ui/Field";
import { DonationCard } from "../components/DonationCard";
import { IndiaLocationFields } from "../components/IndiaLocationFields";
import { GlobalLocationFields } from "../components/GlobalLocationFields";
import { ReferralQrPreview } from "../components/ReferralQrPreview";
import { VoiceUpStoryCarousel } from "../components/VoiceUpStoryCarousel";
import {
  BrowserGPSAdapter,
  type GPSAdapter
} from "../businessOs/geography/index.ts";
import {
  PublicSupporterPhoto,
  type PublicSupporterPhotoCopy
} from "../components/PublicSupporterPhoto";
import { blankSigner } from "../constants";
import {
  isGaumataPublicHostname,
  isGoudhanProductionCampaign
} from "../config/goudhanProduction";
import { LanguageSwitcher, useTranslation, type Language } from "../i18n";
import {
  getAppealAuthority,
  getAuthorityOptionsForCampaign,
  getConfiguredAppealAuthority,
  getPublicAuthorityOptions,
  formatAuthorityDisplay
} from "../utils/authority";
import {
  applySignerLocationRestriction,
  formatLocationForCampaign,
  getCampaignGoalValue,
  getCampaignGeographyMode,
  getCampaignLocationLabels,
  getCampaignPublicUrl,
  getCampaignScope,
  getEffectiveSignerLocationRestrictionLevel,
  getLocationRestrictionMessage,
  getLockedLocationValues,
  renderCampaignMessage
} from "../utils/campaign";
import {
  downloadQrPosterSvg,
  findReferrer,
  getCampaignReferralUrl,
  getSafeReferrerLabel,
  getSupporterReferralCode,
  normalizeReferralCode
} from "../utils/referrals";
import {
  clearPublicSigningJourney,
  clearPublicSigningOtpState,
  getPublicSigningJourneyStorageKey,
  readPublicSigningDraft,
  writePublicSigningDraft
} from "../publicSigningJourney";
import { createConsentVersion } from "../utils/consent";
import {
  PARTICIPATION_REQUEST_LEVELS,
  createParticipationRequestIdempotencyKey,
  getMinimumParticipationLevels,
  parseParticipationRequestList,
  participationRequestFingerprint
} from "../movementRequests";
import "../publicSigningExperience.css";
import type { PublicCampaignCustomLocation } from "../backend";

interface PublicCampaignPageProps {
  campaign: Campaign;
  organization?: Organization;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authority?: AuthorityRule;
  authorities: AuthorityRule[];
  campaignSigners: Signer[];
  publicForm: typeof blankSigner;
  setPublicForm: React.Dispatch<React.SetStateAction<typeof blankSigner>>;
  publicMessage: string;
  lastSignedSigner: Signer | null;
  growthSnapshot?: GrowthSupporterSnapshot;
  growthPortal?: SupporterGrowthPortalModel;
  otpInput: string;
  setOtpInput: React.Dispatch<React.SetStateAction<string>>;
  otpMessage: string;
  onSendOtp: () => void | boolean | Promise<void | boolean>;
  onVerifyOtp: () => void | Promise<void>;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  customLocations?: PublicCampaignCustomLocation[];
  onGrowthShare?: (share: GrowthShareContext) => void;
  onUploadSupporterPhoto?: (file: File) => Promise<void>;
  onSaveDraft?: () => void | Promise<void>;
  onCommunicationConsentChange?: (granted: boolean) => void | Promise<void>;
  onSubmitMovementRequest?: (
    request: ParticipationRequestSubmission,
    idempotencyKey: string
  ) => Promise<PublicParticipationRequest>;
  movementRequests?: PublicParticipationRequest[];
  movementRequestsLoading?: boolean;
  movementRequestsError?: string;
  onRefreshMovementRequests?: () => void | Promise<void>;
  onSubmitCoordinatorApplication?: () => void | Promise<void>;
  onStartNewJourney: () => void;
  gpsAdapter?: GPSAdapter;
  onSubmit: (event: FormEvent) => void | Promise<void>;
}

type SigningStepId = "phone" | "otp" | "profile" | "address" | "review" | "done";
type InvolvementPanel = "none" | "volunteer" | "coordinator";

const signingSteps: Array<{ id: SigningStepId }> = [
  { id: "phone" },
  { id: "otp" },
  { id: "profile" },
  { id: "address" },
  { id: "review" },
  { id: "done" }
];

const defaultPublicGpsAdapter = new BrowserGPSAdapter();

function isPublicFailureMessage(message: string) {
  return (
    /\([a-z][a-z0-9_]{1,63}\)\s*$/i.test(message) ||
    /\b(could not|failed|failure|expired|invalid|unavailable|required|outside|retry|error|blocked|has ended|past due|cancelled|not active|not currently open|reached its|reached the)\b/i.test(message) ||
    /^(create and publish|enter |request |please verify|verify your)/i.test(message)
  );
}

const participationRequestErrorCodes = new Set([
  "invalid_request_payload",
  "invalid_request_type",
  "invalid_coordinator_level",
  "invalid_minimum_level",
  "incomplete_request_geography",
  "request_consent_required",
  "support_completion_required",
  "otp_verification_required",
  "active_participation_request_exists",
  "busy"
]);

function participationRequestErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = String((error as { code?: string }).code ?? "");
  return participationRequestErrorCodes.has(code) ? code : "";
}

function formatParticipationRequestGeography(request: PublicParticipationRequest): string {
  return [
    request.geographicScope.country,
    request.geographicScope.state,
    request.geographicScope.district,
    request.geographicScope.block,
    request.geographicScope.panchayat,
    request.geographicScope.ward
  ].filter(Boolean).join(", ");
}

function getYouTubeEmbedUrl(value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const videoId =
      hostname === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0] ?? ""
        : hostname === "youtube.com" || hostname === "m.youtube.com"
          ? url.pathname.startsWith("/shorts/")
            ? url.pathname.split("/")[2] ?? ""
            : url.searchParams.get("v") ?? ""
          : "";
    return /^[a-zA-Z0-9_-]{6,20}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : "";
  } catch {
    return "";
  }
}

const publicSigningCopyEn = {
  steps: {
    phone: "Phone",
    otp: "OTP",
    profile: "Profile",
    address: "Details",
    review: "Review",
    done: "Done"
  },
  panelTitleComplete: "Signature complete",
  panelTitleSign: "Sign this campaign",
  secureSigning: "Secure signing",
  headerComplete: "Thank you for adding your voice.",
  headerActive: "Sign in about 60 seconds.",
  headerHelp: "Only required fields are shown first. Optional details stay available when needed.",
  invitedBy: "You were invited by",
  invitedFallback: "a campaign supporter",
  referralOptional: "Referral is optional and never affects your ability to sign.",
  phoneVerifiedBody: "Continue to sign, review your details, or share the campaign.",
  viewSignature: "View signature",
  referFriends: "Refer friends",
  phoneTitle: "Start with your phone",
  phoneHelp: "OTP keeps signatures credible and protects the campaign from spam.",
  otpTitle: "Verify OTP",
  otpHelp: "Enter the code sent to your phone.",
  resendOtp: "Resend OTP",
  phoneVerified: "Phone verified",
  profileTitle: "Your signature profile",
  profileHelp: "Enter the required signer details.",
  emailLabel: "Email",
  emailPlaceholder: "Email",
  authorityLabel: "Choose authority for your appeal",
  addOptionalDetails: "Add optional details",
  detailsTitle: "Required location and optional details",
  detailsHelp: "Location helps the campaign show where public support is coming from.",
  locationLimitTitle: "This campaign is limited to",
  addressLabel: "Address",
  addressPlaceholder: "House, street, locality",
  optionalDetails: "Contact and referral options",
  whatsappLabel: "WhatsApp number",
  whatsappPlaceholder: "If different from phone",
  telegramLabel: "Telegram handle or number",
  telegramPlaceholder: "@handle or number",
  referralLabel: "Referred by phone, name, or referral code",
  referralHelp: "Use a referrer phone, name, or code if someone invited you.",
  reviewTitle: "Review and sign",
  reviewHelp: "Confirm your support and submit your signature to this campaign.",
  reviewAuthority: "Authority",
  reviewReferral: "Referral",
  notEntered: "Not entered",
  none: "None",
  trustLabel: "Trust and privacy",
  privacyRespected: "Privacy respected",
  storedSecurely: "Signature stored securely",
  routedAuthority: "Petition routed to selected authority",
  supportCheckbox: "I have read and support the campaign appeal/cause shown above.",
  consentRequiredInline: "Please review and accept both consent confirmations before signing.",
  doneBody: "Your voice has been recorded. Share this campaign to help it reach the next supporter.",
  locationLabels: {
    country: "Country",
    state: "State",
    district: "District",
    block: "Block / Tehsil / Taluk",
    panchayat: "Gram Panchayat / Ward",
    postalCode: "PIN / Postal code"
  }
};

const publicSigningCopy: Record<Language, typeof publicSigningCopyEn> = {
  en: publicSigningCopyEn,
  hi: {
    steps: {
      phone: "फोन",
      otp: "OTP",
      profile: "प्रोफाइल",
      address: "विवरण",
      review: "समीक्षा",
      done: "पूर्ण"
    },
    panelTitleComplete: "हस्ताक्षर पूर्ण",
    panelTitleSign: "इस अभियान पर हस्ताक्षर करें",
    secureSigning: "सुरक्षित हस्ताक्षर",
    headerComplete: "अपनी आवाज जोड़ने के लिए धन्यवाद।",
    headerActive: "लगभग 60 सेकंड में हस्ताक्षर करें।",
    headerHelp: "पहले केवल जरूरी जानकारी दिखाई जाती है। वैकल्पिक विवरण जरूरत पड़ने पर उपलब्ध हैं।",
    invitedBy: "आपको आमंत्रित किया",
    invitedFallback: "एक अभियान समर्थक",
    referralOptional: "रेफ़रल वैकल्पिक है और हस्ताक्षर करने की क्षमता को प्रभावित नहीं करता।",
    phoneVerifiedBody: "हस्ताक्षर जारी रखें, विवरण देखें, या अभियान साझा करें।",
    viewSignature: "हस्ताक्षर देखें",
    referFriends: "मित्रों को भेजें",
    phoneTitle: "अपने फोन से शुरू करें",
    phoneHelp: "OTP हस्ताक्षरों को विश्वसनीय रखता है और अभियान को स्पैम से बचाता है।",
    otpTitle: "OTP सत्यापित करें",
    otpHelp: "अपने फोन पर भेजा गया कोड दर्ज करें।",
    resendOtp: "OTP फिर भेजें",
    phoneVerified: "फोन सत्यापित",
    profileTitle: "आपका हस्ताक्षर प्रोफाइल",
    profileHelp: "जरूरी समर्थक विवरण दर्ज करें।",
    emailLabel: "ईमेल",
    emailPlaceholder: "ईमेल",
    authorityLabel: "अपील के लिए अधिकारी चुनें",
    addOptionalDetails: "वैकल्पिक विवरण जोड़ें",
    detailsTitle: "जरूरी स्थान और वैकल्पिक विवरण",
    detailsHelp: "स्थान से अभियान को सार्वजनिक समर्थन का क्षेत्र दिखाने में मदद मिलती है।",
    locationLimitTitle: "यह अभियान सीमित है",
    addressLabel: "पता",
    addressPlaceholder: "घर, सड़क, मोहल्ला",
    optionalDetails: "संपर्क और रेफ़रल विकल्प",
    whatsappLabel: "WhatsApp नंबर",
    whatsappPlaceholder: "यदि फोन से अलग है",
    telegramLabel: "Telegram हैंडल या नंबर",
    telegramPlaceholder: "@handle या नंबर",
    referralLabel: "रेफ़र करने वाले का फोन, नाम, या कोड",
    referralHelp: "यदि किसी ने आमंत्रित किया है तो फोन, नाम, या कोड दर्ज करें।",
    reviewTitle: "समीक्षा करें और हस्ताक्षर करें",
    reviewHelp: "अपना समर्थन पुष्टि करें और हस्ताक्षर जमा करें।",
    reviewAuthority: "अधिकारी",
    reviewReferral: "रेफ़रल",
    notEntered: "दर्ज नहीं",
    none: "कोई नहीं",
    trustLabel: "विश्वास और गोपनीयता",
    privacyRespected: "गोपनीयता का सम्मान",
    storedSecurely: "हस्ताक्षर सुरक्षित रूप से संग्रहीत",
    routedAuthority: "याचिका चुने गए अधिकारी तक भेजी जाएगी",
    supportCheckbox: "मैंने ऊपर दिखाए गए अभियान अपील/कारण को पढ़ा है और समर्थन करता/करती हूं।",
    consentRequiredInline: "हस्ताक्षर करने से पहले दोनों सहमति पुष्टिकरण स्वीकार करें।",
    doneBody: "आपकी आवाज दर्ज हो गई है। अगले समर्थक तक पहुंचने के लिए अभियान साझा करें।",
    locationLabels: {
      country: "देश",
      state: "राज्य",
      district: "जिला",
      block: "ब्लॉक / तहसील / तालुक",
      panchayat: "ग्राम पंचायत / वार्ड",
      postalCode: "PIN / पोस्टल कोड"
    }
  },
  or: {
    steps: {
      phone: "ଫୋନ",
      otp: "OTP",
      profile: "ପ୍ରୋଫାଇଲ",
      address: "ବିବରଣୀ",
      review: "ସମୀକ୍ଷା",
      done: "ସମ୍ପୂର୍ଣ୍ଣ"
    },
    panelTitleComplete: "ସହି ସମ୍ପୂର୍ଣ୍ଣ",
    panelTitleSign: "ଏହି ଅଭିଯାନରେ ସହି କରନ୍ତୁ",
    secureSigning: "ସୁରକ୍ଷିତ ସହି",
    headerComplete: "ଆପଣଙ୍କ ଆବାଜ ଯୋଡିଥିବାରୁ ଧନ୍ୟବାଦ।",
    headerActive: "ପ୍ରାୟ 60 ସେକେଣ୍ଡରେ ସହି କରନ୍ତୁ।",
    headerHelp: "ପ୍ରଥମେ କେବଳ ଆବଶ୍ୟକ ତଥ୍ୟ ଦେଖାଯାଏ। ବୈକଳ୍ପିକ ବିବରଣୀ ଆବଶ୍ୟକ ହେଲେ ଉପଲବ୍ଧ ରହେ।",
    invitedBy: "ଆପଣଙ୍କୁ ଆମନ୍ତ୍ରଣ କରିଛନ୍ତି",
    invitedFallback: "ଏକ ଅଭିଯାନ ସମର୍ଥକ",
    referralOptional: "ରେଫରାଲ ବୈକଳ୍ପିକ ଏବଂ ସହି କରିବାକୁ ପ୍ରଭାବିତ କରେ ନାହିଁ।",
    phoneVerifiedBody: "ସହି ଜାରି ରଖନ୍ତୁ, ବିବରଣୀ ଦେଖନ୍ତୁ, କିମ୍ବା ଅଭିଯାନ ସେୟାର କରନ୍ତୁ।",
    viewSignature: "ସହି ଦେଖନ୍ତୁ",
    referFriends: "ମିତ୍ରଙ୍କୁ ପଠାନ୍ତୁ",
    phoneTitle: "ଆପଣଙ୍କ ଫୋନରୁ ଆରମ୍ଭ କରନ୍ତୁ",
    phoneHelp: "OTP ସହିକୁ ବିଶ୍ୱସନୀୟ ରଖେ ଏବଂ ଅଭିଯାନକୁ ସ୍ପାମରୁ ସୁରକ୍ଷା କରେ।",
    otpTitle: "OTP ସତ୍ୟାପିତ କରନ୍ତୁ",
    otpHelp: "ଆପଣଙ୍କ ଫୋନକୁ ପଠାଯାଇଥିବା କୋଡ୍ ଦିଅନ୍ତୁ।",
    resendOtp: "OTP ପୁନଃ ପଠାନ୍ତୁ",
    phoneVerified: "ଫୋନ ସତ୍ୟାପିତ",
    profileTitle: "ଆପଣଙ୍କ ସହି ପ୍ରୋଫାଇଲ",
    profileHelp: "ଆବଶ୍ୟକ ସମର୍ଥକ ବିବରଣୀ ଦିଅନ୍ତୁ।",
    emailLabel: "ଇମେଲ",
    emailPlaceholder: "ଇମେଲ",
    authorityLabel: "ଆପଣଙ୍କ ଅପିଲ ପାଇଁ କର୍ତ୍ତୃପକ୍ଷ ବାଛନ୍ତୁ",
    addOptionalDetails: "ବୈକଳ୍ପିକ ବିବରଣୀ ଯୋଡନ୍ତୁ",
    detailsTitle: "ଆବଶ୍ୟକ ସ୍ଥାନ ଏବଂ ବୈକଳ୍ପିକ ବିବରଣୀ",
    detailsHelp: "ସ୍ଥାନ ଅଭିଯାନକୁ ସମର୍ଥନ କେଉଁଠାରୁ ଆସୁଛି ଦେଖାଇବାରେ ସାହାଯ୍ୟ କରେ।",
    locationLimitTitle: "ଏହି ଅଭିଯାନ ସୀମିତ",
    addressLabel: "ଠିକଣା",
    addressPlaceholder: "ଘର, ରାସ୍ତା, ସ୍ଥାନୀୟ ଅଞ୍ଚଳ",
    optionalDetails: "ଯୋଗାଯୋଗ ଏବଂ ରେଫରାଲ ବିକଳ୍ପ",
    whatsappLabel: "WhatsApp ନମ୍ବର",
    whatsappPlaceholder: "ଫୋନରୁ ଭିନ୍ନ ହେଲେ",
    telegramLabel: "Telegram ହ୍ୟାଣ୍ଡଲ କିମ୍ବା ନମ୍ବର",
    telegramPlaceholder: "@handle କିମ୍ବା ନମ୍ବର",
    referralLabel: "ରେଫର କରିଥିବା ଫୋନ, ନାମ, କିମ୍ବା କୋଡ୍",
    referralHelp: "କେହି ଆମନ୍ତ୍ରଣ କରିଥିଲେ ଫୋନ, ନାମ, କିମ୍ବା କୋଡ୍ ବ୍ୟବହାର କରନ୍ତୁ।",
    reviewTitle: "ସମୀକ୍ଷା କରନ୍ତୁ ଏବଂ ସହି କରନ୍ତୁ",
    reviewHelp: "ଆପଣଙ୍କ ସମର୍ଥନ ନିଶ୍ଚିତ କରି ସହି ଦାଖଲ କରନ୍ତୁ।",
    reviewAuthority: "କର୍ତ୍ତୃପକ୍ଷ",
    reviewReferral: "ରେଫରାଲ",
    notEntered: "ଦିଆଯାଇନାହିଁ",
    none: "କିଛି ନାହିଁ",
    trustLabel: "ଭରସା ଏବଂ ଗୋପନୀୟତା",
    privacyRespected: "ଗୋପନୀୟତାର ସମ୍ମାନ",
    storedSecurely: "ସହି ସୁରକ୍ଷିତ ଭାବେ ସଂରକ୍ଷିତ",
    routedAuthority: "ଆବେଦନ ଚୟିତ କର୍ତ୍ତୃପକ୍ଷଙ୍କୁ ପଠାଯିବ",
    supportCheckbox: "ମୁଁ ଉପରେ ଦେଖାଯାଇଥିବା ଅଭିଯାନ ଅପିଲ/କାରଣ ପଢିଛି ଏବଂ ସମର୍ଥନ କରୁଛି।",
    consentRequiredInline: "ସହି କରିବା ପୂର୍ବରୁ ଦୁଇଟି ସମ୍ମତି ନିଶ୍ଚିତକରଣ ଗ୍ରହଣ କରନ୍ତୁ।",
    doneBody: "ଆପଣଙ୍କ ଆବାଜ ରେକର୍ଡ ହୋଇଛି। ପରବର୍ତ୍ତୀ ସମର୍ଥକଙ୍କୁ ପହଞ୍ଚିବା ପାଇଁ ଅଭିଯାନ ସେୟାର କରନ୍ତୁ।",
    locationLabels: {
      country: "ଦେଶ",
      state: "ରାଜ୍ୟ",
      district: "ଜିଲ୍ଲା",
      block: "ବ୍ଲକ / ତହସିଲ / ତାଲୁକ",
      panchayat: "ଗ୍ରାମ ପଞ୍ଚାୟତ / ୱାର୍ଡ",
      postalCode: "PIN / ପୋଷ୍ଟାଲ କୋଡ୍"
    }
  }
};

interface PublicExperienceCopy {
  signNow: string;
  campaignAtGlance: string;
  locationTitle: string;
  locationHelp: string;
  useMyLocation: string;
  enterManually: string;
  locating: string;
  locationReady: string;
  locationPoor: string;
  locationUnavailable: string;
  locationAlreadyRequested: string;
  accuracy: string;
  submitWorking: string;
  otpSending: string;
  otpVerifying: string;
  optionalNext: string;
  helpOrganise: string;
  notNow: string;
  learnMore: string;
  becomeCoordinator: string;
  coordinatorLearn: string;
  coordinatorHandoff: string;
  coordinatorContact: string;
  coordinatorPending: string;
  nationwideReach: string;
  statesReached: string;
  districtsReached: string;
  paperSupporters: string;
  remainingToGoal: string;
  structuredLocationTitle: string;
  structuredLocationHelp: string;
  paperReminderTitle: string;
  paperReminderWithCount: string;
  paperReminderEmpty: string;
  photo: PublicSupporterPhotoCopy;
}

const publicExperienceCopyEn: PublicExperienceCopy = {
  signNow: "SIGN NOW",
  campaignAtGlance: "Campaign at a glance",
  locationTitle: "📍 Speed up registration?",
  locationHelp: "Location is optional. Coordinates are never stored, logged, or shown publicly.",
  useMyLocation: "Use My Location",
  enterManually: "Enter Manually",
  locating: "Checking location permission...",
  locationReady: "Location detected. Review and edit the prefilled campaign area below.",
  locationPoor: "Location accuracy is low. Please review every field or enter it manually.",
  locationUnavailable: "Location could not be detected. Continue by entering it manually.",
  locationAlreadyRequested: "Location was already requested in this signing session. Continue manually.",
  accuracy: "Accuracy",
  submitWorking: "Recording support...",
  otpSending: "Sending...",
  otpVerifying: "Verifying...",
  optionalNext: "Optional next steps",
  helpOrganise: "Would you like to help organise this campaign?",
  notNow: "Not Now",
  learnMore: "Learn More",
  becomeCoordinator: "Become Coordinator",
  coordinatorLearn: "Coordinators help organise verified local activity through the existing campaign hierarchy.",
  coordinatorHandoff: "For security, a campaign manager must create the invited coordinator inside Coordinator Network.",
  coordinatorContact: "Request an invitation",
  coordinatorPending: "Invitation requested",
  nationwideReach: "Nationwide campaign reach",
  statesReached: "States / UTs reached",
  districtsReached: "Districts reached",
  paperSupporters: "Paper signatures",
  remainingToGoal: "Verified support needed",
  structuredLocationTitle: "Confirmed administrative path",
  structuredLocationHelp: "Matched against the India geography hierarchy. Review every field before signing.",
  paperReminderTitle: "Already signed on paper?",
  paperReminderWithCount: "{count} paper signatures are already included. Use the same mobile number so duplicates can be identified safely.",
  paperReminderEmpty: "Use the same mobile number if you signed a paper sheet. Paper entries may require review before appearing in totals.",
  photo: {
    title: "Optional private photo",
    help: "Add a profile photo after signing",
    selfie: "Take Selfie",
    rearCamera: "Rear Camera",
    choosePhoto: "Upload",
    skip: "Skip",
    retake: "Retake",
    rotate: "Rotate",
    crop: "Crop / zoom",
    lighting: "Use even lighting and keep your face inside the preview. The photo stays private.",
    upload: "Upload privately",
    uploading: "Uploading...",
    uploaded: "Private photo uploaded.",
    invalidImage: "Choose a JPEG, PNG, or WebP image up to 5 MB.",
    uploadFailed: "Private photo upload failed."
  }
};

const publicExperienceCopy: Record<Language, PublicExperienceCopy> = {
  en: publicExperienceCopyEn,
  hi: {
    signNow: "अभी हस्ताक्षर करें",
    campaignAtGlance: "अभियान एक नज़र में",
    locationTitle: "📍 पंजीकरण तेज़ करें?",
    locationHelp: "स्थान वैकल्पिक है। निर्देशांक कभी संग्रहीत, लॉग या सार्वजनिक नहीं किए जाते।",
    useMyLocation: "मेरा स्थान उपयोग करें",
    enterManually: "मैन्युअल दर्ज करें",
    locating: "स्थान अनुमति जाँची जा रही है...",
    locationReady: "स्थान मिला। नीचे पहले से भरे अभियान क्षेत्र की समीक्षा और संपादन करें।",
    locationPoor: "स्थान की सटीकता कम है। हर फ़ील्ड जाँचें या मैन्युअल दर्ज करें।",
    locationUnavailable: "स्थान नहीं मिला। मैन्युअल रूप से दर्ज करके जारी रखें।",
    locationAlreadyRequested: "इस हस्ताक्षर सत्र में स्थान पहले ही माँगा गया था। मैन्युअल रूप से जारी रखें।",
    accuracy: "सटीकता",
    submitWorking: "समर्थन दर्ज हो रहा है...",
    otpSending: "भेजा जा रहा है...",
    otpVerifying: "सत्यापित हो रहा है...",
    optionalNext: "वैकल्पिक अगले कदम",
    helpOrganise: "क्या आप इस अभियान को व्यवस्थित करने में मदद करना चाहेंगे?",
    notNow: "अभी नहीं",
    learnMore: "और जानें",
    becomeCoordinator: "समन्वयक बनें",
    coordinatorLearn: "समन्वयक मौजूदा अभियान पदानुक्रम के माध्यम से सत्यापित स्थानीय गतिविधि व्यवस्थित करते हैं।",
    coordinatorHandoff: "सुरक्षा के लिए अभियान प्रबंधक को समन्वयक नेटवर्क में आमंत्रित समन्वयक बनाना होगा।",
    coordinatorContact: "आमंत्रण का अनुरोध करें",
    coordinatorPending: "आमंत्रण का अनुरोध भेजा गया",
    nationwideReach: "राष्ट्रव्यापी अभियान पहुँच",
    statesReached: "राज्य / केंद्र शासित प्रदेश",
    districtsReached: "जिले",
    paperSupporters: "कागज़ी हस्ताक्षर",
    remainingToGoal: "लक्ष्य के लिए सत्यापित समर्थन",
    structuredLocationTitle: "पुष्ट प्रशासनिक मार्ग",
    structuredLocationHelp: "भारत के भूगोल पदानुक्रम से मिलान किया गया। हस्ताक्षर से पहले हर फ़ील्ड की समीक्षा करें।",
    paperReminderTitle: "क्या आपने पहले कागज़ पर हस्ताक्षर किए हैं?",
    paperReminderWithCount: "{count} कागज़ी हस्ताक्षर पहले से शामिल हैं। डुप्लिकेट सुरक्षित रूप से पहचानने के लिए वही मोबाइल नंबर उपयोग करें।",
    paperReminderEmpty: "यदि आपने कागज़ी शीट पर हस्ताक्षर किए हैं तो वही मोबाइल नंबर उपयोग करें। कुल में आने से पहले कागज़ी प्रविष्टियों की समीक्षा हो सकती है।",
    photo: {
      title: "वैकल्पिक निजी फ़ोटो",
      help: "हस्ताक्षर के बाद प्रोफ़ाइल फ़ोटो जोड़ें",
      selfie: "सेल्फ़ी लें",
      rearCamera: "पिछला कैमरा",
      choosePhoto: "अपलोड",
      skip: "छोड़ें",
      retake: "फिर लें",
      rotate: "घुमाएँ",
      crop: "क्रॉप / ज़ूम",
      lighting: "समान रोशनी रखें और चेहरा प्रीव्यू के अंदर रखें। फ़ोटो निजी रहेगी।",
      upload: "निजी रूप से अपलोड करें",
      uploading: "अपलोड हो रहा है...",
      uploaded: "निजी फ़ोटो अपलोड हुई।",
      invalidImage: "5 MB तक JPEG, PNG या WebP छवि चुनें।",
      uploadFailed: "निजी फ़ोटो अपलोड विफल हुई।"
    }
  },
  or: {
    signNow: "ଏବେ ସହି କରନ୍ତୁ",
    campaignAtGlance: "ଅଭିଯାନ ଏକ ନଜରରେ",
    locationTitle: "📍 ପଞ୍ଜୀକରଣ ଶୀଘ୍ର କରିବେ?",
    locationHelp: "ସ୍ଥାନ ବୈକଳ୍ପିକ। ସମନ୍ୱୟ କେବେ ସଂରକ୍ଷିତ, ଲଗ୍ କିମ୍ବା ସାର୍ବଜନୀନ ହୁଏ ନାହିଁ।",
    useMyLocation: "ମୋ ସ୍ଥାନ ବ୍ୟବହାର କରନ୍ତୁ",
    enterManually: "ନିଜେ ଲେଖନ୍ତୁ",
    locating: "ସ୍ଥାନ ଅନୁମତି ଯାଞ୍ଚ ହେଉଛି...",
    locationReady: "ସ୍ଥାନ ମିଳିଲା। ତଳେ ପୂର୍ବପୂରଣ ଅଭିଯାନ କ୍ଷେତ୍ର ସମୀକ୍ଷା ଏବଂ ସମ୍ପାଦନ କରନ୍ତୁ।",
    locationPoor: "ସ୍ଥାନ ସଠିକତା କମ୍। ପ୍ରତ୍ୟେକ କ୍ଷେତ୍ର ଯାଞ୍ଚ କିମ୍ବା ନିଜେ ଲେଖନ୍ତୁ।",
    locationUnavailable: "ସ୍ଥାନ ମିଳିଲା ନାହିଁ। ନିଜେ ଲେଖି ଜାରି ରଖନ୍ତୁ।",
    locationAlreadyRequested: "ଏହି ସହି ସେସନରେ ସ୍ଥାନ ପୂର୍ବରୁ ଅନୁରୋଧ ହୋଇଛି। ନିଜେ ଲେଖନ୍ତୁ।",
    accuracy: "ସଠିକତା",
    submitWorking: "ସମର୍ଥନ ରେକର୍ଡ ହେଉଛି...",
    otpSending: "ପଠାଯାଉଛି...",
    otpVerifying: "ଯାଞ୍ଚ ହେଉଛି...",
    optionalNext: "ବୈକଳ୍ପିକ ପରବର୍ତ୍ତୀ ପଦକ୍ଷେପ",
    helpOrganise: "ଆପଣ ଏହି ଅଭିଯାନ ସଂଗଠିତ କରିବାରେ ସାହାଯ୍ୟ କରିବେ କି?",
    notNow: "ଏବେ ନୁହେଁ",
    learnMore: "ଅଧିକ ଜାଣନ୍ତୁ",
    becomeCoordinator: "ସମନ୍ୱୟକାରୀ ହୁଅନ୍ତୁ",
    coordinatorLearn: "ସମନ୍ୱୟକାରୀମାନେ ବର୍ତ୍ତମାନର ଅଭିଯାନ ପଦାନୁକ୍ରମ ମାଧ୍ୟମରେ ସତ୍ୟାପିତ ସ୍ଥାନୀୟ କାର୍ଯ୍ୟକଳାପ ସଂଗଠିତ କରନ୍ତି।",
    coordinatorHandoff: "ସୁରକ୍ଷା ପାଇଁ ଅଭିଯାନ ପରିଚାଳକଙ୍କୁ ସମନ୍ୱୟକାରୀ ନେଟୱର୍କରେ ଆମନ୍ତ୍ରିତ ସମନ୍ୱୟକାରୀ ସୃଷ୍ଟି କରିବାକୁ ପଡ଼ିବ।",
    coordinatorContact: "ଆମନ୍ତ୍ରଣ ଅନୁରୋଧ କରନ୍ତୁ",
    coordinatorPending: "ଆମନ୍ତ୍ରଣ ଅନୁରୋଧ ପଠାଯାଇଛି",
    nationwideReach: "ଦେଶବ୍ୟାପୀ ଅଭିଯାନ ପହଞ୍ଚ",
    statesReached: "ରାଜ୍ୟ / କେନ୍ଦ୍ରଶାସିତ ଅଞ୍ଚଳ",
    districtsReached: "ଜିଲ୍ଲା",
    paperSupporters: "କାଗଜ ସହି",
    remainingToGoal: "ଲକ୍ଷ୍ୟ ପାଇଁ ସତ୍ୟାପିତ ସମର୍ଥନ",
    structuredLocationTitle: "ନିଶ୍ଚିତ ପ୍ରଶାସନିକ ପଥ",
    structuredLocationHelp: "ଭାରତର ଭୂଗୋଳ ପଦାନୁକ୍ରମ ସହିତ ମେଳ ହୋଇଛି। ସହି ପୂର୍ବରୁ ପ୍ରତ୍ୟେକ କ୍ଷେତ୍ର ସମୀକ୍ଷା କରନ୍ତୁ।",
    paperReminderTitle: "ଆପଣ ପୂର୍ବରୁ କାଗଜରେ ସହି କରିଛନ୍ତି କି?",
    paperReminderWithCount: "{count} କାଗଜ ସହି ପୂର୍ବରୁ ଅନ୍ତର୍ଭୁକ୍ତ। ନକଲ ସୁରକ୍ଷିତ ଭାବେ ଚିହ୍ନଟ ପାଇଁ ସେହି ମୋବାଇଲ୍ ନମ୍ବର ବ୍ୟବହାର କରନ୍ତୁ।",
    paperReminderEmpty: "କାଗଜ ସିଟ୍‌ରେ ସହି କରିଥିଲେ ସେହି ମୋବାଇଲ୍ ନମ୍ବର ବ୍ୟବହାର କରନ୍ତୁ। ମୋଟରେ ଆସିବା ପୂର୍ବରୁ କାଗଜ ଏଣ୍ଟ୍ରି ସମୀକ୍ଷା ହୋଇପାରେ।",
    photo: {
      title: "ବୈକଳ୍ପିକ ଘରୋଇ ଫଟୋ",
      help: "ସହି ପରେ ପ୍ରୋଫାଇଲ୍ ଫଟୋ ଯୋଡ଼ନ୍ତୁ",
      selfie: "ସେଲ୍ଫି ନିଅନ୍ତୁ",
      rearCamera: "ପଛ କ୍ୟାମେରା",
      choosePhoto: "ଅପଲୋଡ୍",
      skip: "ଛାଡ଼ନ୍ତୁ",
      retake: "ପୁଣି ନିଅନ୍ତୁ",
      rotate: "ଘୁରାନ୍ତୁ",
      crop: "କ୍ରପ୍ / ଜୁମ୍",
      lighting: "ସମାନ ଆଲୋକ ରଖନ୍ତୁ ଏବଂ ମୁହଁକୁ ପ୍ରିଭ୍ୟୁ ଭିତରେ ରଖନ୍ତୁ। ଫଟୋ ଘରୋଇ ରହିବ।",
      upload: "ଘରୋଇ ଭାବେ ଅପଲୋଡ୍ କରନ୍ତୁ",
      uploading: "ଅପଲୋଡ୍ ହେଉଛି...",
      uploaded: "ଘରୋଇ ଫଟୋ ଅପଲୋଡ୍ ହେଲା।",
      invalidImage: "5 MB ପର୍ଯ୍ୟନ୍ତ JPEG, PNG କିମ୍ବା WebP ଛବି ବାଛନ୍ତୁ।",
      uploadFailed: "ଘରୋଇ ଫଟୋ ଅପଲୋଡ୍ ବିଫଳ।"
    }
  }
};

export function PublicCampaignPage({
  campaign,
  organization,
  metrics,
  authority,
  authorities,
  campaignSigners,
  publicForm,
  setPublicForm,
  publicMessage,
  lastSignedSigner,
  otpInput,
  setOtpInput,
  otpMessage,
  onSendOtp,
  onVerifyOtp,
  locationOverrides,
  locationDeletions,
  customLocations = [],
  onGrowthShare,
  onUploadSupporterPhoto,
  onSaveDraft,
  onCommunicationConsentChange,
  onSubmitMovementRequest,
  movementRequests,
  movementRequestsLoading = false,
  movementRequestsError = "",
  onRefreshMovementRequests,
  onSubmitCoordinatorApplication,
  onStartNewJourney,
  gpsAdapter = defaultPublicGpsAdapter,
  onSubmit
}: PublicCampaignPageProps) {
  const { language, t } = useTranslation();
  const isGoudhanExperience = isGoudhanProductionCampaign(campaign, organization);
  const isGaumataHost =
    typeof window !== "undefined" &&
    isGaumataPublicHostname(window.location.hostname);
  const isGaumataCampaignExperience = isGoudhanExperience && isGaumataHost;
  const campaignHeroImage = campaign.heroImage.trim();
  const displayCampaign: Campaign = isGoudhanExperience
    ? {
        ...campaign,
        title: t("goudhanCampaign.title"),
        description: t("goudhanCampaign.summary"),
        appealContent: t("goudhanCampaign.appeal"),
        socialShareText: t("goudhanCampaign.share"),
        thankYouMessage: t("goudhanCampaign.thankYou"),
        qrLabel: t("goudhanCampaign.qrLabel"),
        consentText: t("goudhanCampaign.consent"),
        heroImage: campaignHeroImage
      }
    : { ...campaign, heroImage: campaignHeroImage };
  const configuredAuthorityOptions = getAuthorityOptionsForCampaign(campaign, authorities);
  const publicAuthorityOptions = isGaumataCampaignExperience
    ? configuredAuthorityOptions
    : getPublicAuthorityOptions(campaign, authorities);
  const campaignConfiguredAuthority =
    getConfiguredAppealAuthority(campaign, authorities);
  const configuredAuthority = authority ?? campaignConfiguredAuthority;
  const hasConfiguredAuthority = Boolean(configuredAuthority);
  const showNeutralAuthority =
    isGaumataCampaignExperience && !hasConfiguredAuthority;
  const resolvedAuthority = configuredAuthority ?? getAppealAuthority(campaign);
  const isGlobalMode = getCampaignGeographyMode(campaign) === "global";
  const locationLabels = getCampaignLocationLabels(campaign);
  const signerRestrictionLevel = getEffectiveSignerLocationRestrictionLevel(campaign, organization);
  const restrictedPublicForm = applySignerLocationRestriction(campaign, publicForm, organization);
  const publicLocationForm =
    isGlobalMode && getCampaignScope(campaign) !== "global" && campaign.country && !restrictedPublicForm.country
      ? { ...restrictedPublicForm, country: campaign.country }
      : restrictedPublicForm;
  const restrictionMessage = getLocationRestrictionMessage(campaign, organization);
  const lockedLocation = {
    ...(isGlobalMode && getCampaignScope(campaign) !== "global" && campaign.country
      ? { country: campaign.country }
      : {}),
    ...getLockedLocationValues(campaign, signerRestrictionLevel)
  };
  const lockedLocationParts = formatLocationForCampaign(campaign, lockedLocation).split(", ").filter(Boolean);
  const requiredFields = campaign.requiredFields ?? [];
  const copy = publicSigningCopy[language];
  const experienceCopy = publicExperienceCopy[language];
  const addressLabel = isGoudhanExperience ? t("goudhanCampaign.villageLabel") : copy.addressLabel;
  const addressPlaceholder = isGoudhanExperience
    ? t("goudhanCampaign.villagePlaceholder")
    : copy.addressPlaceholder;
  const structuredLocationPath = useMemo(() => {
    const country = publicLocationForm.country || campaign.country || (isGlobalMode ? "" : "India");
    if (country && !["india", "in"].includes(country.trim().toLowerCase())) return [];
    return indiaGeographyService.resolveSuggestedHierarchy("IN", {
      country: country || "India",
      state: publicLocationForm.state,
      district: publicLocationForm.district,
      block: publicLocationForm.block,
      panchayat: publicLocationForm.panchayat,
      postalCode: publicLocationForm.postalCode
    });
  }, [
    campaign.country,
    isGlobalMode,
    publicLocationForm.block,
    publicLocationForm.country,
    publicLocationForm.district,
    publicLocationForm.panchayat,
    publicLocationForm.postalCode,
    publicLocationForm.state
  ]);
  const displayPublicMessage =
    publicMessage === "consent_required" ? t("public.consentRequiredInline") : publicMessage;
  const publicMessageIsError =
    publicMessage === "consent_required" || isPublicFailureMessage(displayPublicMessage);
  const otpMessageIsError = isPublicFailureMessage(otpMessage);
  const signerFieldLabel = (label: string, field: SignerRequiredField) =>
    requiredFields.includes(field) ? `${label} *` : label;
  const publicUrl = getCampaignPublicUrl(organization, campaign);
  const incomingReferralCode = useMemo(() => {
    if (typeof window === "undefined") return "";
    return normalizeReferralCode(new URLSearchParams(window.location.search).get("ref") ?? "");
  }, [campaign.id]);
  const incomingReferrer = findReferrer(campaignSigners, campaign.id, incomingReferralCode);
  const personalReferralCode =
    lastSignedSigner?.campaignId === campaign.id ? getSupporterReferralCode(lastSignedSigner) : "";
  const personalReferralUrl = personalReferralCode
    ? getCampaignReferralUrl(organization, campaign, personalReferralCode)
    : publicUrl;
  const configuredShareMessages = getConfiguredGrowthShareMessages({
    campaign: displayCampaign,
    organization,
    signer: lastSignedSigner,
    referralLink: personalReferralUrl,
    campaignProgress: metrics.progress,
    supporterCount: metrics.total,
    verifiedSupporters: metrics.verified
  });
  const shareMessages = isGoudhanExperience
    ? {
        ...configuredShareMessages,
        whatsapp: `${displayCampaign.socialShareText}\n${personalReferralUrl}`,
        emailSubject: displayCampaign.title,
        emailBody: `${displayCampaign.socialShareText}\n${personalReferralUrl}`,
        social: displayCampaign.socialShareText,
        instagramCaption: displayCampaign.socialShareText
      }
    : configuredShareMessages;
  const [copiedReferral, setCopiedReferral] = useState("");
  const [wizardStep, setWizardStep] = useState<SigningStepId>(publicForm.otpVerified ? "profile" : "phone");
  const [restoredDraftStorageKey, setRestoredDraftStorageKey] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [postSignPanel, setPostSignPanel] = useState<InvolvementPanel>("none");
  const [coordinatorLearnMore, setCoordinatorLearnMore] = useState(false);
  const [communicationConsent, setCommunicationConsent] = useState(false);
  const [appealConsent, setAppealConsent] = useState(false);
  const [campaignConsent, setCampaignConsent] = useState(false);
  const [photoPanelDismissed, setPhotoPanelDismissed] = useState(false);
  const [volunteerSkills, setVolunteerSkills] = useState("");
  const [volunteerInterests, setVolunteerInterests] = useState("");
  const [volunteerAvailability, setVolunteerAvailability] = useState("");
  const [volunteerWorkingArea, setVolunteerWorkingArea] = useState("");
  const [volunteerConsent, setVolunteerConsent] = useState(false);
  const [coordinatorLevel, setCoordinatorLevel] =
    useState<ParticipationRequestLevel>("ward");
  const [coordinatorMinimumLevel, setCoordinatorMinimumLevel] =
    useState<ParticipationRequestLevel | "">("");
  const [coordinatorLocation, setCoordinatorLocation] = useState<LocationWithPin>({
    country: "India",
    state: "",
    district: "",
    block: "",
    panchayat: "",
    postalCode: ""
  });
  const [coordinatorWard, setCoordinatorWard] = useState("");
  const [coordinatorExperience, setCoordinatorExperience] = useState("");
  const [coordinatorMotivation, setCoordinatorMotivation] = useState("");
  const [coordinatorAvailability, setCoordinatorAvailability] = useState("");
  const [coordinatorConsent, setCoordinatorConsent] = useState(false);
  const [submittingMovementRequest, setSubmittingMovementRequest] = useState(false);
  const [savedMovementRequests, setSavedMovementRequests] =
    useState<PublicParticipationRequest[]>([]);
  const [showMovementDashboard, setShowMovementDashboard] = useState(false);
  const [movementRequestError, setMovementRequestError] = useState("");
  const movementRequestAttemptRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const publicMessageRef = useRef<HTMLParagraphElement>(null);
  const movementRequestResultRef = useRef<HTMLHeadingElement>(null);
  const previousWizardStepRef = useRef<SigningStepId>(wizardStep);
  const hasSignedCampaign = lastSignedSigner?.campaignId === campaign.id;
  const campaignGoal = getCampaignGoalValue(campaign);
  const configuredCampaignGoal =
    Number.isFinite(campaign.goal) && campaign.goal > 0 ? campaign.goal : null;
  const signingCampaignScope = useMemo(
    () => ({ campaignId: campaign.id, slug: campaign.slug }),
    [campaign.id, campaign.slug]
  );
  const draftStorageKey = getPublicSigningJourneyStorageKey(signingCampaignScope);
  const isRequired = (field: SignerRequiredField) => requiredFields.includes(field);
  const locationRequired = requiredFields.some((field) =>
    ["country", "state", "district", "block", "panchayat", "postalCode"].includes(field)
  );
  const detailsRequired = Boolean(restrictionMessage || locationRequired || isRequired("address"));
  const hasOptionalDetails = Boolean(
    publicForm.country ||
      publicForm.state ||
      publicForm.district ||
      publicForm.block ||
      publicForm.panchayat ||
      publicForm.postalCode ||
      publicForm.address ||
      publicForm.whatsappNumber ||
      publicForm.telegramHandle ||
      publicForm.referredByPhoneOrCode
  );
  const activeSigningSteps = signingSteps.filter(
    (step) => step.id !== "address" || detailsRequired || hasOptionalDetails || wizardStep === "address"
  );
  const activeStepIndex = Math.max(0, activeSigningSteps.findIndex((step) => step.id === wizardStep));
  const phoneDigits = publicForm.phone.replace(/\D/g, "");
  const phoneReady =
    /^[0-9+()\s-]+$/.test(publicForm.phone.trim()) &&
    phoneDigits.length >= 8 &&
    phoneDigits.length <= 15;
  const otpReady = /^\d{6}$/.test(otpInput.trim());
  const emailReady = publicForm.email.trim()
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicForm.email.trim())
    : !isRequired("email");
  const profileReady =
    (!isRequired("name") || Boolean(publicForm.name.trim())) && emailReady;
  const detailsReady = requiredFields
    .filter((field) =>
      ["country", "state", "district", "block", "panchayat", "postalCode", "address"].includes(field)
    )
    .every((field) => Boolean(restrictedPublicForm[field]?.trim()));
  const requiredConsentsAccepted = appealConsent && campaignConsent;
  const currentStepLabel =
    wizardStep === "review" ? t("public.review") : copy.steps[wizardStep];
  const stepProgressLabel = t("public.stepProgress")
    .replace("{current}", String(activeStepIndex + 1))
    .replace("{total}", String(activeSigningSteps.length))
    .replace("{step}", currentStepLabel);
  const heroSummary =
    displayCampaign.description.trim() ||
    t("public.defaultCampaignSummary").replace("{campaign}", displayCampaign.title);
  const localizedGoudhanUpdate = renderCampaignMessage(t("goudhanCampaign.latestUpdate"),
    { ...displayCampaign, shareUrl: publicUrl },
    metrics
  );
  const campaignUpdates = campaign.participantUpdateMessage.trim()
    ? [
        isGoudhanExperience
          ? localizedGoudhanUpdate
          : renderCampaignMessage(
              campaign.participantUpdateMessage,
              { ...displayCampaign, shareUrl: publicUrl },
              metrics
            )
      ]
    : [];
  const youtubeEmbedUrl = getYouTubeEmbedUrl(campaign.campaignVideoUrl);
  const hasCampaignMedia = Boolean(displayCampaign.heroImage || campaign.campaignVideoUrl.trim());
  const authorityCards = (
    showNeutralAuthority
      ? []
      : campaign.authoritySelectionMode === "public_choice" && publicAuthorityOptions.length > 0
        ? publicAuthorityOptions
        : [resolvedAuthority]
  ).slice(0, 3);
  const storyCards = [
    {
      icon: <HeartHandshake size={20} />,
      title: t("public.story.publicAsk"),
      body: displayCampaign.appealContent || displayCampaign.description
    },
    ...(showNeutralAuthority
      ? []
      : [{
          icon: <Landmark size={20} />,
          title: t("public.story.recipient"),
          body: formatAuthorityDisplay(resolvedAuthority)
        }]),
    {
      icon: <CalendarDays size={20} />,
      title: t("public.story.window"),
      body: [campaign.startDate, campaign.endDate].filter(Boolean).join(` ${t("public.to")} `)
    }
  ].filter((item) => item.body.trim());
  const movementMatterCards = [
    {
      icon: <ClipboardList size={20} />,
      title: t("public.movement.problem"),
      body: displayCampaign.description
    },
    {
      icon: <HeartHandshake size={20} />,
      title: t("public.movement.whyItMatters"),
      body: displayCampaign.appealContent
    },
    {
      icon: <Landmark size={20} />,
      title: t("public.movement.desiredChange"),
      body: displayCampaign.appealContent
    },
    {
      icon: <Users size={20} />,
      title: t("public.movement.supporterHelp"),
      body: displayCampaign.socialShareText || displayCampaign.appealContent
    }
  ].filter((item) => item.body.trim());
  const movementTrustItems = [
    campaign.status === "Published"
      ? {
          icon: <CheckCircle2 size={20} />,
          label: t("public.movement.campaignStatus"),
          value: t("campaignAdmin.status.published"),
          href: undefined
        }
      : null,
    organization?.name.trim()
      ? {
          icon: <Users size={20} />,
          label: t("public.movement.organiser"),
          value: organization.name.trim(),
          href: undefined
        }
      : null,
    campaignConfiguredAuthority
      ? {
          icon: <Landmark size={20} />,
          label: t("public.movement.receivingAuthority"),
          value: formatAuthorityDisplay(campaignConfiguredAuthority),
          href: undefined
        }
      : null,
    displayCampaign.consentText.trim()
      ? {
          icon: <ShieldCheck size={20} />,
          label: t("public.movement.transparency"),
          value: displayCampaign.consentText.trim(),
          href: undefined
        }
      : null,
    campaign.adminEmail.trim()
      ? {
          icon: <Mail size={20} />,
          label: t("public.movement.campaignContact"),
          value: campaign.adminEmail.trim(),
          href: `mailto:${campaign.adminEmail.trim()}`
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const movementFaqItems = [
    {
      question: t("public.movement.faqWhyJoin"),
      answer: displayCampaign.description
    },
    {
      question: t("public.movement.faqInformation"),
      answer: displayCampaign.consentText
    },
    {
      question: t("public.movement.faqVolunteer"),
      answer: t("public.movement.faqVolunteerAnswer")
    },
    {
      question: t("public.movement.faqSubmission"),
      answer: campaignConfiguredAuthority
        ? t("public.movement.faqSubmissionConfigured").replace(
            "{authority}",
            formatAuthorityDisplay(campaignConfiguredAuthority)
          )
        : t("public.movement.faqSubmissionPending")
    },
    ...(organization?.name.trim()
      ? [{
          question: t("public.movement.faqOrganising"),
          answer: t("public.movement.faqOrganisingAnswer").replace(
            "{organiser}",
            organization.name.trim()
          )
        }]
      : [])
  ].filter((item) => item.answer.trim());
  const minimumCoordinatorLevels = getMinimumParticipationLevels(coordinatorLevel);
  const coordinatorRequiredFields: SignerRequiredField[] =
    coordinatorLevel === "national"
      ? []
      : coordinatorLevel === "state"
        ? ["state"]
        : coordinatorLevel === "district"
          ? ["state", "district"]
          : coordinatorLevel === "block"
            ? ["state", "district", "block"]
            : ["state", "district", "block", "panchayat"];
  const coordinatorLocationReady =
    coordinatorRequiredFields.every((field) =>
      Boolean(coordinatorLocation[field as keyof LocationWithPin]?.trim())
    )
    && (coordinatorLevel !== "ward" || Boolean(coordinatorWard.trim()));
  const requestConsentVersion = createConsentVersion(displayCampaign.consentText);
  const savedMovementRequest = savedMovementRequests[0] ?? null;
  const requestDateLocale =
    language === "hi" ? "hi-IN" : language === "or" ? "or-IN" : "en-IN";
  const shareText = `${shareMessages.social}\n${personalReferralUrl}`;
  const whatsappText = shareMessages.whatsapp.includes(personalReferralUrl)
    ? shareMessages.whatsapp
    : `${shareMessages.whatsapp || shareMessages.social}\n${personalReferralUrl}`;
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(whatsappText || shareText)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(personalReferralUrl)}&text=${encodeURIComponent(shareMessages.social)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(personalReferralUrl)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(personalReferralUrl)}&text=${encodeURIComponent(shareMessages.social)}`,
    email: `mailto:?subject=${encodeURIComponent(shareMessages.emailSubject)}&body=${encodeURIComponent(shareMessages.emailBody)}`
  };
  const nativeShareSupported =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const locationFields = isGoudhanExperience ? (
    <IndiaLocationFields
      idPrefix="public-signer-location"
      values={{ ...publicLocationForm, address: publicForm.address, country: "India" }}
      onChange={(values) =>
        setPublicForm(
          applySignerLocationRestriction(
            campaign,
            { ...publicForm, ...values, address: values.address ?? publicForm.address, country: "India" },
            organization
          )
        )
      }
      locationOverrides={locationOverrides}
      locationDeletions={locationDeletions}
      allowedLocation={lockedLocation}
      hiddenLockedLevel={signerRestrictionLevel}
      requiredFields={requiredFields}
      labelOverrides={copy.locationLabels}
      fixedCountry="India"
      verifiedSuggestionsOnly
      customLocations={customLocations}
    />
  ) : isGlobalMode ? (
    <GlobalLocationFields
      idPrefix="public-signer-location"
      values={publicLocationForm}
      onChange={(values) =>
        setPublicForm(applySignerLocationRestriction(campaign, { ...publicForm, ...values }, organization))
      }
      allowedLocation={lockedLocation}
      hiddenLockedLevel={signerRestrictionLevel}
      requiredFields={requiredFields}
      labelOverrides={copy.locationLabels}
    />
  ) : (
    <IndiaLocationFields
      idPrefix="public-signer-location"
      values={{ ...restrictedPublicForm, address: publicForm.address }}
      onChange={(values) =>
        setPublicForm(applySignerLocationRestriction(campaign, { ...publicForm, ...values, address: values.address ?? publicForm.address }, organization))
      }
      locationOverrides={locationOverrides}
      locationDeletions={locationDeletions}
      allowedLocation={lockedLocation}
      hiddenLockedLevel={signerRestrictionLevel}
      requiredFields={requiredFields}
      labelOverrides={copy.locationLabels}
      customLocations={customLocations}
    />
  );

  useEffect(() => {
    if (!incomingReferralCode) return;
    setPublicForm((current) =>
      current.referredByPhoneOrCode
        ? current
        : { ...current, referredByPhoneOrCode: incomingReferralCode, referralSource: "url" }
    );
  }, [incomingReferralCode, setPublicForm]);

  useEffect(() => {
    if (typeof window === "undefined" || restoredDraftStorageKey === draftStorageKey) return;
    const saved = readPublicSigningDraft(window.sessionStorage, signingCampaignScope);
    if (saved?.form) {
      setPublicForm((current) =>
        clearPublicSigningOtpState({
          ...current,
          ...saved.form
        })
      );
    }
    setWizardStep("phone");
    setCommunicationConsent(false);
    setAppealConsent(false);
    setCampaignConsent(false);
    setRestoredDraftStorageKey(draftStorageKey);
  }, [draftStorageKey, restoredDraftStorageKey, setPublicForm, signingCampaignScope]);

  useEffect(() => {
    if (restoredDraftStorageKey !== draftStorageKey || typeof window === "undefined") return;
    if (hasSignedCampaign) {
      clearPublicSigningJourney(window.sessionStorage, signingCampaignScope);
      return;
    }
    writePublicSigningDraft(window.sessionStorage, signingCampaignScope, publicForm);
  }, [draftStorageKey, restoredDraftStorageKey, hasSignedCampaign, publicForm, signingCampaignScope]);

  useEffect(() => {
    if (!onSaveDraft || !publicForm.otpVerified || !publicForm.otpVerificationToken || hasSignedCampaign) return;
    const timer = window.setTimeout(() => {
      void onSaveDraft();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    hasSignedCampaign,
    onSaveDraft,
    publicForm,
    publicForm.otpVerificationToken,
    publicForm.otpVerified
  ]);

  useEffect(() => {
    if (hasSignedCampaign && wizardStep !== "done") {
      setCommunicationConsent(false);
      setAppealConsent(false);
      setCampaignConsent(false);
      setWizardStep("done");
      return;
    }
    if (publicForm.otpVerified && (wizardStep === "phone" || wizardStep === "otp")) {
      setWizardStep("profile");
      return;
    }
    if (
      !hasSignedCampaign &&
      !publicForm.otpVerified &&
      wizardStep !== "phone" &&
      wizardStep !== "otp"
    ) {
      setWizardStep("phone");
    }
  }, [hasSignedCampaign, publicForm.otpVerified, wizardStep]);

  useEffect(() => {
    if (previousWizardStepRef.current === wizardStep) return;
    previousWizardStepRef.current = wizardStep;
    const frame = window.requestAnimationFrame(() => stepHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [wizardStep]);

  useEffect(() => {
    if (!publicMessageIsError || !displayPublicMessage) return;
    const frame = window.requestAnimationFrame(() => publicMessageRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [displayPublicMessage, publicMessageIsError]);

  useEffect(() => {
    if (!hasSignedCampaign || !lastSignedSigner) return;
    setCoordinatorLocation((current) => {
      if (current.state || current.district || current.block || current.panchayat) return current;
      return {
        country: lastSignedSigner.country || "India",
        state: lastSignedSigner.state || "",
        district: lastSignedSigner.district || "",
        block: lastSignedSigner.block || "",
        panchayat: lastSignedSigner.panchayat || "",
        postalCode: lastSignedSigner.postalCode || ""
      };
    });
    setCoordinatorWard((current) => current || lastSignedSigner.address || "");
  }, [hasSignedCampaign, lastSignedSigner]);

  useEffect(() => {
    if (!movementRequests) return;
    setSavedMovementRequests(movementRequests);
  }, [movementRequests]);

  async function persistMovementRequest(request: ParticipationRequestSubmission) {
    if (!onSubmitMovementRequest || submittingMovementRequest) return;
    const fingerprint = participationRequestFingerprint(request);
    if (movementRequestAttemptRef.current?.fingerprint !== fingerprint) {
      movementRequestAttemptRef.current = {
        fingerprint,
        idempotencyKey: createParticipationRequestIdempotencyKey()
      };
    }
    setSubmittingMovementRequest(true);
    setMovementRequestError("");
    try {
      const saved = await onSubmitMovementRequest(
        request,
        movementRequestAttemptRef.current.idempotencyKey
      );
      setSavedMovementRequests((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id && item.requestType !== saved.requestType)
      ]);
      movementRequestAttemptRef.current = null;
      window.requestAnimationFrame(() => movementRequestResultRef.current?.focus());
    } catch (error) {
      const code = participationRequestErrorCode(error);
      setMovementRequestError(
        code
          ? `${t(`public.requests.error.${code}`)} (${code})`
          : t("public.requests.retry")
      );
    } finally {
      setSubmittingMovementRequest(false);
    }
  }

  async function submitVolunteerMovementRequest() {
    if (!volunteerConsent) return;
    await persistMovementRequest({
      requestType: "volunteer",
      requestedRole: "volunteer",
      geographicScope: {
        country: lastSignedSigner?.country || "India",
        state: lastSignedSigner?.state || "",
        district: lastSignedSigner?.district || "",
        block: lastSignedSigner?.block || "",
        panchayat: lastSignedSigner?.panchayat || ""
      },
      skills: parseParticipationRequestList(volunteerSkills),
      areasOfInterest: parseParticipationRequestList(volunteerInterests),
      availability: volunteerAvailability.trim(),
      preferredWorkingArea: volunteerWorkingArea.trim(),
      consent: {
        granted: true,
        version: requestConsentVersion,
        policyId: requestConsentVersion
      }
    });
  }

  async function submitCoordinatorMovementRequest() {
    if (!coordinatorConsent || !coordinatorLocationReady) return;
    await persistMovementRequest({
      requestType: "coordinator",
      requestedRole: "coordinator",
      preferredLevel: coordinatorLevel,
      minimumAcceptableLevel: coordinatorMinimumLevel || undefined,
      geographicScope: {
        country: coordinatorLocation.country || "India",
        state: coordinatorLocation.state,
        district: coordinatorLocation.district,
        block: coordinatorLocation.block,
        panchayat: coordinatorLocation.panchayat,
        ward: coordinatorWard.trim()
      },
      motivation: coordinatorMotivation.trim(),
      experience: coordinatorExperience.trim(),
      availability: coordinatorAvailability.trim(),
      consent: {
        granted: true,
        version: requestConsentVersion,
        policyId: requestConsentVersion
      }
    });
  }

  async function handleSendOtpWizard() {
    if (sendingOtp || !publicForm.phone.trim()) {
      if (!publicForm.phone.trim()) await onSendOtp();
      return;
    }
    setSendingOtp(true);
    try {
      const sent = await onSendOtp();
      if (sent === false) return;
      setWizardStep("otp");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtpWizard() {
    if (verifyingOtp) return;
    setVerifyingOtp(true);
    try {
      await onVerifyOtp();
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handlePublicSubmit(event: FormEvent) {
    if (wizardStep !== "review") {
      event.preventDefault();
      if (wizardStep === "phone" && phoneReady) {
        await handleSendOtpWizard();
      } else if (wizardStep === "otp" && otpReady) {
        await handleVerifyOtpWizard();
      } else if (wizardStep === "profile" && profileReady) {
        setWizardStep(detailsRequired ? "address" : "review");
      } else if (wizardStep === "address" && detailsReady) {
        setWizardStep("review");
      }
      return;
    }
    if (submitting) {
      event.preventDefault();
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(event);
    } finally {
      setSubmitting(false);
    }
  }

  function handleStartNewJourney() {
    setCommunicationConsent(false);
    setAppealConsent(false);
    setCampaignConsent(false);
    onStartNewJourney();
  }

  async function requestSmartLocation() {
    if (locationRequested) {
      setLocationMessage(experienceCopy.locationAlreadyRequested);
      return;
    }
    setLocationRequested(true);
    setLocationMessage(experienceCopy.locating);
    if (!gpsAdapter.isAvailable()) {
      setLocationMessage(experienceCopy.locationUnavailable);
      return;
    }
    try {
      const reading = await gpsAdapter.requestPosition({
        enableHighAccuracy: true,
        timeoutMs: 10_000,
        maximumAgeMs: 120_000
      });
      const accuracy = Math.round(reading.accuracyMeters);
      setLocationAccuracy(accuracy);
      const assignmentPrefill = {
        country: publicForm.country || campaign.country || (isGlobalMode ? "" : "India"),
        state: publicForm.state || campaign.state,
        district: publicForm.district || campaign.district,
        block: publicForm.block || campaign.block,
        panchayat: publicForm.panchayat || campaign.panchayat,
        postalCode: publicForm.postalCode || campaign.postalCode
      };
      setPublicForm(
        applySignerLocationRestriction(
          campaign,
          { ...publicForm, ...assignmentPrefill },
          organization
        )
      );
      setLocationMessage(
        accuracy > 250 ? experienceCopy.locationPoor : experienceCopy.locationReady
      );
    } catch {
      setLocationAccuracy(null);
      setLocationMessage(experienceCopy.locationUnavailable);
    }
  }

  async function copyReferralText(
    label: string,
    value: string,
    channel: GrowthShareContext["channel"] = "copy"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedReferral(t("public.copied"));
      onGrowthShare?.({ channel, url: value });
    } catch {
      setCopiedReferral(t("public.copyFailed"));
    }
  }

  function trackShareClick(channel: GrowthShareContext["channel"]) {
    onGrowthShare?.({ channel, url: personalReferralUrl });
  }

  function downloadActQr() {
    trackShareClick("qr");
    downloadQrPosterSvg({
      campaign: displayCampaign,
      organizationName: isGoudhanExperience ? t("goudhanCampaign.brandName") : organization?.name ?? "VoiceUp",
      url: personalReferralUrl,
      referralCode: personalReferralCode
    });
  }

  async function shareNatively() {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: displayCampaign.title,
        text: shareMessages.social,
        url: personalReferralUrl
      });
      trackShareClick("native");
    } catch {
      // Cancellation and browser share failures are intentionally not recorded.
    }
  }

  return (
    <section
      className="public-layout public-campaign-modern"
      data-wizard-step={wizardStep}
      data-goudhan-experience={isGoudhanExperience ? "true" : undefined}
      data-gaumata-host={isGaumataCampaignExperience ? "true" : undefined}
    >
      <div className="public-story-column">
        <article
          className={displayCampaign.heroImage ? "campaign-page campaign-page-with-media" : "campaign-page"}
          style={{
            backgroundImage: displayCampaign.heroImage
              ? `linear-gradient(135deg, rgba(4, 13, 31, 0.82), rgba(4, 13, 31, 0.46)), url(${displayCampaign.heroImage})`
              : undefined,
            backgroundPosition: campaign.heroImagePosition,
            backgroundSize: `${campaign.heroImageZoom}%`
          }}
        >
          <div className="public-hero-surface">
            <div className="public-hero-content">
              {isGoudhanExperience && (
                <div className="goudhan-public-brand" aria-label={t("goudhanCampaign.brandName")}>
                  <span>{t("goudhanCampaign.tagline")}</span>
                  {isGaumataCampaignExperience && (
                    <small className="goudhan-powered-by">{t("goudhanCampaign.poweredByVoiceUp")}</small>
                  )}
                </div>
              )}
              <div className="public-hero-kicker">
                <span className="eyebrow">
                  {isGoudhanExperience
                    ? t("public.movement.publicCampaign")
                    : t("public.verifiedCampaign")}
                </span>
                <span className="status-pill" data-status={campaign.status}>{t(`campaignAdmin.status.${campaign.status.toLowerCase()}`)}</span>
              </div>
              <h1>{displayCampaign.title}</h1>
              {!isGoudhanExperience && language !== "en" && <span className="original-language-notice">{t("public.originalLanguageNotice")}</span>}
              <p className="public-summary">{heroSummary}</p>
              <div className="public-hero-actions">
                <a className="primary-button" href="#public-sign-form">
                  {isGoudhanExperience ? t("goudhanCampaign.joinMovement") : t("public.signInMinutes")} <ArrowRight size={18} />
                </a>
                {!isGoudhanExperience && nativeShareSupported && (
                  <button className="secondary-button" type="button" onClick={shareNatively}>
                    <Share2 size={18} /> {t("public.shareCampaign")}
                  </button>
                )}
              </div>
            </div>

            {(!isGoudhanExperience || configuredCampaignGoal !== null) && (
              <div className="public-progress public-progress-premium" aria-label={t("public.campaignProgress")}>
                <div className="progress-header">
                  <span>{t("public.liveProgress")}</span>
                  <strong>{metrics.progress}%</strong>
                </div>
                <div className="progress public-progress-bar">
                  <div style={{ width: `${metrics.progress}%` }} />
                </div>
                <div>
                  <strong>{metrics.verified.toLocaleString()}</strong>
                  <span>
                    {t("public.verifiedGoal").replace(
                      "{goal}",
                      (isGoudhanExperience ? configuredCampaignGoal ?? 0 : campaignGoal).toLocaleString()
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="supporter-counter" aria-label={t("public.supporterCount")}>
              <div>
                <Users size={18} />
                <span>{t("public.totalSupporters")}</span>
                <strong>{metrics.total.toLocaleString()}</strong>
              </div>
              <div>
                <BadgeCheck size={18} />
                <span>{t("public.verifiedSupporters")}</span>
                <strong>{metrics.verified.toLocaleString()}</strong>
              </div>
            </div>

            <div className="public-trust-strip" aria-label={t("public.trustIndicators")}>
              <span><ShieldCheck size={16} /> {t("public.privacyRespected")}</span>
              <span>
                <LockKeyhole size={16} />{" "}
                {isGoudhanExperience ? t("public.movement.otpProtected") : t("public.otpVerified")}
              </span>
              <span>
                {showNeutralAuthority ? <Landmark size={16} /> : <CheckCircle2 size={16} />}
                {showNeutralAuthority
                  ? t("public.authorityNotConfigured")
                  : isGoudhanExperience
                    ? t("public.movement.authorityConfigured")
                    : t("public.routedToAuthority")}
              </span>
            </div>
          </div>
        </article>

        <VoiceUpStoryCarousel
          experience="publicCampaign"
          className="voiceup-story-carousel--compact"
          slideIds={["objective", "evidence", "progress", "afterSigning", "share"]}
          mediaBySlide={displayCampaign.heroImage ? { objective: { imageUrl: displayCampaign.heroImage } } : undefined}
          lazyLoadImages
        />

        {isGoudhanExperience && (
          <section className="public-section movement-matters" aria-labelledby="movement-matters-heading">
            <div className="public-section-heading">
              <span className="eyebrow">{t("goudhanCampaign.brandName")}</span>
              <h2 id="movement-matters-heading">{t("public.movement.whyTitle")}</h2>
              <p>{t("public.movement.whyHelp")}</p>
            </div>
            <div className="movement-matters-grid">
              {movementMatterCards.map((item) => (
                <article className="movement-matter-card" key={item.title}>
                  {item.icon}
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {!hasSignedCampaign && (
          <section className="public-section public-share-panel" aria-labelledby="share-campaign-heading">
            <div className="public-section-heading">
              <span className="eyebrow">{t("public.shareThisCampaign")}</span>
              <h2 id="share-campaign-heading">{t("public.shareImpact")}</h2>
            </div>
            <div className="share-panel-grid">
              <div className="share-qr-card">
                <ReferralQrPreview value={personalReferralUrl} label={t("public.campaignQr")} caption={displayCampaign.qrLabel} compact />
                <code>{personalReferralUrl}</code>
                {copiedReferral && <span className="inline-copy-state">{copiedReferral}</span>}
              </div>
              <div className="share-actions-grid">
                <button className="secondary-button" type="button" onClick={() => copyReferralText(t("public.campaignLink"), personalReferralUrl, "copy")}>
                  <Copy size={16} /> {t("public.copyLink")}
                </button>
                {nativeShareSupported && (
                  <button className="secondary-button" type="button" onClick={shareNatively}>
                    <Share2 size={16} /> {t("public.share")}
                  </button>
                )}
                <a className="secondary-link-button" href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => trackShareClick("whatsapp")}>WhatsApp</a>
                <a className="secondary-link-button" href={shareLinks.telegram} target="_blank" rel="noreferrer" onClick={() => trackShareClick("telegram")}>Telegram</a>
                <a className="secondary-link-button" href={shareLinks.facebook} target="_blank" rel="noreferrer" onClick={() => trackShareClick("facebook")}>Facebook</a>
                <a className="secondary-link-button" href={shareLinks.email} onClick={() => trackShareClick("email")}><Mail size={16} /> {t("public.email")}</a>
              </div>
            </div>
          </section>
        )}

        <section className="public-section" aria-labelledby="authority-heading">
          <div className="public-section-heading">
            <span className="eyebrow">{t("public.authorityPath")}</span>
            <h2 id="authority-heading">{t("public.authorityPathHelp")}</h2>
          </div>
          <div className="public-card-grid authority-card-grid">
            {showNeutralAuthority ? (
              <article className="authority-card-modern authority-card-neutral">
                <Landmark size={22} />
                <strong>{t("public.authorityNotConfigured")}</strong>
                <p>{t("public.authorityNotConfiguredHelp")}</p>
              </article>
            ) : (
              authorityCards.map((item) => (
                <article className="authority-card-modern" key={item.id || item.name}>
                  <Landmark size={22} />
                  <span>{item.level}</span>
                  <strong>{item.name}</strong>
                  <p>{formatAuthorityDisplay(item)}</p>
                </article>
              ))
            )}
          </div>
        </section>

        {!isGoudhanExperience && (
          <section className="public-section" aria-labelledby="story-heading">
            <div className="public-section-heading">
              <span className="eyebrow">{t("public.campaignStory")}</span>
              <h2 id="story-heading">{t("public.campaignStoryHelp")}</h2>
            </div>
            <div className="public-card-grid story-card-grid">
              {storyCards.map((item) => (
                <article className="story-card" key={item.title}>
                  {item.icon}
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {isGoudhanExperience && (
          <section className="public-section movement-media" aria-labelledby="campaign-media-heading">
            <div className="public-section-heading">
              <span className="eyebrow">{t("goudhanCampaign.brandName")}</span>
              <h2 id="campaign-media-heading">{t("public.movement.mediaTitle")}</h2>
              <p>{t("public.movement.mediaHelp")}</p>
            </div>
            {hasCampaignMedia ? (
              <div className="movement-media-grid">
                {displayCampaign.heroImage && (
                  <figure className="movement-media-card">
                    <img
                      src={displayCampaign.heroImage}
                      alt={t("public.movement.bannerAlt").replace(
                        "{campaign}",
                        displayCampaign.title
                      )}
                      loading="lazy"
                    />
                  </figure>
                )}
                {youtubeEmbedUrl ? (
                  <div className="movement-video-frame">
                    <iframe
                      src={youtubeEmbedUrl}
                      title={t("public.movement.videoTitle").replace(
                        "{campaign}",
                        displayCampaign.title
                      )}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : campaign.campaignVideoUrl.trim() ? (
                  <a
                    className="secondary-link-button movement-media-link"
                    href={campaign.campaignVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("public.movement.openMedia")}
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="public-empty-state">{t("public.movement.noMedia")}</p>
            )}
          </section>
        )}

        {isGoudhanExperience && (
          <section className="public-section goudhan-latest-update" aria-labelledby="latest-updates-heading">
            <div className="public-section-heading">
              <span className="eyebrow">{t("goudhanCampaign.brandName")}</span>
              <h2 id="latest-updates-heading">{t("public.movement.updatesTitle")}</h2>
              <p>{t("public.movement.updatesHelp")}</p>
            </div>
            {campaignUpdates.length > 0 ? (
              <div className="movement-update-list">
                {campaignUpdates.map((update, index) => (
                  <article className="movement-update-card" key={`${campaign.id}-update-${index}`}>
                    <p>{update}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="public-empty-state">{t("public.movement.noUpdates")}</p>
            )}
          </section>
        )}

        <section className="public-section" aria-labelledby="faq-heading">
          <div className="public-section-heading">
            <span className="eyebrow">{t("public.faq")}</span>
            <h2 id="faq-heading">{t("public.simpleAnswersBeforeSigning")}</h2>
          </div>
          <div className="faq-list">
            {isGoudhanExperience ? (
              movementFaqItems.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))
            ) : (
              <>
                <details>
                  <summary>{t("public.howLongSigningTakes")}</summary>
                  <p>{t("public.howLongSigningAnswer")}</p>
                </details>
                <details>
                  <summary>{t("public.whyOtpRequired")}</summary>
                  <p>{t("public.whyOtpRequiredAnswer")}</p>
                </details>
                <details>
                  <summary>{t("public.whatHappensAfterSigning")}</summary>
                  <p>{t("public.whatHappensAfterSigningAnswer")}</p>
                </details>
              </>
            )}
          </div>
        </section>

        {isGoudhanExperience && (
          <section className="public-section movement-volunteer" aria-labelledby="movement-volunteer-heading">
            <div className="public-section-heading">
              <span className="eyebrow">{t("public.movement.faqVolunteer")}</span>
              <h2 id="movement-volunteer-heading">{t("public.movement.volunteerTitle")}</h2>
              <p>{t("public.movement.volunteerHelp")}</p>
            </div>
            <a
              className="secondary-link-button movement-volunteer-cta"
              href="#public-sign-form"
              onClick={() => {
                if (hasSignedCampaign) setPostSignPanel("coordinator");
              }}
            >
              <Users size={18} /> {t("public.movement.helpOrganise")}
            </a>
          </section>
        )}

        {isGoudhanExperience && movementTrustItems.length > 0 && (
          <section className="public-section movement-trust" aria-labelledby="movement-trust-heading">
            <div className="public-section-heading">
              <span className="eyebrow">{t("public.trustIndicators")}</span>
              <h2 id="movement-trust-heading">{t("public.movement.trustTitle")}</h2>
              <p>{t("public.movement.trustHelp")}</p>
            </div>
            <div className="movement-trust-grid">
              {movementTrustItems.map((item) => (
                <article className="movement-trust-card" key={item.label}>
                  {item.icon}
                  <span>{item.label}</span>
                  {item.href ? <a href={item.href}>{item.value}</a> : <p>{item.value}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {!isGoudhanExperience && campaign.campaignVideoUrl && (
          <a className="video-link" href={campaign.campaignVideoUrl} target="_blank" rel="noreferrer">
            {t("public.watchCampaignVideo")}
          </a>
        )}
      </div>

      <Panel title={hasSignedCampaign ? copy.panelTitleComplete : copy.panelTitleSign} icon={<ClipboardList />}>
        <div className="public-mobile-campaign-summary">
          <span className="eyebrow">{experienceCopy.campaignAtGlance}</span>
          <strong>{displayCampaign.title}</strong>
          <p>{heroSummary}</p>
          <div className="public-mobile-progress">
            <progress max={100} value={metrics.progress}>{metrics.progress}%</progress>
            <span>{metrics.progress}% · {metrics.verified.toLocaleString()} {t("public.verifiedSupporters")}</span>
          </div>
        </div>
        <div className="public-language-selector">
          <LanguageSwitcher />
        </div>
        <div className="wizard-header">
          <span className="eyebrow">{copy.secureSigning}</span>
          <h2>{hasSignedCampaign ? copy.headerComplete : copy.headerActive}</h2>
          <p>{copy.headerHelp}</p>
          {!hasSignedCampaign && (
            <p className="public-step-progress" aria-live="polite">{stepProgressLabel}</p>
          )}
        </div>

        {publicForm.otpVerified && !hasSignedCampaign && (
          <div className="verified-welcome" aria-live="polite">
            <UserRound size={20} />
            <div>
              <strong>{t("public.welcomeBack")}</strong>
              <span>{copy.phoneVerified}</span>
            </div>
          </div>
        )}

        <ol className="wizard-steps" aria-label={t("public.signingSteps")}>
          {activeSigningSteps.map((step, index) => (
            <li key={step.id} aria-current={index === activeStepIndex ? "step" : undefined}>
              <div
                className={index === activeStepIndex ? "wizard-step is-active" : index < activeStepIndex ? "wizard-step is-complete" : "wizard-step"}
              >
                <span>{index + 1}</span>
                {step.id === "review" ? t("public.review") : copy.steps[step.id]}
              </div>
            </li>
          ))}
        </ol>

        <form
          id="public-sign-form"
          className="form-stack public-sign-form public-sign-wizard"
          aria-busy={sendingOtp || verifyingOtp || submitting}
          onSubmit={handlePublicSubmit}
        >
          <span className="sr-only" aria-live="polite">
            {sendingOtp
              ? experienceCopy.otpSending
              : verifyingOtp
                ? experienceCopy.otpVerifying
                : submitting
                  ? experienceCopy.submitWorking
                  : ""}
          </span>
          <p className="required-note">* {t("public.required")}</p>
          {incomingReferralCode && (
            <div className="referral-invite-note">
              <Share2 size={18} />
              <div>
                <strong>
                  {copy.invitedBy} {incomingReferrer ? getSafeReferrerLabel(incomingReferrer) : copy.invitedFallback}.
                </strong>
                <span>{copy.referralOptional}</span>
              </div>
            </div>
          )}

          {wizardStep === "phone" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <Smartphone size={22} />
                <h3 ref={stepHeadingRef} tabIndex={-1}>{copy.phoneTitle}</h3>
                <p id="public-phone-help">{copy.phoneHelp}</p>
              </div>
              <Field label={signerFieldLabel(t("public.phone"), "phone")}>
                <input
                  aria-label={t("public.phone")}
                  aria-describedby="public-phone-help public-phone-validation"
                  aria-invalid={Boolean(publicForm.phone.trim()) && !phoneReady}
                  placeholder={t("public.phone")}
                  value={publicForm.phone}
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  onChange={(event) => {
                    const phone = event.target.value;
                    handleStartNewJourney();
                    setPublicForm({
                      ...blankSigner,
                      phone,
                      referredByPhoneOrCode: publicForm.referredByPhoneOrCode,
                      referralSource: publicForm.referralSource
                    });
                  }}
                />
              </Field>
              <p
                id="public-phone-validation"
                className={publicForm.phone.trim() && !phoneReady ? "public-validation-hint is-error" : "public-validation-hint"}
                role={publicForm.phone.trim() && !phoneReady ? "alert" : undefined}
              >
                {t("public.phoneValidation")}
              </p>
              <button className="primary-button" type="button" disabled={sendingOtp || !phoneReady} aria-busy={sendingOtp} onClick={() => void handleSendOtpWizard()}>
                {sendingOtp ? experienceCopy.otpSending : t("public.sendOtp")} <ArrowRight size={18} />
              </button>
              {otpMessage && (
                <p
                  className={otpMessageIsError ? "error-message" : "info-message"}
                  role={otpMessageIsError ? "alert" : "status"}
                  aria-live={otpMessageIsError ? "assertive" : "polite"}
                >
                  {otpMessage}
                </p>
              )}
            </div>
          )}

          {wizardStep === "otp" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <LockKeyhole size={22} />
                <h3 ref={stepHeadingRef} tabIndex={-1}>{copy.otpTitle}</h3>
                <p id="public-otp-help">{copy.otpHelp}</p>
              </div>
              <div className="otp-box">
                <input
                  aria-label={t("public.enterOtp")}
                  aria-describedby="public-otp-help public-otp-validation"
                  aria-invalid={Boolean(otpInput.trim()) && !otpReady}
                  placeholder={t("public.enterOtp")}
                  value={otpInput}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <p
                  id="public-otp-validation"
                  className={otpInput.trim() && !otpReady ? "public-validation-hint is-error" : "public-validation-hint"}
                >
                  {t("public.otpValidation")}
                </p>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      handleStartNewJourney();
                      setWizardStep("phone");
                    }}
                  >
                    {t("public.changePhone")}
                  </button>
                  <button className="secondary-button" type="button" disabled={sendingOtp} onClick={() => void handleSendOtpWizard()}>
                    {sendingOtp ? experienceCopy.otpSending : copy.resendOtp}
                  </button>
                  <button className="primary-button" type="button" disabled={verifyingOtp || !otpReady} aria-busy={verifyingOtp} onClick={() => void handleVerifyOtpWizard()}>
                    {verifyingOtp ? experienceCopy.otpVerifying : t("public.verifyOtp")}
                  </button>
                </div>
                {publicForm.otpVerified && <span className="status-pill">{copy.phoneVerified}</span>}
                {otpMessage && (
                  <p
                    className={otpMessageIsError ? "error-message" : "info-message"}
                    role={otpMessageIsError ? "alert" : "status"}
                    aria-live={otpMessageIsError ? "assertive" : "polite"}
                  >
                    {otpMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {wizardStep === "profile" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <UserRound size={22} />
                <h3 ref={stepHeadingRef} tabIndex={-1}>{copy.profileTitle}</h3>
                <p>{copy.profileHelp}</p>
              </div>
              <Field label={signerFieldLabel(t("public.name"), "name")}>
                <input
                  aria-label={t("public.name")}
                  placeholder={t("public.name")}
                  value={publicForm.name}
                  required={isRequired("name")}
                  onChange={(event) => setPublicForm({ ...publicForm, name: event.target.value })}
                />
              </Field>
              {isRequired("email") && (
                <Field label={signerFieldLabel(copy.emailLabel, "email")}>
                  <input
                    aria-label={copy.emailLabel}
                    placeholder={copy.emailPlaceholder}
                    type="email"
                    value={publicForm.email}
                    required
                    onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
                  />
                </Field>
              )}
              {campaign.authoritySelectionMode === "public_choice" && (
                <Field label={copy.authorityLabel}>
                  <select
                    value={publicForm.selectedAuthorityId || publicAuthorityOptions[0]?.id || ""}
                    onChange={(event) => {
                      const selected = publicAuthorityOptions.find((item) => item.id === event.target.value);
                      setPublicForm({
                        ...publicForm,
                        selectedAuthorityId: event.target.value,
                        selectedAuthorityName: selected?.name ?? ""
                      });
                    }}
                  >
                    {publicAuthorityOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {formatAuthorityDisplay(option)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep("otp")}>{t("public.back")}</button>
                {!detailsRequired && (
                  <button className="secondary-button" type="button" onClick={() => setWizardStep("address")}>{copy.addOptionalDetails}</button>
                )}
                <button className="primary-button" type="button" disabled={!profileReady} onClick={() => setWizardStep(detailsRequired ? "address" : "review")}>{t("public.continue")} <ArrowRight size={18} /></button>
              </div>
              {!profileReady && <p className="public-validation-hint">{t("public.completeRequiredFields")}</p>}
            </div>
          )}

          {wizardStep === "address" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <MapPin size={22} />
                <h3 ref={stepHeadingRef} tabIndex={-1}>{copy.detailsTitle}</h3>
                <p>{copy.detailsHelp}</p>
              </div>
              <div className="public-smart-location">
                <div>
                  <strong>{experienceCopy.locationTitle}</strong>
                  <span>{experienceCopy.locationHelp}</span>
                </div>
                <div className="button-row">
                  <button className="secondary-button" type="button" disabled={locationRequested} onClick={requestSmartLocation}>
                    <MapPin size={17} /> {experienceCopy.useMyLocation}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setLocationMessage("")}>
                    {experienceCopy.enterManually}
                  </button>
                </div>
                {locationAccuracy !== null && (
                  <span className={locationAccuracy > 250 ? "public-location-accuracy is-poor" : "public-location-accuracy"}>
                    {experienceCopy.accuracy}: ±{locationAccuracy} m
                  </span>
                )}
                {locationMessage && <p role="status">{locationMessage}</p>}
                {structuredLocationPath.length > 1 && (
                  <div className="public-structured-location">
                    <strong>{experienceCopy.structuredLocationTitle}</strong>
                    <ol>
                      {structuredLocationPath.slice(1).map((node) => (
                        <li key={node.id}>
                          <span>
                            {node.level === "state"
                              ? locationLabels.state
                              : node.level === "district"
                                ? locationLabels.district
                                : node.level === "block"
                                  ? locationLabels.block
                                  : locationLabels.panchayat}
                          </span>
                          <b>{node.name}</b>
                        </li>
                      ))}
                    </ol>
                    <small>{experienceCopy.structuredLocationHelp}</small>
                  </div>
                )}
              </div>
              {(restrictionMessage || locationRequired) && (
                <div className="public-location-limit" aria-live="polite">
                  <MapPin size={18} aria-hidden="true" />
                  <div>
                    <strong>{copy.locationLimitTitle}</strong>
                    {lockedLocationParts.length > 0 ? (
                      <ul>
                        {lockedLocationParts.map((location) => (
                          <li key={location}>{location}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{restrictionMessage}</p>
                    )}
                  </div>
                </div>
              )}
              {(restrictionMessage || locationRequired) && locationFields}
              {!restrictionMessage && !locationRequired && locationFields}
              <Field label={isRequired("address") ? signerFieldLabel(addressLabel, "address") : addressLabel}>
                <input
                  aria-label={addressLabel}
                  placeholder={addressPlaceholder}
                  value={publicForm.address}
                  required={isRequired("address")}
                  onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
                />
              </Field>
              <details className="optional-details">
                <summary>{copy.optionalDetails}</summary>
                {!isRequired("email") && (
                  <Field label={copy.emailLabel}>
                    <input
                      aria-label={copy.emailLabel}
                      placeholder={copy.emailPlaceholder}
                      type="email"
                      value={publicForm.email}
                      onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
                    />
                  </Field>
                )}
                <Field label={copy.whatsappLabel}>
                  <input
                    aria-label={copy.whatsappLabel}
                    placeholder={copy.whatsappPlaceholder}
                    value={publicForm.whatsappNumber}
                    onChange={(event) => setPublicForm({ ...publicForm, whatsappNumber: event.target.value })}
                  />
                </Field>
                <Field label={copy.telegramLabel}>
                  <input
                    aria-label={copy.telegramLabel}
                    placeholder={copy.telegramPlaceholder}
                    value={publicForm.telegramHandle}
                    onChange={(event) => setPublicForm({ ...publicForm, telegramHandle: event.target.value })}
                  />
                </Field>
                <Field label={copy.referralLabel}>
                  <input
                    aria-label={copy.referralLabel}
                    placeholder={t("public.optional")}
                    value={publicForm.referredByPhoneOrCode ?? ""}
                    onChange={(event) =>
                      setPublicForm({
                        ...publicForm,
                        referredByPhoneOrCode: event.target.value,
                        referralSource: event.target.value.trim() ? "manual" : undefined
                      })
                    }
                  />
                  <small>{copy.referralHelp}</small>
                </Field>
              </details>
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep("profile")}>{t("public.back")}</button>
                <button className="primary-button" type="button" disabled={!detailsReady} onClick={() => setWizardStep("review")}>{t("public.review")} <ArrowRight size={18} /></button>
              </div>
              {!detailsReady && <p className="public-validation-hint">{t("public.completeRequiredFields")}</p>}
            </div>
          )}

          {wizardStep === "review" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <ClipboardList size={22} />
                <h3 ref={stepHeadingRef} tabIndex={-1}>{copy.reviewTitle}</h3>
                <p>{copy.reviewHelp}</p>
              </div>
              <div className="review-card">
                <span>{t("public.name")} <strong>{publicForm.name || copy.notEntered}</strong></span>
                <span>{t("public.phone")} <strong>{publicForm.phone || copy.notEntered}</strong></span>
                <span>
                  {copy.reviewAuthority}{" "}
                  <strong>
                    {showNeutralAuthority
                      ? t("public.authorityNotConfigured")
                      : publicForm.selectedAuthorityName || resolvedAuthority.name}
                  </strong>
                </span>
                <span>{copy.reviewReferral} <strong>{publicForm.referredByPhoneOrCode || copy.none}</strong></span>
              </div>
              <div className="trust-section" aria-label={copy.trustLabel}>
                <span><ShieldCheck size={18} /> {copy.privacyRespected}</span>
                <span><LockKeyhole size={18} /> {copy.storedSecurely}</span>
                <span>
                  {showNeutralAuthority ? <Landmark size={18} /> : <CheckCircle2 size={18} />}
                  {showNeutralAuthority ? t("public.authorityNotConfigured") : copy.routedAuthority}
                </span>
              </div>
              <fieldset className="public-consent-group">
                <legend>{t("public.consentChoices")}</legend>
                <label className="check-row">
                  <input required type="checkbox"
                    name="supportAppealConsent"
                    checked={appealConsent}
                    onChange={(event) => setAppealConsent(event.target.checked)}
                  />
                  <span><strong>{t("public.required")}</strong>{copy.supportCheckbox}</span>
                </label>
                <label className="check-row">
                  <input required type="checkbox"
                    name="campaignConsent"
                    checked={campaignConsent}
                    onChange={(event) => setCampaignConsent(event.target.checked)}
                  />
                  <span><strong>{t("public.required")}</strong>{displayCampaign.consentText}</span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    name="campaignCommunicationConsent"
                    checked={communicationConsent}
                    onChange={(event) => {
                      const granted = event.target.checked;
                      setCommunicationConsent(granted);
                      void onCommunicationConsentChange?.(granted);
                    }}
                  />
                  <span><strong>{t("public.optional")}</strong>{t("public.communicationConsentHelp")}</span>
                </label>
              </fieldset>
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep(detailsRequired || hasOptionalDetails ? "address" : "profile")}>{t("public.back")}</button>
                <button className="primary-button" type="submit" disabled={submitting || !requiredConsentsAccepted} aria-busy={submitting}>
                  <CheckCircle2 size={18} /> {submitting ? experienceCopy.submitWorking : t("public.submitSupport")}
                </button>
              </div>
              {!requiredConsentsAccepted && (
                <p className="public-validation-hint">{t("public.acceptRequiredConsents")}</p>
              )}
            </div>
          )}

          {wizardStep === "done" && hasSignedCampaign && (
            <div className="wizard-body done-card">
              {isGoudhanExperience ? (
                <>
                  <section
                    className="public-premium-success"
                    aria-labelledby="public-premium-success-heading"
                  >
                    <div className="public-success-mark" aria-hidden="true">
                      <CheckCircle2 size={32} />
                    </div>
                    <span className="eyebrow">{t("public.success.participationComplete")}</span>
                    <h3
                      id="public-premium-success-heading"
                      ref={stepHeadingRef}
                      tabIndex={-1}
                    >
                      {t("public.thankYou")}
                    </h3>
                    <p>{t("public.success.recorded")}</p>
                    <strong>{t("public.success.partOfMovement")}</strong>
                    <dl className="public-success-facts">
                      {lastSignedSigner?.name && (
                        <div>
                          <dt>{t("public.success.supporterName")}</dt>
                          <dd>{lastSignedSigner.name}</dd>
                        </div>
                      )}
                      {lastSignedSigner?.id && (
                        <div>
                          <dt>{t("public.success.supporterId")}</dt>
                          <dd><code>{lastSignedSigner.id}</code></dd>
                        </div>
                      )}
                      <div>
                        <dt>{t("public.success.campaign")}</dt>
                        <dd>{displayCampaign.title}</dd>
                      </div>
                      <div>
                        <dt>{t("public.success.supporterCount")}</dt>
                        <dd>{metrics.total.toLocaleString()}</dd>
                      </div>
                      {configuredCampaignGoal !== null && (
                        <div>
                          <dt>{t("public.success.campaignProgress")}</dt>
                          <dd>{metrics.progress}%</dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  <section className="public-celebration" aria-labelledby="public-celebration-heading">
                    <HeartHandshake size={26} aria-hidden="true" />
                    <div>
                      <h4 id="public-celebration-heading">{t("public.success.welcome")}</h4>
                      <p>{displayCampaign.thankYouMessage}</p>
                      <span>{t("goudhanCampaign.tagline")}</span>
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <CheckCircle2 size={28} />
                  <h3 ref={stepHeadingRef} tabIndex={-1}>{t("public.thankYou")}</h3>
                  <p>{copy.doneBody}</p>
                </>
              )}

              <section className="public-post-sign-sharing" aria-label={t("public.shareThisCampaign")}>
                <div className="public-section-heading">
                  <span className="eyebrow">{t("public.success.shareMovement")}</span>
                  <h4>{t("public.success.inviteOthers")}</h4>
                  <p>{t("public.success.personalLinkHelp")}</p>
                </div>
                <ReferralQrPreview
                  value={personalReferralUrl}
                  label={t("public.campaignQr")}
                  caption={displayCampaign.qrLabel}
                  compact
                />
                <code className="public-personal-referral-url">{personalReferralUrl}</code>
                <div className="public-post-sign-actions">
                  <a
                    className="secondary-link-button"
                    href={shareLinks.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackShareClick("whatsapp")}
                  >
                    <MessageCircle size={18} /> WhatsApp
                  </a>
                  <a
                    className="secondary-link-button"
                    href={shareLinks.facebook}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackShareClick("facebook")}
                  >
                    Facebook
                  </a>
                  <a
                    className="secondary-link-button"
                    href={shareLinks.x}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackShareClick("x")}
                  >
                    X
                  </a>
                  <a
                    className="secondary-link-button"
                    href={shareLinks.telegram}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackShareClick("telegram")}
                  >
                    Telegram
                  </a>
                  {nativeShareSupported && (
                    <button className="secondary-button" type="button" onClick={shareNatively}>
                      <Share2 size={18} /> {t("referrals.dashboard.nativeShare")}
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void copyReferralText(t("public.referralLink"), personalReferralUrl, "copy")}
                  >
                    <Copy size={18} /> {t("public.success.copyReferralLink")}
                  </button>
                  <button className="secondary-button" type="button" onClick={downloadActQr}>
                    <QrCode size={18} /> {t("public.campaignQr")}
                  </button>
                </div>
                {copiedReferral && <span className="public-share-status" role="status">{copiedReferral}</span>}
              </section>

              {isGoudhanExperience && personalReferralCode && (
                <a className="secondary-link-button public-supporter-profile-link" href={`/r/${encodeURIComponent(personalReferralCode)}`}>
                  <UserRound size={18} /> {t("goudhanCampaign.myProfile")}
                </a>
              )}

              {isGoudhanExperience &&
                onUploadSupporterPhoto &&
                !lastSignedSigner?.profilePhotoPath &&
                !photoPanelDismissed && (
                  <PublicSupporterPhoto
                    copy={experienceCopy.photo}
                    onUpload={async (file) => {
                      await onUploadSupporterPhoto(file);
                      setPhotoPanelDismissed(true);
                    }}
                    onSkip={() => setPhotoPanelDismissed(true)}
                  />
                )}

              {isGoudhanExperience && lastSignedSigner?.profilePhotoPath && (
                <p className="success-message" role="status">{t("goudhanCampaign.photoSaved")}</p>
              )}

              {isGoudhanExperience && onSubmitMovementRequest && (
                <section
                  className="public-movement-requests"
                  aria-labelledby="public-movement-requests-heading"
                >
                  <div className="public-section-heading">
                    <span className="eyebrow">{t("public.requests.getInvolved")}</span>
                    <h4 id="public-movement-requests-heading">
                      {t("public.requests.choosePath")}
                    </h4>
                    <p>{t("public.requests.reviewOnly")}</p>
                  </div>
                  <div className="public-involvement-options">
                    <article>
                      <UserRound size={20} />
                      <strong>{t("public.success.continueSupporter")}</strong>
                      <p>{t("public.success.continueSupporterHelp")}</p>
                      {personalReferralCode ? (
                        <a
                          className="secondary-link-button"
                          href={`/r/${encodeURIComponent(personalReferralCode)}`}
                        >
                          {t("goudhanCampaign.myProfile")}
                        </a>
                      ) : (
                        <span className="public-request-muted">
                          {t("public.success.supportRecorded")}
                        </span>
                      )}
                    </article>
                    <article>
                      <HeartHandshake size={20} />
                      <strong>{t("public.requests.volunteerTitle")}</strong>
                      <p>{t("public.requests.volunteerHelp")}</p>
                      <button
                        className="secondary-button"
                        type="button"
                        aria-expanded={postSignPanel === "volunteer"}
                        onClick={() => {
                          setMovementRequestError("");
                          setPostSignPanel((current) =>
                            current === "volunteer" ? "none" : "volunteer"
                          );
                        }}
                      >
                        {t("public.requests.applyVolunteer")}
                      </button>
                    </article>
                    <article>
                      <Users size={20} />
                      <strong>{t("public.requests.coordinatorTitle")}</strong>
                      <p>{t("public.requests.coordinatorHelp")}</p>
                      <button
                        className="secondary-button"
                        type="button"
                        aria-expanded={postSignPanel === "coordinator"}
                        onClick={() => {
                          setMovementRequestError("");
                          setPostSignPanel((current) =>
                            current === "coordinator" ? "none" : "coordinator"
                          );
                        }}
                      >
                        {t("public.requests.applyCoordinator")}
                      </button>
                    </article>
                  </div>

                  {savedMovementRequest && (
                    <div className="public-request-result success-message" role="status">
                      <CheckCircle2 size={20} />
                      <h5 ref={movementRequestResultRef} tabIndex={-1}>
                        {savedMovementRequest.requestType === "volunteer"
                          ? t("public.requests.volunteerSubmitted")
                          : t("public.requests.coordinatorSubmitted")}
                      </h5>
                      <span>
                        {t("public.requests.requestId")}: <code>{savedMovementRequest.id}</code>
                      </span>
                      <span>
                        {t("public.requests.currentStatus")}:{" "}
                        {t(`public.requests.status.${savedMovementRequest.status}`)}
                      </span>
                      {savedMovementRequest.requestType === "coordinator" && (
                        <>
                          <span>
                            {t("public.requests.preferredLevel")}:{" "}
                            {savedMovementRequest.preferredLevel
                              ? t(`public.requests.level.${savedMovementRequest.preferredLevel}`)
                              : t("public.requests.noMinimum")}
                          </span>
                          <span>
                            {t("public.requests.minimumLevel")}:{" "}
                            {savedMovementRequest.minimumAcceptableLevel
                              ? t(`public.requests.level.${savedMovementRequest.minimumAcceptableLevel}`)
                              : t("public.requests.noMinimum")}
                          </span>
                          <span>
                            {t("public.requests.geographicArea")}:{" "}
                            {formatParticipationRequestGeography(savedMovementRequest)}
                          </span>
                          {savedMovementRequest.preferredLevel && (
                            <p>
                              {t(`public.requests.responsibility.${savedMovementRequest.preferredLevel}`)}
                            </p>
                          )}
                        </>
                      )}
                      <p>{t("public.requests.pendingReview")}</p>
                    </div>
                  )}

                  {movementRequestError && (
                    <p className="error-message" role="alert">{movementRequestError}</p>
                  )}

                  {postSignPanel === "volunteer" && (
                    <div className="public-request-form" aria-labelledby="volunteer-request-heading">
                      <h5 id="volunteer-request-heading">{t("public.requests.volunteerForm")}</h5>
                      <Field label={t("public.requests.skills")}>
                        <input
                          value={volunteerSkills}
                          placeholder={t("public.requests.listPlaceholder")}
                          onChange={(event) => setVolunteerSkills(event.target.value)}
                        />
                      </Field>
                      <Field label={t("public.requests.interests")}>
                        <input
                          value={volunteerInterests}
                          placeholder={t("public.requests.listPlaceholder")}
                          onChange={(event) => setVolunteerInterests(event.target.value)}
                        />
                      </Field>
                      <Field label={t("public.requests.availability")}>
                        <input
                          value={volunteerAvailability}
                          onChange={(event) => setVolunteerAvailability(event.target.value)}
                        />
                      </Field>
                      <Field label={t("public.requests.preferredWorkingArea")}>
                        <input
                          value={volunteerWorkingArea}
                          onChange={(event) => setVolunteerWorkingArea(event.target.value)}
                        />
                      </Field>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={volunteerConsent}
                          onChange={(event) => setVolunteerConsent(event.target.checked)}
                        />
                        <span>
                          <strong>{t("public.required")}</strong>
                          {t("public.requests.consent")} {displayCampaign.consentText}
                        </span>
                      </label>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!volunteerConsent || submittingMovementRequest}
                        aria-busy={submittingMovementRequest}
                        onClick={() => void submitVolunteerMovementRequest()}
                      >
                        {submittingMovementRequest
                          ? t("public.requests.submitting")
                          : t("public.requests.submitVolunteer")}
                      </button>
                    </div>
                  )}

                  {postSignPanel === "coordinator" && (
                    <div className="public-request-form" aria-labelledby="coordinator-request-heading">
                      <h5 id="coordinator-request-heading">{t("public.requests.coordinatorForm")}</h5>
                      <Field label={t("public.requests.preferredLevel")}>
                        <select
                          value={coordinatorLevel}
                          onChange={(event) => {
                            const level = event.target.value as ParticipationRequestLevel;
                            setCoordinatorLevel(level);
                            if (
                              coordinatorMinimumLevel
                              && !getMinimumParticipationLevels(level).includes(coordinatorMinimumLevel)
                            ) {
                              setCoordinatorMinimumLevel("");
                            }
                          }}
                        >
                          {PARTICIPATION_REQUEST_LEVELS.map((level) => (
                            <option value={level} key={level}>
                              {t(`public.requests.level.${level}`)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <p className="public-request-responsibility" role="status">
                        {t(`public.requests.responsibility.${coordinatorLevel}`)}
                      </p>
                      <Field label={t("public.requests.minimumLevel")}>
                        <select
                          value={coordinatorMinimumLevel}
                          onChange={(event) =>
                            setCoordinatorMinimumLevel(
                              event.target.value as ParticipationRequestLevel | ""
                            )
                          }
                        >
                          <option value="">{t("public.requests.noMinimum")}</option>
                          {minimumCoordinatorLevels.map((level) => (
                            <option value={level} key={level}>
                              {t(`public.requests.level.${level}`)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="public-request-geography">
                        <strong>{t("public.requests.geographicArea")}</strong>
                        <IndiaLocationFields
                          idPrefix="public-coordinator-request"
                          values={coordinatorLocation}
                          onChange={setCoordinatorLocation}
                          locationOverrides={locationOverrides}
                          locationDeletions={locationDeletions}
                          requiredFields={coordinatorRequiredFields}
                          labelOverrides={copy.locationLabels}
                        />
                        {coordinatorLevel === "ward" && (
                          <Field label={`${t("public.requests.villageWard")} *`}>
                            <input
                              required
                              value={coordinatorWard}
                              onChange={(event) => setCoordinatorWard(event.target.value)}
                            />
                          </Field>
                        )}
                      </div>
                      <Field label={t("public.requests.experience")}>
                        <textarea
                          value={coordinatorExperience}
                          onChange={(event) => setCoordinatorExperience(event.target.value)}
                        />
                      </Field>
                      <Field label={t("public.requests.motivation")}>
                        <textarea
                          value={coordinatorMotivation}
                          onChange={(event) => setCoordinatorMotivation(event.target.value)}
                        />
                      </Field>
                      <Field label={t("public.requests.availability")}>
                        <input
                          value={coordinatorAvailability}
                          onChange={(event) => setCoordinatorAvailability(event.target.value)}
                        />
                      </Field>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={coordinatorConsent}
                          onChange={(event) => setCoordinatorConsent(event.target.checked)}
                        />
                        <span>
                          <strong>{t("public.required")}</strong>
                          {t("public.requests.consent")} {displayCampaign.consentText}
                        </span>
                      </label>
                      {!coordinatorLocationReady && (
                        <p className="public-validation-hint">
                          {t("public.requests.completeGeography")}
                        </p>
                      )}
                      <button
                        className="primary-button"
                        type="button"
                        disabled={
                          !coordinatorConsent
                          || !coordinatorLocationReady
                          || submittingMovementRequest
                        }
                        aria-busy={submittingMovementRequest}
                        onClick={() => void submitCoordinatorMovementRequest()}
                      >
                        {submittingMovementRequest
                          ? t("public.requests.submitting")
                          : t("public.requests.submitCoordinator")}
                      </button>
                    </div>
                  )}
                </section>
              )}

              {isGoudhanExperience
                && (movementRequestsLoading || movementRequestsError || savedMovementRequests.length > 0)
                && (
                <section
                  className="public-request-tracker"
                  aria-labelledby="public-request-tracker-heading"
                >
                  <div className="public-section-heading">
                    <div>
                      <span className="eyebrow">{t("public.success.trackRequest")}</span>
                      <h4 id="public-request-tracker-heading">
                        {t("public.success.myRequests")}
                      </h4>
                    </div>
                    {onRefreshMovementRequests && (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={movementRequestsLoading}
                        aria-busy={movementRequestsLoading}
                        onClick={() => void onRefreshMovementRequests()}
                      >
                        {t("public.success.refreshRequests")}
                      </button>
                    )}
                  </div>
                  {movementRequestsLoading && (
                    <p className="public-request-loading" role="status" aria-live="polite">
                      {t("public.success.loadingRequests")}
                    </p>
                  )}
                  {movementRequestsError && !movementRequestsLoading && (
                    <p className="error-message" role="alert">
                      {movementRequestsError === "otp_verification_required"
                        ? t("public.success.requestReadVerificationRequired")
                        : t("public.success.requestReadFailed")}
                    </p>
                  )}
                  <div className="public-request-tracker-list">
                    {savedMovementRequests.map((request) => {
                      return (
                        <article key={request.id} className="public-request-tracker-card">
                          <div>
                            <strong>
                              {request.requestType === "volunteer"
                                ? t("public.requests.volunteerTitle")
                                : t("public.requests.coordinatorTitle")}
                            </strong>
                            <span className="status-pill" data-status={request.status}>
                              {t(`public.requests.status.${request.status}`)}
                            </span>
                          </div>
                          <dl>
                            <div>
                              <dt>{t("public.requests.requestId")}</dt>
                              <dd><code>{request.id}</code></dd>
                            </div>
                            <div>
                              <dt>{t("public.success.requestType")}</dt>
                              <dd>
                                {request.requestType === "volunteer"
                                  ? t("public.requests.volunteerTitle")
                                  : t("public.requests.coordinatorTitle")}
                              </dd>
                            </div>
                            <div>
                              <dt>{t("public.success.submittedTime")}</dt>
                              <dd>{new Date(request.submittedAt).toLocaleString(requestDateLocale)}</dd>
                            </div>
                            <div>
                              <dt>{t("public.success.campaign")}</dt>
                              <dd>{request.campaign.title}</dd>
                            </div>
                            <div>
                              <dt>{t("public.success.currentStage")}</dt>
                              <dd>{t(`public.success.stage.${request.currentStage}`)}</dd>
                            </div>
                            <div>
                              <dt>{t("public.success.lastUpdated")}</dt>
                              <dd>{new Date(request.updatedAt).toLocaleString(requestDateLocale)}</dd>
                            </div>
                            {request.requestType === "coordinator" && request.preferredLevel && (
                              <>
                                <div>
                                  <dt>{t("public.requests.preferredLevel")}</dt>
                                  <dd>{t(`public.requests.level.${request.preferredLevel}`)}</dd>
                                </div>
                                <div>
                                  <dt>{t("public.requests.minimumLevel")}</dt>
                                  <dd>
                                    {request.minimumAcceptableLevel
                                      ? t(`public.requests.level.${request.minimumAcceptableLevel}`)
                                      : t("public.requests.noMinimum")}
                                  </dd>
                                </div>
                                <div>
                                  <dt>{t("public.requests.geographicArea")}</dt>
                                  <dd>{formatParticipationRequestGeography(request)}</dd>
                                </div>
                              </>
                            )}
                          </dl>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {isGoudhanExperience && (
                <section className="public-movement-dashboard-entry">
                  <button
                    className="primary-button"
                    type="button"
                    aria-expanded={showMovementDashboard}
                    aria-controls="public-movement-dashboard"
                    onClick={() => setShowMovementDashboard((current) => !current)}
                  >
                    <UserRound size={18} /> {t("public.success.movementDashboard")}
                  </button>
                  {showMovementDashboard && (
                    <div
                      id="public-movement-dashboard"
                      className="public-movement-dashboard"
                      aria-label={t("public.success.movementDashboard")}
                    >
                      <article>
                        <CheckCircle2 size={20} />
                        <strong>{t("public.success.mySupport")}</strong>
                        <span>{displayCampaign.title}</span>
                        {lastSignedSigner?.id && <code>{lastSignedSigner.id}</code>}
                      </article>
                      <article>
                        <ClipboardList size={20} />
                        <strong>{t("public.success.myRequests")}</strong>
                        <span>
                          {movementRequestsLoading
                            ? t("public.success.loadingRequests")
                            : savedMovementRequests.length > 0
                            ? String(savedMovementRequests.length)
                            : t("public.success.noRequests")}
                        </span>
                        {movementRequestsError && !movementRequestsLoading && (
                          <span className="error-message" role="alert">
                            {movementRequestsError === "otp_verification_required"
                              ? t("public.success.requestReadVerificationRequired")
                              : t("public.success.requestReadFailed")}
                          </span>
                        )}
                        {onRefreshMovementRequests && (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={movementRequestsLoading}
                            onClick={() => void onRefreshMovementRequests()}
                          >
                            {t("public.success.refreshRequests")}
                          </button>
                        )}
                      </article>
                      <article>
                        <QrCode size={20} />
                        <strong>{t("public.success.myReferralLink")}</strong>
                        <code>{personalReferralUrl}</code>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() =>
                            void copyReferralText(
                              t("public.referralLink"),
                              personalReferralUrl,
                              "copy"
                            )
                          }
                        >
                          <Copy size={16} /> {t("public.copyLink")}
                        </button>
                      </article>
                      <article>
                        <Share2 size={20} />
                        <strong>{t("public.success.mySharedLinks")}</strong>
                        <div className="public-dashboard-share-links">
                          <a href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => trackShareClick("whatsapp")}>WhatsApp</a>
                          <a href={shareLinks.facebook} target="_blank" rel="noreferrer" onClick={() => trackShareClick("facebook")}>Facebook</a>
                          <a href={shareLinks.x} target="_blank" rel="noreferrer" onClick={() => trackShareClick("x")}>X</a>
                          <a href={shareLinks.telegram} target="_blank" rel="noreferrer" onClick={() => trackShareClick("telegram")}>Telegram</a>
                        </div>
                      </article>
                    </div>
                  )}
                </section>
              )}

              {(!isGoudhanExperience || !onSubmitMovementRequest) && (
                <button
                  className="secondary-button public-coordinator-action"
                  type="button"
                  onClick={() => setPostSignPanel((current) => current === "coordinator" ? "none" : "coordinator")}
                >
                  <Users size={18} /> {experienceCopy.becomeCoordinator}
                </button>
              )}

              {(!isGoudhanExperience || !onSubmitMovementRequest) && postSignPanel === "coordinator" && (
                <div className="public-coordinator-handoff">
                  <h4>{experienceCopy.helpOrganise}</h4>
                  <p>{experienceCopy.coordinatorHandoff}</p>
                  {coordinatorLearnMore && <p>{experienceCopy.coordinatorLearn}</p>}
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setCoordinatorLearnMore((value) => !value)}
                    >
                      {experienceCopy.learnMore}
                    </button>
                    {onSubmitCoordinatorApplication ? (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={lastSignedSigner?.coordinatorApplication?.status === "Pending Approval"}
                        onClick={() => void onSubmitCoordinatorApplication()}
                      >
                        <Mail size={18} /> {
                          lastSignedSigner?.coordinatorApplication?.status === "Pending Approval"
                            ? experienceCopy.coordinatorPending
                            : experienceCopy.coordinatorContact
                        }
                      </button>
                    ) : (
                      <a
                        className="primary-link-button"
                        href={`mailto:${campaign.adminEmail}?subject=${encodeURIComponent(
                          `${experienceCopy.becomeCoordinator}: ${displayCampaign.title}`
                        )}&body=${encodeURIComponent(
                          t("goudhanCampaign.coordinatorRequestBody")
                        )}`}
                      >
                        <Mail size={18} /> {experienceCopy.coordinatorContact}
                      </a>
                    )}
                  </div>
                </div>
              )}
              {campaign.donationEnabled && <DonationCard campaign={campaign} compact />}
            </div>
          )}

          {displayPublicMessage && (
            <p
              ref={publicMessageRef}
              tabIndex={publicMessageIsError ? -1 : undefined}
              className={publicMessageIsError ? "error-message" : "success-message"}
              role={publicMessageIsError ? "alert" : "status"}
              aria-live={publicMessageIsError ? "assertive" : "polite"}
            >
              {displayPublicMessage}
            </p>
          )}
        </form>
        {!hasSignedCampaign && (
          <div className="public-sign-share-tools" aria-label={t("public.shareThisCampaign")}>
            <ReferralQrPreview value={personalReferralUrl} label={t("public.campaignQr")} caption={displayCampaign.qrLabel} compact />
            <div>
              {nativeShareSupported && (
                <button className="secondary-button" type="button" onClick={shareNatively}>
                  <Share2 size={17} /> {t("public.share")}
                </button>
              )}
              <a className="secondary-link-button" href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => trackShareClick("whatsapp")}>
                WhatsApp
              </a>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void copyReferralText(t("public.campaignLink"), personalReferralUrl, "copy")}
              >
                <Copy size={17} /> {t("public.copyLink")}
              </button>
            </div>
            {copiedReferral && <span className="public-share-status" role="status">{copiedReferral}</span>}
          </div>
        )}
      </Panel>

      {!hasSignedCampaign && (
        <a className="sticky-support-button" href="#public-sign-form">
          <CheckCircle2 size={18} />{" "}
          {isGaumataCampaignExperience
            ? t("goudhanCampaign.joinMovement")
            : t("public.supportCampaign")}
        </a>
      )}
    </section>
  );
}

export function PublicCampaignNotFound({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">{t("public.notFound.eyebrow")}</span>
        <h1>{t("public.notFound.title")}</h1>
        <p>{t("public.notFound.description")}</p>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
          >
            {t("public.notFound.retry")}
          </button>
          <a className="secondary-link-button" href="/">
            {t("public.notFound.home")}
          </a>
        </div>
      </section>
    </main>
  );
}

export function PublicCampaignLoading({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">{t("public.loading.eyebrow")}</span>
        <h1>{t("public.loading.title")}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
