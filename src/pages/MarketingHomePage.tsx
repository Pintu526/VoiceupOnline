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
import heroImage from "../assets/voiceup-global-hero.png";
import { subscriptionPlans } from "../data";
import { formatPlanLimit } from "../utils/subscription";
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
    title: "AI Campaign Copilot",
    eyebrow: "Draft faster",
    text: "Turn a rough issue into a campaign title, petition copy, authority letter, supporter update, and social post so you can publish in 60 seconds.",
    bullets: ["Campaign brief builder", "Appeal and petition drafts", "Regional-language ready prompts"]
  },
  {
    id: "campaign-studio",
    icon: ClipboardList,
    title: "Campaign Studio",
    eyebrow: "Launch cleanly",
    text: "Create a public campaign workspace with templates, location governance, signer fields, media, QR assets, and publish checks.",
    bullets: ["60-second launch flow", "Public signing page", "Template-led campaign setup"]
  },
  {
    id: "authority-intelligence",
    icon: Landmark,
    title: "Authority Intelligence",
    eyebrow: "Reach the right office",
    text: "Map a campaign to the right local, city, state, national, or global authority with routing context and submission notes.",
    bullets: ["Authority recommendations", "Location-aware routing", "Submission dossier context"]
  },
  {
    id: "field-collection",
    icon: Smartphone,
    title: "Field Collection",
    eyebrow: "Online plus offline",
    text: "Collect signatures from phones, QR posters, paper forms, and field volunteers while keeping every supporter traceable.",
    bullets: ["QR handouts", "Scan review queue", "Volunteer-ready collection"]
  },
  {
    id: "movement-crm",
    icon: UsersRound,
    title: "Movement CRM",
    eyebrow: "Grow the base",
    text: "Understand supporters, referrers, volunteers, ambassadors, and local clusters so a petition becomes an organized movement.",
    bullets: ["Supporter graph", "Referral tracking", "Volunteer segments"]
  },
  {
    id: "command-center",
    icon: RadioTower,
    title: "Command Center",
    eyebrow: "Operate the push",
    text: "Coordinate campaign health, local momentum, authority follow-ups, field progress, and next actions from one dashboard.",
    bullets: ["Live campaign pulse", "Operations checklist", "Escalation readiness"]
  },
  {
    id: "communication-hub",
    icon: Mail,
    title: "Communication Hub",
    eyebrow: "Keep people moving",
    text: "Prepare WhatsApp, SMS, email, and public updates for milestone announcements, volunteer nudges, and supporter follow-up.",
    bullets: ["Messaging setup", "Milestone updates", "Consent-aware communication"]
  },
  {
    id: "reports",
    icon: FileCheck2,
    title: "Reports and Petition Dossier",
    eyebrow: "Show evidence",
    text: "Turn campaign activity into executive reports, location breakdowns, signer exports, and a petition dossier for submission.",
    bullets: ["PDF and CSV exports", "Location analytics", "Authority-ready dossier"]
  }
];

const workflowSteps = [
  "Describe the issue",
  "Let AI shape the campaign",
  "Publish the public link",
  "Collect support everywhere",
  "Route to authorities",
  "Report impact"
];

const faqs = [
  {
    question: "Can a non-technical team launch a campaign quickly?",
    answer:
      "Yes. Voiceup is designed around guided setup, AI-assisted copy, templates, public links, QR sharing, and publish checks so teams can move fast."
  },
  {
    question: "Is the 1-day trial really free?",
    answer:
      "The landing flow presents a 1-day free trial path for one campaign with Voiceup branding and limited supporter collection. Paid upgrades can be configured when the team is ready."
  },
  {
    question: "Can campaigns collect support offline?",
    answer:
      "Yes. Voiceup supports online signatures, QR-based collection, and paper/scan workflows for field teams and community events."
  },
  {
    question: "Does Voiceup work outside India?",
    answer:
      "Yes. Global mode supports country, state or province, city or district, locality or ward, and postal/ZIP fields while India detailed mode remains available."
  },
  {
    question: "Can pricing fit a small organization?",
    answer:
      "Yes. The plan ladder starts with a free trial and Starter plan, then grows into Growth, Pro Movement, and Enterprise options as campaign scale increases."
  }
];

const trustSignals = [
  {
    title: "Fast first campaign",
    text: "Create and publish a campaign in 60 seconds with a public link, QR code, and share options."
  },
  {
    title: "Built for public trust",
    text: "Every campaign can show the appeal, target authority, progress, consent text, and organizer context."
  },
  {
    title: "Simple before powerful",
    text: "Start with one working campaign, then upgrade for larger teams, branding, communication, and reporting."
  }
];

