import type { Language } from "../i18n";
import { normalizeIndianPhone } from "../shared/deduplication/supporterIdentity.ts";

export const GAU_SAMMAN_PREMIUM_SLUG = "gau-samman-ahvaan-abhiyan";

export interface PublicCampaignPresentationCopy {
  identityLine: string;
  primaryAction: string;
  secondaryAction: string;
  participationTitle: string;
  participationTime: string;
  verifiedParticipation: string;
  privacyRespect: string;
  transparentCampaign: string;
  storyTitle: string;
  storyHelp: string;
  pillars: [string, string, string];
  phoneLabel: string;
  phoneHint: string;
  phoneIncomplete: string;
  phoneInvalid: string;
  heroFallbackLabel: string;
}

export interface PublicCampaignPresentation {
  slug: string;
  kind: "premium-national";
  defaultLanguage: Language;
  logoAsset: string;
  heroAsset: string;
  placeholderHeroAsset: string;
  copy: Record<Language, PublicCampaignPresentationCopy>;
}

const gauSammanCopy: Record<Language, PublicCampaignPresentationCopy> = {
  hi: {
    identityLine: "सेवा | सुरक्षा | सम्मान",
    primaryAction: "अपना समर्थन दें",
    secondaryAction: "WhatsApp पर साझा करें",
    participationTitle: "अपना समर्थन दें",
    participationTime: "सिर्फ 60 सेकंड में जुड़ें",
    verifiedParticipation: "OTP सत्यापित भागीदारी",
    privacyRespect: "गोपनीयता का सम्मान",
    transparentCampaign: "पारदर्शी अभियान",
    storyTitle: "यह अभियान क्यों महत्वपूर्ण है",
    storyHelp: "अभियान के प्रकाशित संदेश और नागरिक भागीदारी के उद्देश्य को समझें।",
    pillars: ["सेवा", "सुरक्षा", "सम्मान"],
    phoneLabel: "मोबाइल नंबर",
    phoneHint: "भारत का 10 अंकों का मोबाइल नंबर दर्ज करें।",
    phoneIncomplete: "10 अंक पूरे होने पर OTP प्राप्त कर सकेंगे।",
    phoneInvalid: "6, 7, 8 या 9 से शुरू होने वाला वैध भारतीय मोबाइल नंबर दर्ज करें।",
    heroFallbackLabel: "अभियान का स्वीकृत मुख्य चित्र शीघ्र जोड़ा जाएगा"
  },
  en: {
    identityLine: "Service | Protection | Respect",
    primaryAction: "Add Your Support",
    secondaryAction: "Share on WhatsApp",
    participationTitle: "Add Your Support",
    participationTime: "Join in just 60 seconds",
    verifiedParticipation: "OTP-verified participation",
    privacyRespect: "Privacy respected",
    transparentCampaign: "Transparent campaign",
    storyTitle: "Why this campaign matters",
    storyHelp: "Understand the campaign’s published message and purpose for citizen participation.",
    pillars: ["Service", "Protection", "Respect"],
    phoneLabel: "Mobile number",
    phoneHint: "Enter a 10-digit Indian mobile number.",
    phoneIncomplete: "Complete 10 digits to request an OTP.",
    phoneInvalid: "Enter a valid Indian mobile beginning with 6, 7, 8 or 9.",
    heroFallbackLabel: "Approved campaign hero artwork will be added here"
  },
  or: {
    identityLine: "ସେବା | ସୁରକ୍ଷା | ସମ୍ମାନ",
    primaryAction: "ଆପଣଙ୍କ ସମର୍ଥନ ଦିଅନ୍ତୁ",
    secondaryAction: "WhatsApp ରେ ସେୟାର କରନ୍ତୁ",
    participationTitle: "ଆପଣଙ୍କ ସମର୍ଥନ ଦିଅନ୍ତୁ",
    participationTime: "ମାତ୍ର ୬୦ ସେକେଣ୍ଡରେ ଯୋଗ ଦିଅନ୍ତୁ",
    verifiedParticipation: "OTP ସତ୍ୟାପିତ ଅଂଶଗ୍ରହଣ",
    privacyRespect: "ଗୋପନୀୟତାକୁ ସମ୍ମାନ",
    transparentCampaign: "ପାରଦର୍ଶୀ ଅଭିଯାନ",
    storyTitle: "ଏହି ଅଭିଯାନ କାହିଁକି ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ",
    storyHelp: "ଅଭିଯାନର ପ୍ରକାଶିତ ସନ୍ଦେଶ ଓ ନାଗରିକ ଅଂଶଗ୍ରହଣର ଉଦ୍ଦେଶ୍ୟ ବୁଝନ୍ତୁ।",
    pillars: ["ସେବା", "ସୁରକ୍ଷା", "ସମ୍ମାନ"],
    phoneLabel: "ମୋବାଇଲ ନମ୍ବର",
    phoneHint: "୧୦ ଅଙ୍କର ଭାରତୀୟ ମୋବାଇଲ ନମ୍ବର ଲେଖନ୍ତୁ।",
    phoneIncomplete: "OTP ପାଇବାକୁ ୧୦ଟି ଅଙ୍କ ପୂରଣ କରନ୍ତୁ।",
    phoneInvalid: "୬, ୭, ୮ କିମ୍ବା ୯ ରୁ ଆରମ୍ଭ ହେଉଥିବା ବୈଧ ଭାରତୀୟ ମୋବାଇଲ ଲେଖନ୍ତୁ।",
    heroFallbackLabel: "ଅନୁମୋଦିତ ଅଭିଯାନ ମୁଖ୍ୟ ଚିତ୍ର ଏଠାରେ ଯୋଡ଼ାଯିବ"
  }
};

