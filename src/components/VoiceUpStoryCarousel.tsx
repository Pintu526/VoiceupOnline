import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent
} from "react";
import {
  Building2,
  ArrowRight,
  BarChart3,
  Bolt,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileScan,
  MapPinned,
  Megaphone,
  Network,
  Pause,
  Play,
  RotateCcw,
  Square,
  Users,
  Video,
  Volume2,
  WalletCards
} from "lucide-react";
import { useTranslation } from "../i18n";

export type VoiceUpStoryExperience = "landing" | "publicCampaign" | "campaignAdmin";

export interface VoiceUpStoryAction {
  label: string;
  onClick: () => void;
}

export interface VoiceUpStoryMedia {
  imageUrl?: string;
  videoUrl?: string;
}

export interface VoiceUpCustomSlide {
  title: string;
  description: string;
  narration?: string;
  highlights?: string[];
  status?: string;
}

export interface VoiceUpCustomHeader {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  playLabel?: string;
}

interface LandingJourneyActions {
  onOrganize: () => void;
  onAct: () => void;
  onExplore?: () => void;
}

interface LandingAnalyticsPayload {
  eventName: string;
  context: string;
}

interface VoiceUpStoryCarouselProps {
  experience: VoiceUpStoryExperience;
  autoPlayMs?: number;
  className?: string;
  slideIds?: readonly string[];
  actions?: Partial<Record<string, VoiceUpStoryAction>>;
  mediaBySlide?: Partial<Record<string, VoiceUpStoryMedia>>;
  customSlides?: Partial<Record<string, VoiceUpCustomSlide>>;
  customHeader?: VoiceUpCustomHeader;
  landingJourneyActions?: LandingJourneyActions;
  onLandingAnalytics?: (payload: LandingAnalyticsPayload) => void;
}

const experienceSlides: Record<VoiceUpStoryExperience, readonly string[]> = {
  landing: [
    "opening",
    "problem",
    "organize",
    "initiatives",
    "offlineOnline",
    "engagement",
    "transparency",
    "growth",
    "impact",
    "decision"
  ],
  publicCampaign: [
    "objective",
    "evidence",
    "progress",
    "afterSigning",
    "share",
    "volunteerUpdates"
  ],
  campaignAdmin: [
    "publishStrengthen",
    "paperSignatures",
    "crm",
    "referrals",
    "volunteers",
    "reportsImpact",
    "evidenceUpdates",
    "fundraising",
    "districts",
    "aiCopilot"
  ]
};

const sceneTypes: Record<string, string> = {
  campaignCreation: "campaign",
  objective: "campaign",
  publishStrengthen: "campaign",
  paperDigitization: "scan",
  paperSignatures: "scan",
  supporters: "crm",
  crm: "crm",
  referrals: "referral",
  share: "referral",
  volunteers: "district",
  volunteerUpdates: "district",
  districts: "district",
  timeline: "timeline",
  transparency: "evidence",
  evidence: "evidence",
  evidenceUpdates: "evidence",
  reports: "reports",
  progress: "reports",
  reportsImpact: "reports",
  afterSigning: "timeline",
  fundraising: "funding",
  aiCopilot: "ai"
};

function estimateNarrationMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(14_000, Math.max(5_500, words * 430));
}

function findNarrationVoice(voices: SpeechSynthesisVoice[], language: "en" | "hi" | "or") {
  const normalized = voices.map((voice) => ({ voice, lang: voice.lang.toLowerCase() }));
  const preferences = language === "en" ? ["en-in", "en-gb", "en-us"] : [`${language}-in`];
  for (const preference of preferences) {
    const exact = normalized.find((item) => item.lang === preference);
    if (exact) return exact.voice;
  }
  return normalized.find((item) => item.lang === language || item.lang.startsWith(`${language}-`))?.voice;
}

