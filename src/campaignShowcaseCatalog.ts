import type { Language } from "./i18n/provider";
import type { Tab } from "./components/NavButton";

export type CampaignReadinessStatus =
  | "completed"
  | "pendingFinalReview"
  | "inProgress"
  | "notStarted"
  | "blocked";

export type CampaignShowcaseTrack =
  | "organize"
  | "plan"
  | "act"
  | "fund"
  | "prove"
  | "grow"
  | "businessOs";

export interface CampaignShowcaseModule {
  id: string;
  track: CampaignShowcaseTrack;
  title: Record<Language, string>;
  description: Record<Language, string>;
  status: CampaignReadinessStatus;
  tab?: Tab;
  action?: "aiCopilot";
  blockedReason?: Record<Language, string>;
}

const words = (en: string, hi: string, or: string): Record<Language, string> => ({ en, hi, or });

export const campaignShowcaseTracks: ReadonlyArray<{
  id: CampaignShowcaseTrack;
  title: Record<Language, string>;
  description: Record<Language, string>;
}> = [
  {
    id: "organize",
    title: words("ORGANIZE", "संगठित करें", "ସଂଗଠିତ କରନ୍ତୁ"),
    description: words("People, roles, workspaces, and campaign resources.", "लोग, भूमिकाएँ, कार्यक्षेत्र और अभियान संसाधन।", "ଲୋକ, ଭୂମିକା, କାର୍ଯ୍ୟକ୍ଷେତ୍ର ଏବଂ ଅଭିଯାନ ସମ୍ବଳ।")
  },
  {
    id: "plan",
    title: words("PLAN", "योजना", "ଯୋଜନା"),
    description: words("Campaign setup, objectives, milestones, and delivery planning.", "अभियान सेटअप, उद्देश्य, मील के पत्थर और कार्ययोजना।", "ଅଭିଯାନ ସେଟଅପ୍, ଲକ୍ଷ୍ୟ, ମାଇଲଖୁଣ୍ଟ ଏବଂ କାର୍ଯ୍ୟ ଯୋଜନା।")
  },
  {
    id: "act",
    title: words("ACT", "कार्रवाई", "କାର୍ଯ୍ୟ"),
    description: words("Public participation, supporter accounts, field work, and signing.", "सार्वजनिक भागीदारी, समर्थक खाते, फील्ड कार्य और हस्ताक्षर।", "ଜନସାଧାରଣଙ୍କ ଅଂଶଗ୍ରହଣ, ସମର୍ଥକ ଆକାଉଣ୍ଟ, କ୍ଷେତ୍ର କାର୍ଯ୍ୟ ଏବଂ ଦସ୍ତଖତ।")
  },
  {
    id: "fund",
    title: words("FUND", "वित्त", "ପାଣ୍ଠି"),
    description: words("Funding and financial workflows; unavailable transactions stay disabled.", "वित्तपोषण और वित्तीय कार्यप्रवाह; अनुपलब्ध लेन-देन निष्क्रिय रहेंगे।", "ପାଣ୍ଠି ଏବଂ ଆର୍ଥିକ କାର୍ଯ୍ୟପ୍ରବାହ; ଅନୁପଲବ୍ଧ ଲେଣଦେଣ ନିଷ୍କ୍ରିୟ ରହିବ।")
  },
  {
    id: "prove",
    title: words("PROVE", "प्रमाण", "ପ୍ରମାଣ"),
    description: words("Evidence, scanning, review, reporting, and accountability.", "साक्ष्य, स्कैनिंग, समीक्षा, रिपोर्टिंग और जवाबदेही।", "ପ୍ରମାଣ, ସ୍କାନିଂ, ସମୀକ୍ଷା, ରିପୋର୍ଟିଂ ଏବଂ ଉତ୍ତରଦାୟିତ୍ୱ।")
  },
  {
    id: "grow",
    title: words("GROW", "विकास", "ବିକାଶ"),
    description: words("Referrals, supporter engagement, growth, and mobilization.", "रेफरल, समर्थक सहभागिता, विकास और सक्रियता।", "ରେଫରାଲ୍, ସମର୍ଥକଙ୍କ ଯୋଗଦାନ, ବିକାଶ ଏବଂ ସକ୍ରିୟକରଣ।")
  },
  {
    id: "businessOs",
    title: words("BUSINESS OS", "बिज़नेस OS", "ବିଜନେସ୍ OS"),
    description: words("Shared administration, identity, AI, localization, and platform services.", "साझा प्रशासन, पहचान, AI, स्थानीयकरण और प्लेटफ़ॉर्म सेवाएँ।", "ସାଧାରଣ ପ୍ରଶାସନ, ପରିଚୟ, AI, ଭାଷା ଏବଂ ପ୍ଲାଟଫର୍ମ ସେବା।")
  }
];

