import { ArrowRight, Share2, Sparkles, Trophy } from "lucide-react";
import type { SupporterGrowthPortalViewModel } from "../../supporter/types";
import { ProgressRing, StatusBadge } from "../../ui";

function formatNumber(value: number | undefined) {
  return Math.max(0, Math.round(value ?? 0)).toLocaleString();
}

export function SupporterPortalEngagementCard({ portal }: { portal: SupporterGrowthPortalViewModel }) {
  const activeDays = Array.from(new Set(portal.timeline.map((event) => event.timestamp.slice(0, 10)))).length;
  const streak = Math.max(0, Math.min(30, activeDays));
  const rank = portal.leaderboards.find((item) => item.filter === "overall")?.rank;
  const regionalRank = rank ? `Top ${Math.min(99, Math.max(5, rank * 3))}%` : "Building";
  const nationalRank = rank ? `Top ${Math.min(99, Math.max(10, rank * 5))}%` : "Building";
  const influenceScore = Math.round(
    portal.impact.signaturesInfluenced * 1.2 + portal.impact.verifiedReferrals * 2 + portal.wallet.balance.walletCredits * 0.4
  );

  return (
    <article className="supporter-portal-card">
      <div className="supporter-card-heading">
        <Sparkles />
        <div>
          <span className="eyebrow">Campaign Engagement Hub</span>
          <h2>Momentum for your referral journey</h2>
        </div>
      </div>
      <div className="supporter-metric-grid compact">
        <div className="supporter-portal-metric">
          <span>Current streak</span>
          <strong>{streak} days</strong>
          <small>Keep the momentum alive</small>
        </div>
        <div className="supporter-portal-metric">
          <span>Wallet credits</span>
          <strong>{formatNumber(portal.wallet.balance.walletCredits)}</strong>
          <small>Ready for recognition</small>
        </div>
        <div className="supporter-portal-metric">
          <span>Next milestone</span>
          <strong>{portal.nextLevel?.name ?? "Champion"}</strong>
          <small>{portal.remainingReferralsNeeded} referrals away</small>
        </div>
        <div className="supporter-portal-metric">
          <span>Influence score</span>
          <strong>{formatNumber(influenceScore)}</strong>
          <small>Derived from referral tree and wallet</small>
        </div>
      </div>
      <div className="supporter-pill-row">
        <span><Trophy size={14} /> {portal.currentLevel?.name ?? "Supporter"}</span>
        <span><Share2 size={14} /> Share-ready cards</span>
      </div>
      <div className="supporter-metric-grid compact">
        <div className="supporter-portal-metric">
          <span>Current rank</span>
          <strong>{rank ? `#${rank}` : "Unranked"}</strong>
          <small>Overall campaign leaderboard</small>
        </div>
        <div className="supporter-portal-metric">
          <span>Regional rank</span>
          <strong>{regionalRank}</strong>
          <small>Region percentile estimate</small>
        </div>
        <div className="supporter-portal-metric">
          <span>National rank</span>
          <strong>{nationalRank}</strong>
          <small>National percentile estimate</small>
        </div>
        <div className="supporter-portal-metric">
          <span>Progress</span>
          <div className="supporter-inline-progress-ring">
            <ProgressRing value={portal.progressPercentage} size={58} stroke={7} label="Progress to next level" />
          </div>
          <small>{portal.remainingCreditsNeeded} credits to next level</small>
        </div>
      </div>
      <p>Announcements stay visible here so supporters see the latest campaign momentum, volunteer asks, and achievements.</p>
      <div className="supporter-pill-row">
        <StatusBadge label={portal.achievements.length > 0 ? "Achievement unlocked" : "First achievement pending"} tone={portal.achievements.length > 0 ? "good" : "warning"} />
        <StatusBadge label={portal.prizes.length > 0 ? "Upcoming reward" : "Reward path active"} tone="info" />
      </div>
      <div className="supporter-share-grid">
        <button className="secondary-button" type="button">Daily target <ArrowRight size={14} /></button>
        <button className="secondary-button" type="button">Volunteer call <ArrowRight size={14} /></button>
      </div>
    </article>
  );
}
