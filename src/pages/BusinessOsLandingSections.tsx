import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BellRing,
  Bot,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  FileCheck2,
  FileStack,
  Fingerprint,
  FolderOpen,
  Globe2,
  HandCoins,
  Languages,
  Megaphone,
  Network,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  type LucideIcon
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import type { BusinessOsApplicationStatus } from "../components/ApplicationStatusCard";
import type { MarketingApplicationKey } from "./marketingApplications";

type Translate = (key: string) => string;

interface BusinessOsApplication {
  key: MarketingApplicationKey;
  name: string;
  description: string;
  status: BusinessOsApplicationStatus;
  statusDisplay: string;
  enabled: boolean;
  icon: LucideIcon;
}

const lifecycleStages = [
  { key: "organise", icon: UsersRound, items: ["teams", "roles", "coordinatorNetwork", "organizationSetup"] },
  { key: "plan", icon: BriefcaseBusiness, items: ["campaigns", "projects", "events", "missions", "aiPlanning"] },
  { key: "act", icon: Megaphone, items: ["execute", "volunteers", "tasks", "mobileWorkforce", "offlineOperations"] },
  { key: "fund", icon: HandCoins, items: ["donations", "membership", "marketplace", "commerce", "subscriptions"] },
  { key: "prove", icon: FileCheck2, items: ["transparency", "evidence", "reports", "analytics", "auditTrail"] },
  { key: "grow", icon: ChartNoAxesCombined, items: ["crm", "referrals", "recognition", "rewards", "communication", "aiInsights"] }
] as const;

const heroFeatures: Array<{ key: string; icon: LucideIcon }> = [
  { key: "applications", icon: BriefcaseBusiness },
  { key: "ai", icon: Sparkles },
  { key: "enterprise", icon: ShieldCheck },
  { key: "modular", icon: Network }
];

const platformServices: Array<{ key: string; icon: LucideIcon }> = [
  { key: "aiCopilot", icon: Bot },
  { key: "identity", icon: Fingerprint },
  { key: "notifications", icon: BellRing },
  { key: "reports", icon: FileStack },
  { key: "analytics", icon: ChartNoAxesCombined },
  { key: "payments", icon: CircleDollarSign },
  { key: "localization", icon: Languages },
  { key: "integrations", icon: PlugZap },
  { key: "automation", icon: Workflow },
  { key: "documents", icon: FolderOpen },
  { key: "media", icon: Globe2 },
  { key: "audit", icon: BadgeCheck }
];

export function BusinessOsHeroCards({ t }: { t: Translate }) {
  return (
    <div className="business-os-hero-cards">
      {heroFeatures.map(({ key, icon: Icon }, index) => (
        <motion.article
          key={key}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 + index * 0.06, duration: 0.42 }}
        >
          <Icon size={20} aria-hidden="true" />
          <strong>{t(`landing.businessOs.hero.cards.${key}.title`)}</strong>
          <p>{t(`landing.businessOs.hero.cards.${key}.description`)}</p>
        </motion.article>
      ))}
    </div>
  );
}

