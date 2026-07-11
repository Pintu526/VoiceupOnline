import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users
} from "lucide-react";
import type { AuthorityRule, Campaign, Organization, Signer, SignerRequiredField } from "../types";
import { getConfiguredGrowthShareMessages } from "../growth/configuration";
import type { GrowthShareContext, GrowthSupporterSnapshot } from "../growth/lifecycle";
import type { SupporterGrowthPortalModel } from "../growth/tree";
import { ViralPostSignExperience } from "../growth/supporter";
import type { LocationDeletions, LocationOverrides } from "../geography";
import type { getCampaignMetrics } from "../lib";
import { Panel } from "../ui/Panel";
import { Field } from "../ui/Field";
import { DonationCard } from "../components/DonationCard";
import { IndiaLocationFields } from "../components/IndiaLocationFields";
import { GlobalLocationFields } from "../components/GlobalLocationFields";
import { ReferralQrPreview } from "../components/ReferralQrPreview";
import { blankSigner } from "../constants";
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
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  onGrowthShare?: (share: GrowthShareContext) => void;
  onSubmit: (event: FormEvent) => void;
}

type SigningStepId = "phone" | "otp" | "profile" | "address" | "review" | "done";
type PublicSigningLanguage = "en" | "hi" | "or";

const signingSteps: Array<{ id: SigningStepId }> = [
  { id: "phone" },
  { id: "otp" },
  { id: "profile" },
  { id: "address" },
  { id: "review" },
  { id: "done" }
];

const publicSigningLanguageOptions: Array<{ id: PublicSigningLanguage; label: string }> = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "or", label: "ଓଡ଼ିଆ" }
];

const publicSigningCopyEn = {
  languageLabel: "Signing language",
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
  requiredNote: "Fields marked * are required.",
  invitedBy: "You were invited by",
  invitedFallback: "a campaign supporter",
  referralOptional: "Referral is optional and never affects your ability to sign.",
  phoneVerifiedTitle: "Phone verified",
  phoneVerifiedBody: "Continue to sign, review your details, or share the campaign.",
  continue: "Continue",
  back: "Back",
  viewSignature: "View signature",
  shareCampaign: "Share campaign",
  referFriends: "Refer friends",
  phoneTitle: "Start with your phone",
  phoneHelp: "OTP keeps signatures credible and protects the campaign from spam.",
  phoneLabel: "Phone",
  phonePlaceholder: "Phone",
  sendOtp: "Send OTP",
  otpTitle: "Verify OTP",
  otpHelp: "Enter the code sent to your phone.",
  otpLabel: "Enter OTP",
  otpPlaceholder: "Enter OTP",
  resendOtp: "Resend OTP",
  verifyOtp: "Verify OTP",
  phoneVerified: "Phone verified",
  profileTitle: "Your signature profile",
  profileHelp: "Enter the required signer details.",
  fullNameLabel: "Full name",
  fullNamePlaceholder: "Full name",
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
  optionalPlaceholder: "Optional",
  referralHelp: "Use a referrer phone, name, or code if someone invited you.",
  reviewAction: "Review",
  reviewTitle: "Review and sign",
  reviewHelp: "Confirm your support and submit your signature to this campaign.",
  reviewName: "Name",
  reviewPhone: "Phone",
  reviewAuthority: "Authority",
  reviewReferral: "Referral",
  notEntered: "Not entered",
  none: "None",
  trustLabel: "Trust and privacy",
  privacyRespected: "Privacy respected",
  storedSecurely: "Signature stored securely",
  routedAuthority: "Petition routed to selected authority",
  supportCheckbox: "I have read and support the campaign appeal/cause shown above.",
  signCampaign: "Sign campaign",
  doneTitle: "Signature saved successfully.",
  doneBody: "Your voice has been recorded. Share this campaign to help it reach the next supporter.",
  support: "Support",
  locationLabels: {
    country: "Country",
    state: "State",
    district: "District",
    block: "Block / Tehsil / Taluk",
    panchayat: "Gram Panchayat / Ward",
    postalCode: "PIN / Postal code"
  }
};