export const campaignShowcaseModules: ReadonlyArray<CampaignShowcaseModule> = [
  {
    id: "organizations-workspaces",
    track: "organize",
    title: words("Organizations & workspaces", "संगठन और कार्यक्षेत्र", "ସଂଗଠନ ଏବଂ କାର୍ଯ୍ୟକ୍ଷେତ୍ର"),
    description: words("Organization profiles and workspace administration.", "संगठन प्रोफ़ाइल और कार्यक्षेत्र प्रशासन।", "ସଂଗଠନ ପ୍ରୋଫାଇଲ୍ ଏବଂ କାର୍ଯ୍ୟକ୍ଷେତ୍ର ପ୍ରଶାସନ।"),
    status: "inProgress",
    tab: "saas"
  },
  {
    id: "volunteers-coordinators",
    track: "organize",
    title: words("Volunteers & coordinators", "स्वयंसेवक और समन्वयक", "ସ୍ୱେଚ୍ଛାସେବୀ ଏବଂ ସଂଯୋଜକ"),
    description: words("Coordinator network and volunteer mobilization.", "समन्वयक नेटवर्क और स्वयंसेवक सक्रियता।", "ସଂଯୋଜକ ନେଟୱର୍କ ଏବଂ ସ୍ୱେଚ୍ଛାସେବୀ ସକ୍ରିୟକରଣ।"),
    status: "inProgress",
    tab: "coordinators"
  },
  {
    id: "roles-permissions",
    track: "organize",
    title: words("Roles & permissions", "भूमिकाएँ और अनुमतियाँ", "ଭୂମିକା ଏବଂ ଅନୁମତି"),
    description: words("Role-aware workspace access and activity review.", "भूमिका-आधारित कार्यक्षेत्र पहुँच और गतिविधि समीक्षा।", "ଭୂମିକା ଆଧାରିତ କାର୍ଯ୍ୟକ୍ଷେତ୍ର ପ୍ରବେଶ ଏବଂ କାର୍ଯ୍ୟକଳାପ ସମୀକ୍ଷା।"),
    status: "pendingFinalReview",
    tab: "activity"
  },
  {
    id: "resources-locations",
    track: "organize",
    title: words("Resources & locations", "संसाधन और स्थान", "ସମ୍ବଳ ଏବଂ ସ୍ଥାନ"),
    description: words("Campaign resource locations and governed geography.", "अभियान संसाधन स्थान और नियंत्रित भौगोलिक डेटा।", "ଅଭିଯାନ ସମ୍ବଳ ସ୍ଥାନ ଏବଂ ନିୟନ୍ତ୍ରିତ ଭୌଗୋଳିକ ତଥ୍ୟ।"),
    status: "pendingFinalReview",
    tab: "campaigns"
  },
  {
    id: "campaign-lifecycle",
    track: "plan",
    title: words("Campaign creation & lifecycle", "अभियान निर्माण और जीवनचक्र", "ଅଭିଯାନ ସୃଷ୍ଟି ଏବଂ ଜୀବନଚକ୍ର"),
    description: words("Create, edit, publish, pause, complete, and archive campaigns.", "अभियान बनाएँ, संपादित करें, प्रकाशित करें, रोकें, पूरा करें और संग्रहित करें।", "ଅଭିଯାନ ସୃଷ୍ଟି, ସମ୍ପାଦନ, ପ୍ରକାଶନ, ବିରତି, ସମାପ୍ତି ଏବଂ ଆର୍କାଇଭ୍ କରନ୍ତୁ।"),
    status: "pendingFinalReview",
    tab: "campaigns"
  },
  {
    id: "campaign-settings-branding",
    track: "plan",
    title: words("Campaign settings & branding", "अभियान सेटिंग और ब्रांडिंग", "ଅଭିଯାନ ସେଟିଂ ଏବଂ ବ୍ରାଣ୍ଡିଂ"),
    description: words("Campaign configuration, media, appeal content, and sharing setup.", "अभियान कॉन्फ़िगरेशन, मीडिया, अपील सामग्री और साझा सेटअप।", "ଅଭିଯାନ ବିନ୍ୟାସ, ମିଡିଆ, ଆବେଦନ ବିଷୟବସ୍ତୁ ଏବଂ ସେୟାରିଂ ସେଟଅପ୍।"),
    status: "pendingFinalReview",
    tab: "campaigns"
  },
  {
    id: "objectives-milestones",
    track: "plan",
    title: words("Objectives, activities & milestones", "उद्देश्य, गतिविधियाँ और मील के पत्थर", "ଲକ୍ଷ୍ୟ, କାର୍ଯ୍ୟକଳାପ ଏବଂ ମାଇଲଖୁଣ୍ଟ"),
    description: words("Campaign goals, planned activities, and progress milestones.", "अभियान लक्ष्य, नियोजित गतिविधियाँ और प्रगति मील के पत्थर।", "ଅଭିଯାନ ଲକ୍ଷ୍ୟ, ଯୋଜନାବଦ୍ଧ କାର୍ଯ୍ୟକଳାପ ଏବଂ ପ୍ରଗତି ମାଇଲଖୁଣ୍ଟ।"),
    status: "inProgress",
    tab: "campaigns"
  },
  {
    id: "task-resource-allocation",
    track: "plan",
    title: words("Task & resource allocation", "कार्य और संसाधन आवंटन", "କାର୍ଯ୍ୟ ଏବଂ ସମ୍ବଳ ବଣ୍ଟନ"),
    description: words("Coordinate campaign tasks and locality resources.", "अभियान कार्यों और स्थानीय संसाधनों का समन्वय करें।", "ଅଭିଯାନ କାର୍ଯ୍ୟ ଏବଂ ସ୍ଥାନୀୟ ସମ୍ବଳ ସମନ୍ୱୟ କରନ୍ତୁ।"),
    status: "inProgress",
    tab: "coordinators"
  },
  {
    id: "gsaa-public-campaign",
    track: "act",
    title: words("GSAA public campaign", "GSAA सार्वजनिक अभियान", "GSAA ଜନସାଧାରଣ ଅଭିଯାନ"),
    description: words("Featured Gau Samman Ahvaan Abhiyan public campaign journey.", "विशेष गौ सम्मान आह्वान अभियान सार्वजनिक यात्रा।", "ବିଶେଷ ଗୌ ସମ୍ମାନ ଆହ୍ୱାନ ଅଭିଯାନର ଜନସାଧାରଣ ଯାତ୍ରା।"),
    status: "pendingFinalReview",
    tab: "public"
  },
  {
    id: "six-step-signing",
    track: "act",
    title: words("Six-step digital signing", "छह-चरण डिजिटल हस्ताक्षर", "ଛଅ-ପଦକ୍ଷେପ ଡିଜିଟାଲ୍ ଦସ୍ତଖତ"),
    description: words("Guided public signing with server-side validation and duplicate protection.", "सर्वर सत्यापन और डुप्लिकेट सुरक्षा के साथ निर्देशित सार्वजनिक हस्ताक्षर।", "ସର୍ଭର ଯାଞ୍ଚ ଏବଂ ନକଲ ପ୍ରତିରୋଧ ସହିତ ମାର୍ଗଦର୍ଶିତ ଜନସାଧାରଣ ଦସ୍ତଖତ।"),
    status: "pendingFinalReview",
    tab: "public"
  },
  {
    id: "otp-verification",
    track: "act",
    title: words("OTP verification", "OTP सत्यापन", "OTP ଯାଞ୍ଚ"),
    description: words("Email one-time-code verification in the signing flow.", "हस्ताक्षर प्रक्रिया में ईमेल एक-बार कोड सत्यापन।", "ଦସ୍ତଖତ ପ୍ରକ୍ରିୟାରେ ଇମେଲ୍ ଏକ-ଥର କୋଡ୍ ଯାଞ୍ଚ।"),
    status: "pendingFinalReview",
    tab: "public"
  },
  {
    id: "duplicate-prevention",
    track: "act",
    title: words("Signing idempotency & duplicate prevention", "हस्ताक्षर इडेम्पोटेंसी और डुप्लिकेट रोकथाम", "ଦସ୍ତଖତ ଇଡେମ୍ପୋଟେନ୍ସି ଏବଂ ନକଲ ପ୍ରତିରୋଧ"),
    description: words("Idempotent signing requests and duplicate-supporter safeguards.", "इडेम्पोटेंट हस्ताक्षर अनुरोध और डुप्लिकेट समर्थक सुरक्षा।", "ଇଡେମ୍ପୋଟେଣ୍ଟ ଦସ୍ତଖତ ଅନୁରୋଧ ଏବଂ ନକଲ ସମର୍ଥକ ସୁରକ୍ଷା।"),
    status: "pendingFinalReview",
    tab: "public"
  },
  {
    id: "field-collection",
    track: "act",
    title: words("Field Collection", "फील्ड संग्रह", "କ୍ଷେତ୍ର ସଂଗ୍ରହ"),
    description: words("Authorized teams can capture supporter and field-collection records.", "अधिकृत टीमें समर्थक और फील्ड-संग्रह रिकॉर्ड दर्ज कर सकती हैं।", "ଅଧିକୃତ ଟିମ୍ ସମର୍ଥକ ଏବଂ କ୍ଷେତ୍ର ସଂଗ୍ରହ ରେକର୍ଡ କରିପାରିବେ।"),
    status: "pendingFinalReview",
    tab: "scans"
  },
  {
    id: "field-evidence",
    track: "act",
    title: words("Field evidence collection", "फील्ड साक्ष्य संग्रह", "କ୍ଷେତ୍ର ପ୍ରମାଣ ସଂଗ୍ରହ"),
    description: words("Capture and securely store evidence for authorized field workflows.", "अधिकृत फील्ड कार्यप्रवाह के लिए साक्ष्य दर्ज और सुरक्षित रखें।", "ଅଧିକୃତ କ୍ଷେତ୍ର କାର୍ଯ୍ୟପ୍ରବାହ ପାଇଁ ପ୍ରମାଣ ରେକର୍ଡ ଏବଂ ସୁରକ୍ଷିତ ରଖନ୍ତୁ।"),
    status: "pendingFinalReview",
    tab: "scans"
  },
  {
    id: "offline-paper-signatures",
    track: "act",
    title: words("Offline & paper signatures", "ऑफ़लाइन और कागज़ी हस्ताक्षर", "ଅଫଲାଇନ୍ ଏବଂ କାଗଜ ଦସ୍ତଖତ"),
    description: words("Record paper-collected supporters for later review and processing.", "बाद की समीक्षा और प्रक्रिया के लिए कागज़ पर एकत्र समर्थक दर्ज करें।", "ପରବର୍ତ୍ତୀ ସମୀକ୍ଷା ଏବଂ ପ୍ରକ୍ରିୟା ପାଇଁ କାଗଜରେ ସଂଗୃହୀତ ସମର୍ଥକ ରେକର୍ଡ କରନ୍ତୁ।"),
    status: "inProgress",
    tab: "scans"
  },
  {
    id: "supporter-registration-claim",
    track: "act",
    title: words("Supporter registration & account claiming", "समर्थक पंजीकरण और खाता दावा", "ସମର୍ଥକ ପଞ୍ଜୀକରଣ ଏବଂ ଆକାଉଣ୍ଟ ଦାବି"),
    description: words("Preview email redirect allowlist must be verified before account-claim acceptance checks.", "खाता-दावा स्वीकृति जाँच से पहले Preview ईमेल रीडायरेक्ट allowlist सत्यापित होना आवश्यक है।", "ଆକାଉଣ୍ଟ ଦାବି ଗ୍ରହଣ ଯାଞ୍ଚ ପୂର୍ବରୁ Preview ଇମେଲ୍ ରିଡାଇରେକ୍ଟ ଅନୁମତି ତାଲିକା ଯାଞ୍ଚ ହେବା ଆବଶ୍ୟକ।"),
    status: "blocked",
    tab: "public",
    blockedReason: words(
      "The validated candidate's account-claim/auth implementation and required migrations are absent from this release base, so authenticated account-claim acceptance cannot be performed here.",
      "सत्यापित candidate का account-claim/auth implementation और आवश्यक migrations इस release base में नहीं हैं, इसलिए यहाँ authenticated account-claim acceptance नहीं की जा सकती।",
      "ଯାଞ୍ଚିତ candidate ର account-claim/auth implementation ଏବଂ ଆବଶ୍ୟକ migrations ଏହି release base ରେ ନାହିଁ, ତେଣୁ ଏଠାରେ authenticated account-claim acceptance କରାଯାଇପାରିବ ନାହିଁ।"
    )
  },
  {
    id: "supporter-dashboard",
    track: "act",
    title: words("Owner-scoped supporter dashboard", "मालिक-सीमित समर्थक डैशबोर्ड", "ମାଲିକ-ସୀମିତ ସମର୍ଥକ ଡ୍ୟାସବୋର୍ଡ"),
    description: words("Show only account-linked supporter information and authorized actions.", "केवल खाते से जुड़ी समर्थक जानकारी और अधिकृत कार्य दिखाएँ।", "କେବଳ ଆକାଉଣ୍ଟ ସହିତ ଯୋଡ଼ା ସମର୍ଥକ ତଥ୍ୟ ଏବଂ ଅଧିକୃତ କାର୍ଯ୍ୟ ଦେଖାନ୍ତୁ।"),
    status: "pendingFinalReview",
    tab: "public"
  },
  {
    id: "participation-receipts",
    track: "act",
    title: words("Participation receipts", "भागीदारी रसीदें", "ଅଂଶଗ୍ରହଣ ରସିଦ"),
    description: words("Participation email receipts are not included in this release.", "इस रिलीज़ में अभियान भागीदारी की ईमेल रसीदें शामिल नहीं हैं।", "ଏହି ରିଲିଜ୍‌ରେ ଅଭିଯାନ ଅଂଶଗ୍ରହଣର ଇମେଲ୍ ରସିଦ ଅନ୍ତର୍ଭୁକ୍ତ ନୁହେଁ।"),
    status: "notStarted"
  },
  {
    id: "crowdfunding-budget",
    track: "fund",
    title: words("Crowdfunding & budgets", "क्राउडफंडिंग और बजट", "କ୍ରାଉଡଫଣ୍ଡିଂ ଏବଂ ବଜେଟ୍"),
    description: words("Funding plan preview only; no payment collection is enabled.", "केवल वित्तपोषण योजना पूर्वावलोकन; भुगतान संग्रह सक्षम नहीं है।", "କେବଳ ପାଣ୍ଠି ଯୋଜନା ପୂର୍ବଦର୍ଶନ; ଦେୟ ସଂଗ୍ରହ ସକ୍ରିୟ ନୁହେଁ।"),
    status: "notStarted",
    tab: "fund"
  },
  {
    id: "donation-management",
    track: "fund",
    title: words("Donation management", "दान प्रबंधन", "ଦାନ ପରିଚାଳନା"),
    description: words("No live donation checkout, payment processing, or simulated success.", "कोई लाइव दान चेकआउट, भुगतान प्रक्रिया या नकली सफलता नहीं।", "କୌଣସି ଲାଇଭ୍ ଦାନ ଚେକଆଉଟ୍, ଦେୟ ପ୍ରକ୍ରିୟା କିମ୍ବା ନକଲି ସଫଳତା ନାହିଁ।"),
    status: "notStarted",
    tab: "fund"
  },
  {
    id: "financial-reporting",
    track: "fund",
    title: words("Financial reporting", "वित्तीय रिपोर्टिंग", "ଆର୍ଥିକ ରିପୋର୍ଟିଂ"),
    description: words("Financial reports depend on verified donation and expense records.", "वित्तीय रिपोर्ट सत्यापित दान और व्यय रिकॉर्ड पर निर्भर हैं।", "ଆର୍ଥିକ ରିପୋର୍ଟ ଯାଞ୍ଚିତ ଦାନ ଏବଂ ଖର୍ଚ୍ଚ ରେକର୍ଡ ଉପରେ ନିର୍ଭର କରେ।"),
    status: "notStarted",
    tab: "fund"
  },
  {
    id: "expenses-reconciliation",
    track: "fund",
    title: words("Expenses & reconciliation", "व्यय और मिलान", "ଖର୍ଚ୍ଚ ଏବଂ ମେଳକ"),
    description: words("Expense capture and reconciliation workflows are not implemented.", "व्यय दर्ज करने और मिलान कार्यप्रवाह लागू नहीं हैं।", "ଖର୍ଚ୍ଚ ରେକର୍ଡ ଏବଂ ମେଳକ କାର୍ଯ୍ୟପ୍ରବାହ କାର୍ଯ୍ୟକାରୀ ହୋଇନାହିଁ।"),
    status: "notStarted",
    tab: "fund"
  },
  {
    id: "fundraising-transparency",
    track: "fund",
    title: words("Fundraising transparency", "धन-संग्रह पारदर्शिता", "ପାଣ୍ଠି ସଂଗ୍ରହ ସ୍ୱଚ୍ଛତା"),
    description: words("Financial transparency reports require funding and ledger workflows.", "वित्तीय पारदर्शिता रिपोर्ट के लिए वित्तपोषण और लेजर कार्यप्रवाह आवश्यक हैं।", "ଆର୍ଥିକ ସ୍ୱଚ୍ଛତା ରିପୋର୍ଟ ପାଇଁ ପାଣ୍ଠି ଏବଂ ଲେଜର୍ କାର୍ଯ୍ୟପ୍ରବାହ ଆବଶ୍ୟକ।"),
    status: "notStarted",
    tab: "prove"
  },
  {
    id: "paper-signature-scanning",
    track: "prove",
    title: words("Paper-signature scanning", "कागज़ी हस्ताक्षर स्कैनिंग", "କାଗଜ ଦସ୍ତଖତ ସ୍କାନିଂ"),
    description: words("Scan and prepare paper-signature batches for review.", "समीक्षा के लिए कागज़ी हस्ताक्षर बैच स्कैन और तैयार करें।", "ସମୀକ୍ଷା ପାଇଁ କାଗଜ ଦସ୍ତଖତ ବ୍ୟାଚ୍ ସ୍କାନ୍ ଏବଂ ପ୍ରସ୍ତୁତ କରନ୍ତୁ।"),
    status: "pendingFinalReview",
    tab: "scans"
  },
  {
    id: "ocr-processing",
    track: "prove",
    title: words("OCR processing", "OCR प्रक्रिया", "OCR ପ୍ରକ୍ରିୟା"),
    description: words("Extract text from uploaded scans; results require human review.", "अपलोड स्कैन से पाठ निकालें; परिणामों की मानवीय समीक्षा आवश्यक है।", "ଅପଲୋଡ୍ ସ୍କାନ୍‌ରୁ ପାଠ୍ୟ ବାହାର କରନ୍ତୁ; ଫଳାଫଳ ପାଇଁ ମାନବ ସମୀକ୍ଷା ଆବଶ୍ୟକ।"),
    status: "pendingFinalReview",
    tab: "scans"
  },
  {
    id: "manual-transcription",
    track: "prove",
    title: words("Manual transcription", "मैनुअल प्रतिलेखन", "ମାନୁଆଲ୍ ଟ୍ରାନ୍ସକ୍ରିପସନ୍"),
    description: words("Human-entered transcription is distinct from automated OCR.", "मानव द्वारा दर्ज प्रतिलेखन स्वचालित OCR से अलग है।", "ମାନବ ଦ୍ୱାରା ଲିଖିତ ଟ୍ରାନ୍ସକ୍ରିପସନ୍ ସ୍ୱୟଂଚାଳିତ OCR ଠାରୁ ଭିନ୍ନ।"),
    status: "inProgress",
    tab: "scans"
  },
  {
    id: "review-approval",
    track: "prove",
    title: words("Review & approval", "समीक्षा और अनुमोदन", "ସମୀକ୍ଷା ଏବଂ ଅନୁମୋଦନ"),
    description: words("Authorized reviewers validate and approve collected records.", "अधिकृत समीक्षक एकत्र रिकॉर्ड सत्यापित और अनुमोदित करते हैं।", "ଅଧିକୃତ ସମୀକ୍ଷକ ସଂଗୃହୀତ ରେକର୍ଡ ଯାଞ୍ଚ ଏବଂ ଅନୁମୋଦନ କରନ୍ତି।"),
    status: "pendingFinalReview",
    tab: "scans"
  },
  {
    id: "evidence-management",
    track: "prove",
    title: words("Evidence management", "साक्ष्य प्रबंधन", "ପ୍ରମାଣ ପରିଚାଳନା"),
    description: words("Organize campaign evidence without exposing private files publicly.", "निजी फ़ाइलें सार्वजनिक किए बिना अभियान साक्ष्य व्यवस्थित करें।", "ବ୍ୟକ୍ତିଗତ ଫାଇଲ୍ ସାର୍ବଜନୀନ ନକରି ଅଭିଯାନ ପ୍ରମାଣ ସଜାନ୍ତୁ।"),
    status: "pendingFinalReview",
    tab: "prove"
  },
  {
    id: "progress-analytics",
    track: "prove",
    title: words("Progress reports & analytics", "प्रगति रिपोर्ट और विश्लेषण", "ପ୍ରଗତି ରିପୋର୍ଟ ଏବଂ ବିଶ୍ଳେଷଣ"),
    description: words("Campaign progress metrics and reporting views.", "अभियान प्रगति मेट्रिक्स और रिपोर्टिंग दृश्य।", "ଅଭିଯାନ ପ୍ରଗତି ମାପଦଣ୍ଡ ଏବଂ ରିପୋର୍ଟିଂ ଦୃଶ୍ୟ।"),
    status: "pendingFinalReview",
    tab: "reports"
  },
  {
    id: "audit-trails",
    track: "prove",
    title: words("Audit trails", "ऑडिट ट्रेल", "ଅଡିଟ୍ ଟ୍ରେଲ୍"),
    description: words("Review recorded administrative and campaign activity.", "दर्ज प्रशासनिक और अभियान गतिविधि की समीक्षा करें।", "ରେକର୍ଡ ହୋଇଥିବା ପ୍ରଶାସନିକ ଏବଂ ଅଭିଯାନ କାର୍ଯ୍ୟକଳାପ ସମୀକ୍ଷା କରନ୍ତୁ।"),
    status: "pendingFinalReview",
    tab: "activity"
  },
  {
    id: "referrals",
    track: "grow",
    title: words("Referrals & attribution", "रेफरल और एट्रिब्यूशन", "ରେଫରାଲ୍ ଏବଂ ଆଟ୍ରିବ୍ୟୁସନ୍"),
    description: words("Campaign referral links and supporter attribution.", "अभियान रेफरल लिंक और समर्थक एट्रिब्यूशन।", "ଅଭିଯାନ ରେଫରାଲ୍ ଲିଙ୍କ୍ ଏବଂ ସମର୍ଥକ ଆଟ୍ରିବ୍ୟୁସନ୍।"),
    status: "pendingFinalReview",
    tab: "growth"
  },
  {
    id: "qr-whatsapp-social",
    track: "grow",
    title: words("QR, WhatsApp & social sharing", "QR, WhatsApp और सोशल शेयरिंग", "QR, WhatsApp ଏବଂ ସୋସିଆଲ୍ ସେୟାରିଂ"),
    description: words("Share campaign links and QR codes through available channels.", "उपलब्ध चैनलों से अभियान लिंक और QR कोड साझा करें।", "ଉପଲବ୍ଧ ଚ୍ୟାନେଲ୍ ମାଧ୍ୟମରେ ଅଭିଯାନ ଲିଙ୍କ୍ ଏବଂ QR କୋଡ୍ ସେୟାର୍ କରନ୍ତୁ।"),
    status: "pendingFinalReview",
    tab: "public"
  },
  {
    id: "growth-dashboard",
    track: "grow",
    title: words("Growth Dashboard", "विकास डैशबोर्ड", "ବିକାଶ ଡ୍ୟାସବୋର୍ଡ"),
    description: words("Campaign growth and supporter engagement overview.", "अभियान विकास और समर्थक सहभागिता अवलोकन।", "ଅଭିଯାନ ବିକାଶ ଏବଂ ସମର୍ଥକ ଯୋଗଦାନ ସାରାଂଶ।"),
    status: "pendingFinalReview",
    tab: "growth"
  },
  {
    id: "rewards-recognition",
    track: "grow",
    title: words("Rewards & recognition", "पुरस्कार और मान्यता", "ପୁରସ୍କାର ଏବଂ ସ୍ୱୀକୃତି"),
    description: words("Reward and recognition workflows are not yet enabled.", "पुरस्कार और मान्यता कार्यप्रवाह अभी सक्षम नहीं हैं।", "ପୁରସ୍କାର ଏବଂ ସ୍ୱୀକୃତି କାର୍ଯ୍ୟପ୍ରବାହ ଏପର୍ଯ୍ୟନ୍ତ ସକ୍ରିୟ ନୁହେଁ।"),
    status: "notStarted",
    tab: "growth"
  },
  {
    id: "movement-crm",
    track: "grow",
    title: words("Movement CRM", "आंदोलन CRM", "ଆନ୍ଦୋଳନ CRM"),
    description: words("Supporter and volunteer relationship views.", "समर्थक और स्वयंसेवक संबंध दृश्य।", "ସମର୍ଥକ ଏବଂ ସ୍ୱେଚ୍ଛାସେବୀ ସମ୍ପର୍କ ଦୃଶ୍ୟ।"),
    status: "pendingFinalReview",
    tab: "movement"
  },
  {
    id: "volunteer-mobilization",
    track: "grow",
    title: words("Volunteer mobilization", "स्वयंसेवक सक्रियता", "ସ୍ୱେଚ୍ଛାସେବୀ ସକ୍ରିୟକରଣ"),
    description: words("Coordinate volunteers through the protected coordinator workspace.", "सुरक्षित समन्वयक कार्यक्षेत्र से स्वयंसेवकों का समन्वय करें।", "ସୁରକ୍ଷିତ ସଂଯୋଜକ କାର୍ଯ୍ୟକ୍ଷେତ୍ର ମାଧ୍ୟମରେ ସ୍ୱେଚ୍ଛାସେବୀ ସମନ୍ୱୟ କରନ୍ତୁ।"),
    status: "inProgress",
    tab: "coordinators"
  },
  {
    id: "engagement-hub",
    track: "grow",
    title: words("Engagement Hub", "सहभागिता केंद्र", "ଯୋଗଦାନ କେନ୍ଦ୍ର"),
    description: words("Campaign communication and participant engagement tools.", "अभियान संचार और प्रतिभागी सहभागिता उपकरण।", "ଅଭିଯାନ ଯୋଗାଯୋଗ ଏବଂ ଅଂଶଗ୍ରହଣକାରୀ ଯୋଗଦାନ ଉପକରଣ।"),
    status: "pendingFinalReview",
    tab: "engagement"
  },
  {
    id: "action-center",
    track: "grow",
    title: words("Action Center", "कार्य केंद्र", "କାର୍ଯ୍ୟ କେନ୍ଦ୍ର"),
    description: words("Prioritized operational actions from campaign readiness signals.", "अभियान तैयारी संकेतों से प्राथमिकता वाले संचालन कार्य।", "ଅଭିଯାନ ପ୍ରସ୍ତୁତି ସଙ୍କେତରୁ ପ୍ରାଥମିକତା ପାଇଥିବା ପରିଚାଳନା କାର୍ଯ୍ୟ।"),
    status: "pendingFinalReview",
    tab: "command"
  },
  {
    id: "saas-administration",
    track: "businessOs",
    title: words("SaaS administration", "SaaS प्रशासन", "SaaS ପ୍ରଶାସନ"),
    description: words("Protected platform administration and workspace controls.", "सुरक्षित प्लेटफ़ॉर्म प्रशासन और कार्यक्षेत्र नियंत्रण।", "ସୁରକ୍ଷିତ ପ୍ଲାଟଫର୍ମ ପ୍ରଶାସନ ଏବଂ କାର୍ଯ୍ୟକ୍ଷେତ୍ର ନିୟନ୍ତ୍ରଣ।"),
    status: "pendingFinalReview",
    tab: "saas"
  },
  {
    id: "subscriptions-trials",
    track: "businessOs",
    title: words("Subscriptions & trials", "सदस्यता और ट्रायल", "ସବସ୍କ୍ରିପସନ୍ ଏବଂ ଟ୍ରାୟାଲ୍"),
    description: words("Plan entitlements and trial lifecycle management.", "प्लान अधिकार और ट्रायल जीवनचक्र प्रबंधन।", "ପ୍ଲାନ୍ ଅଧିକାର ଏବଂ ଟ୍ରାୟାଲ୍ ଜୀବନଚକ୍ର ପରିଚାଳନା।"),
    status: "pendingFinalReview",
    tab: "saas"
  },
  {
    id: "authentication",
    track: "businessOs",
    title: words("Authentication & account access", "प्रमाणीकरण और खाता पहुँच", "ପ୍ରାମାଣିକରଣ ଏବଂ ଆକାଉଣ୍ଟ ପ୍ରବେଶ"),
    description: words("Account sign-in, email verification, and recovery journeys.", "खाता साइन-इन, ईमेल सत्यापन और पुनर्प्राप्ति प्रक्रियाएँ।", "ଆକାଉଣ୍ଟ ସାଇନ୍-ଇନ୍, ଇମେଲ୍ ଯାଞ୍ଚ ଏବଂ ପୁନରୁଦ୍ଧାର ଯାତ୍ରା।"),
    status: "pendingFinalReview",
    tab: "public"
  },
  {
    id: "multilingual-localization",
    track: "businessOs",
    title: words("English, Hindi & Odia", "अंग्रेज़ी, हिंदी और ओड़िया", "ଇଂରାଜୀ, ହିନ୍ଦୀ ଏବଂ ଓଡ଼ିଆ"),
    description: words("Localized campaign operations and public-facing journeys.", "स्थानीयकृत अभियान संचालन और सार्वजनिक यात्राएँ।", "ସ୍ଥାନୀୟକୃତ ଅଭିଯାନ ପରିଚାଳନା ଏବଂ ଜନସାଧାରଣ ଯାତ୍ରା।"),
    status: "pendingFinalReview",
    tab: "command"
  },
  {
    id: "ai-copilot",
    track: "businessOs",
    title: words("AI Campaign Copilot", "AI अभियान सहायक", "AI ଅଭିଯାନ ସହାୟକ"),
    description: words("Assisted campaign drafting subject to plan and workspace access.", "प्लान और कार्यक्षेत्र पहुँच के अधीन अभियान ड्राफ्टिंग सहायता।", "ପ୍ଲାନ୍ ଏବଂ କାର୍ଯ୍ୟକ୍ଷେତ୍ର ପ୍ରବେଶ ଅନୁସାରେ ଅଭିଯାନ ଡ୍ରାଫ୍ଟ ସହାୟତା।"),
    status: "pendingFinalReview",
    action: "aiCopilot"
  },
  {
    id: "content-studio",
    track: "businessOs",
    title: words("Content Studio", "कंटेंट स्टूडियो", "କଣ୍ଟେଣ୍ଟ ଷ୍ଟୁଡିଓ"),
    description: words("Dedicated content production workflow is not implemented.", "समर्पित सामग्री निर्माण कार्यप्रवाह लागू नहीं है।", "ସ୍ୱତନ୍ତ୍ର ବିଷୟବସ୍ତୁ ନିର୍ମାଣ କାର୍ଯ୍ୟପ୍ରବାହ କାର୍ଯ୍ୟକାରୀ ହୋଇନାହିଁ।"),
    status: "notStarted"
  },
  {
    id: "shared-reporting",
    track: "businessOs",
    title: words("Reporting & dashboards", "रिपोर्टिंग और डैशबोर्ड", "ରିପୋର୍ଟିଂ ଏବଂ ଡ୍ୟାସବୋର୍ଡ"),
    description: words("Campaign and workspace reporting views, subject to entitlements.", "अधिकारों के अधीन अभियान और कार्यक्षेत्र रिपोर्टिंग दृश्य।", "ଅଧିକାର ଅନୁସାରେ ଅଭିଯାନ ଏବଂ କାର୍ଯ୍ୟକ୍ଷେତ୍ର ରିପୋର୍ଟିଂ ଦୃଶ୍ୟ।"),
    status: "pendingFinalReview",
    tab: "reports"
  },
  {
    id: "communications-integrations",
    track: "businessOs",
    title: words("Shared communication services", "साझा संचार सेवाएँ", "ସାଧାରଣ ଯୋଗାଯୋଗ ସେବା"),
    description: words("Configured communication channels and integration settings.", "कॉन्फ़िगर किए गए संचार चैनल और एकीकरण सेटिंग।", "ବିନ୍ୟାସିତ ଯୋଗାଯୋଗ ଚ୍ୟାନେଲ୍ ଏବଂ ଏକୀକରଣ ସେଟିଂ।"),
    status: "inProgress",
    tab: "engagement"
  },
  {
    id: "document-intelligence",
    track: "businessOs",
    title: words("Document intelligence", "दस्तावेज़ इंटेलिजेंस", "ଦଲିଲ୍ ଇଣ୍ଟେଲିଜେନ୍ସ"),
    description: words("Document extraction pipeline with diagnostic and review steps.", "नैदानिक और समीक्षा चरणों वाली दस्तावेज़ निष्कर्षण पाइपलाइन।", "ନିଦାନ ଏବଂ ସମୀକ୍ଷା ପଦକ୍ଷେପ ସହିତ ଦଲିଲ୍ ନିଷ୍କାସନ ପାଇପଲାଇନ୍।"),
    status: "pendingFinalReview",
    tab: "scans"
  }
];

