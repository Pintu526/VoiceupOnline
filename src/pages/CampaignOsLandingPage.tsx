import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  FileCheck2,
  Globe2,
  HandCoins,
  HeartHandshake,
  LayoutDashboard,
  Megaphone,
  Network,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { useState } from "react";
import {
  campaignReadinessLabels,
  campaignShowcaseCopy,
  campaignShowcaseModules,
  campaignShowcaseTracks,
  type CampaignReadinessStatus,
  type CampaignShowcaseModule,
  type CampaignShowcaseTrack
} from "../campaignShowcaseCatalog";
import { campaignCapabilityAssessments } from "../campaignCompletion";
import { GOUDHAN_CAMPAIGN_SLUG } from "../config/goudhanProduction";
import { LanguageSwitcher, useTranslation } from "../i18n";

const pillarIcons: Record<CampaignShowcaseTrack, LucideIcon> = {
  organize: UsersRound,
  plan: BriefcaseBusiness,
  act: Megaphone,
  fund: HandCoins,
  prove: FileCheck2,
  grow: TrendingUp,
  businessOs: ShieldCheck
};

const moduleIcons: Record<string, LucideIcon> = {
  "organizations-workspaces": LayoutDashboard,
  "volunteers-coordinators": Network,
  "roles-permissions": ShieldCheck,
  "resources-locations": Globe2,
  "campaign-lifecycle": Megaphone,
  "campaign-settings-branding": Sparkles,
  "six-step-signing": CheckCircle2,
  "otp-verification": BadgeCheck,
  "field-collection": ScanLine,
  "paper-signature-scanning": ScanLine,
  "qr-whatsapp-social": QrCode,
  "progress-analytics": BarChart3,
  "shared-reporting": BarChart3,
  "ai-copilot": Bot,
  "merchant-partner-foundations": HeartHandshake
};

const pillarDestinations: Partial<Record<CampaignShowcaseTrack, string>> = {
  organize: "/app?tab=coordinators",
  plan: "/app?tab=campaigns",
  act: "/app?tab=public",
  prove: "/app?tab=reports",
  grow: "/app?tab=growth"
};

const availability: Record<CampaignReadinessStatus, { label: string; className: string }> = {
  completed: { label: "Operational", className: "operational" },
  pendingFinalReview: { label: "Development", className: "development" },
  inProgress: { label: "Development", className: "development" },
  notStarted: { label: "Planned", className: "planned" },
  blocked: { label: "Planned", className: "planned" }
};

const supplementalCapabilities: ReadonlyArray<CampaignShowcaseModule> = [
  {
    id: "command-center-overview",
    track: "businessOs",
    title: { en: "Campaign Command Center & overview", hi: "अभियान कमांड सेंटर और अवलोकन", or: "ଅଭିଯାନ କମାଣ୍ଡ ସେଣ୍ଟର୍ ଏବଂ ସାରାଂଶ" },
    description: { en: "Movement health, risk, action priorities and campaign operating context in one workspace view.", hi: "एक कार्यक्षेत्र दृश्य में अभियान स्वास्थ्य, जोखिम, कार्य प्राथमिकताएँ और संचालन संदर्भ।", or: "ଗୋଟିଏ କାର୍ଯ୍ୟକ୍ଷେତ୍ର ଦୃଶ୍ୟରେ ଅଭିଯାନ ସ୍ୱାସ୍ଥ୍ୟ, ବିପଦ, କାର୍ଯ୍ୟ ପ୍ରାଥମିକତା ଏବଂ ପରିଚାଳନା ପ୍ରସଙ୍ଗ।" },
    status: "pendingFinalReview",
    tab: "command"
  },
  {
    id: "participation-certificates",
    track: "prove",
    title: { en: "Participation certificates & designer", hi: "भागीदारी प्रमाणपत्र और डिज़ाइनर", or: "ଅଂଶଗ୍ରହଣ ପ୍ରମାଣପତ୍ର ଏବଂ ଡିଜାଇନର୍" },
    description: { en: "Campaign certificate configuration, preview, issuance, supporter access and public verification foundations.", hi: "अभियान प्रमाणपत्र कॉन्फ़िगरेशन, पूर्वावलोकन, जारी करना, समर्थक पहुँच और सार्वजनिक सत्यापन आधार।", or: "ଅଭିଯାନ ପ୍ରମାଣପତ୍ର ବିନ୍ୟାସ, ପୂର୍ବଦର୍ଶନ, ପ୍ରଦାନ, ସମର୍ଥକ ପ୍ରବେଶ ଏବଂ ସାର୍ବଜନୀନ ଯାଞ୍ଚ ଭିତ୍ତିଭୂମି।" },
    status: "pendingFinalReview",
    tab: "campaigns"
  },
  {
    id: "merchant-partner-foundations",
    track: "grow",
    title: { en: "Merchant & partner reward foundations", hi: "व्यापारी और भागीदार पुरस्कार आधार", or: "ବ୍ୟବସାୟୀ ଏବଂ ସହଭାଗୀ ପୁରସ୍କାର ଭିତ୍ତିଭୂମି" },
    description: { en: "Growth configuration, merchant records, reward catalogs and redemption service foundations under development.", hi: "विकासाधीन ग्रोथ कॉन्फ़िगरेशन, व्यापारी रिकॉर्ड, पुरस्कार कैटलॉग और रिडेम्पशन सेवा आधार।", or: "ବିକାଶାଧୀନ ଗ୍ରୋଥ୍ ବିନ୍ୟାସ, ବ୍ୟବସାୟୀ ରେକର୍ଡ, ପୁରସ୍କାର କ୍ୟାଟାଲଗ୍ ଏବଂ ରିଡେମ୍ପସନ୍ ସେବା ଭିତ୍ତିଭୂମି।" },
    status: "inProgress",
    tab: "growth"
  }
];


