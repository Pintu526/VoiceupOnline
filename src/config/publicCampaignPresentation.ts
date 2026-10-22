import type { Language } from "../i18n";
import { normalizeIndianPhone } from "../shared/deduplication/supporterIdentity.ts";

export const GAU_SAMMAN_PREMIUM_SLUG = "gau-samman-ahvaan-abhiyan";

/** Immutable design blueprint — never render in the live page. */
export const GAU_SAMMAN_HOMEPAGE_BLUEPRINT_ASSET =
  "/brands/gau-samman-hero-final.png.png";

/** Frozen central artwork copied from approved art18. */
export const GAU_SAMMAN_FINAL_ARTWORK_ASSET =
  "/brands/gau-samman/gau-samman-final-artwork.png";

export interface PublicCampaignPresentationCopy {
  identityLine: string;
  subtitle: string;
  invocation: string;
  primaryAction: string;
  primaryActionHint: string;
  secondaryAction: string;
  secondaryActionHint: string;
  participationTitle: string;
  participationTime: string;
  verifiedParticipation: string;
  privacyRespect: string;
  transparentCampaign: string;
  publicCollaboration: string;
  storyTitle: string;
  storyHelp: string;
  pillars: [string, string, string, string, string];
  journeyTitle: string;
  journeySteps: [string, string, string, string, string];
  phoneLabel: string;
  phoneHint: string;
  phoneIncomplete: string;
  phoneInvalid: string;
  heroFallbackLabel: string;
  privacyFooter: string;
  guideLabel: string;
  kamadhenuTitle: string;
  kamadhenuBody: string;
  nandiTitle: string;
  nandiBody: string;
  panchagavyaTitle: string;
  panchagavyaBody: string;
  panchagavyaItems: [string, string, string, string, string];
  midCta: string;
  midCtaHelp: string;
  purposeTitle: string;
  purposeBody: string;
  objectivesTitle: string;
  objectives: [string, string, string, string, string, string, string];
  pledgesTitle: string;
  pledges: [string, string, string, string, string];
  footerStatement: string;
  footerInvocation: string;
  audioOn: string;
  audioOff: string;
  audioUnavailable: string;
  shareScanHelp: string;
  signatureStatusTitle: string;
  statOnline: string;
  statHardcopy: string;
  statVerified: string;
  statTotal: string;
  statProgress: string;
  lastUpdatedLabel: string;
  liveDataNote: string;
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
    identityLine: "सेवा • संरक्षण • सम्मान • राष्ट्रमाता",
    subtitle: "गौमाता और नंदी बाबा (बैल) की सेवा, संरक्षण, सम्मान और राष्ट्रमाता घोषणा के लिए",
    invocation: "॥ श्री सुरभ्ये नमः जय गौ माता जय नंदी बाबा ॥",
    primaryAction: "अपना समर्थन दें",
    primaryActionHint: "सिर्फ 60 सेकंड में जुड़ें",
    secondaryAction: "WhatsApp पर साझा करें",
    secondaryActionHint: "अभियान को आगे बढ़ाएं",
    participationTitle: "अपना समर्थन जोड़ें",
    participationTime: "सिर्फ 60 सेकंड में जुड़ें",
    verifiedParticipation: "स्क्रीन सत्यापित भागीदारी",
    privacyRespect: "गोपनीयता सुरक्षित",
    transparentCampaign: "पारदर्शी अभियान",
    publicCollaboration: "जन सहयोग",
    storyTitle: "यह अभियान क्यों महत्वपूर्ण है",
    storyHelp: "गौ माता, नंदी बाबा और पंचगव्य के माध्यम से सेवा, संरक्षण और सम्मान का नागरिक आह्वान।",
    pillars: ["राष्ट्र प्रथम", "जनशक्ति", "आत्मनिर्भर भारत", "विश्वगुरु भारत", "राष्ट्रमाता"],
    journeyTitle: "आपका समर्थन, बदलाव की शुरुआत",
    journeySteps: ["समर्थन दें", "सत्यापित करें", "साझा करें", "जुड़ें", "प्रगति देखें"],
    phoneLabel: "मोबाइल नंबर",
    phoneHint: "भारत का 10 अंकों का मोबाइल नंबर दर्ज करें।",
    phoneIncomplete: "10 अंक पूरे होने पर सत्यापन कोड प्राप्त कर सकेंगे।",
    phoneInvalid: "6, 7, 8 या 9 से शुरू होने वाला वैध भारतीय मोबाइल नंबर दर्ज करें।",
    heroFallbackLabel: "अभियान का स्वीकृत मुख्य चित्र शीघ्र जोड़ा जाएगा",
    privacyFooter: "आपका डेटा सुरक्षित और गोपनीय रखा जाता है।",
    guideLabel: "अभियान मार्गदर्शिका",
    kamadhenuTitle: "कामधेनु गाय के बारे में",
    kamadhenuBody:
      "कामधेनु गौ माता करुणा, समृद्धि और राष्ट्रीय चेतना की प्रतीक हैं। भारतीय संस्कृति में गौ माता पूजनीय हैं। उनकी सेवा धर्म, समाज और ग्राम जीवन की सेवा है।",
    nandiTitle: "नंदी बाबा (बैल) के बारे में",
    nandiBody:
      "नंदी बाबा भगवान शिव के वाहन हैं और धर्म, शक्ति तथा आध्यात्मिक प्रगति के प्रतीक माने जाते हैं। कृषि, ग्राम अर्थव्यवस्था और संस्कृति में नंदी का स्थान गौ माता के साथ अभिन्न है।",
    panchagavyaTitle: "पंचगव्य — प्रकृति का वरदान",
    panchagavyaBody:
      "पंचगव्य गौ माता से प्राप्त पाँच पवित्र तत्व हैं। ये स्वास्थ्य, प्राकृतिक कृषि और सांस्कृतिक जीवन से जुड़े हैं।",
    panchagavyaItems: ["दूध", "दही", "घी", "गोमूत्र", "गोबर"],
    midCta: "आइए, मिलकर बनाएं आत्मनिर्भर और मजबूत भारत",
    midCtaHelp: "गौ माता और नंदी बाबा की सेवा, संरक्षण और सम्मान के इस राष्ट्रीय आह्वान में अपना सत्यापित समर्थन जोड़ें।",
    purposeTitle: "अभियान का उद्देश्य",
    purposeBody:
      "यह अभियान गौ माता को राष्ट्रमाता के रूप में सम्मान देने, नंदी बाबा की रक्षा करने, पंचगव्य आधारित प्राकृतिक जीवन को बढ़ावा देने और नागरिक भागीदारी से आत्मनिर्भर भारत का निर्माण करने का आह्वान है।",
    objectivesTitle: "अभियान के उद्देश्य",
    objectives: [
      "गौ माता को राष्ट्रमाता घोषित करने का जनसमर्थन",
      "गौ माता और नंदी बाबा की रक्षा तथा सम्मान",
      "गौ हत्या और क्रूरता के विरुद्ध जागरूकता",
      "गौशालाओं और ग्राम आधारित संरक्षण को समर्थन",
      "पंचगव्य और प्राकृतिक कृषि को बढ़ावा",
      "ग्रामीण आजीविका और गो-आधारित अर्थव्यवस्था को सशक्त करना",
      "सत्यापित नागरिक भागीदारी से पारदर्शी जनआंदोलन"
    ],
    pledgesTitle: "हमारी 5 प्रतिज्ञाएं",
    pledges: [
      "हम गौ माता की रक्षा करेंगे",
      "हम गौ माता और नंदी बाबा का सम्मान करेंगे",
      "हम सेवा भाव से जुड़ेंगे",
      "हम ग्राम अर्थव्यवस्था और प्राकृतिक कृषि का समर्थन करेंगे",
      "हम आत्मनिर्भर और मजबूत भारत के निर्माण में सहयोग करेंगे"
    ],
    footerStatement: "गौ माता केवल एक पशु नहीं, वह हमारी माता है, हमारी संस्कृति है, हमारा भविष्य है।",
    footerInvocation: "॥ जय गौ माता | जय नंदी बाबा ॥",
    audioOn: "ऑडियो ON",
    audioOff: "ऑडियो OFF",
    audioUnavailable: "इस उपकरण पर वाचन उपलब्ध नहीं है।",
    shareScanHelp: "स्कैन करें, साझा करें और इस अभियान से और लोगों को जोड़ें।",
    signatureStatusTitle: "हस्ताक्षर स्थिति",
    statOnline: "ऑनलाइन हस्ताक्षर",
    statHardcopy: "सत्यापित हार्डकॉपी हस्ताक्षर",
    statVerified: "सत्यापित समर्थक",
    statTotal: "कुल हस्ताक्षर",
    statProgress: "अभियान प्रगति",
    lastUpdatedLabel: "अंतिम अद्यतन",
    liveDataNote: "आँकड़े लाइव अभियान डेटा से आते हैं।"
  },
  en: {
    identityLine: "Service • Protection • Honour • National Mother",
    subtitle: "For the service, protection, honour, and National Mother declaration of Gau Mata and Nandi Baba (the bull)",
    invocation: "|| Shri Surabhyai Namah Jai Gau Mata Jai Nandi Baba ||",
    primaryAction: "Add Your Support",
    primaryActionHint: "Join in just 60 seconds",
    secondaryAction: "Share on WhatsApp",
    secondaryActionHint: "Help the campaign grow",
    participationTitle: "Add Your Support",
    participationTime: "Join in just 60 seconds",
    verifiedParticipation: "Screen-verified participation",
    privacyRespect: "Privacy protected",
    transparentCampaign: "Transparent campaign",
    publicCollaboration: "Public collaboration",
    storyTitle: "Why this campaign matters",
    storyHelp: "A civic call for service, protection and honour through Gau Mata, Nandi Baba and Panchagavya.",
    pillars: ["Nation First", "People's Power", "Self-Reliant India", "Vishwaguru India", "National Mother"],
    journeyTitle: "Your support starts the change",
    journeySteps: ["Support", "Verify", "Share", "Join", "Track progress"],
    phoneLabel: "Mobile number",
    phoneHint: "Enter a 10-digit Indian mobile number.",
    phoneIncomplete: "Complete 10 digits to request a verification code.",
    phoneInvalid: "Enter a valid Indian mobile beginning with 6, 7, 8 or 9.",
    heroFallbackLabel: "Approved campaign hero artwork will be added here",
    privacyFooter: "Your data is kept secure and confidential.",
    guideLabel: "Campaign Guide",
    kamadhenuTitle: "About Kamadhenu / Gau Mata",
    kamadhenuBody:
      "Kamadhenu Gau Mata is a symbol of compassion, prosperity and national consciousness. In Indian culture, Gau Mata is revered. Serving her is service to dharma, society and village life.",
    nandiTitle: "About Nandi Baba (the bull)",
    nandiBody:
      "Nandi Baba is the vehicle of Lord Shiva and a symbol of dharma, strength and spiritual progress. In agriculture, village economy and culture, Nandi stands together with Gau Mata.",
    panchagavyaTitle: "Panchagavya — nature's blessing",
    panchagavyaBody:
      "Panchagavya is the five sacred gifts of Gau Mata. They are linked to health, natural farming and cultural life.",
    panchagavyaItems: ["Milk", "Curd", "Ghee", "Cow urine", "Cow dung"],
    midCta: "Come, let us together build a self-reliant and strong India",
    midCtaHelp: "Add your verified support to this national call for the service, protection and honour of Gau Mata and Nandi Baba.",
    purposeTitle: "Campaign purpose",
    purposeBody:
      "This campaign calls citizens to honour Gau Mata as National Mother, protect Nandi Baba, promote Panchagavya-based natural living, and build a self-reliant India through verified public participation.",
    objectivesTitle: "Campaign objectives",
    objectives: [
      "Build public support to declare Gau Mata as National Mother",
      "Protect and honour Gau Mata and Nandi Baba",
      "Raise awareness against cow slaughter and cruelty",
      "Support gaushalas and village-based protection",
      "Promote Panchagavya and natural farming",
      "Strengthen rural livelihoods and a cow-based economy",
      "Grow a transparent people's movement through verified participation"
    ],
    pledgesTitle: "Our 5 pledges",
    pledges: [
      "We will protect Gau Mata",
      "We will honour Gau Mata and Nandi Baba",
      "We will join in the spirit of service",
      "We will support the village economy and natural farming",
      "We will help build a self-reliant and strong India"
    ],
    footerStatement: "Gau Mata is not just an animal. She is our mother, our culture, our future.",
    footerInvocation: "|| Jai Gau Mata | Jai Nandi Baba ||",
    audioOn: "Audio ON",
    audioOff: "Audio OFF",
    audioUnavailable: "Narration is not available on this device.",
    shareScanHelp: "Scan, share, and invite others to this campaign.",
    signatureStatusTitle: "Signature status",
    statOnline: "Online signatures",
    statHardcopy: "Verified hard-copy signatures",
    statVerified: "Verified supporters",
    statTotal: "Total signatures",
    statProgress: "Campaign progress",
    lastUpdatedLabel: "Last updated",
    liveDataNote: "Figures come from live campaign data."
  },
  or: {
    identityLine: "ସେବା • ସଂରକ୍ଷଣ • ସମ୍ମାନ • ରାଷ୍ଟ୍ରମାତା",
    subtitle: "ଗୌମାତା ଓ ନନ୍ଦୀ ବାବା (ଷଣ୍ଢ)ଙ୍କ ସେବା, ସଂରକ୍ଷଣ, ସମ୍ମାନ ଓ ରାଷ୍ଟ୍ରମାତା ଘୋଷଣା ପାଇଁ",
    invocation: "॥ ଶ୍ରୀ ସୁରଭ୍ୟୈ ନମଃ ଜୟ ଗୌ ମାତା ଜୟ ନନ୍ଦୀ ବାବା ॥",
    primaryAction: "ଆପଣଙ୍କ ସମର୍ଥନ ଦିଅନ୍ତୁ",
    primaryActionHint: "ମାତ୍ର ୬୦ ସେକେଣ୍ଡରେ ଯୋଗ ଦିଅନ୍ତୁ",
    secondaryAction: "WhatsApp ରେ ସେୟାର କରନ୍ତୁ",
    secondaryActionHint: "ଅଭିଯାନକୁ ଆଗକୁ ବଢ଼ାନ୍ତୁ",
    participationTitle: "ଆପଣଙ୍କ ସମର୍ଥନ ଯୋଡ଼ନ୍ତୁ",
    participationTime: "ମାତ୍ର ୬୦ ସେକେଣ୍ଡରେ ଯୋଗ ଦିଅନ୍ତୁ",
    verifiedParticipation: "ସ୍କ୍ରିନ୍ ଯାଞ୍ଚିତ ଅଂଶଗ୍ରହଣ",
    privacyRespect: "ଗୋପନୀୟତା ସୁରକ୍ଷିତ",
    transparentCampaign: "ପାରଦର୍ଶୀ ଅଭିଯାନ",
    publicCollaboration: "ଜନ ସହଯୋଗ",
    storyTitle: "ଏହି ଅଭିଯାନ କାହିଁକି ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ",
    storyHelp: "ଗୌ ମାତା, ନନ୍ଦୀ ବାବା ଓ ପଞ୍ଚଗବ୍ୟ ମାଧ୍ୟମରେ ସେବା, ସଂରକ୍ଷଣ ଓ ସମ୍ମାନର ନାଗରିକ ଆହ୍ୱାନ।",
    pillars: ["ରାଷ୍ଟ୍ର ପ୍ରଥମ", "ଜନଶକ୍ତି", "ଆତ୍ମନିର୍ଭର ଭାରତ", "ବିଶ୍ୱଗୁରୁ ଭାରତ", "ରାଷ୍ଟ୍ରମାତା"],
    journeyTitle: "ଆପଣଙ୍କ ସମର୍ଥନ, ପରିବର୍ତ୍ତନର ଆରମ୍ଭ",
    journeySteps: ["ସମର୍ଥନ ଦିଅନ୍ତୁ", "ସତ୍ୟାପନ", "ସେୟାର", "ଯୋଗ ଦିଅନ୍ତୁ", "ପ୍ରଗତି ଦେଖନ୍ତୁ"],
    phoneLabel: "ମୋବାଇଲ ନମ୍ବର",
    phoneHint: "୧୦ ଅଙ୍କର ଭାରତୀୟ ମୋବାଇଲ ନମ୍ବର ଲେଖନ୍ତୁ।",
    phoneIncomplete: "ଯାଞ୍ଚ କୋଡ୍ ପାଇବାକୁ ୧୦ଟି ଅଙ୍କ ପୂରଣ କରନ୍ତୁ।",
    phoneInvalid: "୬, ୭, ୮ କିମ୍ବା ୯ ରୁ ଆରମ୍ଭ ହେଉଥିବା ବୈଧ ଭାରତୀୟ ମୋବାଇଲ ଲେଖନ୍ତୁ।",
    heroFallbackLabel: "ଅନୁମୋଦିତ ଅଭିଯାନ ମୁଖ୍ୟ ଚିତ୍ର ଏଠାରେ ଯୋଡ଼ାଯିବ",
    privacyFooter: "ଆପଣଙ୍କ ତଥ୍ୟ ସୁରକ୍ଷିତ ଓ ଗୋପନୀୟ ରଖାଯାଏ।",
    guideLabel: "ଅଭିଯାନ ମାର୍ଗଦର୍ଶିକା",
    kamadhenuTitle: "କାମଧେନୁ / ଗୌ ମାତା ବିଷୟରେ",
    kamadhenuBody:
      "କାମଧେନୁ ଗୌ ମାତା କରୁଣା, ସମୃଦ୍ଧି ଓ ଜାତୀୟ ଚେତନାର ପ୍ରତୀକ। ଭାରତୀୟ ସଂସ୍କୃତିରେ ଗୌ ମାତା ପୂଜନୀୟ। ତାଙ୍କ ସେବା ଧର୍ମ, ସମାଜ ଓ ଗ୍ରାମ ଜୀବନର ସେବା।",
    nandiTitle: "ନନ୍ଦୀ ବାବା (ଷଣ୍ଢ) ବିଷୟରେ",
    nandiBody:
      "ନନ୍ଦୀ ବାବା ଭଗବାନ ଶିବଙ୍କ ବାହନ ଏବଂ ଧର୍ମ, ଶକ୍ତି ଓ ଆଧ୍ୟାତ୍ମିକ ପ୍ରଗତିର ପ୍ରତୀକ। କୃଷି, ଗ୍ରାମ ଅର୍ଥନୀତି ଓ ସଂସ୍କୃତିରେ ନନ୍ଦୀଙ୍କ ସ୍ଥାନ ଗୌ ମାତାଙ୍କ ସହିତ ଅଭିନ୍ନ।",
    panchagavyaTitle: "ପଞ୍ଚଗବ୍ୟ — ପ୍ରକୃତିର ବରଦାନ",
    panchagavyaBody:
      "ପଞ୍ଚଗବ୍ୟ ଗୌ ମାତାଙ୍କଠାରୁ ପ୍ରାପ୍ତ ପାଞ୍ଚଟି ପବିତ୍ର ତତ୍ତ୍ୱ। ଏଗୁଡ଼ିକ ସ୍ୱାସ୍ଥ୍ୟ, ପ୍ରାକୃତିକ କୃଷି ଓ ସାଂସ୍କୃତିକ ଜୀବନ ସହିତ ଜଡ଼ିତ।",
    panchagavyaItems: ["କ୍ଷୀର", "ଦହି", "ଘିଅ", "ଗୋମୂତ୍ର", "ଗୋବର"],
    midCta: "ଆସନ୍ତୁ, ମିଳିତ ଭାବେ ଆତ୍ମନିର୍ଭର ଓ ଶକ୍ତିଶାଳୀ ଭାରତ ଗଢ଼ିବା",
    midCtaHelp: "ଗୌ ମାତା ଓ ନନ୍ଦୀ ବାବାଙ୍କ ସେବା, ସଂରକ୍ଷଣ ଓ ସମ୍ମାନର ଏହି ଜାତୀୟ ଆହ୍ୱାନରେ ଆପଣଙ୍କ ସତ୍ୟାପିତ ସମର୍ଥନ ଯୋଡ଼ନ୍ତୁ।",
    purposeTitle: "ଅଭିଯାନର ଉଦ୍ଦେଶ୍ୟ",
    purposeBody:
      "ଏହି ଅଭିଯାନ ଗୌ ମାତାଙ୍କୁ ରାଷ୍ଟ୍ରମାତା ଭାବେ ସମ୍ମାନ ଦେବା, ନନ୍ଦୀ ବାବାଙ୍କ ସୁରକ୍ଷା, ପଞ୍ଚଗବ୍ୟ ଆଧାରିତ ପ୍ରାକୃତିକ ଜୀବନ ଏବଂ ସତ୍ୟାପିତ ନାଗରିକ ଅଂଶଗ୍ରହଣ ଦ୍ୱାରା ଆତ୍ମନିର୍ଭର ଭାରତ ଗଠନର ଆହ୍ୱାନ।",
    objectivesTitle: "ଅଭିଯାନର ଲକ୍ଷ୍ୟ",
    objectives: [
      "ଗୌ ମାତାଙ୍କୁ ରାଷ୍ଟ୍ରମାତା ଘୋଷଣା ପାଇଁ ଜନସମର୍ଥନ",
      "ଗୌ ମାତା ଓ ନନ୍ଦୀ ବାବାଙ୍କ ସୁରକ୍ଷା ଓ ସମ୍ମାନ",
      "ଗୋହତ୍ୟା ଓ ନିର୍ଯ୍ୟାତନା ବିରୁଦ୍ଧରେ ସଚେତନତା",
      "ଗୋଶାଳା ଓ ଗ୍ରାମ ଆଧାରିତ ସଂରକ୍ଷଣକୁ ସମର୍ଥନ",
      "ପଞ୍ଚଗବ୍ୟ ଓ ପ୍ରାକୃତିକ କୃଷିକୁ ପ୍ରୋତ୍ସାହନ",
      "ଗ୍ରାମୀଣ ଜୀବିକା ଓ ଗୋ-ଆଧାରିତ ଅର୍ଥନୀତିକୁ ସଶକ୍ତ କରିବା",
      "ସତ୍ୟାପିତ ନାଗରିକ ଅଂଶଗ୍ରହଣ ଦ୍ୱାରା ପାରଦର୍ଶୀ ଜନଆନ୍ଦୋଳନ"
    ],
    pledgesTitle: "ଆମର ୫ ପ୍ରତିଜ୍ଞା",
    pledges: [
      "ଆମେ ଗୌ ମାତାଙ୍କ ସୁରକ୍ଷା କରିବୁ",
      "ଆମେ ଗୌ ମାତା ଓ ନନ୍ଦୀ ବାବାଙ୍କୁ ସମ୍ମାନ ଦେବୁ",
      "ଆମେ ସେବା ଭାବରେ ଯୋଗ ଦେବୁ",
      "ଆମେ ଗ୍ରାମ ଅର୍ଥନୀତି ଓ ପ୍ରାକୃତିକ କୃଷିକୁ ସମର୍ଥନ କରିବୁ",
      "ଆମେ ଆତ୍ମନିର୍ଭର ଓ ଶକ୍ତିଶାଳୀ ଭାରତ ଗଠନରେ ସହଯୋଗ କରିବୁ"
    ],
    footerStatement: "ଗୌ ମାତା କେବଳ ଏକ ପଶୁ ନୁହଁନ୍ତି; ସେ ଆମ ମାତା, ଆମ ସଂସ୍କୃତି, ଆମ ଭବିଷ୍ୟତ।",
    footerInvocation: "॥ ଜୟ ଗୌ ମାତା | ଜୟ ନନ୍ଦୀ ବାବା ॥",
    audioOn: "ଅଡିଓ ON",
    audioOff: "ଅଡିଓ OFF",
    audioUnavailable: "ଏହି ଡିଭାଇସରେ ବାଚନ ଉପଲବ୍ଧ ନାହିଁ।",
    shareScanHelp: "ସ୍କାନ କରନ୍ତୁ, ସେୟାର କରନ୍ତୁ ଏବଂ ଏହି ଅଭିଯାନରେ ଅନ୍ୟମାନଙ୍କୁ ଯୋଡ଼ନ୍ତୁ।",
    signatureStatusTitle: "ସହି ସ୍ଥିତି",
    statOnline: "ଅନଲାଇନ୍ ସହି",
    statHardcopy: "ସତ୍ୟାପିତ ହାର୍ଡକପି ସହି",
    statVerified: "ସତ୍ୟାପିତ ସମର୍ଥକ",
    statTotal: "ମୋଟ ସହି",
    statProgress: "ଅଭିଯାନ ପ୍ରଗତି",
    lastUpdatedLabel: "ଶେଷ ଅଦ୍ୟତନ",
    liveDataNote: "ସଂଖ୍ୟାଗୁଡ଼ିକ ଲାଇଭ୍ ଅଭିଯାନ ତଥ୍ୟରୁ ଆସେ।"
  }
};