export const publicCampaignPresentationConfig: Record<string, PublicCampaignPresentation> = {
  [GAU_SAMMAN_PREMIUM_SLUG]: {
    slug: GAU_SAMMAN_PREMIUM_SLUG,
    kind: "premium-national",
    defaultLanguage: "hi",
    logoAsset: "/brands/gau-samman/campaign-logo.png",
    heroAsset: "/brands/gau-samman/gau-samman-hero-final.png",
    placeholderHeroAsset: "/brands/goudhan/gau-samman-hero.svg",
    copy: gauSammanCopy
  }
};

export function getPublicCampaignPresentation(
  slug: string | null | undefined
): PublicCampaignPresentation | null {
  const normalizedSlug = (slug ?? "").trim().toLowerCase();
  return publicCampaignPresentationConfig[normalizedSlug] ?? null;
}

export function getPublicCampaignPresentationCopy(
  presentation: PublicCampaignPresentation,
  language: Language
): PublicCampaignPresentationCopy {
  return presentation.copy[language] ?? presentation.copy.en;
}

export interface IndianMobileInputState {
  digits: string;
  display: string;
  complete: boolean;
  valid: boolean;
  canonical: string;
}

export const INDIAN_MOBILE_INPUT_MAX_LENGTH = 18;

export function normalizeIndianMobileInput(rawValue: string): IndianMobileInputState {
  const allowed = rawValue.replace(/[^\d+()\s-]/g, "");
  let digits = allowed.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) digits = digits.slice(2);
  digits = digits.slice(0, 10);
  const normalized = normalizeIndianPhone(digits);
  return {
    digits,
    display: digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits,
    complete: digits.length === 10,
    valid: normalized.verified,
    canonical: normalized.verified ? normalized.normalized : digits
  };
}

const PRODUCTION_OTP_HOSTS = new Set([
  "gaumata.cloud",
  "www.gaumata.cloud",
  "voiceup.live",
  "www.voiceup.live"
]);

export function canDisplayDevelopmentOtp(input: {
  hostname: string;
  isDevelopment: boolean;
  explicitTestDisplayEnabled: boolean;
}): boolean {
  const hostname = input.hostname.trim().toLowerCase().replace(/\.$/, "");
  return (
    input.isDevelopment &&
    input.explicitTestDisplayEnabled &&
    !PRODUCTION_OTP_HOSTS.has(hostname)
  );
}

export function getSafeOtpDisplayMessage(
  message: string,
  input: {
    hostname: string;
    isDevelopment: boolean;
    explicitTestDisplayEnabled: boolean;
    neutralMessage: string;
  }
): string {
  const containsOtpValue = /\b(?:otp|code)\s*[:=-]\s*\d{4,8}\b/i.test(message);
  if (!containsOtpValue) return message;
  return canDisplayDevelopmentOtp(input) ? message : input.neutralMessage;
}

export interface PublicMetricInput {
  key: string;
  label: string;
  value: number | null | undefined;
}

export function getVisiblePublicMetrics(metrics: PublicMetricInput[]): Array<{
  key: string;
  label: string;
  value: number;
}> {
  return metrics.filter(
    (metric): metric is PublicMetricInput & { value: number } =>
      typeof metric.value === "number" && Number.isFinite(metric.value)
  );
}
