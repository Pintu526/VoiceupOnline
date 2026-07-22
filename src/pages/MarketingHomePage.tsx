import { motion } from "framer-motion";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Building2,
  Bolt,
  ChevronDown,
  Landmark,
  Megaphone,
  Moon,
  Smartphone,
  Sparkles,
  ShoppingBasket,
  Sun,
  GraduationCap,
  WalletCards,
  UsersRound
} from "lucide-react";
import heroImage from "../assets/voiceup-global-hero.jpg";
import { VoiceUpStoryCarousel } from "../components/VoiceUpStoryCarousel";
import { LanguageSwitcher, useTranslation } from "../i18n";
import {
  OnboardingWizard,
  type OnboardingCompletionPayload,
  type OnboardingCompletionResult
} from "./OnboardingWizard";
import {
  type VoiceUpCustomSlide,
  type VoiceUpStoryAction,
  type VoiceUpStoryMedia
} from "../components/VoiceUpStoryCarousel";
import { MarketingApplicationGateways } from "./MarketingGateways";
import { marketingApplicationDefinitions, type MarketingApplicationKey } from "./marketingApplications";

interface MarketingHomePageProps {
  theme: "light" | "dark";
  setTheme: Dispatch<SetStateAction<"light" | "dark">>;
  onboardingOpen: boolean;
  onOpenOnboarding: () => void;
  onCloseOnboarding: () => void;
  onCompleteOnboarding: (payload: OnboardingCompletionPayload) => OnboardingCompletionResult | Promise<OnboardingCompletionResult>;
}

type LandingView = "landing" | "applications" | "application-detail" | "application-act" | "application-team";

const appIcons: Record<MarketingApplicationKey, typeof Megaphone> = {
  voiceup: Sparkles,
  campaign: Megaphone,
  goudhan: WalletCards,
  panditOnline: Landmark,
  teachToday: GraduationCap,
  homeNurseHub: Smartphone,
  cateringHub: ShoppingBasket
};

function getLandingViewFromPath(pathname: string): LandingView {
  if (pathname === "/applications" || pathname === "/applications/") return "applications";
  if (/^\/applications\/[^/]+\/act\/?$/.test(pathname)) return "application-act";
  if (/^\/applications\/[^/]+\/team\/?$/.test(pathname)) return "application-team";
  if (/^\/applications\/[^/]+\/?$/.test(pathname)) return "application-detail";
  return "landing";
}

function getApplicationKeyFromPath(pathname: string): MarketingApplicationKey {
  const matched = pathname.match(/^\/applications\/([^/]+)/);
  const key = matched?.[1] as MarketingApplicationKey | undefined;
  const exists = marketingApplicationDefinitions.some((application) => application.key === key);
  return exists && key ? key : "campaign";
}