const publicSigningCopy: Record<PublicSigningLanguage, typeof publicSigningCopyEn> = {
  en: publicSigningCopyEn,
  hi: {
    languageLabel: "हस्ताक्षर भाषा",
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
    requiredNote: "* वाले फ़ील्ड जरूरी हैं।",
    invitedBy: "आपको आमंत्रित किया",
    invitedFallback: "एक अभियान समर्थक",
    referralOptional: "रेफ़रल वैकल्पिक है और हस्ताक्षर करने की क्षमता को प्रभावित नहीं करता।",
    phoneVerifiedTitle: "फोन सत्यापित",
    phoneVerifiedBody: "हस्ताक्षर जारी रखें, विवरण देखें, या अभियान साझा करें।",
    continue: "जारी रखें",
    back: "वापस",
    viewSignature: "हस्ताक्षर देखें",
    shareCampaign: "अभियान साझा करें",
    referFriends: "मित्रों को भेजें",
    phoneTitle: "अपने फोन से शुरू करें",
    phoneHelp: "OTP हस्ताक्षरों को विश्वसनीय रखता है और अभियान को स्पैम से बचाता है।",
    phoneLabel: "फोन",
    phonePlaceholder: "फोन",
    sendOtp: "OTP भेजें",
    otpTitle: "OTP सत्यापित करें",
    otpHelp: "अपने फोन पर भेजा गया कोड दर्ज करें।",
    otpLabel: "OTP दर्ज करें",
    otpPlaceholder: "OTP दर्ज करें",
    resendOtp: "OTP फिर भेजें",
    verifyOtp: "OTP सत्यापित करें",
    phoneVerified: "फोन सत्यापित",
    profileTitle: "आपका हस्ताक्षर प्रोफाइल",
    profileHelp: "जरूरी समर्थक विवरण दर्ज करें।",
    fullNameLabel: "पूरा नाम",
    fullNamePlaceholder: "पूरा नाम",
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
    optionalPlaceholder: "वैकल्पिक",
    referralHelp: "यदि किसी ने आमंत्रित किया है तो फोन, नाम, या कोड दर्ज करें।",
    reviewAction: "समीक्षा",
    reviewTitle: "समीक्षा करें और हस्ताक्षर करें",
    reviewHelp: "अपना समर्थन पुष्टि करें और हस्ताक्षर जमा करें।",
    reviewName: "नाम",
    reviewPhone: "फोन",
    reviewAuthority: "अधिकारी",
    reviewReferral: "रेफ़रल",
    notEntered: "दर्ज नहीं",
    none: "कोई नहीं",
    trustLabel: "विश्वास और गोपनीयता",
    privacyRespected: "गोपनीयता का सम्मान",
    storedSecurely: "हस्ताक्षर सुरक्षित रूप से संग्रहीत",
    routedAuthority: "याचिका चुने गए अधिकारी तक भेजी जाएगी",
    supportCheckbox: "मैंने ऊपर दिखाए गए अभियान अपील/कारण को पढ़ा है और समर्थन करता/करती हूं।",
    signCampaign: "अभियान पर हस्ताक्षर करें",
    doneTitle: "हस्ताक्षर सफलतापूर्वक सहेजा गया।",
    doneBody: "आपकी आवाज दर्ज हो गई है। अगले समर्थक तक पहुंचने के लिए अभियान साझा करें।",
    support: "समर्थन",
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
    languageLabel: "ସହି ଭାଷା",
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
    requiredNote: "* ଥିବା ଫିଲ୍ଡ ଆବଶ୍ୟକ।",
    invitedBy: "ଆପଣଙ୍କୁ ଆମନ୍ତ୍ରଣ କରିଛନ୍ତି",
    invitedFallback: "ଏକ ଅଭିଯାନ ସମର୍ଥକ",
    referralOptional: "ରେଫରାଲ ବୈକଳ୍ପିକ ଏବଂ ସହି କରିବାକୁ ପ୍ରଭାବିତ କରେ ନାହିଁ।",
    phoneVerifiedTitle: "ଫୋନ ସତ୍ୟାପିତ",
    phoneVerifiedBody: "ସହି ଜାରି ରଖନ୍ତୁ, ବିବରଣୀ ଦେଖନ୍ତୁ, କିମ୍ବା ଅଭିଯାନ ସେୟାର କରନ୍ତୁ।",
    continue: "ଜାରି ରଖନ୍ତୁ",
    back: "ପଛକୁ",
    viewSignature: "ସହି ଦେଖନ୍ତୁ",
    shareCampaign: "ଅଭିଯାନ ସେୟାର କରନ୍ତୁ",
    referFriends: "ମିତ୍ରଙ୍କୁ ପଠାନ୍ତୁ",
    phoneTitle: "ଆପଣଙ୍କ ଫୋନରୁ ଆରମ୍ଭ କରନ୍ତୁ",
    phoneHelp: "OTP ସହିକୁ ବିଶ୍ୱସନୀୟ ରଖେ ଏବଂ ଅଭିଯାନକୁ ସ୍ପାମରୁ ସୁରକ୍ଷା କରେ।",
    phoneLabel: "ଫୋନ",
    phonePlaceholder: "ଫୋନ",
    sendOtp: "OTP ପଠାନ୍ତୁ",
    otpTitle: "OTP ସତ୍ୟାପିତ କରନ୍ତୁ",
    otpHelp: "ଆପଣଙ୍କ ଫୋନକୁ ପଠାଯାଇଥିବା କୋଡ୍ ଦିଅନ୍ତୁ।",
    otpLabel: "OTP ଦିଅନ୍ତୁ",
    otpPlaceholder: "OTP ଦିଅନ୍ତୁ",
    resendOtp: "OTP ପୁନଃ ପଠାନ୍ତୁ",
    verifyOtp: "OTP ସତ୍ୟାପିତ କରନ୍ତୁ",
    phoneVerified: "ଫୋନ ସତ୍ୟାପିତ",
    profileTitle: "ଆପଣଙ୍କ ସହି ପ୍ରୋଫାଇଲ",
    profileHelp: "ଆବଶ୍ୟକ ସମର୍ଥକ ବିବରଣୀ ଦିଅନ୍ତୁ।",
    fullNameLabel: "ପୂର୍ଣ୍ଣ ନାମ",
    fullNamePlaceholder: "ପୂର୍ଣ୍ଣ ନାମ",
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
    optionalPlaceholder: "ବୈକଳ୍ପିକ",
    referralHelp: "କେହି ଆମନ୍ତ୍ରଣ କରିଥିଲେ ଫୋନ, ନାମ, କିମ୍ବା କୋଡ୍ ବ୍ୟବହାର କରନ୍ତୁ।",
    reviewAction: "ସମୀକ୍ଷା",
    reviewTitle: "ସମୀକ୍ଷା କରନ୍ତୁ ଏବଂ ସହି କରନ୍ତୁ",
    reviewHelp: "ଆପଣଙ୍କ ସମର୍ଥନ ନିଶ୍ଚିତ କରି ସହି ଦାଖଲ କରନ୍ତୁ।",
    reviewName: "ନାମ",
    reviewPhone: "ଫୋନ",
    reviewAuthority: "କର୍ତ୍ତୃପକ୍ଷ",
    reviewReferral: "ରେଫରାଲ",
    notEntered: "ଦିଆଯାଇନାହିଁ",
    none: "କିଛି ନାହିଁ",
    trustLabel: "ଭରସା ଏବଂ ଗୋପନୀୟତା",
    privacyRespected: "ଗୋପନୀୟତାର ସମ୍ମାନ",
    storedSecurely: "ସହି ସୁରକ୍ଷିତ ଭାବେ ସଂରକ୍ଷିତ",
    routedAuthority: "ଆବେଦନ ଚୟିତ କର୍ତ୍ତୃପକ୍ଷଙ୍କୁ ପଠାଯିବ",
    supportCheckbox: "ମୁଁ ଉପରେ ଦେଖାଯାଇଥିବା ଅଭିଯାନ ଅପିଲ/କାରଣ ପଢିଛି ଏବଂ ସମର୍ଥନ କରୁଛି।",
    signCampaign: "ଅଭିଯାନରେ ସହି କରନ୍ତୁ",
    doneTitle: "ସହି ସଫଳତାର ସହିତ ସଂରକ୍ଷିତ ହେଲା।",
    doneBody: "ଆପଣଙ୍କ ଆବାଜ ରେକର୍ଡ ହୋଇଛି। ପରବର୍ତ୍ତୀ ସମର୍ଥକଙ୍କୁ ପହଞ୍ଚିବା ପାଇଁ ଅଭିଯାନ ସେୟାର କରନ୍ତୁ।",
    support: "ସମର୍ଥନ",
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

function readPublicSigningLanguage(): PublicSigningLanguage {
  if (typeof window === "undefined") return "en";
  const storedLanguage = window.localStorage.getItem("voiceup-public-signing-language");
  return storedLanguage === "hi" || storedLanguage === "or" ? storedLanguage : "en";
}

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
  onSubmit
}: PublicCampaignPageProps) {
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
  const participationLabel = isGlobalMode ? `${locationLabels.district} participation` : "District participation";
  const locationParticipation = campaign.district || restrictedPublicForm.district || "Not captured yet";
  const requiredFields = campaign.requiredFields ?? [];
  const [language, setLanguage] = useState<PublicSigningLanguage>(() => readPublicSigningLanguage());
  const copy = publicSigningCopy[language];
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
  const [wizardStep, setWizardStep] = useState<SigningStepId>(publicForm.otpVerified ? "profile" : "phone");
  const [hasRestoredWizard, setHasRestoredWizard] = useState(false);
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
    `Support ${campaign.title} and help move this public issue toward visible action.`;
  const authorityCards = (campaign.authoritySelectionMode === "public_choice" && publicAuthorityOptions.length > 0
    ? publicAuthorityOptions
    : [resolvedAuthority]
  ).slice(0, 3);
  const storyCards = [
    {
      icon: <HeartHandshake size={20} />,
      title: "The public ask",
      body: campaign.appealContent || campaign.description
    },
    {
      icon: <Landmark size={20} />,
      title: "Who receives it",
      body: formatAuthorityDisplay(resolvedAuthority)
    },
    {
      icon: <CalendarDays size={20} />,
      title: "Campaign window",
      body: `${campaign.startDate || "Open now"} to ${campaign.endDate || "goal reached"}`
    }
  ];
  const testimonialCards = [
    "A clear, verified signature helps the organizer show public demand.",
    "Voiceup keeps the campaign structured so supporters know what action is being requested.",
    "Sharing after signing helps bring the issue to more people who care."
  ];
  const updateCards = [
    `${metrics.verified.toLocaleString()} verified supporters have joined this campaign.`,
    `${metrics.progress}% of the target has been reached so far.`,
    `The petition is prepared for ${resolvedAuthority.name}.`
  ];
  const shareText = `${shareMessages.social}\n${personalReferralUrl}`;
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareMessages.whatsapp || shareText)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(personalReferralUrl)}&text=${encodeURIComponent(shareMessages.social)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(personalReferralUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(shareMessages.emailSubject)}&body=${encodeURIComponent(shareMessages.emailBody)}`
  };
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
    if (typeof window === "undefined") return;
    window.localStorage.setItem("voiceup-public-signing-language", language);
  }, [language]);

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
      const saved = JSON.parse(window.localStorage.getItem(draftStorageKey) ?? "null") as
        | { step?: SigningStepId; form?: Partial<typeof blankSigner> }
        | null;
      if (!saved) return;
      if (saved.form) {
        setPublicForm((current) => ({ ...current, ...saved.form }));
      }
      if (saved.step && signingSteps.some((step) => step.id === saved.step)) {
        setWizardStep(saved.step);
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, hasRestoredWizard, setPublicForm]);

  useEffect(() => {
    if (!hasRestoredWizard || typeof window === "undefined") return;
    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({ step: wizardStep, form: publicForm })
    );
  }, [draftStorageKey, hasRestoredWizard, publicForm, wizardStep]);

  useEffect(() => {
    if (hasSignedCampaign && wizardStep !== "done") {
      setWizardStep("done");
      return;
    }
    if (publicForm.otpVerified && (wizardStep === "phone" || wizardStep === "otp")) {
      setWizardStep("profile");
    }
  }, [hasSignedCampaign, publicForm.otpVerified, wizardStep]);

  function handleSendOtpWizard() {
    onSendOtp();
    if (publicForm.phone.trim()) setWizardStep("otp");
  }

  function handleVerifyOtpWizard() {
    onVerifyOtp();
  }

  async function copyReferralText(
    label: string,
    value: string,
    channel: GrowthShareContext["channel"] = "copy"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedReferral("✓ Copied");
      onGrowthShare?.({ channel, url: value });
    } catch {
      setCopiedReferral("Copy failed. Select and copy the link manually.");
    }
  }

  function trackShareClick(channel: GrowthShareContext["channel"]) {
    setShareClicks((current) => current + 1);
    onGrowthShare?.({ channel, url: personalReferralUrl });
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
    await copyReferralText("Referral link", personalReferralUrl);
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
                <span className="eyebrow">Verified public campaign</span>
                <span className="status-pill" data-status={campaign.status}>{campaign.status}</span>
              </div>
              <h1>{campaign.title}</h1>
              <p className="public-summary">{heroSummary}</p>
              <div className="public-hero-actions">
                <a className="primary-button" href="#public-sign-form">
                  Sign in minutes <ArrowRight size={18} />
                </a>
                <button className="secondary-button" type="button" onClick={shareNatively}>
                  <Share2 size={18} /> Share campaign
                </button>
              </div>
            </div>

            <div className="public-progress public-progress-premium" aria-label="Campaign progress">
              <div className="progress-header">
                <span>Live progress</span>
                <strong>{metrics.progress}%</strong>
              </div>
              <div className="progress public-progress-bar">
                <div style={{ width: `${metrics.progress}%` }} />
              </div>
              <div>
                <strong>{metrics.verified.toLocaleString()}</strong>
                <span>of {campaignGoal.toLocaleString()} verified signatures</span>
              </div>
            </div>

            <div className="supporter-counter" aria-label="Supporter count">
              <div>
                <Users size={18} />
                <span>Total supporters</span>
                <strong>{metrics.total.toLocaleString()}</strong>
              </div>
              <div>
                <BadgeCheck size={18} />
                <span>Verified supporters</span>
                <strong>{metrics.verified.toLocaleString()}</strong>
              </div>
              <div>
                <MapPin size={18} />
                <span>{participationLabel}</span>
                <strong>{locationParticipation}</strong>
              </div>
            </div>

            <div className="public-trust-strip" aria-label="Voiceup trust indicators">
              <span><ShieldCheck size={16} /> Privacy respected</span>
              <span><LockKeyhole size={16} /> OTP verified</span>
              <span><CheckCircle2 size={16} /> Routed to authority</span>
            </div>
          </div>
        </article>

        <section className="public-section public-share-panel" aria-labelledby="share-campaign-heading">
          <div className="public-section-heading">
            <span className="eyebrow">Share this campaign</span>
            <h2 id="share-campaign-heading">Every share can create another verified supporter.</h2>
          </div>
          <div className="share-panel-grid">
            <div className="share-qr-card">
              <ReferralQrPreview value={personalReferralUrl} label="Campaign QR" caption={campaign.qrLabel} compact />
              <code>{personalReferralUrl}</code>
              {copiedReferral && <span className="inline-copy-state">{copiedReferral}</span>}
            </div>
            <div className="share-actions-grid">
              <button className="secondary-button" type="button" onClick={() => copyReferralText("Campaign link", personalReferralUrl, "copy")}>
                <Copy size={16} /> Copy
              </button>
              <button className="secondary-button" type="button" onClick={shareNatively}>
                <Share2 size={16} /> Native Share
              </button>
              <a className="secondary-link-button" href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => trackShareClick("whatsapp")}>WhatsApp</a>
              <a className="secondary-link-button" href={shareLinks.telegram} target="_blank" rel="noreferrer" onClick={() => trackShareClick("telegram")}>Telegram</a>
              <a className="secondary-link-button" href={shareLinks.facebook} target="_blank" rel="noreferrer" onClick={() => trackShareClick("facebook")}>Facebook</a>
              <a className="secondary-link-button" href={shareLinks.email} onClick={() => trackShareClick("email")}><Mail size={16} /> Email</a>
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="authority-heading">
          <div className="public-section-heading">
            <span className="eyebrow">Authority path</span>
            <h2 id="authority-heading">Your signature supports a clear appeal to the right decision makers.</h2>
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
            <span className="eyebrow">Campaign story</span>
            <h2 id="story-heading">What happens when people add their voice.</h2>
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
              <span className="eyebrow">Updates</span>
              <h2 id="updates-heading">Live movement signals.</h2>
            </div>
            <div className="update-stack">
              {updateCards.map((item) => (
                <div key={item}><Sparkles size={16} /> {item}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="public-section-heading">
              <span className="eyebrow">Supporter trust</span>
              <h2>Why people sign with confidence.</h2>
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
            <span className="eyebrow">FAQ</span>
            <h2 id="faq-heading">Simple answers before you sign.</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>How long does signing take?</summary>
              <p>Most supporters finish in under two minutes after phone verification.</p>
            </details>
            <details>
              <summary>Why is OTP required?</summary>
              <p>OTP helps protect the campaign from spam, misuse, and duplicate signatures.</p>
            </details>
            <details>
              <summary>What happens after I sign?</summary>
              <p>Your verified support is counted and can be included in the campaign appeal to the selected authority.</p>
            </details>
          </div>
        </section>

        <section className="public-section" aria-labelledby="related-heading">
          <div className="public-section-heading">
            <span className="eyebrow">Related campaigns</span>
            <h2 id="related-heading">More ways to support this cause.</h2>
          </div>
          <div className="related-campaigns-grid">
            <a href={publicUrl}>
              <span>{campaign.category}</span>
              <strong>{campaign.title}</strong>
              <p>{formatLocationForCampaign(campaign, campaign)}</p>
            </a>
            <a href={publicUrl}>
              <span>{organization?.name || "Voiceup"}</span>
              <strong>Share this campaign with your network</strong>
              <p>Help the organizer reach the next supporter milestone.</p>
            </a>
          </div>
        </section>

        {campaign.donationEnabled && <DonationCard campaign={campaign} compact />}
        {campaign.campaignVideoUrl && (
          <a className="video-link" href={campaign.campaignVideoUrl} target="_blank" rel="noreferrer">
            Watch campaign video
          </a>
        )}
      </div>

      <Panel title={hasSignedCampaign ? copy.panelTitleComplete : copy.panelTitleSign} icon={<ClipboardList />}>
        <div className="public-language-selector">
          <label htmlFor="public-signing-language">{copy.languageLabel}</label>
          <select
            id="public-signing-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as PublicSigningLanguage)}
          >
            {publicSigningLanguageOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="wizard-header">
          <span className="eyebrow">{copy.secureSigning}</span>
          <h2>{hasSignedCampaign ? copy.headerComplete : copy.headerActive}</h2>
          <p>{copy.headerHelp}</p>
        </div>

        {publicForm.otpVerified && !hasSignedCampaign && (
          <div className="verified-welcome" aria-live="polite">
            <UserRound size={20} />
            <div>
              <strong>{copy.phoneVerifiedTitle}</strong>
              <span>{copy.phoneVerifiedBody}</span>
            </div>
            <div className="verified-actions">
              <button className="secondary-button" type="button" onClick={() => setWizardStep("profile")}>{copy.continue}</button>
              <button className="secondary-button" type="button" onClick={() => setWizardStep("review")}>{copy.viewSignature}</button>
              <button className="secondary-button" type="button" onClick={shareNatively}>{copy.shareCampaign}</button>
              <button className="secondary-button" type="button" onClick={() => copyReferralText("Campaign link", personalReferralUrl, "copy")}>{copy.referFriends}</button>
            </div>
          </div>
        )}

        <ol className="wizard-steps" aria-label="Signing steps">
          {activeSigningSteps.map((step, index) => (
            <li key={step.id}>
              <button
                type="button"
                className={index === activeStepIndex ? "wizard-step is-active" : index < activeStepIndex ? "wizard-step is-complete" : "wizard-step"}
                aria-current={index === activeStepIndex ? "step" : undefined}
                onClick={() => setWizardStep(step.id)}
              >
                <span>{index + 1}</span>
                {copy.steps[step.id]}
              </button>
            </li>
          ))}
        </ol>

        <form id="public-sign-form" className="form-stack public-sign-form public-sign-wizard" onSubmit={onSubmit}>
          <p className="required-note">{copy.requiredNote}</p>
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
              <Field label={signerFieldLabel(copy.phoneLabel, "phone")}>
                <input
                  aria-label={copy.phoneLabel}
                  placeholder={copy.phonePlaceholder}
                  value={publicForm.phone}
                  onChange={(event) => setPublicForm({ ...publicForm, phone: event.target.value })}
                />
              </Field>
              <button className="primary-button" type="button" onClick={handleSendOtpWizard}>
                {copy.sendOtp} <ArrowRight size={18} />
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
                  aria-label={copy.otpLabel}
                  placeholder={copy.otpPlaceholder}
                  value={otpInput}
                  onChange={(event) => setOtpInput(event.target.value)}
                />
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={handleSendOtpWizard}>{copy.resendOtp}</button>
                  <button className="primary-button" type="button" onClick={handleVerifyOtpWizard}>{copy.verifyOtp}</button>
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
              <Field label={signerFieldLabel(copy.fullNameLabel, "name")}>
                <input
                  aria-label={copy.fullNameLabel}
                  placeholder={copy.fullNamePlaceholder}
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
                <button className="secondary-button" type="button" onClick={() => setWizardStep("otp")}>{copy.back}</button>
                {!detailsRequired && (
                  <button className="secondary-button" type="button" onClick={() => setWizardStep("address")}>{copy.addOptionalDetails}</button>
                )}
                <button className="primary-button" type="button" onClick={() => setWizardStep(detailsRequired ? "address" : "review")}>{copy.continue} <ArrowRight size={18} /></button>
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
                    placeholder={copy.optionalPlaceholder}
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
                <button className="secondary-button" type="button" onClick={() => setWizardStep("profile")}>{copy.back}</button>
                <button className="primary-button" type="button" onClick={() => setWizardStep("review")}>{copy.reviewAction} <ArrowRight size={18} /></button>
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
                <span>{copy.reviewName} <strong>{publicForm.name || copy.notEntered}</strong></span>
                <span>{copy.reviewPhone} <strong>{publicForm.phone || copy.notEntered}</strong></span>
                <span>{copy.reviewAuthority} <strong>{publicForm.selectedAuthorityName || resolvedAuthority.name}</strong></span>
                <span>{copy.reviewReferral} <strong>{publicForm.referredByPhoneOrCode || copy.none}</strong></span>
              </div>
              <div className="trust-section" aria-label={copy.trustLabel}>
                <span><ShieldCheck size={18} /> {copy.privacyRespected}</span>
                <span><LockKeyhole size={18} /> {copy.storedSecurely}</span>
                <span><CheckCircle2 size={18} /> {copy.routedAuthority}</span>
              </div>
              <label className="check-row">
                <input required type="checkbox" /> {copy.supportCheckbox}
              </label>
              <label className="check-row">
                <input required type="checkbox" /> {campaign.consentText}
              </label>
              {campaign.donationEnabled && <DonationCard campaign={campaign} />}
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep(detailsRequired || hasOptionalDetails ? "address" : "profile")}>{copy.back}</button>
                <button className="primary-button" type="submit">
                  <CheckCircle2 size={18} /> {copy.signCampaign}
                </button>
              </div>
            </div>
          )}

          {wizardStep === "done" && hasSignedCampaign && (
            <div className="wizard-body done-card">
              <CheckCircle2 size={28} />
              <h3>{copy.doneTitle}</h3>
              <p>{copy.doneBody}</p>
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep("review")}>{copy.viewSignature}</button>
                <button className="primary-button" type="button" onClick={shareNatively}>{copy.shareCampaign} <Send size={18} /></button>
              </div>
            </div>
          )}

          {publicMessage && <p className="success-message">{publicMessage}</p>}
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
                  organizationName: organization?.name ?? "Voiceup",
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
          <CheckCircle2 size={18} /> {copy.support}
        </a>
      )}
    </section>
  );
}

export function PublicCampaignNotFound({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Campaign link</span>
        <h1>This campaign is not available.</h1>
        <p>
          Please check the campaign link or ask the campaign organizer to publish the campaign
          again. The public signing page shows only campaign content when a published campaign is
          available.
        </p>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
          >
            Retry loading campaign
          </button>
          <a className="secondary-link-button" href="/">
            Go to Voiceup
          </a>
        </div>
      </section>
    </main>
  );
}

export function PublicCampaignLoading({ message }: { message: string }) {
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">Loading campaign</span>
        <h1>Loading campaign details...</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
