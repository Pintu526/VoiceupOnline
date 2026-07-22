import * as React from "react";
import {
  ArrowLeft,
  Bolt,
  Building2,
  CheckCircle2,
  ClipboardList,
  Flower2,
  GraduationCap,
  HeartPulse,
  Landmark,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  UsersRound
} from "lucide-react";
import { VoiceUpStoryCarousel, type VoiceUpCustomSlide, type VoiceUpStoryAction, type VoiceUpStoryMedia } from "../components/VoiceUpStoryCarousel";
import { type MarketingApplicationDefinition, type MarketingApplicationKey } from "./marketingApplications";

interface MarketingApplicationView {
  key: MarketingApplicationKey;
  status: MarketingApplicationDefinition["status"];
  enabled: boolean;
  name: string;
  description: string;
  statusDisplay: string;
  highlights: string[];
}

interface MarketingApplicationGatewaysProps {
  page: "applications" | "application-detail" | "application-act" | "application-team";
  applications: MarketingApplicationView[];
  activeApplicationKey: MarketingApplicationKey;
  onBackToLanding: () => void;
  onBackToApplications: () => void;
  onOpenApplicationDetail: (applicationKey: MarketingApplicationKey) => void;
  onOpenActGateway: (applicationKey: MarketingApplicationKey) => void;
  onOpenTeamGateway: (applicationKey: MarketingApplicationKey) => void;
  onCampaignAdminLogin: (campaignSlug: string, openCoordinatorTab: boolean) => void;
  onStartFreeTrial: () => void;
  t: (key: string) => string;
  heroImageUrl: string;
}

const applicationVisualThemes: Record<MarketingApplicationKey, { icon: React.ComponentType<{ size?: number }>; className: string }> = {
  voiceup: { icon: Sparkles, className: "voiceup" },
  campaign: { icon: Megaphone, className: "campaign" },
  goudhan: { icon: Flower2, className: "goudhan" },
  panditOnline: { icon: Landmark, className: "pandit" },
  teachToday: { icon: GraduationCap, className: "teach" },
  homeNurseHub: { icon: HeartPulse, className: "nurse" },
  cateringHub: { icon: ShoppingBasket, className: "catering" }
};

function getPlanningSections(t: (key: string) => string) {
  return [
    "basics",
    "team",
    "budget",
    "coverage",
    "timeline",
    "subscription",
    "communication",
    "evidence"
  ].map((key) => ({
    key,
    title: t(`landing.gateways.plan.sections.${key}.title`),
    items: [1, 2, 3, 4].map((index) => t(`landing.gateways.plan.sections.${key}.items.${index}`))
  }));
}

function ApplicationVisualHero({
  application,
  heroImageUrl
}: {
  application: MarketingApplicationView;
  heroImageUrl: string;
}) {
  if (shouldUseCampaignImage(application.key)) {
    return <img src={heroImageUrl} alt="" />;
  }

  const theme = applicationVisualThemes[application.key];
  const VisualIcon = theme.icon;

  return (
    <div className={`landing-app-detail-placeholder landing-app-detail-placeholder--${theme.className}`} aria-hidden="true">
      <span className="landing-app-detail-placeholder-badge">{application.statusDisplay}</span>
      <VisualIcon size={28} />
      <strong>{application.name}</strong>
      <p>{application.description}</p>
      <div className="landing-app-detail-placeholder-tags">
        {application.highlights.slice(0, 3).map((highlight) => (
          <span key={highlight}>{highlight}</span>
        ))}
      </div>
    </div>
  );
}

