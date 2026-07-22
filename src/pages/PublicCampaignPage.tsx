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
import { VoiceUpStoryCarousel } from "../components/VoiceUpStoryCarousel";
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

const signingSteps: Array<{ id: SigningStepId }> = [
  { id: "phone" },
  { id: "otp" },
  { id: "profile" },
  { id: "address" },
  { id: "review" },
  { id: "done" }
];

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
      setCopiedReferral(t("public.copied"));
      onGrowthShare?.({ channel, url: value });
    } catch {
      setCopiedReferral(t("public.copyFailed"));
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

            <div className="public-trust-strip" aria-label={t("public.trustIndicators")}>
              <span><ShieldCheck size={16} /> {t("public.privacyRespected")}</span>
              <span><LockKeyhole size={16} /> {t("public.otpVerified")}</span>
              <span><CheckCircle2 size={16} /> {t("public.routedToAuthority")}</span>
            </div>
          </div>
        </article>

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
        <div className="public-language-selector">
          <LanguageSwitcher />
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

        <form id="public-sign-form" className="form-stack public-sign-form public-sign-wizard" onSubmit={onSubmit}>
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
                  onChange={(event) => setPublicForm({ ...publicForm, phone: event.target.value })}
                />
              </Field>
              <button className="primary-button" type="button" onClick={handleSendOtpWizard}>
                {t("public.sendOtp")} <ArrowRight size={18} />
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
                  onChange={(event) => setOtpInput(event.target.value)}
                />
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={handleSendOtpWizard}>{copy.resendOtp}</button>
                  <button className="primary-button" type="button" onClick={handleVerifyOtpWizard}>{t("public.verifyOtp")}</button>
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
              {campaign.donationEnabled && <DonationCard campaign={campaign} />}
              <div className="wizard-actions">
                <button className="secondary-button" type="button" onClick={() => setWizardStep(detailsRequired || hasOptionalDetails ? "address" : "profile")}>{t("public.back")}</button>
                <button className="primary-button" type="submit">
                  <CheckCircle2 size={18} /> {t("public.submitSupport")}
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
