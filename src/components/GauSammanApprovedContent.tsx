import { useEffect, useMemo, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { Language } from "../i18n";
import { useTranslation } from "../i18n";
import type { PublicCampaignPresentationCopy } from "../config/publicCampaignPresentation";
import type { getCampaignMetrics } from "../lib";

interface GauSammanShareLinks {
  whatsapp: string;
  facebook: string;
  x: string;
  telegram: string;
}

interface GauSammanApprovedContentProps {
  copy: PublicCampaignPresentationCopy;
  language: Language;
  metrics: ReturnType<typeof getCampaignMetrics>;
  lastUpdatedLabel?: string;
  variant?: "cards" | "closing";
  shareLinks?: GauSammanShareLinks;
  onShareClick?: (channel: "whatsapp" | "facebook" | "telegram" | "x") => void;
}

function speechLocale(language: Language): string {
  if (language === "hi") return "hi-IN";
  if (language === "or") return "or-IN";
  return "en-IN";
}

function SectionAudioButton({
  text,
  copy
}: {
  text: string;
  copy: PublicCampaignPresentationCopy;
}) {
  const { language } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(false);
  }, [language, text]);

  if (!supported) {
    return (
      <button type="button" className="public-gau-audio" disabled aria-label={copy.audioUnavailable}>
        <VolumeX size={14} />
        <span>{copy.audioOff}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="public-gau-audio"
      aria-pressed={playing}
      onClick={() => {
        if (playing) {
          window.speechSynthesis.cancel();
          setPlaying(false);
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = speechLocale(language);
        utterance.onend = () => setPlaying(false);
        utterance.onerror = () => setPlaying(false);
        setPlaying(true);
        window.speechSynthesis.speak(utterance);
      }}
    >
      {playing ? <Volume2 size={14} /> : <VolumeX size={14} />}
      <span>{playing ? copy.audioOn : copy.audioOff}</span>
    </button>
  );
}

export function GauSammanApprovedContent({
  copy,
  language,
  metrics,
  lastUpdatedLabel,
  variant = "cards",
  shareLinks,
  onShareClick
}: GauSammanApprovedContentProps) {
  const { t } = useTranslation();
  const numberLocale = language === "hi" ? "hi-IN" : language === "or" ? "or-IN" : "en-IN";
  const stats = useMemo(
    () => [
      { key: "online", label: copy.statOnline, value: metrics.online },
      { key: "hardcopy", label: copy.statHardcopy, value: metrics.scanned },
      { key: "verified", label: copy.statVerified, value: metrics.verified },
      { key: "total", label: copy.statTotal, value: metrics.total },
      { key: "progress", label: copy.statProgress, value: metrics.progress, suffix: "%" }
    ],
    [copy, metrics]
  );

  if (variant === "cards") {
    return (
      <div className="public-gau-cards">
        <article className="public-gau-card">
          <div className="public-gau-card-head">
            <h2>{copy.kamadhenuTitle}</h2>
            <SectionAudioButton text={`${copy.kamadhenuTitle}. ${copy.kamadhenuBody}`} copy={copy} />
          </div>
          <p>{copy.kamadhenuBody}</p>
        </article>
        <article className="public-gau-card">
          <div className="public-gau-card-head">
            <h2>{copy.nandiTitle}</h2>
            <SectionAudioButton text={`${copy.nandiTitle}. ${copy.nandiBody}`} copy={copy} />
          </div>
          <p>{copy.nandiBody}</p>
        </article>
        <article className="public-gau-card">
          <div className="public-gau-card-head">
            <h2>{copy.panchagavyaTitle}</h2>
            <SectionAudioButton
              text={`${copy.panchagavyaTitle}. ${copy.panchagavyaBody} ${copy.panchagavyaItems.join(", ")}`}
              copy={copy}
            />
          </div>
          <p>{copy.panchagavyaBody}</p>
          <ul className="public-gau-panchagavya">
            {copy.panchagavyaItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    );
  }

  return (
    <div className="public-gau-closing">
      <section className="public-gau-mid-cta" aria-labelledby="gau-mid-cta-heading">
        <h2 id="gau-mid-cta-heading">{copy.midCta}</h2>
        <p>{copy.midCtaHelp}</p>
      </section>

      <section className="public-gau-pillars" aria-labelledby="gau-pillars-heading">
        <h2 id="gau-pillars-heading" className="sr-only">
          {copy.journeyTitle}
        </h2>
        <ol>
          {copy.pillars.map((pillar, index) => (
            <li key={pillar}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{pillar}</strong>
            </li>
          ))}
        </ol>
        {shareLinks ? (
          <div className="public-gau-social" aria-label={t("public.shareThisCampaign")}>
            <a href={shareLinks.whatsapp} target="_blank" rel="noreferrer" onClick={() => onShareClick?.("whatsapp")}>
              WhatsApp
            </a>
            <a href={shareLinks.facebook} target="_blank" rel="noreferrer" onClick={() => onShareClick?.("facebook")}>
              Facebook
            </a>
            <a href={shareLinks.telegram} target="_blank" rel="noreferrer" onClick={() => onShareClick?.("telegram")}>
              Telegram
            </a>
            <a href={shareLinks.x} target="_blank" rel="noreferrer" onClick={() => onShareClick?.("x")}>
              X
            </a>
          </div>
        ) : null}
      </section>

      <section className="public-gau-purpose" aria-labelledby="gau-purpose-heading">
        <h2 id="gau-purpose-heading">{copy.purposeTitle}</h2>
        <p>{copy.purposeBody}</p>
      </section>

      <div className="public-gau-bottom-grid">
        <section className="public-gau-card" aria-labelledby="gau-objectives-heading">
          <div className="public-gau-card-head">
            <h2 id="gau-objectives-heading">{copy.objectivesTitle}</h2>
            <SectionAudioButton text={`${copy.objectivesTitle}. ${copy.objectives.join(". ")}`} copy={copy} />
          </div>
          <ol className="public-gau-checklist">
            {copy.objectives.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section className="public-gau-stats" aria-labelledby="gau-stats-heading">
          <h2 id="gau-stats-heading">{copy.signatureStatusTitle}</h2>
          <p>{copy.liveDataNote}</p>
          <div className="public-gau-stat-grid">
            {stats.map((stat) => (
              <article key={stat.key}>
                <strong>
                  {stat.value.toLocaleString(numberLocale)}
                  {stat.suffix ?? ""}
                </strong>
                <span>{stat.label}</span>
              </article>
            ))}
          </div>
          {lastUpdatedLabel ? (
            <p className="public-gau-updated">
              {copy.lastUpdatedLabel}: {lastUpdatedLabel}
            </p>
          ) : null}
        </section>

        <section className="public-gau-card" aria-labelledby="gau-pledges-heading">
          <div className="public-gau-card-head">
            <h2 id="gau-pledges-heading">{copy.pledgesTitle}</h2>
            <SectionAudioButton text={`${copy.pledgesTitle}. ${copy.pledges.join(". ")}`} copy={copy} />
          </div>
          <ol className="public-gau-checklist public-gau-pledges">
            {copy.pledges.map((item, index) => (
              <li key={item}>
                <span>{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="public-gau-footer">
        <p>{copy.footerStatement}</p>
        <strong>{copy.footerInvocation}</strong>
      </footer>
    </div>
  );
}