export const publicCampaignPresentationConfig: Record<string, PublicCampaignPresentation> = {
  [GAU_SAMMAN_PREMIUM_SLUG]: {
    slug: GAU_SAMMAN_PREMIUM_SLUG,
    kind: "premium-national",
    defaultLanguage: "hi",
    logoAsset: "/brands/gau-samman/campaign-logo.png",
    heroAsset: GAU_SAMMAN_FINAL_ARTWORK_ASSET,
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

/** Full homepage PNG and screenshot variants must never render as page media. */
export function isForbiddenPublicCampaignBlueprintAsset(url: string | null | undefined): boolean {
  const normalized = (url ?? "").trim().toLowerCase().replace(/\\/g, "/");
  if (!normalized) return false;
  return (
    normalized.includes("gau-samman-hero-final.png") ||
    normalized.includes("gausamman-hindi-review") ||
    normalized.endsWith(GAU_SAMMAN_HOMEPAGE_BLUEPRINT_ASSET.toLowerCase())
  );
}

export function sanitizePublicCampaignMediaUrl(url: string | null | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed || isForbiddenPublicCampaignBlueprintAsset(trimmed)) return "";
  return trimmed;
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

const SCREEN_OTP_HOSTS = new Set([
  "gaumata.cloud",
  "www.gaumata.cloud",
  "voiceup.live",
  "www.voiceup.live"
]);

export function canDisplayScreenOtp(input: {
  hostname: string;
  isDevelopment: boolean;
  explicitTestDisplayEnabled: boolean;
}): boolean {
  const hostname = input.hostname.trim().toLowerCase().replace(/\.$/, "");
  const isApprovedHost =
    SCREEN_OTP_HOSTS.has(hostname) ||
    hostname.endsWith(".vercel.app") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  return input.explicitTestDisplayEnabled && (input.isDevelopment || isApprovedHost);
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
  return canDisplayScreenOtp(input) ? message : input.neutralMessage;
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
      typeof metric.value === "number" &&
      Number.isFinite(metric.value) &&
      metric.value > 0
  );
}