export function MarketingHomePage({
  theme,
  setTheme,
  onboardingOpen,
  onOpenOnboarding,
  onCloseOnboarding,
  onCompleteOnboarding
}: MarketingHomePageProps) {
  const { language, t } = useTranslation();
  const [signInOpen, setSignInOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const signInMenuRef = useRef<HTMLDivElement | null>(null);
  const [landingView, setLandingView] = useState<LandingView>(() => getLandingViewFromPath(window.location.pathname));
  const [activeApplicationKey, setActiveApplicationKey] = useState<MarketingApplicationKey>(() => getApplicationKeyFromPath(window.location.pathname));

  const signInEntries = [
    { key: "workspaceAdmin", href: "/app", helpKey: "workspaceAdminHelp" },
    { key: "platformAdmin", href: "/admin", helpKey: "platformAdminHelp" }
  ] as const;

  function navigateLanding(targetPath: string, view: LandingView, applicationKey?: MarketingApplicationKey) {
    window.history.pushState({}, "", targetPath);
    setLandingView(view);
    if (applicationKey) setActiveApplicationKey(applicationKey);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    const onPopState = () => {
      const view = getLandingViewFromPath(window.location.pathname);
      setLandingView(view);
      setActiveApplicationKey(getApplicationKeyFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 260);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!signInMenuRef.current?.contains(event.target as Node)) setSignInOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSignInOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function trackLandingAction(eventName: string, context: string) {
    if (typeof window !== "undefined" && window.va) {
      window.va(eventName, {
        context,
        page: "landing",
        language
      });
    }
  }

  function startOrganize(context: string) {
    trackLandingAction("landing_organize_clicked", context);
    navigateLanding(`/applications/${activeApplicationKey}/team`, "application-team", activeApplicationKey);
  }

  function startAct(context: string) {
    trackLandingAction("landing_act_clicked", context);
    navigateLanding(`/applications/${activeApplicationKey}/act`, "application-act", activeApplicationKey);
  }

  function openApplications(context: string) {
    trackLandingAction("landing_explore_mode_opened", context);
    navigateLanding("/applications", "applications", activeApplicationKey);
  }

  function scrollToApplication(applicationKey: string, context: string) {
    trackLandingAction("landing_application_learn_more_clicked", context);
    const targetKey = applicationKey as MarketingApplicationKey;
    navigateLanding(`/applications/${targetKey}`, "application-detail", targetKey);
  }

  function openCampaignAdminLogin(campaignSlug: string, openCoordinatorTab: boolean) {
    const normalizedSlug = campaignSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!normalizedSlug) return;
    const suffix = openCoordinatorTab ? "?tab=coordinators" : "";
    window.location.assign(`/admin/${normalizedSlug}${suffix}`);
  }

  function handleLandingAnalytics(payload: { eventName: string; context: string }) {
    trackLandingAction(payload.eventName, payload.context);
  }

  const businessOsApplications = marketingApplicationDefinitions.map((application) => ({
    ...application,
    icon: appIcons[application.key],
    name: t(`landing.saas.apps.${application.key}.name`),
    description: t(`landing.saas.apps.${application.key}.description`),
    statusDisplay: application.key === "voiceup"
      ? t("landing.saas.status.platform")
      : t(`landing.saas.status.${application.status}`),
    highlights: [1, 2, 3, 4]
      .map((index) => t(`landing.saas.apps.${application.key}.highlights.${index}`))
      .filter(Boolean)
  }));

  const applicationSlideIds = businessOsApplications.map((application) => application.key);
  const applicationSlides: Record<string, VoiceUpCustomSlide> = Object.fromEntries(
    businessOsApplications.map((application) => [
      application.key,
      {
        title: application.name,
        description: application.description,
        narration: `${application.name}. ${application.description}`,
        status: application.statusDisplay,
        highlights: application.highlights
      }
    ])
  );

  const applicationSlideActions: Record<string, VoiceUpStoryAction> = Object.fromEntries(
    businessOsApplications.map((application) => [
      application.key,
      {
        label: t("landing.saas.actions.learnMore"),
        onClick: () => scrollToApplication(application.key, `application_carousel_${application.key}`)
      }
    ])
  );

  const applicationSlideMedia: Partial<Record<string, VoiceUpStoryMedia>> = {
    campaign: { imageUrl: heroImage }
  };
  const landingJourneyAvailabilityBySlide = Object.fromEntries(
    businessOsApplications.map((application) => [
      application.key,
      {
        planEnabled: application.key === "campaign" && application.enabled,
        actEnabled: application.key === "campaign" && application.enabled
      }
    ])
  );

  const publicHeader = (
    <header className="global-nav">
      <a className="global-brand" href="/" aria-label={t("landing.nav.homeAria")}>
        <span className="brand-mark">
          <Megaphone size={24} />
        </span>
        <span>
          <strong>VoiceUp</strong>
          <small>{t("landing.saas.hero.title")}</small>
        </span>
      </a>
      <nav className="global-nav-links" aria-label={t("landing.nav.sectionsAria")}>
        <a href="/applications">{t("landing.saas.applications.title")}</a>
        <a href="/applications/campaign/team">{t("landing.saas.actions.organize")}</a>
        <a href="/applications/campaign/act">{t("landing.saas.actions.act")}</a>
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
        <div className="landing-signin-menu" ref={signInMenuRef}>
          <button
            type="button"
            className="landing-signin-trigger"
            aria-haspopup="menu"
            aria-expanded={signInOpen}
            onClick={() => setSignInOpen((current) => !current)}
          >
            {t("landing.signIn.title")} <ChevronDown size={16} />
          </button>
          {signInOpen && (
            <div className="landing-signin-dropdown" role="menu" aria-label={t("landing.signIn.title")}>
              {signInEntries.map((entry) => (
                <a
                  key={entry.key}
                  href={entry.href}
                  role="menuitem"
                  onClick={() => setSignInOpen(false)}
                >
                  {t(`landing.signIn.${entry.key}`)}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );

  if (landingView !== "landing") {
    return (
      <main className="marketing-home global-landing">
        {publicHeader}
        <MarketingApplicationGateways
          page={landingView === "applications" ? "applications" : landingView}
          applications={businessOsApplications}
          activeApplicationKey={activeApplicationKey}
          onBackToLanding={() => navigateLanding("/", "landing")}
          onBackToApplications={() => navigateLanding("/applications", "applications", activeApplicationKey)}
          onOpenApplicationDetail={(applicationKey) => navigateLanding(`/applications/${applicationKey}`, "application-detail", applicationKey)}
          onOpenActGateway={(applicationKey) => navigateLanding(`/applications/${applicationKey}/act`, "application-act", applicationKey)}
          onOpenTeamGateway={(applicationKey) => navigateLanding(`/applications/${applicationKey}/team`, "application-team", applicationKey)}
          onCampaignAdminLogin={openCampaignAdminLogin}
          onStartFreeTrial={onOpenOnboarding}
          t={t}
          heroImageUrl={heroImage}
        />
        <button
          type="button"
          className={`back-to-top-button ${showBackToTop ? "is-visible" : ""}`}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t("landing.gateways.backToTop")}
        >
          ↑
        </button>
      </main>
    );
  }

  return (
    <main className="marketing-home global-landing">
      {publicHeader}

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
          <span className="eyebrow">{t("landing.saas.hero.brand")}</span>
          <h1>{t("landing.saas.hero.title")}</h1>
          <p>{t("landing.saas.hero.subtitle")}</p>
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
        <VoiceUpStoryCarousel
          experience="landing"
          autoPlayMs={2000}
          customHeader={{
            eyebrow: t("landing.saas.carousel.eyebrow"),
            title: t("landing.saas.carousel.title"),
            subtitle: t("landing.saas.carousel.subtitle"),
            playLabel: t("landing.saas.carousel.play")
          }}
          slideIds={applicationSlideIds}
          customSlides={applicationSlides}
          actions={applicationSlideActions}
          mediaBySlide={applicationSlideMedia}
          onLandingAnalytics={handleLandingAnalytics}
          landingJourneyActions={{
            onOrganize: () => startOrganize("story"),
            onAct: () => startAct("story"),
            onExplore: () => openApplications("story")
          }}
          landingJourneyAvailabilityBySlide={landingJourneyAvailabilityBySlide}
          simplifyLandingControls
        />
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
      <button
        type="button"
        className={`back-to-top-button ${showBackToTop ? "is-visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label={t("landing.gateways.backToTop")}
      >
        ↑
      </button>
    </main>
  );
}