export function BusinessOsLifecycle({ t }: { t: Translate }) {
  const [activeStage, setActiveStage] = useState<(typeof lifecycleStages)[number]["key"]>("organise");

  return (
    <section className="business-os-section business-os-lifecycle" id="lifecycle" aria-labelledby="business-os-lifecycle-title">
      <div className="business-os-section-heading">
        <span>{t("landing.businessOs.lifecycle.eyebrow")}</span>
        <h2 id="business-os-lifecycle-title">{t("landing.businessOs.lifecycle.title")}</h2>
        <p>{t("landing.businessOs.lifecycle.subtitle")}</p>
      </div>
      <div className="business-os-lifecycle-flow">
        {lifecycleStages.map(({ key, icon: Icon, items }, index) => {
          const expanded = activeStage === key;
          return (
            <div className={`business-os-lifecycle-stage${expanded ? " is-active" : ""}`} key={key}>
              <button type="button" aria-expanded={expanded} aria-controls={`lifecycle-panel-${key}`} onClick={() => setActiveStage(key)}>
                <span className="business-os-stage-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="business-os-stage-icon"><Icon size={21} /></span>
                <strong>{t(`landing.businessOs.lifecycle.stages.${key}.title`)}</strong>
                <ChevronDown size={18} className="business-os-stage-chevron" />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    id={`lifecycle-panel-${key}`}
                    className="business-os-lifecycle-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div>
                      {items.map((item) => <span key={item}>{t(`landing.businessOs.lifecycle.stages.${key}.items.${item}`)}</span>)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {index < lifecycleStages.length - 1 && <span className="business-os-stage-arrow" aria-hidden="true"><ArrowDown size={18} /></span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function statusClass(status: BusinessOsApplicationStatus) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

export function BusinessApplicationCarousel({
  applications,
  campaignImageUrl,
  t,
  onOrganise,
  onLearnMore,
  onStart
}: {
  applications: BusinessOsApplication[];
  campaignImageUrl: string;
  t: Translate;
  onOrganise: (applicationKey: MarketingApplicationKey) => void;
  onLearnMore: (applicationKey: MarketingApplicationKey) => void;
  onStart: (applicationKey: MarketingApplicationKey) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const application = applications[activeIndex] ?? applications[0];

  function move(direction: number) {
    setActiveIndex((current) => (current + direction + applications.length) % applications.length);
  }

  useEffect(() => {
    if (paused || applications.length < 2) return;
    const timer = window.setInterval(() => move(1), 2000);
    return () => window.clearInterval(timer);
  }, [applications.length, paused]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    setPaused(true);
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX !== null && endX !== undefined && Math.abs(startX - endX) > 42) move(startX > endX ? 1 : -1);
    setPaused(false);
  }

  if (!application) return null;
  const Icon = application.icon;

  return (
    <section className="business-os-section business-application-carousel" id="applications" aria-labelledby="business-applications-title">
      <div className="business-os-section-heading">
        <span>{t("landing.businessOs.carousel.eyebrow")}</span>
        <h2 id="business-applications-title">{t("landing.businessOs.carousel.title")}</h2>
        <p>{t("landing.businessOs.carousel.subtitle")}</p>
      </div>
      <div
        className="business-application-carousel-shell"
        role="region"
        aria-roledescription="carousel"
        aria-label={t("landing.businessOs.carousel.title")}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            className="business-application-card"
            key={application.key}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={`business-application-image business-application-image--${application.key}`} role="img" aria-label={`${application.name} ${t("landing.businessOs.carousel.illustration")}`}>
              {application.key === "campaign" ? <img src={campaignImageUrl} alt="" /> : <Icon size={86} aria-hidden="true" />}
              <span className="business-application-orbit orbit-one" />
              <span className="business-application-orbit orbit-two" />
              <span className="business-application-image-label"><Building2 size={16} /> VoiceUp OS</span>
            </div>
            <div className="business-application-copy">
              <span className={`business-application-status status-${statusClass(application.status)}`}>{application.statusDisplay}</span>
              <span className="business-application-count">{String(activeIndex + 1).padStart(2, "0")} / {String(applications.length).padStart(2, "0")}</span>
              <h3>{application.name}</h3>
              <p>{application.description}</p>
              <div className="business-application-actions">
                <button type="button" className="secondary-button" onClick={() => onOrganise(application.key)}>{t("landing.businessOs.carousel.actions.organise")}</button>
                <button type="button" className="secondary-button" onClick={() => onLearnMore(application.key)}>{t("landing.businessOs.carousel.actions.learnMore")}</button>
                <button type="button" className="primary-button" disabled={!application.enabled} onClick={() => onStart(application.key)}>{t("landing.businessOs.carousel.actions.start")}</button>
              </div>
            </div>
          </motion.article>
        </AnimatePresence>
        <div className="business-application-controls">
          <button type="button" className="icon-button" onClick={() => move(-1)} aria-label={t("landing.businessOs.carousel.previous")}><ArrowLeft size={18} /></button>
          <div className="business-application-dots" role="tablist" aria-label={t("landing.businessOs.carousel.navigation")}>
            {applications.map((item, index) => (
              <button key={item.key} type="button" role="tab" aria-selected={index === activeIndex} aria-label={item.name} onClick={() => setActiveIndex(index)} />
            ))}
          </div>
          <button type="button" className="icon-button" onClick={() => move(1)} aria-label={t("landing.businessOs.carousel.next")}><ArrowRight size={18} /></button>
        </div>
      </div>
    </section>
  );
}

export function SharedPlatformServices({ t }: { t: Translate }) {
  return (
    <section className="business-os-section business-platform-services" id="services" aria-labelledby="business-platform-services-title">
      <div className="business-os-section-heading">
        <span>{t("landing.businessOs.services.eyebrow")}</span>
        <h2 id="business-platform-services-title">{t("landing.businessOs.services.title")}</h2>
        <p>{t("landing.businessOs.services.subtitle")}</p>
      </div>
      <div className="business-platform-service-grid">
        {platformServices.map(({ key, icon: Icon }, index) => (
          <motion.article key={key} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ delay: (index % 4) * 0.04 }}>
            <span><Icon size={20} /></span>
            <strong>{t(`landing.businessOs.services.items.${key}`)}</strong>
          </motion.article>
        ))}
      </div>
      <div className="business-platform-foundation" aria-label={t("landing.businessOs.services.foundation") }>
        <RefreshCw size={18} />
        <span>{t("landing.businessOs.services.foundation")}</span>
      </div>
    </section>
  );
}
