import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  Award,
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
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Users
} from "lucide-react";
import type { AuthorityRule, Campaign, Organization, Signer, SignerRequiredField } from "../types";
import { getConfiguredGrowthShareMessages } from "../growth/configuration";
import type { GrowthShareContext, GrowthSupporterSnapshot } from "../growth/lifecycle";
import type { SupporterGrowthPortalModel } from "../growth/tree";
import { ViralPostSignExperience } from "../growth/supporter";
import {
  indiaGeographyService,
  type LocationDeletions,
  type LocationOverrides
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
import { LanguageSwitcher, useTranslation, type Language } from "../i18n";
import {
  getAppealAuthority,
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
  getLockedLocationValues
} from "../utils/campaign";
import {
  downloadQrPosterSvg,
  findReferrer,
  getCampaignReferralUrl,
  getSafeReferrerLabel,
  getSupporterReferralCode,
  normalizeReferralCode
} from "../utils/referrals";
import "../publicSigningExperience.css";

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
  onSendOtp: () => void | Promise<void>;
  onVerifyOtp: () => void | Promise<void>;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  onGrowthShare?: (share: GrowthShareContext) => void;
  onUploadSupporterPhoto?: (file: File) => Promise<void>;
  onSaveDraft?: () => void | Promise<void>;
  onCommunicationConsentChange?: (granted: boolean) => void | Promise<void>;
  onSubmitCoordinatorApplication?: () => void | Promise<void>;
  gpsAdapter?: GPSAdapter;
  onSubmit: (event: FormEvent) => void | Promise<void>;
}

type SigningStepId = "phone" | "otp" | "profile" | "address" | "review" | "done";

const signingSteps: Array<{ id: SigningStepId }> = [
  { id: "phone" },
  { id: "otp" },
  { id: "profile" },
  { id: "address" },
  { id: "review" },
  { id: "done" }
];