// Localized presentation copy only; routes, access checks and campaign data are unchanged.
const campaignOsUiCopy = {
  "by VoiceUp Business OS": { hi: "VoiceUp Business OS द्वारा", or: "VoiceUp Business OS ଦ୍ୱାରା" },
  "CampaignOS sections": { hi: "CampaignOS अनुभाग", or: "CampaignOS ବିଭାଗ" },
  "Operating model": { hi: "संचालन मॉडल", or: "ପରିଚାଳନା ମଡେଲ୍" },
  "Capabilities": { hi: "क्षमताएँ", or: "ସାମର୍ଥ୍ୟ" },
  "Access": { hi: "पहुँच", or: "ପ୍ରବେଶ" },
  "— From an Idea to a Movement.": { hi: "— विचार से जनआंदोलन तक।", or: "— ଚିନ୍ତାଧାରାରୁ ଜନଆନ୍ଦୋଳନ ପର୍ଯ୍ୟନ୍ତ।" },
  "Plan, launch, mobilize and prove public campaigns from one governed command system—connecting teams, supporters, field evidence, communications and growth.": { hi: "एक नियंत्रित कमांड प्रणाली से सार्वजनिक अभियानों की योजना बनाएँ, शुरू करें, लोगों को जोड़ें और परिणाम प्रमाणित करें—टीम, समर्थक, क्षेत्रीय साक्ष्य, संचार और विकास को साथ लाएँ।", or: "ଗୋଟିଏ ସୁପରିଚାଳିତ କମାଣ୍ଡ ପ୍ରଣାଳୀରୁ ଜନଅଭିଯାନ ଯୋଜନା, ଆରମ୍ଭ, ଲୋକଙ୍କ ସଂଗଠନ ଓ ପ୍ରମାଣୀକରଣ କରନ୍ତୁ—ଦଳ, ସମର୍ଥକ, କ୍ଷେତ୍ର ପ୍ରମାଣ, ଯୋଗାଯୋଗ ଓ ଅଭିବୃଦ୍ଧିକୁ ଯୋଡ଼ନ୍ତୁ।" },
  "Explore Campaigns": { hi: "अभियान देखें", or: "ଅଭିଯାନ ଦେଖନ୍ତୁ" },
  "Create Campaign": { hi: "अभियान बनाएँ", or: "ଅଭିଯାନ ସୃଷ୍ଟି କରନ୍ତୁ" },
  "Supporter Account": { hi: "समर्थक खाता", or: "ସମର୍ଥକ ଖାତା" },
  "Campaign Admin": { hi: "अभियान प्रशासक", or: "ଅଭିଯାନ ପ୍ରଶାସକ" },
  "Protected workspaces retain their existing identity, role, plan and campaign-scope checks.": { hi: "सुरक्षित कार्यक्षेत्रों में पहचान, भूमिका, योजना और अभियान-सीमा की मौजूदा जाँच बनी रहती है।", or: "ସୁରକ୍ଷିତ କାର୍ଯ୍ୟକ୍ଷେତ୍ରରେ ପରିଚୟ, ଭୂମିକା, ଯୋଜନା ଓ ଅଭିଯାନ ସୀମାର ବର୍ତ୍ତମାନ ଯାଞ୍ଚ ଅପରିବର୍ତ୍ତିତ ରହେ।" },
  "CampaignOS command system illustration": { hi: "CampaignOS कमांड प्रणाली का चित्र", or: "CampaignOS କମାଣ୍ଡ ପ୍ରଣାଳୀ ଚିତ୍ର" },
  "CAMPAIGN COMMAND CENTER": { hi: "अभियान कमांड सेंटर", or: "ଅଭିଯାନ କମାଣ୍ଡ ସେଣ୍ଟର୍" },
  "One campaign.": { hi: "एक अभियान।", or: "ଗୋଟିଏ ଅଭିଯାନ।" },
  "One operating picture.": { hi: "एक समग्र संचालन दृश्य।", or: "ଗୋଟିଏ ସମନ୍ୱିତ ପରିଚାଳନା ଦୃଶ୍ୟ।" },
  "People": { hi: "लोग", or: "ଲୋକ" },
  "Evidence": { hi: "साक्ष्य", or: "ପ୍ରମାଣ" },
  "Action": { hi: "कार्रवाई", or: "କାର୍ଯ୍ୟ" },
  "Growth": { hi: "विकास", or: "ଅଭିବୃଦ୍ଧି" },
  "THE OPERATING MODEL": { hi: "संचालन मॉडल", or: "ପରିଚାଳନା ମଡେଲ୍" },
  "Every stage of movement building, connected.": { hi: "जनआंदोलन निर्माण का हर चरण आपस में जुड़ा है।", or: "ଜନଆନ୍ଦୋଳନ ଗଠନର ପ୍ରତ୍ୟେକ ପର୍ଯ୍ୟାୟ ସଂଯୁକ୍ତ।" },
  "The six-pillar model reflects modules already present in the CampaignOS workspace and clearly distinguishes protected or planned areas.": { hi: "छह-स्तंभीय मॉडल CampaignOS में पहले से मौजूद मॉड्यूल दिखाता है और सुरक्षित तथा नियोजित क्षेत्रों को स्पष्ट रूप से अलग करता है।", or: "ଛଅଟି ସ୍ତମ୍ଭର ମଡେଲ୍ CampaignOS ରେ ଥିବା ମଡ୍ୟୁଲ୍‌ଗୁଡ଼ିକୁ ଦର୍ଶାଏ ଏବଂ ସୁରକ୍ଷିତ ଓ ଯୋଜନାଧୀନ କ୍ଷେତ୍ରକୁ ସ୍ପଷ୍ଟ ଭାବେ ପୃଥକ କରେ।" },
  "Open protected module": { hi: "सुरक्षित मॉड्यूल खोलें", or: "ସୁରକ୍ଷିତ ମଡ୍ୟୁଲ୍ ଖୋଲନ୍ତୁ" },
  "Planned workflows": { hi: "नियोजित कार्यप्रवाह", or: "ଯୋଜନାଧୀନ କାର୍ଯ୍ୟପ୍ରବାହ" },
  "EVIDENCE-BASED DIRECTORY": { hi: "साक्ष्य-आधारित निर्देशिका", or: "ପ୍ରମାଣ-ଆଧାରିତ ନିର୍ଦ୍ଦେଶିକା" },
  "The real Command Center capability map.": { hi: "कमांड सेंटर की वास्तविक क्षमताओं का मानचित्र।", or: "କମାଣ୍ଡ ସେଣ୍ଟର୍‌ର ବାସ୍ତବ ସାମର୍ଥ୍ୟ ମାନଚିତ୍ର।" },
  "Filter capabilities by operating pillar": { hi: "संचालन स्तंभ के अनुसार क्षमताएँ छाँटें", or: "ପରିଚାଳନା ସ୍ତମ୍ଭ ଅନୁସାରେ ସାମର୍ଥ୍ୟ ଛାଣନ୍ତୁ" },
  "All capabilities": { hi: "सभी क्षमताएँ", or: "ସମସ୍ତ ସାମର୍ଥ୍ୟ" },
  "Operational": { hi: "संचालित", or: "କାର୍ଯ୍ୟକ୍ଷମ" },
  "Development": { hi: "विकासाधीन", or: "ବିକାଶାଧୀନ" },
  "Planned": { hi: "नियोजित", or: "ଯୋଜନାଧୀନ" },
  "Open public campaign": { hi: "सार्वजनिक अभियान खोलें", or: "ସାର୍ବଜନୀନ ଅଭିଯାନ ଖୋଲନ୍ତୁ" },
  "Enter protected workspace": { hi: "सुरक्षित कार्यक्षेत्र में जाएँ", or: "ସୁରକ୍ଷିତ କାର୍ଯ୍ୟକ୍ଷେତ୍ରକୁ ଯାଆନ୍ତୁ" },
  "No live entry until available": { hi: "उपलब्ध होने तक प्रवेश नहीं", or: "ଉପଲବ୍ଧ ହେବା ପର୍ଯ୍ୟନ୍ତ ପ୍ରବେଶ ନାହିଁ" },
  "ROLE-BASED ENTRY": { hi: "भूमिका-आधारित प्रवेश", or: "ଭୂମିକା-ଆଧାରିତ ପ୍ରବେଶ" },
  "The right door for every participant.": { hi: "हर प्रतिभागी के लिए सही प्रवेश मार्ग।", or: "ପ୍ରତ୍ୟେକ ଅଂଶଗ୍ରହଣକାରୀଙ୍କ ପାଇଁ ଉପଯୁକ୍ତ ପ୍ରବେଶ ପଥ।" },
  "Each entry uses an existing route and keeps Campaign Admin access separate from VoiceUp Platform administration.": { hi: "हर प्रवेश मौजूदा मार्ग का उपयोग करता है और अभियान प्रशासन को VoiceUp प्लेटफ़ॉर्म प्रशासन से अलग रखता है।", or: "ପ୍ରତ୍ୟେକ ପ୍ରବେଶ ବର୍ତ୍ତମାନର ପଥ ବ୍ୟବହାର କରେ ଏବଂ ଅଭିଯାନ ପ୍ରଶାସନକୁ VoiceUp ପ୍ଲାଟଫର୍ମ ପ୍ରଶାସନରୁ ପୃଥକ ରଖେ।" },
  "Public visitor": { hi: "सार्वजनिक आगंतुक", or: "ସାର୍ବଜନୀନ ପରିଦର୍ଶକ" },
  "Explore the live public campaign journey.": { hi: "सक्रिय सार्वजनिक अभियान प्रक्रिया देखें।", or: "ସକ୍ରିୟ ସାର୍ବଜନୀନ ଅଭିଯାନ ପ୍ରକ୍ରିୟା ଦେଖନ୍ତୁ।" },
  "Supporter": { hi: "समर्थक", or: "ସମର୍ଥକ" },
  "Sign in and open owner-scoped supporter access.": { hi: "साइन इन करके अपने समर्थक खाते तक पहुँचें।", or: "ସାଇନ୍ ଇନ୍ କରି ନିଜ ସମର୍ଥକ ଖାତାକୁ ପ୍ରବେଶ କରନ୍ତୁ।" },
  "Campaign creator": { hi: "अभियान निर्माता", or: "ଅଭିଯାନ ସୃଷ୍ଟିକର୍ତ୍ତା" },
  "Start the existing guided campaign onboarding.": { hi: "मौजूदा निर्देशित अभियान पंजीकरण शुरू करें।", or: "ବର୍ତ୍ତମାନର ନିର୍ଦ୍ଦେଶିତ ଅଭିଯାନ ପଞ୍ଜୀକରଣ ଆରମ୍ଭ କରନ୍ତୁ।" },
  "Choose a campaign and enter its campaign-scoped admin route.": { hi: "अभियान चुनकर उसके निर्धारित प्रशासनिक मार्ग पर जाएँ।", or: "ଅଭିଯାନ ବାଛି ତାହାର ନିର୍ଦ୍ଦିଷ୍ଟ ପ୍ରଶାସନିକ ପଥକୁ ଯାଆନ୍ତୁ।" },
  "VoiceUp Platform Admin": { hi: "VoiceUp प्लेटफ़ॉर्म प्रशासक", or: "VoiceUp ପ୍ଲାଟଫର୍ମ ପ୍ରଶାସକ" },
  "Platform-owner administration only—not Campaign Admin.": { hi: "केवल प्लेटफ़ॉर्म स्वामी का प्रशासन—अभियान प्रशासन नहीं।", or: "କେବଳ ପ୍ଲାଟଫର୍ମ ମାଲିକଙ୍କ ପ୍ରଶାସନ—ଅଭିଯାନ ପ୍ରଶାସନ ନୁହେଁ।" },
  "Continue": { hi: "आगे बढ़ें", or: "ଆଗକୁ ବଢ଼ନ୍ତୁ" },
  "Administration boundary": { hi: "प्रशासनिक सीमा", or: "ପ୍ରଶାସନିକ ସୀମା" },
  " remains exclusively the VoiceUp Platform Admin gate. Campaign administrators use campaign-specific ": { hi: " केवल VoiceUp प्लेटफ़ॉर्म प्रशासक के लिए है। अभियान प्रशासक अभियान-विशिष्ट ", or: " କେବଳ VoiceUp ପ୍ଲାଟଫର୍ମ ପ୍ରଶାସକଙ୍କ ପାଇଁ। ଅଭିଯାନ ପ୍ରଶାସକମାନେ ଅଭିଯାନ-ନିର୍ଦ୍ଦିଷ୍ଟ " },
  " routes reached through the Campaign Admin gateway.": { hi: " मार्गों का उपयोग करते हैं, जो अभियान प्रशासन प्रवेश से खुलते हैं।", or: " ପଥ ବ୍ୟବହାର କରନ୍ତି, ଯାହା ଅଭିଯାନ ପ୍ରଶାସନ ପ୍ରବେଶ ଦ୍ୱାରା ଖୋଲାଯାଏ।" },
  "CampaignOS · Governed campaigns from idea to movement": { hi: "CampaignOS · विचार से जनआंदोलन तक सुव्यवस्थित अभियान", or: "CampaignOS · ଚିନ୍ତାଧାରାରୁ ଜନଆନ୍ଦୋଳନ ପର୍ଯ୍ୟନ୍ତ ସୁପରିଚାଳିତ ଅଭିଯାନ" }
} as const;