function StoryVisualScene({
  slideKey,
  title,
  media,
  t
}: {
  slideKey: string;
  title: string;
  media?: VoiceUpStoryMedia;
  t: (key: string) => string;
}) {
  if (media?.videoUrl) {
    return (
      <div className="voiceup-story-visual voiceup-story-visual--media">
        <video controls preload="metadata" src={media.videoUrl} aria-label={title} />
      </div>
    );
  }

  if (media?.imageUrl) {
    return (
      <div className="voiceup-story-visual voiceup-story-visual--media">
        <img src={media.imageUrl} alt="" />
        <span className="voiceup-story-media-caption">{title}</span>
      </div>
    );
  }

  const scene = sceneTypes[slideKey] ?? "campaign";
  const SceneIcon = scene === "scan" ? FileScan
    : scene === "crm" ? Users
      : scene === "referral" ? Network
        : scene === "district" ? MapPinned
          : scene === "reports" ? BarChart3
            : scene === "evidence" ? FileCheck2
              : scene === "funding" ? WalletCards
                : scene === "ai" ? Bot
                  : Megaphone;

  return (
    <div className={`voiceup-story-visual voiceup-story-scene voiceup-story-scene--${scene}`}>
      <div className="voiceup-story-scene-header">
        <span><SceneIcon size={21} /></span>
        <small>{t("storyCarousel.common.illustrative")}</small>
      </div>
      <div className="voiceup-story-scene-canvas">
        {scene === "scan" && (
          <>
            <div className="story-paper"><i /><i /><i /></div>
            <ArrowRight size={18} />
            <div className="story-supporter-card"><CheckCircle2 size={18} /><span>{t("storyCarousel.common.verified")}</span></div>
          </>
        )}
        {scene === "crm" && (
          <div className="story-crm-stack">
            {["A", "B", "C"].map((item, index) => <span key={item} style={{ "--story-order": index } as React.CSSProperties}><b>{item}</b><i /></span>)}
          </div>
        )}
        {scene === "referral" && (
          <div className="story-referral-flow"><b /><i /><i /><i /></div>
        )}
        {scene === "district" && (
          <div className="story-district-grid">{[0, 1, 2, 3, 4, 5].map((item) => <i key={item} />)}</div>
        )}
        {(scene === "reports" || scene === "funding") && (
          <div className="story-report-bars">{[46, 72, 58, 88].map((value) => <i key={value} style={{ "--story-bar": `${value}%` } as React.CSSProperties} />)}</div>
        )}
        {(scene === "campaign" || scene === "timeline" || scene === "evidence") && (
          <div className="story-step-flow">{[1, 2, 3].map((item) => <span key={item}><b>{item}</b><i /></span>)}</div>
        )}
        {scene === "ai" && (
          <div className="story-ai-chat"><span /><span /><span /></div>
        )}
      </div>
      <strong>{title}</strong>
    </div>
  );
}