function CampaignAdminLoginEntry({
  onSubmit,
  t,
  openCoordinatorTab,
  submitLabel
}: {
  onSubmit: (campaignSlug: string, openCoordinatorTab: boolean) => void;
  t: (key: string) => string;
  openCoordinatorTab: boolean;
  submitLabel: string;
}) {
  const [campaignSlug, setCampaignSlug] = React.useState("");
  const [validationMessage, setValidationMessage] = React.useState("");
  const inputId = openCoordinatorTab ? "campaign-admin-slug-team" : "campaign-admin-slug-act";

  function parseCampaignIdentifier(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? "";
      return last.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    } catch {
      return trimmed.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    }
  }

  function submitCampaignLogin() {
    const parsedIdentifier = parseCampaignIdentifier(campaignSlug);
    if (!parsedIdentifier) {
      setValidationMessage(t("landing.gateways.campaignAdmin.validation"));
      return;
    }
    setValidationMessage("");
    onSubmit(parsedIdentifier, openCoordinatorTab);
  }

  return (
    <div className="landing-campaign-admin-entry">
      <label htmlFor={inputId}>{t("landing.gateways.campaignAdmin.slugLabel")}</label>
      <input
        id={inputId}
        type="text"
        value={campaignSlug}
        placeholder={t("landing.gateways.campaignAdmin.slugPlaceholder")}
        onChange={(event) => {
          setCampaignSlug(event.target.value);
          if (validationMessage) setValidationMessage("");
        }}
      />
      <button
        type="button"
        className="primary-link-button"
        onClick={submitCampaignLogin}
      >
        <Megaphone size={17} /> {submitLabel}
      </button>
      {validationMessage && <p className="info-message">{validationMessage}</p>}
    </div>
  );
}

function shouldUseCampaignImage(applicationKey: MarketingApplicationKey) {
  return applicationKey === "campaign" || applicationKey === "voiceup";
}

function getApplicationByKey(
  applications: MarketingApplicationView[],
  applicationKey: MarketingApplicationKey
) {
  return applications.find((application) => application.key === applicationKey) ?? applications[0];
}

