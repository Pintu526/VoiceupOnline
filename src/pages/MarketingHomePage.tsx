import { motion } from "framer-motion";
import type { Dispatch, SetStateAction } from "react";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileCheck2,
  FileText,
  Globe2,
  Landmark,
  Mail,
  Megaphone,
  Moon,
  Network,
  Play,
  RadioTower,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  UsersRound,
  WalletCards,
  Workflow
} from "lucide-react";
import heroImage from "../assets/voiceup-global-hero.jpg";
import { VoiceUpStoryCarousel } from "../components/VoiceUpStoryCarousel";
import { LanguageSwitcher, useTranslation } from "../i18n";
import {
  OnboardingWizard,
  type OnboardingCompletionPayload,
  type OnboardingCompletionResult
} from "./OnboardingWizard";

interface MarketingHomePageProps {
  theme: "light" | "dark";
  setTheme: Dispatch<SetStateAction<"light" | "dark">>;
  onboardingOpen: boolean;
  onOpenOnboarding: () => void;
  onCloseOnboarding: () => void;
  onCompleteOnboarding: (payload: OnboardingCompletionPayload) => OnboardingCompletionResult | Promise<OnboardingCompletionResult>;
}

const landingSections = [
  {
    id: "ai-copilot",
    icon: Bot,
    key: "aiCopilot",
    bullets: ["briefBuilder", "appealDrafts", "regionalPrompts"]
  },
  {
    id: "campaign-studio",
    icon: ClipboardList,
    key: "campaignStudio",
    bullets: ["launchFlow", "publicSigning", "templateSetup"]
  },
  {
    id: "authority-intelligence",
    icon: Landmark,
    key: "authorityIntelligence",
    bullets: ["authorityRecommendations", "locationRouting", "dossierContext"]
  },
  {
    id: "field-collection",
    icon: Smartphone,
    key: "fieldCollection",
    bullets: ["qrHandouts", "scanReview", "volunteerCollection"]
  },
  {
    id: "movement-crm",
    icon: UsersRound,
    key: "movementCrm",
    bullets: ["supporterGraph", "referralTracking", "volunteerSegments"]
  },
  {
    id: "command-center",
    icon: RadioTower,
    key: "commandCenter",
    bullets: ["campaignPulse", "operationsChecklist", "escalationReadiness"]
  },
  {
    id: "communication-hub",
    icon: Mail,
    key: "communicationHub",
    bullets: ["messagingSetup", "milestoneUpdates", "consentCommunication"]
  },
  {
    id: "reports",
    icon: FileCheck2,
    key: "reports",
    bullets: ["exports", "locationAnalytics", "authorityDossier"]
  }
];

const workflowSteps = ["describe", "shape", "publish", "collect", "route", "report"];

const faqs = [
  {
    key: "quickLaunch"
  },
  {
    key: "freeTrial"
  },
  {
    key: "offlineSupport"
  },
  {
    key: "outsideIndia"
  },
  {
    key: "smallOrganization"
  }
];

const trustSignals = [
  {
    key: "fastCampaign"
  },
  {
    key: "publicTrust"
  },
  {
    key: "simplePowerful"
  }
];

const roleOptions = [
  { key: "organizer", icon: Megaphone },
  { key: "supporter", icon: UsersRound },
  { key: "fieldTeam", icon: Smartphone }
];