const defaultPublicGpsAdapter = new BrowserGPSAdapter();

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
  nationwideReach: "Nationwide campaign reach",
  statesReached: "States / UTs reached",
  districtsReached: "Districts reached",
  paperSupporters: "Paper signatures",
  remainingToGoal: "Verified support needed",
  structuredLocationTitle: "Confirmed administrative path",
  structuredLocationHelp: "Matched against the shared Business OS India geography hierarchy. Review every field before signing.",
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
    nationwideReach: "राष्ट्रव्यापी अभियान पहुँच",
    statesReached: "राज्य / केंद्र शासित प्रदेश",
    districtsReached: "जिले",
    paperSupporters: "कागज़ी हस्ताक्षर",
    remainingToGoal: "लक्ष्य के लिए सत्यापित समर्थन",
    structuredLocationTitle: "पुष्ट प्रशासनिक मार्ग",
    structuredLocationHelp: "साझा बिज़नेस OS भारत भूगोल पदानुक्रम से मिलान किया गया। हस्ताक्षर से पहले हर फ़ील्ड की समीक्षा करें।",
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
    nationwideReach: "ଦେଶବ୍ୟାପୀ ଅଭିଯାନ ପହଞ୍ଚ",
    statesReached: "ରାଜ୍ୟ / କେନ୍ଦ୍ରଶାସିତ ଅଞ୍ଚଳ",
    districtsReached: "ଜିଲ୍ଲା",
    paperSupporters: "କାଗଜ ସହି",
    remainingToGoal: "ଲକ୍ଷ୍ୟ ପାଇଁ ସତ୍ୟାପିତ ସମର୍ଥନ",
    structuredLocationTitle: "ନିଶ୍ଚିତ ପ୍ରଶାସନିକ ପଥ",
    structuredLocationHelp: "ସାଧାରଣ Business OS ଭାରତ ଭୂଗୋଳ ପଦାନୁକ୍ରମ ସହିତ ମେଳ ହୋଇଛି। ସହି ପୂର୍ବରୁ ପ୍ରତ୍ୟେକ କ୍ଷେତ୍ର ସମୀକ୍ଷା କରନ୍ତୁ।",
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
  growthSnapshot,
  growthPortal,
  otpInput,
  setOtpInput,
  otpMessage,
  onSendOtp,
  onVerifyOtp,
  locationOverrides,
  locationDeletions,
  onGrowthShare,
  onUploadSupporterPhoto,
  onSaveDraft,
  onCommunicationConsentChange,
  onSubmitCoordinatorApplication,
  gpsAdapter = defaultPublicGpsAdapter,
  onSubmit
}: PublicCampaignPageProps) {
  const { language, t } = useTranslation();
  const publicAuthorityOptions = getPublicAuthorityOptions(campaign, authorities);
  const resolvedAuthority = authority ?? getAppealAuthority(campaign);
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
  const participationLabel = isGlobalMode ? `${locationLabels.district} ${t("public.participation")}` : t("public.districtParticipation");
  const locationParticipation = campaign.district || restrictedPublicForm.district || t("public.notCapturedYet");
  const requiredFields = campaign.requiredFields ?? [];
  const copy = publicSigningCopy[language];
  const experienceCopy = publicExperienceCopy[language];
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
  const shareMessages = getConfiguredGrowthShareMessages({
    campaign,
    organization,
    signer: lastSignedSigner,
    referralLink: personalReferralUrl,
    walletCredits: growthPortal?.wallet.balance.walletCredits ?? growthSnapshot?.lifetimeGrowth,
    recognitionLevel: growthSnapshot?.currentRecognitionLevelName ?? growthPortal?.tree.currentRecognition,
    campaignProgress: metrics.progress,
    supporterCount: metrics.total,
    verifiedSupporters: metrics.verified
  });
  const [copiedReferral, setCopiedReferral] = useState("");
  const [shareClicks, setShareClicks] = useState(0);
  const [actChannels, setActChannels] = useState<GrowthShareContext["channel"][]>([]);
  const [wizardStep, setWizardStep] = useState<SigningStepId>(publicForm.otpVerified ? "profile" : "phone");
  const [hasRestoredWizard, setHasRestoredWizard] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [postSignPanel, setPostSignPanel] = useState<"none" | "photo" | "coordinator" | "donation">("none");
  const [coordinatorLearnMore, setCoordinatorLearnMore] = useState(false);
  const [communicationConsent, setCommunicationConsent] = useState(false);
  const hasSignedCampaign = lastSignedSigner?.campaignId === campaign.id;
  const campaignGoal = getCampaignGoalValue(campaign);
  const draftStorageKey = `voiceup-public-signing-progress-${campaign.id}`;
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
  const heroSummary =
    campaign.description.trim() ||
    t("public.defaultCampaignSummary").replace("{campaign}", campaign.title);
  const authorityCards = (campaign.authoritySelectionMode === "public_choice" && publicAuthorityOptions.length > 0
    ? publicAuthorityOptions
    : [resolvedAuthority]
  ).slice(0, 3);
  const storyCards = [
    {
      icon: <HeartHandshake size={20} />,
      title: t("public.story.publicAsk"),
      body: campaign.appealContent || campaign.description
    },
    {
      icon: <Landmark size={20} />,
      title: t("public.story.recipient"),
      body: formatAuthorityDisplay(resolvedAuthority)
    },
    {
      icon: <CalendarDays size={20} />,
      title: t("public.story.window"),
      body: `${campaign.startDate || t("public.openNow")} ${t("public.to")} ${campaign.endDate || t("public.goalReached")}`
    }
  ];
  const testimonialCards = [
    t("public.trust.signature"),
    t("public.trust.structure"),
    t("public.trust.sharing")
  ];
  const updateCards = [
    t("public.updates.verified").replace("{count}", metrics.verified.toLocaleString()),
    t("public.updates.progress").replace("{progress}", String(metrics.progress)),
    `${t("public.petitionPreparedFor")} ${resolvedAuthority.name}.`
  ];
  const shareText = `${shareMessages.social}\n${personalReferralUrl}`;
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareMessages.whatsapp || shareText)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(personalReferralUrl)}&text=${encodeURIComponent(shareMessages.social)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(personalReferralUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(shareMessages.emailSubject)}&body=${encodeURIComponent(shareMessages.emailBody)}`
  };
  const campaignParticipants = campaignSigners.filter((signer) => signer.campaignId === campaign.id);
  const fieldParticipants = campaignParticipants.filter((signer) => signer.source === "field" || signer.source === "scan");
  const paperParticipants = campaignParticipants.filter((signer) => signer.source === "scan");
  const reachedStates = new Set(
    campaignParticipants.map((signer) => signer.state.trim().toLowerCase()).filter(Boolean)
  );
  const reachedDistricts = new Set(
    campaignParticipants
      .filter((signer) => signer.district.trim())
      .map((signer) => `${signer.state.trim().toLowerCase()}::${signer.district.trim().toLowerCase()}`)
  );
  const verifiedRemaining = Math.max(0, campaignGoal - metrics.verified);
  const referralParticipants = campaignParticipants.filter((signer) => Boolean(signer.referredBy || signer.referredByPhoneOrCode));
  const hasSocialShare = actChannels.some((channel) => ["native", "telegram", "facebook", "x", "linkedin", "email"].includes(channel));
  const actTasks = [
    { id: "participate", complete: hasSignedCampaign },
    { id: "whatsapp", complete: actChannels.includes("whatsapp") },
    { id: "social", complete: hasSocialShare },
    { id: "qr", complete: actChannels.includes("qr") },
    { id: "referral", complete: referralParticipants.length > 0 }
  ] as const;
  const completedActTasks = actTasks.filter((task) => task.complete).length;
  const actProgress = Math.round((completedActTasks / actTasks.length) * 100);
  const recognitionLabel = growthSnapshot?.currentRecognitionLevelName
    ?? growthPortal?.tree.currentRecognition
    ?? t("act.metrics.building");
  const actTimeline = [
    ...(shareClicks > 0 ? [{
      id: "current-share-activity",
      title: t("act.timeline.share"),
      detail: t("act.timeline.shareDetail").replace("{count}", String(shareClicks)),
      occurredAt: new Date().toISOString()
    }] : []),
    ...campaignParticipants
      .slice()
      .sort((left, right) => new Date(right.signedAt).getTime() - new Date(left.signedAt).getTime())
      .slice(0, 5)
      .map((signer) => ({
        id: signer.id,
        title: signer.source === "scan" || signer.source === "field"
          ? t("act.timeline.fieldParticipation")
          : signer.referredBy || signer.referredByPhoneOrCode
            ? t("act.timeline.referralParticipation")
            : t("act.timeline.publicParticipation"),
        detail: signer.otpVerified || signer.status === "verified"
          ? t("act.timeline.verified")
          : t("act.timeline.recorded"),
        occurredAt: signer.signedAt
      })),
    ...(campaign.startDate ? [{
      id: "campaign-start",
      title: t("act.timeline.started"),
      detail: campaign.title,
      occurredAt: campaign.startDate
    }] : [])
  ].slice(0, 6);
  const locationFields = isGlobalMode ? (
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
      values={restrictedPublicForm}
      onChange={(values) =>
        setPublicForm(applySignerLocationRestriction(campaign, { ...publicForm, ...values }, organization))
      }
      locationOverrides={locationOverrides}
      locationDeletions={locationDeletions}
      allowedLocation={lockedLocation}
      hiddenLockedLevel={signerRestrictionLevel}
      requiredFields={requiredFields}
      labelOverrides={copy.locationLabels}
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
    if (hasRestoredWizard || typeof window === "undefined") return;
    setHasRestoredWizard(true);
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(draftStorageKey) ?? "null") as
        | { step?: SigningStepId; form?: Partial<typeof blankSigner> }
        | null;
      if (!saved) return;
      if (saved.form) {
        setPublicForm((current) => ({
          ...current,
          ...saved.form,
          otpVerified: false,
          otpChallengeId: "",
          otpVerificationToken: ""
        }));
      }
      if (saved.step === "phone") {
        setWizardStep(saved.step);
      }
    } catch {
      window.sessionStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, hasRestoredWizard, setPublicForm]);

  useEffect(() => {
    if (!hasRestoredWizard || typeof window === "undefined") return;
    if (hasSignedCampaign) {
      window.sessionStorage.removeItem(draftStorageKey);
      return;
    }
    const recoverableForm = {
      ...publicForm,
      otpVerified: false,
      otpChallengeId: "",
      otpVerificationToken: ""
    };
    window.sessionStorage.setItem(
      draftStorageKey,
      JSON.stringify({ step: "phone", form: recoverableForm })
    );
  }, [draftStorageKey, hasRestoredWizard, hasSignedCampaign, publicForm]);

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
      setWizardStep("done");
      return;
    }
    if (publicForm.otpVerified && (wizardStep === "phone" || wizardStep === "otp")) {
      setWizardStep("profile");
    }
  }, [hasSignedCampaign, publicForm.otpVerified, wizardStep]);

  async function handleSendOtpWizard() {
    if (sendingOtp || !publicForm.phone.trim()) {
      if (!publicForm.phone.trim()) await onSendOtp();
      return;
    }
    setSendingOtp(true);
    try {
      await onSendOtp();
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
      setActChannels((current) => current.includes(channel) ? current : [...current, channel]);
      onGrowthShare?.({ channel, url: value });
    } catch {
      setCopiedReferral(t("public.copyFailed"));
    }
  }

  function trackShareClick(channel: GrowthShareContext["channel"]) {
    setShareClicks((current) => current + 1);
    setActChannels((current) => current.includes(channel) ? current : [...current, channel]);
    onGrowthShare?.({ channel, url: personalReferralUrl });
  }

  function downloadActQr() {
    trackShareClick("qr");
    downloadQrPosterSvg({
      campaign,
      organizationName: organization?.name ?? "VoiceUp",
      url: personalReferralUrl,
      referralCode: personalReferralCode
    });
  }

  async function shareNatively() {
    trackShareClick("native");
    if (navigator.share) {
      try {
        await navigator.share({
          title: campaign.title,
          text: shareMessages.social,
          url: personalReferralUrl
        });
        return;
      } catch {
        // User cancelled or native share failed; keep the copied fallback available.
      }
    }
    await copyReferralText(t("public.referralLink"), personalReferralUrl);
  }

  return (
    <section className="public-layout public-campaign-modern">
      <div className="public-story-column">
        <article
          className={campaign.heroImage ? "campaign-page campaign-page-with-media" : "campaign-page"}
          style={{
            backgroundImage: campaign.heroImage
              ? `linear-gradient(135deg, rgba(4, 13, 31, 0.88), rgba(4, 13, 31, 0.56)), url(${campaign.heroImage})`
              : undefined,
            backgroundPosition: campaign.heroImagePosition,
            backgroundSize: `${campaign.heroImageZoom}%`
          }}
        >
          <div className="public-hero-surface">
            <div className="public-hero-content">
              <div className="public-hero-kicker">
                <span className="eyebrow">{t("public.verifiedCampaign")}</span>
                <span className="status-pill" data-status={campaign.status}>{t(`campaignAdmin.status.${campaign.status.toLowerCase()}`)}</span>
              </div>
              <h1>{campaign.title}</h1>
              {language !== "en" && <span className="original-language-notice">{t("public.originalLanguageNotice")}</span>}
              <p className="public-summary">{heroSummary}</p>
              <div className="public-hero-actions">
                <a className="primary-button" href="#public-sign-form">
                  {t("public.signInMinutes")} <ArrowRight size={18} />
                </a>
                <button className="secondary-button" type="button" onClick={shareNatively}>
                  <Share2 size={18} /> {t("public.shareCampaign")}
                </button>
              </div>
            </div>

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
                <span>{t("public.verifiedGoal").replace("{goal}", campaignGoal.toLocaleString())}</span>
              </div>
            </div>

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
              <div>
                <MapPin size={18} />
                <span>{participationLabel}</span>
                <strong>{locationParticipation}</strong>
              </div>
            </div>

            <section className="public-national-progress" aria-label={experienceCopy.nationwideReach}>
              <div className="public-national-progress-heading">
                <TrendingUp size={18} />
                <strong>{experienceCopy.nationwideReach}</strong>
              </div>
              <div className="public-national-progress-grid">
                <article>
                  <span>{experienceCopy.statesReached}</span>
                  <strong>{reachedStates.size.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{experienceCopy.districtsReached}</span>
                  <strong>{reachedDistricts.size.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{experienceCopy.paperSupporters}</span>
                  <strong>{paperParticipants.length.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{experienceCopy.remainingToGoal}</span>
                  <strong>{verifiedRemaining.toLocaleString()}</strong>
                </article>
              </div>
            </section>

            <div className="public-trust-strip" aria-label={t("public.trustIndicators")}>
              <span><ShieldCheck size={16} /> {t("public.privacyRespected")}</span>
              <span><LockKeyhole size={16} /> {t("public.otpVerified")}</span>
              <span><CheckCircle2 size={16} /> {t("public.routedToAuthority")}</span>
            </div>
          </div>
        </article>

        <section className="public-section act-home" aria-labelledby="act-home-heading">
          <div className="public-section-heading act-home-heading">
            <div>
              <span className="eyebrow">{t("act.eyebrow")}</span>
              <h2 id="act-home-heading">{t("act.title")}</h2>
              <p>{t("act.description")}</p>
            </div>
            <div className="act-progress-summary" aria-label={t("act.progressLabel")}>
              <strong>{actProgress}%</strong>
              <span>{t("act.tasksComplete").replace("{complete}", String(completedActTasks)).replace("{total}", String(actTasks.length))}</span>
              <progress max={100} value={actProgress}>{actProgress}%</progress>
            </div>
          </div>

          <div className="act-metric-grid">
            <article><Users size={19} /><span>{t("act.metrics.participation")}</span><strong>{campaignParticipants.length.toLocaleString()}</strong></article>
            <article><BadgeCheck size={19} /><span>{t("act.metrics.verified")}</span><strong>{metrics.verified.toLocaleString()}</strong></article>
            <article><Activity size={19} /><span>{t("act.metrics.field")}</span><strong>{fieldParticipants.length.toLocaleString()}</strong></article>
            <article><Share2 size={19} /><span>{t("act.metrics.referrals")}</span><strong>{referralParticipants.length.toLocaleString()}</strong></article>
            <article><TrendingUp size={19} /><span>{t("act.metrics.growth")}</span><strong>{Math.round(growthSnapshot?.lifetimeGrowth ?? growthPortal?.wallet.balance.totalEarned ?? 0).toLocaleString()}</strong></article>
            <article><Award size={19} /><span>{t("act.metrics.recognition")}</span><strong>{recognitionLabel}</strong></article>
          </div>

          <div className="act-home-grid">
            <div className="act-task-board">
              <div className="act-section-title"><Target size={20} /><div><strong>{t("act.tasks.title")}</strong><span>{t("act.tasks.description")}</span></div></div>
              {actTasks.map((task) => (
                <article className={task.complete ? "is-complete" : ""} key={task.id}>
                  <span className="act-task-status">{task.complete ? <CheckCircle2 size={18} /> : <span />}</span>
                  <div><strong>{t(`act.tasks.${task.id}`)}</strong><small>{t(`act.tasks.${task.id}Help`)}</small></div>
                  {task.id === "participate" ? (
                    <a className="secondary-link-button" href="#public-sign-form">{t(task.complete ? "act.actions.review" : "act.actions.start")}</a>
                  ) : task.id === "whatsapp" ? (
                    <a className="secondary-link-button" href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => trackShareClick("whatsapp")}>WhatsApp</a>
                  ) : task.id === "social" ? (
                    <button className="secondary-button" type="button" onClick={shareNatively}>{t("act.actions.share")}</button>
                  ) : task.id === "qr" ? (
                    <button className="secondary-button" type="button" onClick={downloadActQr}><QrCode size={16} /> {t("act.actions.qr")}</button>
                  ) : (
                    <button className="secondary-button" type="button" onClick={() => void copyReferralText(t("public.referralLink"), personalReferralUrl, "copy")}><Copy size={16} /> {t("act.actions.invite")}</button>
                  )}
                </article>
              ))}
            </div>

            <div className="act-timeline">
              <div className="act-section-title"><CalendarDays size={20} /><div><strong>{t("act.timeline.title")}</strong><span>{t("act.timeline.description")}</span></div></div>
              {actTimeline.length > 0 ? (
                <ol>
                  {actTimeline.map((entry) => (
                    <li key={entry.id}>
                      <span aria-hidden="true" />
                      <div><strong>{entry.title}</strong><small>{entry.detail}</small></div>
                      <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleDateString()}</time>
                    </li>
                  ))}
                </ol>
              ) : <p className="helper-text">{t("act.timeline.empty")}</p>}
            </div>
          </div>
        </section>

        <VoiceUpStoryCarousel
          experience="publicCampaign"
          className="voiceup-story-carousel--compact"
          mediaBySlide={campaign.heroImage ? { objective: { imageUrl: campaign.heroImage } } : undefined}
        />

        <section className="public-section public-share-panel" aria-labelledby="share-campaign-heading">
          <div className="public-section-heading">
            <span className="eyebrow">{t("public.shareThisCampaign")}</span>
            <h2 id="share-campaign-heading">{t("public.shareImpact")}</h2>
          </div>
          <div className="share-panel-grid">
            <div className="share-qr-card">
              <ReferralQrPreview value={personalReferralUrl} label={t("public.campaignQr")} caption={campaign.qrLabel} compact />
              <code>{personalReferralUrl}</code>
              {copiedReferral && <span className="inline-copy-state">{copiedReferral}</span>}
            </div>
            <div className="share-actions-grid">
              <button className="secondary-button" type="button" onClick={() => copyReferralText(t("public.campaignLink"), personalReferralUrl, "copy")}>
                <Copy size={16} /> {t("public.copyLink")}
              </button>
              <button className="secondary-button" type="button" onClick={shareNatively}>
                <Share2 size={16} /> {t("public.share")}
              </button>
              <a className="secondary-link-button" href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => trackShareClick("whatsapp")}>WhatsApp</a>
              <a className="secondary-link-button" href={shareLinks.telegram} target="_blank" rel="noreferrer" onClick={() => trackShareClick("telegram")}>Telegram</a>
              <a className="secondary-link-button" href={shareLinks.facebook} target="_blank" rel="noreferrer" onClick={() => trackShareClick("facebook")}>Facebook</a>
              <a className="secondary-link-button" href={shareLinks.email} onClick={() => trackShareClick("email")}><Mail size={16} /> {t("public.email")}</a>
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="authority-heading">
          <div className="public-section-heading">
            <span className="eyebrow">{t("public.authorityPath")}</span>
            <h2 id="authority-heading">{t("public.authorityPathHelp")}</h2>
          </div>
          <div className="public-card-grid authority-card-grid">
            {authorityCards.map((item) => (
              <article className="authority-card-modern" key={item.id || item.name}>
                <Landmark size={22} />
                <span>{item.level}</span>
                <strong>{item.name}</strong>
                <p>{formatAuthorityDisplay(item)}</p>
              </article>
            ))}
          </div>
        </section>

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

        <section className="public-section public-updates-grid" aria-labelledby="updates-heading">
          <div>
            <div className="public-section-heading">
              <span className="eyebrow">{t("public.updatesTitle")}</span>
              <h2 id="updates-heading">{t("public.updatesHelp")}</h2>
            </div>
            <div className="update-stack">
              {updateCards.map((item) => (
                <div key={item}><Sparkles size={16} /> {item}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="public-section-heading">
              <span className="eyebrow">{t("public.supporterTrust")}</span>
              <h2>{t("public.supporterTrustHelp")}</h2>
            </div>
            <div className="testimonial-grid">
              {testimonialCards.map((item) => (
                <blockquote key={item}>{item}</blockquote>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="faq-heading">
          <div className="public-section-heading">
            <span className="eyebrow">{t("public.faq")}</span>
            <h2 id="faq-heading">{t("public.simpleAnswersBeforeSigning")}</h2>
          </div>
          <div className="faq-list">
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
          </div>
        </section>

        <section className="public-section" aria-labelledby="related-heading">
          <div className="public-section-heading">
            <span className="eyebrow">{t("public.relatedCampaigns")}</span>
            <h2 id="related-heading">{t("public.moreWaysToSupport")}</h2>
          </div>
          <div className="related-campaigns-grid">
            <a href={publicUrl}>
              <span>{campaign.category}</span>
              <strong>{campaign.title}</strong>
              <p>{formatLocationForCampaign(campaign, campaign)}</p>
            </a>
            <a href={publicUrl}>
              <span>{organization?.name || "VoiceUp"}</span>
              <strong>{t("public.shareWithNetwork")}</strong>
              <p>{t("public.nextMilestoneHelp")}</p>
            </a>
          </div>
        </section>

        {campaign.donationEnabled && <DonationCard campaign={campaign} compact />}
        {campaign.campaignVideoUrl && (
          <a className="video-link" href={campaign.campaignVideoUrl} target="_blank" rel="noreferrer">
            {t("public.watchCampaignVideo")}
          </a>
        )}
      </div>

      <Panel title={hasSignedCampaign ? copy.panelTitleComplete : copy.panelTitleSign} icon={<ClipboardList />}>
        <div className="public-mobile-campaign-summary">
          <span className="eyebrow">{experienceCopy.campaignAtGlance}</span>
          <strong>{campaign.title}</strong>
          <p>{heroSummary}</p>
          <div className="public-mobile-progress">
            <progress max={100} value={metrics.progress}>{metrics.progress}%</progress>
            <span>{metrics.progress}% · {metrics.verified.toLocaleString()} {t("public.verifiedSupporters")}</span>
          </div>
          {!hasSignedCampaign && (
            <button className="primary-button public-mobile-sign-now" type="button" onClick={() => setWizardStep("phone")}>
              {experienceCopy.signNow} <ArrowRight size={20} />
            </button>
          )}
        </div>
        <div className="public-language-selector">
          <LanguageSwitcher />
        </div>
        <div className="public-sign-share-tools" aria-label={t("public.shareThisCampaign")}>
          <ReferralQrPreview value={personalReferralUrl} label={t("public.campaignQr")} caption={campaign.qrLabel} compact />
          <div>
            <button className="secondary-button" type="button" onClick={shareNatively}>
              <Share2 size={17} /> {t("public.share")}
            </button>
            <a className="secondary-link-button" href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => trackShareClick("whatsapp")}>
              WhatsApp
            </a>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void copyReferralText(t("public.campaignLink"), personalReferralUrl, "copy")}
            >
              <Copy size={17} /> {t("public.campaignLink")}
            </button>
          </div>
          {copiedReferral && <span className="public-share-status" role="status">{copiedReferral}</span>}
        </div>
        <aside className="public-paper-reminder" aria-label={experienceCopy.paperReminderTitle}>
          <ClipboardList size={20} />
          <div>
            <strong>{experienceCopy.paperReminderTitle}</strong>
            <p>
              {paperParticipants.length > 0
                ? experienceCopy.paperReminderWithCount.replace(
                    "{count}",
                    paperParticipants.length.toLocaleString()
                  )
                : experienceCopy.paperReminderEmpty}
            </p>
          </div>
        </aside>
        <div className="wizard-header">
          <span className="eyebrow">{copy.secureSigning}</span>
          <h2>{hasSignedCampaign ? copy.headerComplete : copy.headerActive}</h2>
          <p>{copy.headerHelp}</p>
        </div>

        {publicForm.otpVerified && !hasSignedCampaign && (
          <div className="verified-welcome" aria-live="polite">
            <UserRound size={20} />
            <div>
              <strong>{t("public.welcomeBack")}</strong>
              <span>{copy.phoneVerifiedBody}</span>
            </div>
            <div className="verified-actions">
              <button className="secondary-button" type="button" onClick={() => setWizardStep("profile")}>{t("public.continue")}</button>
              <button className="secondary-button" type="button" onClick={() => setWizardStep("review")}>{copy.viewSignature}</button>
              <button className="secondary-button" type="button" onClick={shareNatively}>{t("public.share")}</button>
              <button className="secondary-button" type="button" onClick={() => copyReferralText(t("public.campaignLink"), personalReferralUrl, "copy")}>{copy.referFriends}</button>
            </div>
          </div>
        )}

        <ol className="wizard-steps" aria-label={t("public.signingSteps")}>
          {activeSigningSteps.map((step, index) => (
            <li key={step.id}>
              <button
                type="button"
                className={index === activeStepIndex ? "wizard-step is-active" : index < activeStepIndex ? "wizard-step is-complete" : "wizard-step"}
                aria-current={index === activeStepIndex ? "step" : undefined}
                onClick={() => setWizardStep(step.id)}
              >
                <span>{index + 1}</span>
                {step.id === "review" ? t("public.review") : copy.steps[step.id]}
              </button>
            </li>
          ))}
        </ol>

        <form id="public-sign-form" className="form-stack public-sign-form public-sign-wizard" onSubmit={handlePublicSubmit}>
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
                <h3>{copy.phoneTitle}</h3>
                <p>{copy.phoneHelp}</p>
              </div>
              <Field label={signerFieldLabel(t("public.phone"), "phone")}>
                <input
                  aria-label={t("public.phone")}
                  placeholder={t("public.phone")}
                  value={publicForm.phone}
                  inputMode="tel"
                  autoComplete="tel"
                  onChange={(event) => setPublicForm({
                    ...publicForm,
                    phone: event.target.value,
                    otpVerified: false,
                    otpChallengeId: "",
                    otpVerificationToken: ""
                  })}
                />
              </Field>
              <button className="primary-button" type="button" disabled={sendingOtp} aria-busy={sendingOtp} onClick={() => void handleSendOtpWizard()}>
                {sendingOtp ? experienceCopy.otpSending : t("public.sendOtp")} <ArrowRight size={18} />
              </button>
            </div>
          )}

          {wizardStep === "otp" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <LockKeyhole size={22} />
                <h3>{copy.otpTitle}</h3>
                <p>{copy.otpHelp}</p>
              </div>
              <div className="otp-box">
                <input
                  aria-label={t("public.enterOtp")}
                  placeholder={t("public.enterOtp")}
                  value={otpInput}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  onChange={(event) => setOtpInput(event.target.value)}
                />
                <div className="button-row">
                  <button className="secondary-button" type="button" disabled={sendingOtp} onClick={() => void handleSendOtpWizard()}>
                    {sendingOtp ? experienceCopy.otpSending : copy.resendOtp}
                  </button>
                  <button className="primary-button" type="button" disabled={verifyingOtp || otpInput.trim().length < 6} aria-busy={verifyingOtp} onClick={() => void handleVerifyOtpWizard()}>
                    {verifyingOtp ? experienceCopy.otpVerifying : t("public.verifyOtp")}
                  </button>
                </div>
                {publicForm.otpVerified && <span className="status-pill">{copy.phoneVerified}</span>}
                {otpMessage && <p className="info-message">{otpMessage}</p>}
              </div>
            </div>
          )}

          {wizardStep === "profile" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <UserRound size={22} />
                <h3>{copy.profileTitle}</h3>
                <p>{copy.profileHelp}</p>
              </div>
              <Field label={signerFieldLabel(t("public.name"), "name")}>
                <input
                  aria-label={t("public.name")}
                  placeholder={t("public.name")}
                  value={publicForm.name}
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
                <button className="primary-button" type="button" onClick={() => setWizardStep(detailsRequired ? "address" : "review")}>{t("public.continue")} <ArrowRight size={18} /></button>
              </div>
            </div>
          )}

          {wizardStep === "address" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <MapPin size={22} />
                <h3>{copy.detailsTitle}</h3>
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
              <Field label={isRequired("address") ? signerFieldLabel(copy.addressLabel, "address") : copy.addressLabel}>
                <input
                  aria-label={copy.addressLabel}
                  placeholder={copy.addressPlaceholder}
                  value={publicForm.address}
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
                <button className="primary-button" type="button" onClick={() => setWizardStep("review")}>{t("public.review")} <ArrowRight size={18} /></button>
              </div>
            </div>
          )}

          {wizardStep === "review" && (
            <div className="wizard-body">
              <div className="wizard-copy">
                <ClipboardList size={22} />
                <h3>{copy.reviewTitle}</h3>
                <p>{copy.reviewHelp}</p>
              </div>
              <div className="review-card">
                <span>{t("public.name")} <strong>{publicForm.name || copy.notEntered}</strong></span>
                <span>{t("public.phone")} <strong>{publicForm.phone || copy.notEntered}</strong></span>
                <span>{copy.reviewAuthority} <strong>{publicForm.selectedAuthorityName || resolvedAuthority.name}</strong></span>
                <span>{copy.reviewReferral} <strong>{publicForm.referredByPhoneOrCode || copy.none}</strong></span>
              </div>
              <div className="trust-section" aria-label={copy.trustLabel}>
                <span><ShieldCheck size={18} /> {copy.privacyRespected}</span>
                <span><LockKeyhole size={18} /> {copy.storedSecurely}</span>
                <span><CheckCircle2 size={18} /> {copy.routedAuthority}</span>
              </div>
              <label className="check-row">
                <input required type="checkbox" name="supportAppealConsent" /> {copy.supportCheckbox}
              </label>
              <label className="check-row">
                <input required type="checkbox" name="campaignConsent" /> {campaign.consentText}
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
                Keep me informed about this campaign. This optional communication consent can be withdrawn.
              </label>
              {campaign.donationEnabled && <DonationCard campaign={campaign} />}
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep(detailsRequired || hasOptionalDetails ? "address" : "profile")}>{t("public.back")}</button>
                <button className="primary-button" type="submit" disabled={submitting} aria-busy={submitting}>
                  <CheckCircle2 size={18} /> {submitting ? experienceCopy.submitWorking : t("public.submitSupport")}
                </button>
              </div>
            </div>
          )}

          {wizardStep === "done" && hasSignedCampaign && (
            <div className="wizard-body done-card">
              <CheckCircle2 size={28} />
              <h3>{t("public.thankYou")}</h3>
              <p>{copy.doneBody}</p>
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep("review")}>{copy.viewSignature}</button>
                <button className="primary-button" type="button" onClick={shareNatively}>{t("public.share")} <Send size={18} /></button>
              </div>
              <section className="public-post-sign-next" aria-labelledby="public-next-steps-title">
                <h4 id="public-next-steps-title">{experienceCopy.optionalNext}</h4>
                <div className="public-post-sign-actions">
                  <button className="secondary-button" type="button" onClick={shareNatively}>
                    <Share2 size={18} /> {t("public.share")}
                  </button>
                  {onUploadSupporterPhoto && (
                    <button className="secondary-button" type="button" onClick={() => setPostSignPanel("photo")}>
                      {experienceCopy.photo.title}
                    </button>
                  )}
                  <button className="secondary-button" type="button" onClick={() => setPostSignPanel("coordinator")}>
                    <Users size={18} /> {experienceCopy.becomeCoordinator}
                  </button>
                  {campaign.donationEnabled && (
                    <button className="secondary-button" type="button" onClick={() => setPostSignPanel("donation")}>
                      <HeartHandshake size={18} /> {campaign.donationCaption || "Donate"}
                    </button>
                  )}
                  <button className="text-button" type="button" onClick={() => setPostSignPanel("none")}>
                    {experienceCopy.notNow}
                  </button>
                </div>

                {postSignPanel === "photo" && onUploadSupporterPhoto && (
                  <PublicSupporterPhoto
                    copy={experienceCopy.photo}
                    onUpload={onUploadSupporterPhoto}
                    onSkip={() => setPostSignPanel("none")}
                  />
                )}

                {postSignPanel === "coordinator" && (
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
                              ? "Pending Approval"
                              : experienceCopy.coordinatorContact
                          }
                        </button>
                      ) : (
                        <a
                          className="primary-link-button"
                          href={`mailto:${campaign.adminEmail}?subject=${encodeURIComponent(
                            `${experienceCopy.becomeCoordinator}: ${campaign.title}`
                          )}&body=${encodeURIComponent(
                            `I signed "${campaign.title}" and would like a coordinator invitation. Please use my verified supporter profile and the existing Coordinator Network approval, role, geography, and reporting-manager workflow.`
                          )}`}
                        >
                          <Mail size={18} /> {experienceCopy.coordinatorContact}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {postSignPanel === "donation" && campaign.donationEnabled && (
                  <DonationCard campaign={campaign} />
                )}
              </section>
            </div>
          )}

          {displayPublicMessage && <p className="success-message">{displayPublicMessage}</p>}
          {hasSignedCampaign && lastSignedSigner && (
            <ViralPostSignExperience
              campaign={campaign}
              organization={organization}
              signer={lastSignedSigner}
              campaignSigners={campaignSigners}
              metrics={metrics}
              growthSnapshot={growthSnapshot}
              growthPortal={growthPortal}
              personalReferralUrl={personalReferralUrl}
              personalReferralCode={personalReferralCode}
              shareMessages={shareMessages}
              shareClicks={shareClicks}
              copiedReferral={copiedReferral}
              publicMessage={publicMessage}
              onTrackShareClick={trackShareClick}
              onCopyReferralText={copyReferralText}
              onShareNatively={shareNatively}
              onDownloadQrPoster={() => {
                trackShareClick("qr");
                downloadQrPosterSvg({
                  campaign,
                  organizationName: organization?.name ?? "VoiceUp",
                  url: personalReferralUrl,
                  referralCode: personalReferralCode
                });
              }}
              onPrintPoster={() => {
                trackShareClick("poster");
                window.print();
              }}
              onDownloadAppealPdf={async () => {
                const { exportSignerAppealPdf } = await import("../pdfExports");
                exportSignerAppealPdf(campaign, lastSignedSigner, resolvedAuthority);
              }}
            />
          )}
        </form>
      </Panel>

      {!hasSignedCampaign && (
        <a className="sticky-support-button" href="#public-sign-form">
          <CheckCircle2 size={18} /> {t("public.supportCampaign")}
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
