import type { AuthorityRule, Campaign } from "../types";
import type { getCampaignMetrics } from "../lib";
import { useTranslation } from "../i18n";

interface HeroProps {
  campaign: Campaign;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authority?: AuthorityRule;
}

export function Hero({ campaign, metrics, authority }: HeroProps) {
  const { language, t } = useTranslation();
  return (
    <div className="hero">
      <div>
        <span className="status-pill" data-status={campaign.status}>{t(`campaignAdmin.status.${campaign.status.toLowerCase()}`)}</span>
        <h1>{campaign.title}</h1>
        {language !== "en" && <span className="original-language-notice">{t("public.originalLanguageNotice")}</span>}
        <p>{campaign.description}</p>
        <div className="button-row">
          <span className="status-pill">{campaign.category}</span>
          <span className="status-pill">{campaign.location}</span>
          {authority && <span className="status-pill">{authority.name}</span>}
        </div>
      </div>
      <div className="hero-progress">
        <strong>{metrics.progress}%</strong>
        <span>{t("campaignAdmin.dashboard.freeze.actions.verifiedSignatures").replace("{count}", metrics.verified.toLocaleString())}</span>
        <div className="progress">
          <div style={{ width: `${metrics.progress}%` }} />
        </div>
      </div>
    </div>
  );
}