export function MarketingHomePage({
  theme,
  setTheme,
  onboardingOpen,
  onOpenOnboarding,
  onCloseOnboarding,
  onCompleteOnboarding
}: MarketingHomePageProps) {
  return (
    <main className="marketing-home global-landing">
      <header className="global-nav">
        <a className="global-brand" href="#top" aria-label="Voiceup Global home">
          <span className="brand-mark">
            <Megaphone size={24} />
          </span>
          <span>
            <strong>Voiceup Global</strong>
            <small>Public campaign operating system</small>
          </span>
        </a>
        <nav className="global-nav-links" aria-label="Marketing sections">
          <a href="#product">Product</a>
          <a href="#workflow">Workflow</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="button-row">
          <button
            className="secondary-button icon-button"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle color theme"
            title="Toggle color theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a className="secondary-link-button" href="#demo">
            <Play size={17} /> Watch demo
          </a>
          <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
            Start Free Campaign
          </button>
        </div>
      </header>

      <section className="global-hero" id="top" style={{ backgroundImage: `url(${heroImage})` }}>
        <div className="global-hero-overlay" />
        <motion.div
          className="global-hero-content"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">No credit card. Free trial. Public link ready.</span>
          <h1>Create Voice Campaigns in 60 Seconds</h1>
          <p>
            Launch a public campaign from Facebook, WhatsApp, LinkedIn, Instagram, Google Ads, or a QR code without
            forcing visitors into an admin dashboard first.
          </p>
          <div className="global-hero-actions">
            <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
              <Rocket size={18} /> Start Free Campaign
            </button>
            <button className="primary-link-button accent" type="button" onClick={onOpenOnboarding}>
              <Sparkles size={18} /> Create campaign with AI
            </button>
            <a className="secondary-link-button light" href="#demo">
              <Play size={18} /> Watch demo
            </a>
            <a className="secondary-link-button light" href="#pricing">
              <WalletCards size={18} /> View pricing
            </a>
          </div>
          <div className="hero-proof-strip" aria-label="Voiceup platform highlights">
            {[
              ["60 sec", "campaign creation"],
              ["No card", "1-day free trial"],
              ["Trusted", "global-ready flow"],
              ["Viral", "share link + QR"]
            ].map(([value, label]) => (
              <div key={value}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="landing-band ai-band" id="product">
        <div className="landing-section-heading">
          <span className="eyebrow">Premium campaign stack</span>
          <h2>Create and publish your campaign in 60 seconds, then grow it with proof.</h2>
          <p>
            Voiceup brings campaign creation, supporter collection, routing, operations, messaging, CRM, reporting,
            and clear upgrade controls into one global product.
          </p>
        </div>
        <div className="landing-module-grid">
          {landingSections.map((section) => (
            <article className="landing-module-card" id={section.id} key={section.id}>
              <section.icon size={24} />
              <span className="eyebrow">{section.eyebrow}</span>
              <h3>{section.title}</h3>
              <p>{section.text}</p>
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>
                    <CheckCircle2 size={16} /> {bullet}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band studio-band">
        <div className="landing-split">
          <div>
            <span className="eyebrow">Customer workflow</span>
            <h2>From an issue to a polished petition campaign.</h2>
            <p>
              A small team can start with a local problem, use AI to shape campaign content, publish a public link,
              collect support in the field, and hand a professional dossier to the right authority.
            </p>
            <div className="workflow-row" id="workflow">
              {workflowSteps.map((step, index) => (
                <div className="workflow-step" key={step}>
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="campaign-flow-panel">
            <Workflow size={26} />
            <h3>Campaign Studio workflow</h3>
            <p>AI brief, location governance, signer fields, authority route, QR share, media, dossier.</p>
            <div className="mini-flow">
              {["Brief", "Studio", "Collect", "Route", "Report"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band demo-band" id="demo">
        <div className="demo-layout">
          <div>
            <span className="eyebrow">Product demo</span>
            <h2>Watch how a campaign goes from idea to public launch.</h2>
            <p>
              Preview the Voiceup operating surface: launch, supporters, authority routing, sharing, reports,
              and upgrade paths after the first campaign is live.
            </p>
            <div className="button-row">
              <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
                <Sparkles size={18} /> Create campaign with AI
              </button>
              <a className="secondary-link-button" href="#pricing">
                View pricing
              </a>
            </div>
          </div>
          <div className="demo-visual">
            <img src={heroImage} alt="Voiceup Global campaign dashboard preview" />
            <button type="button" aria-label="Watch Voiceup Global demo">
              <Play size={28} />
            </button>
          </div>
        </div>
      </section>

      <section className="landing-band testimonial-band">
        <div className="landing-section-heading">
          <span className="eyebrow">Trusted globally</span>
          <h2>Designed for people who need momentum before management.</h2>
          <p>
            The first win is a working public campaign link. Admin, billing, analytics, branding, integrations, and
            team controls can come after users experience value.
          </p>
        </div>
        <div className="testimonial-grid">
          {trustSignals.map((signal) => (
            <article className="testimonial-card" key={signal.title}>
              <Globe2 size={22} />
              <strong>{signal.title}</strong>
              <p>{signal.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band pricing-band" id="pricing">
        <div className="landing-section-heading">
          <span className="eyebrow">Pricing that suits the pocket</span>
          <h2>Start free, grow only when the campaign needs more power.</h2>
          <p>
            Pick a plan for a small local campaign, a growing public movement, or an enterprise program. Upgrade paths
            support subscription, campaign-duration, supporter-count, feature-based, and custom quote models.
          </p>
        </div>
        <div className="landing-pricing-grid">
          {subscriptionPlans.map((plan) => (
            <article className={plan.recommended ? "landing-price-card recommended" : "landing-price-card"} key={plan.name}>
              {plan.recommended && <span className="recommended-pill">Popular</span>}
              <h3>{plan.name}</h3>
              <strong>{plan.price}</strong>
              <p>{plan.description}</p>
              <ul>
                <li>{formatPlanLimit(plan.campaignLimit)} campaign{plan.campaignLimit === 1 ? "" : "s"}</li>
                <li>{formatPlanLimit(plan.supporterLimit)} supporters</li>
                <li>{plan.monthlySignatureLimit.toLocaleString()} signatures/month</li>
                <li>{plan.providerReadyIntegrations ? "Integrations available" : "Upgrade for integrations"}</li>
              </ul>
              <button
                className={plan.recommended ? "primary-link-button" : "secondary-link-button"}
                type="button"
                onClick={onOpenOnboarding}
              >
                {plan.name === "Enterprise" ? "Start free first" : "Start this plan"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band trial-band">
        <div className="trial-panel">
          <div>
            <span className="eyebrow">1-day free trial</span>
            <h2>Let people try Voiceup before they commit.</h2>
            <p>
              One campaign, limited supporter collection, Voiceup branding, and simple sharing tools.
              Ideal for a first campaign, a live launch, or testing whether the workflow fits the team.
            </p>
          </div>
          <div className="trial-checklist">
            {["1 campaign", "1-day free access", "Public signing", "Basic reports", "Upgrade when ready"].map((item) => (
              <span key={item}>
                <CheckCircle2 size={16} /> {item}
              </span>
            ))}
          </div>
          <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
            Start free for 1 day
          </button>
        </div>
      </section>

      <section className="landing-band faq-band" id="faq">
        <div className="landing-section-heading">
          <span className="eyebrow">FAQ</span>
          <h2>Built for teams that need trust before scale.</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                <span>{faq.question}</span>
                <ChevronDown size={20} />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-final-cta">
        <div>
          <span className="eyebrow">Ready to launch?</span>
          <h2>Launch the first campaign, show the value, then choose the plan that fits.</h2>
          <p>
            Voiceup helps people promote their campaign from a real public link: AI campaign copy, field
            collection, movement CRM, communication hub, and impact reports in one place.
          </p>
          <div className="global-hero-actions">
            <button className="primary-link-button" type="button" onClick={onOpenOnboarding}>
              <Clock size={18} /> Start free for 1 day
            </button>
            <button className="primary-link-button accent" type="button" onClick={onOpenOnboarding}>
              <Sparkles size={18} /> Create campaign with AI
            </button>
            <a className="secondary-link-button light" href="#demo">
              <Play size={18} /> Watch demo
            </a>
            <a className="secondary-link-button light" href="#pricing">
              <CreditCard size={18} /> View pricing
            </a>
          </div>
        </div>
      </section>

      <footer className="marketing-footer global-footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refund">Refund policy</a>
        <a href="/data-deletion">Data deletion</a>
        <span>Voiceup Global, built for public campaigns worldwide.</span>
      </footer>
      <OnboardingWizard
        open={onboardingOpen}
        onClose={onCloseOnboarding}
        onComplete={onCompleteOnboarding}
      />
    </main>
  );
}