function campaignOsText(language: "en" | "hi" | "or", english: keyof typeof campaignOsUiCopy): string {
  return language === "en" ? english : campaignOsUiCopy[english][language];
}

function moduleHref(moduleId: string, tab?: string, action?: string) {
  if (moduleId === "gsaa-public-campaign") return `/c/${GOUDHAN_CAMPAIGN_SLUG}`;
  if (moduleId === "supporter-dashboard") return "/account";
  if (action === "aiCopilot") return "/app?tab=campaigns";
  return tab ? `/app?tab=${tab}` : "";
}

export function CampaignOsLandingPage() {
  const { language } = useTranslation();
  const [activeTrack, setActiveTrack] = useState<CampaignShowcaseTrack | "all">("all");
  const pillars = campaignShowcaseTracks.filter((track) => track.id !== "businessOs");
  const capabilityModules = [...campaignShowcaseModules, ...supplementalCapabilities];
  const assessmentById = new Map(campaignCapabilityAssessments.map((assessment) => [assessment.id, assessment]));
  const visibleModules = activeTrack === "all"
    ? capabilityModules
    : capabilityModules.filter((module) => module.track === activeTrack);

  return (
    <main className="campaignos-landing">
      <header className="campaignos-nav">
        <a className="campaignos-brand" href="/" aria-label="VoiceUp Business OS home">
          <span><Megaphone size={20} /></span>
          <div><strong>CampaignOS</strong><small>{campaignOsText(language, "by VoiceUp Business OS")}</small></div>
        </a>
        <nav aria-label={campaignOsText(language, "CampaignOS sections")}>
          <a href="#operating-model">{campaignOsText(language, "Operating model")}</a>
          <a href="#capabilities">{campaignOsText(language, "Capabilities")}</a>
          <a href="#roles">{campaignOsText(language, "Access")}</a>
        </nav>
        <div className="campaignos-nav-actions">
          <LanguageSwitcher />
          <a href="/">VoiceUp <ArrowRight size={14} /></a>
        </div>
      </header>

      <section className="campaignos-hero">
        <div className="campaignos-hero-glow" aria-hidden="true" />
        <motion.div className="campaignos-hero-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48 }}>
          <span className="campaignos-kicker"><Sparkles size={15} /> VoiceUp Business OS</span>
          <h1>CampaignOS <em>{campaignOsText(language, "\u2014 From an Idea to a Movement.")}</em></h1>
          <p>{campaignOsText(language, "Plan, launch, mobilize and prove public campaigns from one governed command system\u2014connecting teams, supporters, field evidence, communications and growth.")}</p>
          <div className="campaignos-hero-actions">
            <a className="campaignos-primary" href={`/c/${GOUDHAN_CAMPAIGN_SLUG}`}>{campaignOsText(language, "Explore Campaigns")} <ArrowRight size={17} /></a>
            <a href="/start">{campaignOsText(language, "Create Campaign")}</a>
            <a href="/account">{campaignOsText(language, "Supporter Account")}</a>
            <a href="/applications/campaign/act">{campaignOsText(language, "Campaign Admin")}</a>
          </div>
          <p className="campaignos-access-note"><ShieldCheck size={15} /> Protected workspaces retain their existing identity, role, plan and campaign-scope checks.</p>
        </motion.div>
        <motion.div className="campaignos-command-visual" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55, delay: 0.08 }} aria-label={campaignOsText(language, "CampaignOS command system illustration")}>
          <div className="campaignos-visual-top"><span /><span /><span /><strong>{campaignOsText(language, "CAMPAIGN COMMAND CENTER")}</strong></div>
          <div className="campaignos-visual-core"><Megaphone size={30} /><strong>{campaignOsText(language, "One campaign.")}<br />{campaignOsText(language, "One operating picture.")}</strong></div>
          <div className="campaignos-visual-orbit">
            {pillars.map((pillar, index) => {
              const Icon = pillarIcons[pillar.id];
              return <span key={pillar.id} style={{ "--orbit-index": index } as React.CSSProperties}><Icon size={16} /> {pillar.title[language]}</span>;
            })}
          </div>
          <div className="campaignos-visual-footer"><span>{campaignOsText(language, "People")}</span><span>{campaignOsText(language, "Evidence")}</span><span>{campaignOsText(language, "Action")}</span><span>{campaignOsText(language, "Growth")}</span></div>
        </motion.div>
      </section>

      <section className="campaignos-section campaignos-pillars" id="operating-model" aria-labelledby="campaignos-pillars-title">
        <div className="campaignos-section-heading">
          <span>{campaignOsText(language, "THE OPERATING MODEL")}</span>
          <h2 id="campaignos-pillars-title">{campaignOsText(language, "Every stage of movement building, connected.")}</h2>
          <p>{campaignOsText(language, "The six-pillar model reflects modules already present in the CampaignOS workspace and clearly distinguishes protected or planned areas.")}</p>
        </div>
        <div className="campaignos-pillar-flow">
          {pillars.map((pillar, index) => {
            const Icon = pillarIcons[pillar.id];
            const destination = pillarDestinations[pillar.id];
            return (
              <article key={pillar.id}>
                <span className="campaignos-pillar-number">0{index + 1}</span>
                <span className="campaignos-pillar-icon"><Icon size={22} /></span>
                <h3>{pillar.title[language]}</h3>
                <p>{pillar.description[language]}</p>
                {destination ? <a href={destination}>{campaignOsText(language, "Open protected module")} <ArrowRight size={14} /></a> : <span className="campaignos-planned-label">{campaignOsText(language, "Planned workflows")}</span>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="campaignos-section campaignos-capabilities" id="capabilities" aria-labelledby="campaignos-capabilities-title">
        <div className="campaignos-section-heading is-light">
          <span>{campaignOsText(language, "EVIDENCE-BASED DIRECTORY")}</span>
          <h2 id="campaignos-capabilities-title">{campaignOsText(language, "The real Command Center capability map.")}</h2>
          <p>{campaignShowcaseCopy.description[language]}</p>
        </div>
        <div className="campaignos-filters" role="group" aria-label={campaignOsText(language, "Filter capabilities by operating pillar")}>
          <button className={activeTrack === "all" ? "active" : ""} type="button" onClick={() => setActiveTrack("all")}>{campaignOsText(language, "All capabilities")}</button>
          {campaignShowcaseTracks.map((track) => <button className={activeTrack === track.id ? "active" : ""} key={track.id} type="button" onClick={() => setActiveTrack(track.id)}>{track.title[language]}</button>)}
        </div>
        <div className="campaignos-capability-grid">
          {visibleModules.map((module, index) => {
            const actualStatus = assessmentById.get(module.id)?.actualStatus ?? module.status;
            const status = availability[actualStatus];
            const Icon = moduleIcons[module.id] ?? pillarIcons[module.track];
            const href = actualStatus === "notStarted" || actualStatus === "blocked" ? "" : moduleHref(module.id, module.tab, module.action);
            return (
              <motion.article key={module.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ delay: (index % 6) * 0.025 }}>
                <div className="campaignos-capability-top"><span><Icon size={18} /></span><b className={`campaignos-status ${status.className}`}>{campaignOsText(language, status.label as "Operational" | "Development" | "Planned")}</b></div>
                <small>{campaignShowcaseTracks.find((track) => track.id === module.track)?.title[language]} · {campaignReadinessLabels[actualStatus][language]}</small>
                <h3>{module.title[language]}</h3>
                <p>{module.description[language]}</p>
                {module.blockedReason && <p className="campaignos-blocked-reason">{module.blockedReason[language]}</p>}
                {href ? <a href={href}>{module.id === "gsaa-public-campaign" ? campaignOsText(language, "Open public campaign") : campaignOsText(language, "Enter protected workspace")} <ArrowRight size={14} /></a> : <span className="campaignos-no-action">{campaignOsText(language, "No live entry until available")}</span>}
              </motion.article>
            );
          })}
        </div>
      </section>

      <section className="campaignos-section campaignos-roles" id="roles" aria-labelledby="campaignos-roles-title">
        <div className="campaignos-section-heading">
          <span>{campaignOsText(language, "ROLE-BASED ENTRY")}</span>
          <h2 id="campaignos-roles-title">{campaignOsText(language, "The right door for every participant.")}</h2>
          <p>{campaignOsText(language, "Each entry uses an existing route and keeps Campaign Admin access separate from VoiceUp Platform administration.")}</p>
        </div>
        <div className="campaignos-role-grid">
          {[
            [campaignOsText(language, "Public visitor"), campaignOsText(language, "Explore the live public campaign journey."), `/c/${GOUDHAN_CAMPAIGN_SLUG}`, Globe2],
            [campaignOsText(language, "Supporter"), campaignOsText(language, "Sign in and open owner-scoped supporter access."), "/account", HeartHandshake],
            [campaignOsText(language, "Campaign creator"), campaignOsText(language, "Start the existing guided campaign onboarding."), "/start", Sparkles],
            [campaignOsText(language, "Campaign Admin"), campaignOsText(language, "Choose a campaign and enter its campaign-scoped admin route."), "/applications/campaign/act", Megaphone],
            [campaignOsText(language, "VoiceUp Platform Admin"), campaignOsText(language, "Platform-owner administration only—not Campaign Admin."), "/admin", ShieldCheck]
          ].map(([title, description, href, Icon]) => {
            const RoleIcon = Icon as LucideIcon;
            return <article key={title as string}><RoleIcon size={22} /><h3>{title as string}</h3><p>{description as string}</p><a href={href as string}>{campaignOsText(language, "Continue")} <ArrowRight size={14} /></a></article>;
          })}
        </div>
        <div className="campaignos-boundary"><ShieldCheck size={22} /><div><strong>{campaignOsText(language, "Administration boundary")}</strong><p><code>/admin</code>{campaignOsText(language, " remains exclusively the VoiceUp Platform Admin gate. Campaign administrators use campaign-specific ")}<code>/admin/:slug</code>{campaignOsText(language, " routes reached through the Campaign Admin gateway.")}</p></div></div>
      </section>

      <footer className="campaignos-footer"><a href="/">← VoiceUp Business OS</a><span>{campaignOsText(language, "CampaignOS \u00b7 Governed campaigns from idea to movement")}</span></footer>
    </main>
  );
}