export function MarketingHomePage({
  theme,
  setTheme,
  onboardingOpen,
  onOpenOnboarding,
  onCloseOnboarding,
  onCompleteOnboarding
}: MarketingHomePageProps) {
  const { language, t } = useTranslation();

  return (
    <main className="marketing-home global-landing">
      <header className="global-nav">
        <a className="global-brand" href="#top" aria-label={t("landing.nav.homeAria")}>
          <span className="brand-mark">
            <Megaphone size={24} />
          </span>
          <span>
            <strong>VoiceUp</strong>
            <small>{t("landing.freeze.tagline")}</small>
          </span>
        </a>
        <nav className="global-nav-links" aria-label={t("landing.nav.sectionsAria")}>
          <a href="#product">{t("landing.nav.product")}</a>
          <a href="#workflow">{t("landing.nav.workflow")}</a>
          <a href="#pricing">{t("landing.freeze.getStarted")}</a>
          <a href="#faq">{t("landing.nav.faq")}</a>
        </nav>
        <div className="button-row">
          <LanguageSwitcher />
          <button
            className="secondary-button icon-button"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={t("landing.nav.toggleTheme")}
            title={t("landing.nav.toggleTheme")}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a className="secondary-link-button" href="#demo">
            <Play size={17} /> {t("landing.actions.watchDemo")}
          </a>
          <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
            {t("landing.actions.startFreeCampaign")}
          </button>
        </div>
      </header>

      <section
        className="global-hero"
        id="top"
        style={{ backgroundImage: language === "en" ? `url(${heroImage})` : "var(--brand-gradient)" }}
      >
        <div className="global-hero-overlay" />
        <motion.div
          className="global-hero-content"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">{t("landing.freeze.heroEyebrow")}</span>
          <h1>{t("landing.freeze.heroTitle")}</h1>
          <p>{t("landing.freeze.heroSubtitle")}</p>
          <div className="global-hero-actions">
            <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
              <Rocket size={18} /> {t("landing.actions.startFreeCampaign")}
            </button>
            <button className="primary-link-button accent" type="button" onClick={onOpenOnboarding}>
              <Sparkles size={18} /> {t("landing.actions.createWithAi")}
            </button>
            <a className="secondary-link-button light" href="#demo">
              <Play size={18} /> {t("landing.actions.watchDemo")}
            </a>
            <a className="secondary-link-button light" href="#pricing">
              <WalletCards size={18} /> {t("landing.actions.viewPricing")}
            </a>
          </div>
          <div className="hero-proof-strip" aria-label={t("landing.hero.highlightsAria")}>
            {[
              ["speedValue", "speedLabel"],
              ["cardValue", "cardLabel"],
              ["trustValue", "trustLabel"],
              ["viralValue", "viralLabel"]
            ].map(([value, label]) => (
              <div key={value}>
                <strong>{t(`landing.hero.proof.${value}`)}</strong>
                <span>{t(`landing.hero.proof.${label}`)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="landing-guided-band" id="product">
        <span className="landing-anchor" id="demo" aria-hidden="true" />
        <VoiceUpStoryCarousel experience="landing" />
      </section>

      <section className="landing-band ai-band landing-product-showcase">
        <div className="landing-section-heading">
          <span className="eyebrow">{t("landing.freeze.productEyebrow")}</span>
          <h2>{t("landing.freeze.productTitle")}</h2>
          <p>{t("landing.freeze.productSubtitle")}</p>
        </div>
        <div className="landing-module-grid">
          {landingSections.slice(0, 6).map((section) => (
            <article className="landing-module-card" id={section.id} key={section.id}>
              <section.icon size={24} />
              <span className="eyebrow">{t(`landing.modules.${section.key}.eyebrow`)}</span>
              <h3>{t(`landing.modules.${section.key}.title`)}</h3>
              <p>{t(`landing.modules.${section.key}.text`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band landing-role-band" aria-labelledby="landing-role-title">
        <div className="landing-section-heading">
          <span className="eyebrow">{t("landing.roles.eyebrow")}</span>
          <h2 id="landing-role-title">{t("landing.roles.title")}</h2>
          <p>{t("landing.roles.subtitle")}</p>
        </div>
        <div className="landing-role-grid">
          {roleOptions.map(({ key, icon: Icon }) => (
            <article className="landing-role-card" key={key}>
              <Icon size={24} aria-hidden="true" />
              <h3>{t(`landing.roles.${key}.title`)}</h3>
              <p>{t(`landing.roles.${key}.text`)}</p>
              <button className="secondary-button" type="button" onClick={onOpenOnboarding}>
                {t(`landing.roles.${key}.action`)}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band studio-band landing-deferred-section">
        <div className="landing-split">
          <div>
            <span className="eyebrow">{t("landing.workflow.eyebrow")}</span>
            <h2>{t("landing.workflow.title")}</h2>
            <p>{t("landing.workflow.subtitle")}</p>
            <div className="workflow-row">
              {workflowSteps.map((step, index) => (
                <div className="workflow-step" key={step}>
                  <span>{index + 1}</span>
                  <strong>{t(`landing.workflow.steps.${step}`)}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="campaign-flow-panel">
            <Workflow size={26} />
            <h3>{t("landing.workflow.panelTitle")}</h3>
            <p>{t("landing.workflow.panelText")}</p>
            <div className="mini-flow">
              {["brief", "studio", "collect", "route", "report"].map((item) => (
                <span key={item}>{t(`landing.workflow.mini.${item}`)}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band demo-band landing-deferred-section">
        <div className="demo-layout">
          <div>
            <span className="eyebrow">{t("landing.demo.eyebrow")}</span>
            <h2>{t("landing.demo.title")}</h2>
            <p>{t("landing.demo.subtitle")}</p>
            <div className="button-row">
              <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
                <Sparkles size={18} /> {t("landing.actions.createWithAi")}
              </button>
              <a className="secondary-link-button" href="#pricing">
                {t("landing.actions.viewPricing")}
              </a>
            </div>
          </div>
          <div className="demo-visual">
            <img src={heroImage} alt={t("landing.demo.imageAlt")} />
            <button type="button" aria-label={t("landing.demo.watchAria")}>
              <Play size={28} />
            </button>
          </div>
        </div>
      </section>

      <section className="landing-band testimonial-band landing-compact-proof" id="workflow">
        <div className="landing-section-heading">
          <span className="eyebrow">{t("landing.freeze.trustEyebrow")}</span>
          <h2>{t("landing.freeze.trustTitle")}</h2>
          <p>{t("landing.freeze.trustSubtitle")}</p>
        </div>
        <div className="testimonial-grid">
          {trustSignals.map((signal) => (
            <article className="testimonial-card" key={signal.key}>
              <Globe2 size={22} />
              <strong>{t(`landing.trust.signals.${signal.key}.title`)}</strong>
              <p>{t(`landing.trust.signals.${signal.key}.text`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band pricing-band" id="pricing">
        <div className="landing-activation-copy">
          <span className="eyebrow">{t("storyCarousel.landing.activation.eyebrow")}</span>
          <h2>{t("storyCarousel.landing.activation.title")}</h2>
          <p>{t("storyCarousel.landing.activation.description")}</p>
          <small>{t("storyCarousel.landing.activation.usageNote")}</small>
        </div>
        <div className="button-row">
          <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
            <Rocket size={18} /> {t("storyCarousel.landing.activation.cta")}
          </button>
        </div>
      </section>

      <section className="landing-band trial-band landing-deferred-section">
        <div className="trial-panel">
          <div>
            <span className="eyebrow">{t("landing.trial.eyebrow")}</span>
            <h2>{t("landing.trial.title")}</h2>
            <p>{t("landing.trial.subtitle")}</p>
          </div>
          <div className="trial-checklist">
            {["oneCampaign", "freeAccess", "publicSigning", "basicReports", "upgradeReady"].map((item) => (
              <span key={item}>
                <CheckCircle2 size={16} /> {t(`landing.trial.items.${item}`)}
              </span>
            ))}
          </div>
          <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
            {t("landing.actions.startOneDay")}
          </button>
        </div>
      </section>

      <section className="landing-band faq-band" id="faq">
        <div className="landing-section-heading">
          <span className="eyebrow">{t("landing.faq.eyebrow")}</span>
          <h2>{t("landing.faq.title")}</h2>
        </div>
        <div className="faq-list">
          {faqs.slice(0, 4).map((faq) => (
            <details key={faq.key}>
              <summary>
                <span>{t(`landing.faq.items.${faq.key}.question`)}</span>
                <ChevronDown size={20} />
              </summary>
              <p>{t(`landing.faq.items.${faq.key}.answer`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-final-cta landing-deferred-section">
        <div>
          <span className="eyebrow">{t("landing.finalCta.eyebrow")}</span>
          <h2>{t("landing.finalCta.title")}</h2>
          <p>{t("landing.finalCta.subtitle")}</p>
          <div className="global-hero-actions">
            <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
              <Clock size={18} /> {t("landing.actions.startOneDay")}
            </button>
            <button className="primary-link-button accent" type="button" onClick={onOpenOnboarding}>
              <Sparkles size={18} /> {t("landing.actions.createWithAi")}
            </button>
            <a className="secondary-link-button light" href="#demo">
              <Play size={18} /> {t("landing.actions.watchDemo")}
            </a>
            <a className="secondary-link-button light" href="#pricing">
              <CreditCard size={18} /> {t("landing.actions.viewPricing")}
            </a>
          </div>
        </div>
      </section>

      <footer className="marketing-footer global-footer">
        <a href="/privacy">{t("landing.footer.privacy")}</a>
        <a href="/terms">{t("landing.footer.terms")}</a>
        <a href="/refund">{t("landing.footer.refund")}</a>
        <a href="/data-deletion">{t("landing.footer.dataDeletion")}</a>
        <span>{t("landing.freeze.footerTagline")}</span>
      </footer>
      <OnboardingWizard
        open={onboardingOpen}
        onClose={onCloseOnboarding}
        onComplete={onCompleteOnboarding}
      />
    </main>
  );
}