function CarouselApplicationsView({
  applications,
  onOpenApplicationDetail,
  onOpenActGateway,
  onOpenTeamGateway,
  t,
  heroImageUrl
}: {
  applications: MarketingApplicationView[];
  onOpenApplicationDetail: (applicationKey: MarketingApplicationKey) => void;
  onOpenActGateway: (applicationKey: MarketingApplicationKey) => void;
  onOpenTeamGateway: (applicationKey: MarketingApplicationKey) => void;
  t: (key: string) => string;
  heroImageUrl: string;
}) {
  const slides = applications.map((application) => application.key);
  const slideMap: Record<string, VoiceUpCustomSlide> = Object.fromEntries(
    applications.map((application) => [
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
  const actions: Record<string, VoiceUpStoryAction> = Object.fromEntries(
    applications.map((application) => [
      application.key,
      {
        label: t("landing.saas.actions.learnMore"),
        onClick: () => onOpenApplicationDetail(application.key)
      }
    ])
  );
  const mediaBySlide: Partial<Record<string, VoiceUpStoryMedia>> = {
    campaign: { imageUrl: heroImageUrl }
  };
  const landingJourneyAvailabilityBySlide = Object.fromEntries(
    applications.map((application) => [
      application.key,
      {
        planEnabled: application.key === "campaign" && application.enabled,
        actEnabled: application.key === "campaign" && application.enabled
      }
    ])
  );

  return (
    <section className="landing-gateway-surface" aria-labelledby="applications-gateway-title">
      <header className="landing-gateway-header">
        <span className="eyebrow">{t("landing.saas.hero.brand")}</span>
        <h1 id="applications-gateway-title">{t("landing.gateways.applications.title")}</h1>
        <p>{t("landing.gateways.applications.subtitle")}</p>
      </header>
      <VoiceUpStoryCarousel
        experience="landing"
        autoPlayMs={2000}
        customHeader={{
          eyebrow: t("landing.saas.carousel.eyebrow"),
          title: t("landing.saas.carousel.title"),
          subtitle: t("landing.saas.carousel.subtitle"),
          playLabel: t("landing.saas.carousel.play")
        }}
        slideIds={slides}
        customSlides={slideMap}
        actions={actions}
        mediaBySlide={mediaBySlide}
        landingJourneyAvailabilityBySlide={landingJourneyAvailabilityBySlide}
        simplifyLandingControls
      />
      <div className="landing-gateway-actions">
        <button type="button" className="primary-link-button" onClick={() => onOpenTeamGateway("campaign")}>
          <ClipboardList size={18} /> {t("landing.saas.actions.organizeWithTeam")}
        </button>
        <button type="button" className="primary-link-button accent" onClick={() => onOpenActGateway("campaign")}>
          <Bolt size={18} /> {t("landing.saas.actions.actWithStartFree")}
        </button>
      </div>
    </section>
  );
}

function ApplicationDetailView({
  application,
  applications,
  onOpenApplicationDetail,
  onOpenActGateway,
  onOpenTeamGateway,
  onBackToApplications,
  onBackToLanding,
  t,
  heroImageUrl
}: {
  application: MarketingApplicationView;
  applications: MarketingApplicationView[];
  onOpenApplicationDetail: (applicationKey: MarketingApplicationKey) => void;
  onOpenActGateway: (applicationKey: MarketingApplicationKey) => void;
  onOpenTeamGateway: (applicationKey: MarketingApplicationKey) => void;
  onBackToApplications: () => void;
  onBackToLanding: () => void;
  t: (key: string) => string;
  heroImageUrl: string;
}) {
  const applicationIndex = applications.findIndex((item) => item.key === application.key);
  const previous = applications[(applicationIndex - 1 + applications.length) % applications.length];
  const next = applications[(applicationIndex + 1) % applications.length];
  const workflowSteps = [t("landing.saas.actions.learnMore"), t("landing.saas.actions.organize"), t("landing.saas.actions.act")];

  return (
    <section className="landing-gateway-surface" aria-labelledby="application-detail-title">
      <header className="landing-gateway-header">
        <button type="button" className="landing-gateway-back" onClick={onBackToApplications}>
          <ArrowLeft size={16} /> {t("landing.gateways.backToSelector")}
        </button>
        <span className="eyebrow">{t("landing.saas.actions.learnMore")}</span>
        <h1 id="application-detail-title">{application.name}</h1>
        <p>{application.description}</p>
      </header>

      <article className="landing-app-detail-card">
        <ApplicationVisualHero application={application} heroImageUrl={heroImageUrl} />
        <div className="landing-app-detail-content">
          <span className="landing-app-detail-status" aria-label={t("landing.saas.labels.applicationStatus")}>{application.statusDisplay}</span>
          <ul>
            {application.highlights.slice(0, 3).map((highlight) => (
              <li key={highlight}><CheckCircle2 size={14} /> {highlight}</li>
            ))}
          </ul>
          <div className="landing-workflow-strip" aria-label={t("landing.gateways.workflowAria")}>
            {workflowSteps.map((step) => (
              <span key={step}>{step}</span>
            ))}
          </div>
          <div className="landing-gateway-actions">
            <button
              type="button"
              className="primary-link-button"
              onClick={() => onOpenTeamGateway(application.key)}
              disabled={application.key !== "campaign" || !application.enabled}
            >
              <ClipboardList size={17} /> {t("landing.saas.actions.organizeWithTeam")}
            </button>
            <button
              type="button"
              className="primary-link-button accent"
              onClick={() => onOpenActGateway(application.key)}
              disabled={application.key !== "campaign" || !application.enabled}
            >
              <Bolt size={17} /> {t("landing.saas.actions.actWithStartFree")}
            </button>
          </div>
        </div>
      </article>

      <nav className="landing-app-detail-pagination" aria-label={t("storyCarousel.common.navigationAria")}>
        <button type="button" className="secondary-link-button" onClick={() => onOpenApplicationDetail(previous.key)}>
          {t("storyCarousel.common.previous")}: {previous.name}
        </button>
        <div className="landing-app-detail-dots" role="group" aria-label={t("storyCarousel.common.navigationAria")}>
          {applications.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === application.key ? "active" : ""}
              onClick={() => onOpenApplicationDetail(item.key)}
              aria-current={item.key === application.key ? "true" : undefined}
              aria-label={item.name}
            />
          ))}
        </div>
        <button type="button" className="secondary-link-button" onClick={() => onOpenApplicationDetail(next.key)}>
          {t("storyCarousel.common.next")}: {next.name}
        </button>
      </nav>

      <div className="landing-gateway-actions">
        <button type="button" className="secondary-link-button" onClick={onBackToApplications}>
          {t("landing.gateways.backToSelector")}
        </button>
        <button type="button" className="secondary-link-button" onClick={onBackToLanding}>
          {t("landing.gateways.backToLanding")}
        </button>
      </div>
    </section>
  );
}

