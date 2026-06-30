import type { AuthorityRule, Campaign } from "../types";
import type { getCampaignMetrics } from "../lib";

interface HeroProps {
  campaign: Campaign;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authority?: AuthorityRule;
}

export function Hero({ campaign, metrics, authority }: HeroProps) {
  return (
    <div className="hero">
      <div>
        <span className="status-pill" data-status={campaign.status}>{campaign.status}</span>
        <h1>{campaign.title}</h1>
        <p>{campaign.description}</p>
        <div className="button-row">
          <span className="status-pill">{campaign.category}</span>
          <span className="status-pill">{campaign.location}</span>
          {authority && <span className="status-pill">{authority.name}</span>}
        </div>
      </div>
      <div className="hero-progress">
        <strong>{metrics.progress}%</strong>
        <span>{metrics.verified.toLocaleString()} verified signatures</span>
        <div className="progress">
          <div style={{ width: `${metrics.progress}%` }} />
        </div>
      </div>
    </div>
  );
}