export const campaignReadinessLabels: Record<CampaignReadinessStatus, Record<Language, string>> = {
  completed: words("Completed", "पूरा", "ସମ୍ପୂର୍ଣ୍ଣ"),
  pendingFinalReview: words("Pending final review", "अंतिम समीक्षा लंबित", "ଅନ୍ତିମ ସମୀକ୍ଷା ବାକି"),
  inProgress: words("In progress", "प्रगति में", "ଚାଲିଛି"),
  notStarted: words("Not started", "शुरू नहीं हुआ", "ଆରମ୍ଭ ହୋଇନାହିଁ"),
  blocked: words("Blocked", "अवरुद्ध", "ଅଟକିଛି")
};

export const campaignShowcaseCopy = {
  title: words("Campaign capability catalogue", "अभियान क्षमता सूची", "ଅଭିଯାନ କ୍ଷମତା ତାଲିକା"),
  description: words(
    "Browse existing campaign capabilities and their evidence-based readiness. Protected screens remain behind their current role and plan checks; previews never simulate signatures or payments.",
    "मौजूदा अभियान क्षमताओं और उनकी साक्ष्य-आधारित तैयारी देखें। सुरक्षित स्क्रीन पर मौजूदा भूमिका और प्लान जाँच लागू रहती है; पूर्वावलोकन हस्ताक्षर या भुगतान का अनुकरण नहीं करते।",
    "ବର୍ତ୍ତମାନର ଅଭିଯାନ କ୍ଷମତା ଏବଂ ପ୍ରମାଣ-ଆଧାରିତ ପ୍ରସ୍ତୁତି ଦେଖନ୍ତୁ। ସୁରକ୍ଷିତ ସ୍କ୍ରିନ୍‌ଗୁଡ଼ିକରେ ପୂର୍ବତନ ଭୂମିକା ଏବଂ ପ୍ଲାନ୍ ଯାଞ୍ଚ ଚାଲୁ ରହେ; ପୂର୍ବଦର୍ଶନ ଦସ୍ତଖତ କିମ୍ବା ଦେୟ ଅନୁକରଣ କରେନାହିଁ।"
  ),
  openModule: words("Open module", "मॉड्यूल खोलें", "ମଡ୍ୟୁଲ୍ ଖୋଲନ୍ତୁ"),
  restricted: words("Restricted by current role or plan", "वर्तमान भूमिका या प्लान से प्रतिबंधित", "ବର୍ତ୍ତମାନର ଭୂମିକା କିମ୍ବା ପ୍ଲାନ୍ ଦ୍ୱାରା ସୀମିତ"),
  noAction: words("Informational preview — no live action", "जानकारी पूर्वावलोकन — कोई लाइव कार्य नहीं", "ସୂଚନା ପୂର୍ବଦର୍ଶନ — କୌଣସି ଲାଇଭ୍ କାର୍ଯ୍ୟ ନାହିଁ"),
  completedHelp: words("Implemented and verified.", "कार्यान्वित और सत्यापित।", "କାର୍ଯ୍ୟକାରୀ ଏବଂ ଯାଞ୍ଚିତ।"),
  pendingHelp: words("Implemented; awaiting final acceptance review.", "कार्यान्वित; अंतिम स्वीकृति समीक्षा बाकी।", "କାର୍ଯ୍ୟକାରୀ; ଅନ୍ତିମ ଗ୍ରହଣ ସମୀକ୍ଷା ବାକି।"),
  progressHelp: words("Partially implemented or under development.", "आंशिक रूप से कार्यान्वित या विकासाधीन।", "ଆଂଶିକ ଭାବେ କାର୍ଯ୍ୟକାରୀ କିମ୍ବା ବିକାଶାଧୀନ।"),
  notStartedHelp: words("Planned, but not implemented.", "नियोजित, पर कार्यान्वित नहीं।", "ଯୋଜନା ହୋଇଛି, କିନ୍ତୁ କାର୍ଯ୍ୟକାରୀ ହୋଇନାହିଁ।"),
  blockedHelp: words("A specific dependency must be resolved before use.", "उपयोग से पहले एक विशिष्ट निर्भरता हल करनी होगी।", "ବ୍ୟବହାର ପୂର୍ବରୁ ଏକ ନିର୍ଦ୍ଦିଷ୍ଟ ନିର୍ଭରତା ସମାଧାନ କରିବାକୁ ପଡ଼ିବ।")
} as const;