function TeamGatewayView({
  application,
  onCampaignAdminLogin,
  onBackToApplications,
  onBackToLanding,
  onOpenApplicationDetail,
  onOpenActGateway,
  t
}: {
  application: MarketingApplicationView;
  onCampaignAdminLogin: (campaignSlug: string, openCoordinatorTab: boolean) => void;
  onBackToApplications: () => void;
  onBackToLanding: () => void;
  onOpenApplicationDetail: (applicationKey: MarketingApplicationKey) => void;
  onOpenActGateway: (applicationKey: MarketingApplicationKey) => void;
  t: (key: string) => string;
}) {
  const planningSections = getPlanningSections(t);

  return (
    <section className="landing-gateway-surface" aria-labelledby="team-gateway-title">
      <header className="landing-gateway-header">
        <button type="button" className="landing-gateway-back" onClick={onBackToApplications}>
          <ArrowLeft size={16} /> {t("landing.gateways.backToSelector")}
        </button>
        <span className="eyebrow">{t("landing.saas.actions.organize")}</span>
        <h1 id="team-gateway-title">{t("landing.gateways.team.title")}</h1>
        <p>{t("landing.gateways.team.subtitle")}</p>
      </header>

      <div className="landing-gateway-highlight landing-gateway-highlight--plan">
        <ClipboardList size={20} />
        <div>
          <strong>{application.name}</strong>
          <p>{application.statusDisplay}</p>
        </div>
      </div>

      <div className="plan-overview-grid" aria-label={t("landing.gateways.plan.categoriesAria")}>
        {planningSections.map((section) => (
          <article className="plan-overview-card" key={section.key}>
            <strong>{section.title}</strong>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="landing-gateway-note">
        <LockKeyhole size={16} /> {t("landing.gateways.team.entitlementNote")}
      </p>

      <div className="landing-gateway-actions">
        <CampaignAdminLoginEntry
          onSubmit={onCampaignAdminLogin}
          t={t}
          openCoordinatorTab
          submitLabel={t("landing.gateways.team.continue")}
        />
        <button type="button" className="secondary-link-button" onClick={() => onOpenApplicationDetail("campaign")}>
          {t("landing.gateways.team.learnMore")}
        </button>
        <button type="button" className="secondary-link-button" onClick={() => onOpenActGateway("campaign")}>
          {t("landing.gateways.team.goToAct")}
        </button>
        <button type="button" className="secondary-link-button" onClick={onBackToLanding}>
          {t("landing.gateways.team.backToCampaign")}
        </button>
      </div>
    </section>
  );
}

function ActGatewayView({
  applications,
  onCampaignAdminLogin,
  onStartFreeTrial,
  onOpenApplicationDetail,
  onOpenTeamGateway,
  onBackToApplications,
  onBackToLanding,
  t
}: {
  applications: MarketingApplicationView[];
  onCampaignAdminLogin: (campaignSlug: string, openCoordinatorTab: boolean) => void;
  onStartFreeTrial: () => void;
  onOpenApplicationDetail: (applicationKey: MarketingApplicationKey) => void;
  onOpenTeamGateway: (applicationKey: MarketingApplicationKey) => void;
  onBackToApplications: () => void;
  onBackToLanding: () => void;
  t: (key: string) => string;
}) {
  const campaign = applications.find((application) => application.key === "campaign") ?? applications[0];

  return (
    <section className="landing-gateway-surface" aria-labelledby="act-gateway-title">
      <header className="landing-gateway-header">
        <button type="button" className="landing-gateway-back" onClick={onBackToApplications}>
          <ArrowLeft size={16} /> {t("landing.gateways.backToSelector")}
        </button>
        <span className="eyebrow">{t("landing.saas.actions.act")}</span>
        <h1 id="act-gateway-title">{t("landing.gateways.act.title")}</h1>
        <p>{t("landing.gateways.act.subtitle")}</p>
      </header>

      <div className="act-choice-grid">
        <article className="landing-act-primary-card landing-act-primary-card--trial">
          <div>
            <span className="eyebrow">{t("landing.gateways.act.optionNew")}</span>
            <strong>{t("landing.gateways.act.startTrial")}</strong>
            <p>{t("landing.gateways.act.optionNewDescription")}</p>
            <ul className="landing-act-list">
              {[1, 2, 3, 4, 5].map((index) => (
                <li key={index}><CheckCircle2 size={14} /> {t(`landing.gateways.act.optionNewItems.${index}`)}</li>
              ))}
            </ul>
          </div>
          <button type="button" className="primary-link-button accent" onClick={onStartFreeTrial}>
            <Bolt size={17} /> {t("landing.gateways.act.startTrial")}
          </button>
        </article>

        <article className="landing-act-primary-card landing-act-primary-card--login">
          <div>
            <span className="eyebrow">{t("landing.gateways.act.optionExisting")}</span>
            <strong>{t("landing.saas.act.adminLogin")}</strong>
            <p>{t("landing.gateways.act.optionExistingDescription")}</p>
            <ul className="landing-act-list">
              {[1, 2, 3, 4, 5].map((index) => (
                <li key={index}><ShieldCheck size={14} /> {t(`landing.gateways.act.optionExistingItems.${index}`)}</li>
              ))}
            </ul>
          </div>
          <CampaignAdminLoginEntry
            onSubmit={onCampaignAdminLogin}
            t={t}
            openCoordinatorTab={false}
            submitLabel={t("landing.saas.act.adminLogin")}
          />
        </article>
      </div>

      <div className="landing-gateway-list" aria-label={t("landing.gateways.act.otherApplications") }>
        {applications.filter((application) => application.key !== "campaign").map((application) => (
          <article className="landing-gateway-list-item" key={application.key}>
            <div>
              <strong>{application.name}</strong>
              <p>{application.description}</p>
            </div>
            <span>{application.statusDisplay}</span>
          </article>
        ))}
      </div>

      <div className="landing-gateway-actions">
        <button type="button" className="secondary-link-button" onClick={() => onOpenTeamGateway("campaign")}>
          {t("landing.gateways.act.goToPlan")}
        </button>
        <button type="button" className="secondary-link-button" onClick={() => onOpenApplicationDetail("campaign")}>
          {t("landing.gateways.act.learnMore")}
        </button>
        <button type="button" className="secondary-link-button" onClick={() => onOpenApplicationDetail("campaign")}>
          {t("landing.gateways.act.backToCampaign")}
        </button>
        <button type="button" className="secondary-link-button" onClick={onBackToLanding}>
          {t("landing.gateways.backToLanding")}
        </button>
      </div>
    </section>
  );
}

export function MarketingApplicationGateways({
  page,
  applications,
  activeApplicationKey,
  onBackToLanding,
  onBackToApplications,
  onOpenApplicationDetail,
  onOpenActGateway,
  onOpenTeamGateway,
  onCampaignAdminLogin,
  onStartFreeTrial,
  t,
  heroImageUrl
}: MarketingApplicationGatewaysProps) {
  const activeApplication = getApplicationByKey(applications, activeApplicationKey);

  if (page === "application-detail") {
    return (
      <ApplicationDetailView
        application={activeApplication}
        applications={applications}
        onOpenApplicationDetail={onOpenApplicationDetail}
        onOpenActGateway={onOpenActGateway}
        onOpenTeamGateway={onOpenTeamGateway}
        onBackToApplications={onBackToApplications}
        onBackToLanding={onBackToLanding}
        t={t}
        heroImageUrl={heroImageUrl}
      />
    );
  }

  if (page === "application-team") {
    return (
      <TeamGatewayView
        application={activeApplication}
        onCampaignAdminLogin={onCampaignAdminLogin}
        onBackToApplications={onBackToApplications}
        onBackToLanding={onBackToLanding}
        onOpenApplicationDetail={onOpenApplicationDetail}
        onOpenActGateway={onOpenActGateway}
        t={t}
      />
    );
  }

  if (page === "application-act") {
    return (
      <ActGatewayView
        applications={applications}
        onCampaignAdminLogin={onCampaignAdminLogin}
        onStartFreeTrial={onStartFreeTrial}
        onOpenApplicationDetail={onOpenApplicationDetail}
        onOpenTeamGateway={onOpenTeamGateway}
        onBackToApplications={onBackToApplications}
        onBackToLanding={onBackToLanding}
        t={t}
      />
    );
  }

  return (
    <CarouselApplicationsView
      applications={applications}
      onOpenApplicationDetail={onOpenApplicationDetail}
      onOpenActGateway={onOpenActGateway}
      onOpenTeamGateway={onOpenTeamGateway}
      t={t}
      heroImageUrl={heroImageUrl}
    />
  );
}
