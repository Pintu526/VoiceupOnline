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
  ArrowRight,
  BarChart3,
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

interface VoiceUpStoryCarouselProps {
  experience: VoiceUpStoryExperience;
  autoPlayMs?: number;
  className?: string;
  slideIds?: readonly string[];
  actions?: Partial<Record<string, VoiceUpStoryAction>>;
  mediaBySlide?: Partial<Record<string, VoiceUpStoryMedia>>;
}

const experienceSlides: Record<VoiceUpStoryExperience, readonly string[]> = {
  landing: [
    "campaignCreation",
    "paperDigitization",
    "supporters",
    "volunteers",
    "timeline",
    "transparency",
    "reports",
    "aiCopilot"
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
  mediaBySlide = {}
}: VoiceUpStoryCarouselProps) {
  const { language, t } = useTranslation();
  const slides = useMemo(
    () => (slideIds?.length ? [...slideIds] : [...experienceSlides[experience]]),
    [experience, slideIds]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [silentPaused, setSilentPaused] = useState(false);
  const [isHoverPaused, setIsHoverPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [guidedActive, setGuidedActive] = useState(false);
  const [guidedPaused, setGuidedPaused] = useState(false);
  const [guidedCompleted, setGuidedCompleted] = useState(false);
  const [narrationUnavailable, setNarrationUnavailable] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const pointerStartX = useRef<number | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const fallbackStartedAt = useRef(0);
  const fallbackRemaining = useRef(0);
  const finishNarration = useRef<() => void>(() => undefined);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  useEffect(() => () => cancelNarration(), [cancelNarration]);

  useEffect(() => {
    setActiveIndex(0);
    setSilentPaused(reducedMotion);
    setGuidedActive(false);
    setGuidedPaused(false);
    setGuidedCompleted(false);
    cancelNarration();
  }, [cancelNarration, experience, reducedMotion, slides.length]);

  const showNextSilent = useCallback(() => {
    setActiveIndex((current) => (current + 1) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (silentPaused || isHoverPaused || isFocusPaused || guidedActive || reducedMotion) return;
    const intervalId = window.setInterval(showNextSilent, autoPlayMs);
    return () => window.clearInterval(intervalId);
  }, [autoPlayMs, guidedActive, isFocusPaused, isHoverPaused, reducedMotion, showNextSilent, silentPaused]);

  const slideKey = slides[Math.min(activeIndex, slides.length - 1)];
  const title = t(`storyCarousel.${experience}.slides.${slideKey}.title`);
  const description = t(`storyCarousel.${experience}.slides.${slideKey}.description`);
  const narration = t(`storyCarousel.${experience}.slides.${slideKey}.narration`);
  const activeAction = actions[slideKey];

  useEffect(() => {
    if (!guidedActive) return;
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
  }, [activeIndex, cancelNarration, guidedActive, language, narration, scheduleFallback, slides.length, voices]);

  function moveTo(index: number) {
    setSilentPaused(true);
    cancelNarration();
    setActiveIndex((index + slides.length) % slides.length);
  }

  function startGuided() {
    cancelNarration();
    setSilentPaused(true);
    setGuidedCompleted(false);
    setGuidedPaused(false);
    setGuidedActive(true);
  }

  function pauseGuided() {
    setGuidedPaused(true);
    if ("speechSynthesis" in window && utteranceRef.current) window.speechSynthesis.pause();
    if (fallbackTimer.current !== null) {
      fallbackRemaining.current = Math.max(500, fallbackRemaining.current - (Date.now() - fallbackStartedAt.current));
      clearFallbackTimer();
    }
  }

  function resumeGuided() {
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
  }

  function replayGuided() {
    cancelNarration();
    setActiveIndex(0);
    setGuidedCompleted(false);
    setGuidedPaused(false);
    setGuidedActive(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTo(activeIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(slides.length - 1);
    }
  }

  function handleFocusLeave(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusPaused(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") pointerStartX.current = event.clientX;
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (pointerStartX.current === null) return;
    const distance = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(distance) < 48) return;
    moveTo(distance > 0 ? activeIndex - 1 : activeIndex + 1);
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
      onMouseEnter={() => setIsHoverPaused(true)}
      onMouseLeave={() => setIsHoverPaused(false)}
      onFocusCapture={() => setIsFocusPaused(true)}
      onBlurCapture={handleFocusLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { pointerStartX.current = null; }}
    >
      <div className="voiceup-story-header">
        <div>
          <span className="eyebrow">{t(`storyCarousel.${experience}.eyebrow`)}</span>
          <h2>{t(`storyCarousel.${experience}.title`)}</h2>
          <p>{t(`storyCarousel.${experience}.subtitle`)}</p>
        </div>
        {!guidedActive && !guidedCompleted && (
          <button type="button" className="voiceup-story-guided-start" onClick={startGuided}>
            <Volume2 size={19} /> {t(`storyCarousel.${experience}.playLabel`)}
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
            {activeAction && (
              <button
                type="button"
                className="voiceup-story-cta"
                onClick={() => { stopGuided(); activeAction.onClick(); }}
              >
                {activeAction.label} <ArrowRight size={16} />
              </button>
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

      <div className="voiceup-story-media" aria-label={t("storyCarousel.common.mediaAria")}>
        <span><Volume2 size={16} /> {t("storyCarousel.common.nativeNarration")}</span>
        <span><Video size={16} /> {t("storyCarousel.common.videoPlaceholder")}</span>
        <small>{t("storyCarousel.common.swipeHint")}</small>
      </div>

      <div className="voiceup-story-controls">
        <button type="button" className="voiceup-story-arrow" onClick={() => moveTo(activeIndex - 1)} aria-label={t("storyCarousel.common.previous")}>
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
              onClick={() => moveTo(index)}
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={`${t("storyCarousel.common.goTo")} ${index + 1}: ${t(`storyCarousel.${experience}.slides.${item}.title`)}`}
              title={t(`storyCarousel.${experience}.slides.${item}.title`)}
            />
          ))}
        </div>

        {guidedActive ? (
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
            onClick={() => setSilentPaused((current) => !current)}
            aria-pressed={silentPaused}
          >
            {silentPaused ? <Play size={17} /> : <Pause size={17} />}
            {t(silentPaused ? "storyCarousel.common.resumeAutoplay" : "storyCarousel.common.pauseAutoplay")}
          </button>
        )}

        <button type="button" className="voiceup-story-arrow" onClick={() => moveTo(activeIndex + 1)} aria-label={t("storyCarousel.common.next")}>
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