export function VoiceUpStoryCarousel({
  experience,
  autoPlayMs = 7000,
  className = "",
  slideIds,
  actions = {},
  mediaBySlide = {},
  customSlides,
  customHeader,
  landingJourneyActions,
  onLandingAnalytics
}: VoiceUpStoryCarouselProps) {
  const { language, t } = useTranslation();
  const slides = useMemo(
    () => (slideIds?.length ? [...slideIds] : [...experienceSlides[experience]]),
    [experience, slideIds]
  );
  const isLanding = experience === "landing";
  const [activeIndex, setActiveIndex] = useState(0);
  const [silentPaused, setSilentPaused] = useState(false);
  const [isHoverPaused, setIsHoverPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [guidedActive, setGuidedActive] = useState(false);
  const [guidedPaused, setGuidedPaused] = useState(false);
  const [guidedCompleted, setGuidedCompleted] = useState(false);
  const [isExploreMode, setIsExploreMode] = useState(false);
  const [landingRemainingMs, setLandingRemainingMs] = useState(autoPlayMs);
  const [narrationUnavailable, setNarrationUnavailable] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const pointerStartX = useRef<number | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const landingTimer = useRef<number | null>(null);
  const fallbackStartedAt = useRef(0);
  const fallbackRemaining = useRef(0);
  const finishNarration = useRef<() => void>(() => undefined);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const firstLanguageRender = useRef(true);

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
  }, []);

  const cancelNarration = useCallback(() => {
    clearFallbackTimer();
    fallbackRemaining.current = 0;
    utteranceRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [clearFallbackTimer]);

  const clearLandingTimer = useCallback(() => {
    if (landingTimer.current !== null) window.clearInterval(landingTimer.current);
    landingTimer.current = null;
  }, []);

  function trackLanding(eventName: string, context: string) {
    if (isLanding && onLandingAnalytics) onLandingAnalytics({ eventName, context });
  }

  function isEditableTarget(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.closest("input, textarea, select, [contenteditable='true']")) return true;
    return false;
  }

  function isInteractiveTarget(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true']")) return true;
    return false;
  }

  const scheduleFallback = useCallback((delay: number) => {
    clearFallbackTimer();
    fallbackRemaining.current = delay;
    fallbackStartedAt.current = Date.now();
    fallbackTimer.current = window.setTimeout(() => {
      fallbackTimer.current = null;
      fallbackRemaining.current = 0;
      finishNarration.current();
    }, delay);
  }, [clearFallbackTimer]);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setReducedMotion(motionQuery.matches);
      if (motionQuery.matches) setSilentPaused(true);
    };
    updateMotionPreference();
    motionQuery.addEventListener("change", updateMotionPreference);
    return () => motionQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => () => {
    cancelNarration();
    clearLandingTimer();
  }, [cancelNarration, clearLandingTimer]);

  useEffect(() => {
    setActiveIndex(0);
    setSilentPaused(reducedMotion);
    setGuidedActive(false);
    setGuidedPaused(false);
    setGuidedCompleted(false);
    setIsExploreMode(false);
    setLandingRemainingMs(autoPlayMs);
    cancelNarration();
  }, [cancelNarration, experience, reducedMotion, slides.length]);

  const showNextSilent = useCallback(() => {
    setActiveIndex((current) => {
      if (isLanding && current >= slides.length - 1) return current;
      return (current + 1) % slides.length;
    });
  }, [isLanding, slides.length]);

  useEffect(() => {
    if (isLanding) return;
    if (silentPaused || isHoverPaused || isFocusPaused || guidedActive || reducedMotion) return;
    const intervalId = window.setInterval(showNextSilent, autoPlayMs);
    return () => window.clearInterval(intervalId);
  }, [autoPlayMs, guidedActive, isFocusPaused, isHoverPaused, isLanding, reducedMotion, showNextSilent, silentPaused]);

  const slideKey = slides[Math.min(activeIndex, slides.length - 1)];
  const customSlide = customSlides?.[slideKey];
  const title = customSlide?.title ?? t(`storyCarousel.${experience}.slides.${slideKey}.title`);
  const description = customSlide?.description ?? t(`storyCarousel.${experience}.slides.${slideKey}.description`);
  const narration = customSlide?.narration ?? t(`storyCarousel.${experience}.slides.${slideKey}.narration`);
  const activeAction = actions[slideKey];
  const isLandingOpeningSlide = experience === "landing" && slideKey === "opening";
  const isLandingDecisionSlide = experience === "landing" && slideKey === "decision";
  const hasLandingJourneyActions = experience === "landing" && Boolean(landingJourneyActions);
  const isLandingFinalSlide = isLanding && activeIndex >= slides.length - 1;
  const landingPaused = isLanding && (silentPaused || isHoverPaused || isFocusPaused || guidedPaused || reducedMotion || isExploreMode);

  useEffect(() => {
    if (!isLanding) return;
    trackLanding("landing_scene_viewed", slideKey);
  }, [isLanding, slideKey]);

  useEffect(() => {
    if (!isLanding) return;
    if (firstLanguageRender.current) {
      firstLanguageRender.current = false;
      return;
    }
    setLandingRemainingMs(autoPlayMs);
    trackLanding("landing_language_changed", language);
  }, [autoPlayMs, isLanding, language]);

  useEffect(() => {
    if (!isLanding) return;
    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      setSilentPaused(true);
      setGuidedPaused(true);
      trackLanding("landing_paused", "tab_hidden");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isLanding]);

  useEffect(() => {
    if (!isLanding) return;
    setLandingRemainingMs(autoPlayMs);
  }, [activeIndex, autoPlayMs, isLanding]);

  useEffect(() => {
    clearLandingTimer();
    if (!isLanding || landingPaused || isLandingFinalSlide) return;
    landingTimer.current = window.setInterval(() => {
      setLandingRemainingMs((current) => {
        const next = current - 100;
        if (next > 0) return next;
        setActiveIndex((currentIndex) => {
          if (currentIndex >= slides.length - 1) {
            setGuidedCompleted(true);
            setGuidedActive(false);
            setSilentPaused(true);
            setGuidedPaused(true);
            trackLanding("landing_story_completed", "timer");
            return currentIndex;
          }
          return currentIndex + 1;
        });
        return autoPlayMs;
      });
    }, 100);
    return clearLandingTimer;
  }, [autoPlayMs, clearLandingTimer, isLanding, isLandingFinalSlide, landingPaused, slides.length]);

  useEffect(() => {
    if (isLanding || !guidedActive) return;
    cancelNarration();
    let cancelled = false;
    finishNarration.current = () => {
      if (cancelled) return;
      if (activeIndex >= slides.length - 1) {
        setGuidedActive(false);
        setGuidedPaused(false);
        setGuidedCompleted(true);
        cancelNarration();
      } else {
        setActiveIndex(activeIndex + 1);
      }
    };

    const matchingVoice = findNarrationVoice(voices, language);
    if (!("speechSynthesis" in window) || !matchingVoice) {
      setNarrationUnavailable(true);
      scheduleFallback(estimateNarrationMs(narration));
    } else {
      setNarrationUnavailable(false);
      const utterance = new SpeechSynthesisUtterance(narration);
      utterance.voice = matchingVoice;
      utterance.lang = matchingVoice.lang;
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.onend = () => finishNarration.current();
      utterance.onerror = (event) => {
        if (cancelled || event.error === "canceled" || event.error === "interrupted") return;
        utteranceRef.current = null;
        setNarrationUnavailable(true);
        scheduleFallback(estimateNarrationMs(narration));
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }

    return () => {
      cancelled = true;
      cancelNarration();
    };
  }, [activeIndex, cancelNarration, guidedActive, isLanding, language, narration, scheduleFallback, slides.length, voices]);

  function moveTo(index: number, context: string = "controls") {
    setSilentPaused(true);
    if (isLanding) setGuidedPaused(true);
    cancelNarration();
    setLandingRemainingMs(autoPlayMs);
    const targetIndex = isLanding
      ? Math.min(slides.length - 1, Math.max(0, index))
      : (index + slides.length) % slides.length;
    if (isLanding) {
      const eventName = targetIndex < activeIndex ? "landing_previous_clicked" : "landing_next_clicked";
      if (targetIndex !== activeIndex) trackLanding(eventName, context);
    }
    setActiveIndex(targetIndex);
  }

  function startGuided() {
    cancelNarration();
    if (isLanding) {
      setActiveIndex(0);
      setLandingRemainingMs(autoPlayMs);
      setSilentPaused(false);
      setGuidedPaused(false);
      setGuidedActive(true);
      setGuidedCompleted(false);
      trackLanding("landing_guided_started", "story");
      return;
    }
    setSilentPaused(true);
    setGuidedCompleted(false);
    setGuidedPaused(false);
    setGuidedActive(true);
  }

  function pauseGuided() {
    if (isLanding) {
      setSilentPaused(true);
      setGuidedPaused(true);
      trackLanding("landing_paused", "controls");
      return;
    }
    setGuidedPaused(true);
    if ("speechSynthesis" in window && utteranceRef.current) window.speechSynthesis.pause();
    if (fallbackTimer.current !== null) {
      fallbackRemaining.current = Math.max(500, fallbackRemaining.current - (Date.now() - fallbackStartedAt.current));
      clearFallbackTimer();
    }
  }

  function resumeGuided() {
    if (isLanding) {
      setGuidedPaused(false);
      setSilentPaused(false);
      setLandingRemainingMs(autoPlayMs);
      trackLanding("landing_resumed", "controls");
      return;
    }
    setGuidedPaused(false);
    if ("speechSynthesis" in window && utteranceRef.current && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else if (fallbackRemaining.current > 0) {
      scheduleFallback(fallbackRemaining.current);
    }
  }

  function stopGuided() {
    cancelNarration();
    setGuidedActive(false);
    setGuidedPaused(false);
    setGuidedCompleted(false);
    if (isLanding) setSilentPaused(true);
  }

  function replayGuided() {
    cancelNarration();
    setActiveIndex(0);
    setLandingRemainingMs(autoPlayMs);
    setIsExploreMode(false);
    setGuidedCompleted(false);
    setGuidedPaused(false);
    setGuidedActive(!isLanding);
    setSilentPaused(false);
    if (isLanding) trackLanding("landing_guided_restarted", "controls");
  }

  function openExploreMode(context: string) {
    setIsExploreMode(true);
    setGuidedPaused(true);
    setSilentPaused(true);
    trackLanding("landing_paused", context);
  }

  function returnToGuidedStory() {
    setIsExploreMode(false);
    setLandingRemainingMs(autoPlayMs);
    setGuidedPaused(false);
    setSilentPaused(false);
    trackLanding("landing_resumed", "explore_return");
  }

  function handleLandingJourneyAction(action: () => void, context: string) {
    stopGuided();
    setSilentPaused(true);
    setLandingRemainingMs(autoPlayMs);
    action();
    if (isLanding && context === "explore") openExploreMode("explore");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (isEditableTarget(event.target)) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(activeIndex - 1, "keyboard");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTo(activeIndex + 1, "keyboard");
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0, "keyboard");
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(slides.length - 1, "keyboard");
    } else if (event.key === " " && isLanding) {
      event.preventDefault();
      if (landingPaused) {
        resumeGuided();
      } else {
        pauseGuided();
      }
    } else if (event.key === "Escape" && isLanding && isExploreMode) {
      event.preventDefault();
      returnToGuidedStory();
    }
  }

  function handleFocusLeave(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusPaused(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") pointerStartX.current = event.clientX;
    if (isLanding && event.pointerType !== "mouse") {
      setSilentPaused(true);
      setGuidedPaused(true);
      trackLanding("landing_paused", "swipe_start");
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (pointerStartX.current === null) return;
    const distance = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(distance) < 48) {
      if (isLanding && !isInteractiveTarget(event.target)) {
        setSilentPaused(true);
        setGuidedPaused(true);
        trackLanding("landing_paused", "tap_background");
      }
      return;
    }
    moveTo(distance > 0 ? activeIndex - 1 : activeIndex + 1, "swipe");
  }

  const rootClassName = [
    "voiceup-story-carousel",
    `voiceup-story-carousel--${experience}`,
    guidedActive ? "is-guided" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <section
      className={rootClassName}
      lang={language}
      role="region"
      aria-roledescription={t("storyCarousel.common.carousel")}
      aria-label={t(`storyCarousel.${experience}.regionLabel`)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => {
        setIsHoverPaused(true);
        if (isLanding) trackLanding("landing_paused", "hover");
      }}
      onMouseLeave={() => {
        setIsHoverPaused(false);
      }}
      onFocusCapture={() => setIsFocusPaused(true)}
      onBlurCapture={handleFocusLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { pointerStartX.current = null; }}
    >
      <div className="voiceup-story-header">
        <div>
          <span className="eyebrow">{customHeader?.eyebrow ?? t(`storyCarousel.${experience}.eyebrow`)}</span>
          <h2>{customHeader?.title ?? t(`storyCarousel.${experience}.title`)}</h2>
          <p>{customHeader?.subtitle ?? t(`storyCarousel.${experience}.subtitle`)}</p>
        </div>
        {!guidedActive && !guidedCompleted && (
          <button type="button" className="voiceup-story-guided-start" onClick={startGuided}>
            <Volume2 size={19} /> {customHeader?.playLabel ?? t(`storyCarousel.${experience}.playLabel`)}
          </button>
        )}
        {guidedCompleted && (
          <button type="button" className="voiceup-story-guided-start" onClick={replayGuided}>
            <RotateCcw size={19} /> {t("storyCarousel.common.replay")}
          </button>
        )}
      </div>

      <div
        className="voiceup-story-stage"
        role="group"
        aria-roledescription={t("storyCarousel.common.slide")}
        aria-label={`${activeIndex + 1} ${t("storyCarousel.common.of")} ${slides.length}: ${title}`}
        aria-live={guidedActive || silentPaused ? "polite" : "off"}
      >
        <div className="voiceup-story-copy" key={`${experience}-${slideKey}`}>
          <span className="voiceup-story-number" aria-hidden="true">{String(activeIndex + 1).padStart(2, "0")}</span>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
            {experience === "campaignAdmin" && (
              <ul className="voiceup-story-benefits">
                {["benefit1", "benefit2", "benefit3"].map((benefit) => (
                  <li key={benefit}><CheckCircle2 size={15} /> {t(`storyCarousel.${experience}.slides.${slideKey}.${benefit}`)}</li>
                ))}
              </ul>
            )}
            {customSlide?.highlights && customSlide.highlights.length > 0 && (
              <ul className="voiceup-story-benefits">
                {customSlide.highlights.map((highlight) => (
                  <li key={highlight}><CheckCircle2 size={15} /> {highlight}</li>
                ))}
              </ul>
            )}
            {customSlide?.status && (
              <span className="voiceup-story-status" aria-label={t("landing.saas.labels.applicationStatus")}>{customSlide.status}</span>
            )}
            {activeAction && !isLandingOpeningSlide && !isLandingDecisionSlide && (
              <button
                type="button"
                className="voiceup-story-cta"
                onClick={() => { stopGuided(); activeAction.onClick(); }}
              >
                {activeAction.label} <ArrowRight size={16} />
              </button>
            )}
            {hasLandingJourneyActions && isLandingOpeningSlide && landingJourneyActions && (
              <div className="voiceup-story-journey-actions" aria-label={t("storyCarousel.landing.journey.aria")}>
                <button
                  type="button"
                  className="voiceup-story-cta voiceup-story-journey-cta"
                  onClick={() => handleLandingJourneyAction(landingJourneyActions.onOrganize, "organize")}
                >
                  <Building2 size={16} /> {t("storyCarousel.landing.journey.organize")}
                </button>
                <button
                  type="button"
                  className="voiceup-story-cta voiceup-story-journey-cta"
                  onClick={() => handleLandingJourneyAction(landingJourneyActions.onAct, "act")}
                >
                  <Bolt size={16} /> {t("storyCarousel.landing.journey.act")}
                </button>
                <button
                  type="button"
                  className="voiceup-story-link-button"
                  onClick={() => {
                    if (landingJourneyActions.onExplore) {
                      handleLandingJourneyAction(landingJourneyActions.onExplore, "explore");
                    } else {
                      stopGuided();
                      setSilentPaused(true);
                    }
                  }}
                >
                  {t("storyCarousel.landing.journey.explore")}
                </button>
              </div>
            )}
            {hasLandingJourneyActions && isLandingDecisionSlide && landingJourneyActions && (
              <div className="voiceup-story-decision-grid" aria-label={t("storyCarousel.landing.decision.aria")}>
                <article>
                  <h4>{t("storyCarousel.landing.decision.organizeTitle")}</h4>
                  <p>{t("storyCarousel.landing.decision.organizeText")}</p>
                  <button
                    type="button"
                    className="voiceup-story-cta voiceup-story-journey-cta"
                    onClick={() => handleLandingJourneyAction(landingJourneyActions.onOrganize, "organize")}
                  >
                    <Building2 size={16} /> {t("storyCarousel.landing.journey.organize")}
                  </button>
                </article>
                <article>
                  <h4>{t("storyCarousel.landing.decision.actTitle")}</h4>
                  <p>{t("storyCarousel.landing.decision.actText")}</p>
                  <button
                    type="button"
                    className="voiceup-story-cta voiceup-story-journey-cta"
                    onClick={() => handleLandingJourneyAction(landingJourneyActions.onAct, "act")}
                  >
                    <Bolt size={16} /> {t("storyCarousel.landing.journey.act")}
                  </button>
                </article>
                <button
                  type="button"
                  className="voiceup-story-link-button voiceup-story-decision-link"
                  onClick={() => {
                    if (landingJourneyActions.onExplore) {
                      handleLandingJourneyAction(landingJourneyActions.onExplore, "explore");
                    } else {
                      stopGuided();
                      setSilentPaused(true);
                    }
                  }}
                >
                  {t("storyCarousel.landing.journey.explore")}
                </button>
              </div>
            )}
          </div>
          <div className="voiceup-story-subtitles">
            <span>{t("storyCarousel.common.subtitles")}</span>
            <p>{narration}</p>
          </div>
        </div>
        <StoryVisualScene slideKey={slideKey} title={title} media={mediaBySlide[slideKey]} t={t} />
      </div>

      {narrationUnavailable && guidedActive && (
        <p className="voiceup-story-notice" role="status">{t("storyCarousel.common.narrationUnavailable")}</p>
      )}

      {isLanding && (
        <div className="voiceup-story-timer" aria-label={t("landing.saas.carousel.timer")}>
          <span className="voiceup-story-timer-countdown" aria-live="polite">{Math.max(0, Math.ceil(landingRemainingMs / 1000))}s</span>
          <div className="voiceup-story-timer-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((autoPlayMs - landingRemainingMs) / autoPlayMs) * 100)}>
            <span style={{ width: `${Math.max(0, Math.min(100, ((autoPlayMs - landingRemainingMs) / autoPlayMs) * 100))}%` }} />
          </div>
        </div>
      )}

      {isLanding && landingPaused && (
        <p className="voiceup-story-notice" role="status">
          {t("storyCarousel.common.pause")} - {t("storyCarousel.common.resume")}
        </p>
      )}

      <div className="voiceup-story-media" aria-label={t("storyCarousel.common.mediaAria")}>
        <span><Volume2 size={16} /> {t("storyCarousel.common.nativeNarration")}</span>
        <span><Video size={16} /> {t("storyCarousel.common.videoPlaceholder")}</span>
        <small>{t("storyCarousel.common.swipeHint")}</small>
      </div>

      <div className="voiceup-story-controls">
        <button type="button" className="voiceup-story-arrow" onClick={() => moveTo(activeIndex - 1, "controls")} aria-label={t("storyCarousel.common.previous")}>
          <ChevronLeft size={20} />
        </button>

        <span className="voiceup-story-count" aria-label={t("storyCarousel.common.progress")}>
          {activeIndex + 1} {t("storyCarousel.common.of")} {slides.length}
        </span>

        <div className="voiceup-story-dots" role="group" aria-label={t("storyCarousel.common.navigationAria")}>
          {slides.map((item, index) => (
            <button
              type="button"
              className={index === activeIndex ? "active" : ""}
              key={item}
              onClick={() => moveTo(index, "dots")}
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={`${t("storyCarousel.common.goTo")} ${index + 1}: ${customSlides?.[item]?.title ?? t(`storyCarousel.${experience}.slides.${item}.title`)}`}
              title={customSlides?.[item]?.title ?? t(`storyCarousel.${experience}.slides.${item}.title`)}
            />
          ))}
        </div>

        {isLanding ? (
          <div className="voiceup-story-guided-controls">
            <button type="button" className="voiceup-story-play" onClick={landingPaused ? resumeGuided : pauseGuided}>
              {landingPaused ? <Play size={17} /> : <Pause size={17} />}
              {t(landingPaused ? "storyCarousel.common.resume" : "storyCarousel.common.pause")}
            </button>
            <button type="button" className="voiceup-story-play" onClick={replayGuided}>
              <RotateCcw size={15} /> {t("storyCarousel.common.replay")}
            </button>
            <button
              type="button"
              className="voiceup-story-play"
              onClick={() => {
                if (isExploreMode) {
                  returnToGuidedStory();
                  return;
                }
                if (landingJourneyActions?.onExplore) {
                  handleLandingJourneyAction(landingJourneyActions.onExplore, "explore");
                } else {
                  openExploreMode("explore");
                }
              }}
            >
              {isExploreMode ? t("storyCarousel.common.replay") : t("storyCarousel.landing.journey.explore")}
            </button>
          </div>
        ) : guidedActive ? (
          <div className="voiceup-story-guided-controls">
            <button type="button" className="voiceup-story-play" onClick={guidedPaused ? resumeGuided : pauseGuided}>
              {guidedPaused ? <Play size={17} /> : <Pause size={17} />}
              {t(guidedPaused ? "storyCarousel.common.resume" : "storyCarousel.common.pause")}
            </button>
            <button type="button" className="voiceup-story-play" onClick={stopGuided}>
              <Square size={15} /> {t("storyCarousel.common.stop")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="voiceup-story-play voiceup-story-autoplay"
            onClick={() => {
              setSilentPaused((current) => {
                const nextPaused = !current;
                if (isLanding) {
                  if (nextPaused) {
                    setGuidedPaused(true);
                    trackLanding("landing_paused", "autoplay_toggle");
                  } else {
                    setGuidedPaused(false);
                    setLandingRemainingMs(autoPlayMs);
                    trackLanding("landing_resumed", "autoplay_toggle");
                  }
                }
                return nextPaused;
              });
            }}
            aria-pressed={silentPaused}
          >
            {silentPaused ? <Play size={17} /> : <Pause size={17} />}
            {t(silentPaused ? "storyCarousel.common.resumeAutoplay" : "storyCarousel.common.pauseAutoplay")}
          </button>
        )}

        <button type="button" className="voiceup-story-arrow" onClick={() => moveTo(activeIndex + 1, "controls")} aria-label={t("storyCarousel.common.next")}>
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
