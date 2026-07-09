import { lazy, Suspense, useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  ChevronDown,
  Copy,
  Download,
  Gift,
  GitBranch,
  Mail,
  Medal,
  MessageCircle,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards
} from "lucide-react";
import { ReferralQrPreview } from "../../components/ReferralQrPreview";
import { whatsAppLink, smsLink } from "../../utils/links";
import { simulateSupporterGrowth } from "../calculator";
import type { SupporterGrowthPortalViewModel } from "./types";
import {
  downloadReferralCardSvg,
  downloadSupporterReferralPoster,
  getCampaignJourneyDisplayName,
  getSupporterDisplayName
} from "./supporterPortalViewService";
import { SupporterPortalEngagementCard } from "../components/engagement/SupporterPortalEngagementCard";

const RewardCenter = lazy(() => import("../rewards/components/RewardCenter"));

interface SupporterGrowthPortalPageProps {
  portal: SupporterGrowthPortalViewModel;
  onRewardAction: (action: import("../rewards/rewardRuntimeService").RewardRuntimeAction) => void;
}

interface SupporterGrowthPortalNotFoundProps {
  message?: string;
  onRetry: () => void;
}

function formatDate(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatNumber(value: number | undefined) {
  return Math.max(0, Math.round(value ?? 0)).toLocaleString();
}

function firstInitial(value: string) {
  return (value.trim()[0] || "V").toUpperCase();
}

function metric(label: string, value: string | number, detail?: string) {
  return (
    <div className="supporter-portal-metric">
      <span>{label}</span>
      <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function SupporterGrowthPortalNotFound({ message, onRetry }: SupporterGrowthPortalNotFoundProps) {
  return (
    <main className="supporter-portal-shell">
      <section className="supporter-portal-empty">
        <UserRound size={42} />
        <span className="eyebrow">My Campaign Journey</span>
        <h1>Journey not found yet</h1>
        <p>{message ?? "This referral code is not connected to a signed supporter yet."}</p>
        <button className="primary-button" type="button" onClick={onRetry}>Retry</button>
      </section>
    </main>
  );
}

export function SupporterGrowthPortalLoading() {
  return (
    <main className="supporter-portal-shell">
      <section className="supporter-portal-skeleton" aria-live="polite" role="status">
        <span />
        <span />
        <span />
        <strong>Loading My Campaign Journey</strong>
      </section>
    </main>
  );
}

export function SupporterGrowthPortalPage({ portal, onRewardAction }: SupporterGrowthPortalPageProps) {
  const [copied, setCopied] = useState("");
  const [calculator, setCalculator] = useState({
    invites: 10,
    verificationRate: 50,
    volunteerRate: 20,
    treeLevels: 3
  });
  const displayName = getSupporterDisplayName(portal.supporter);
  const journeyDisplayName = getCampaignJourneyDisplayName(portal.campaign);
  const referralLink = portal.portal.referralLink;
  const progress = Math.min(100, Math.max(0, portal.progressPercentage));
  const projected = useMemo(() => {
    const result = simulateSupporterGrowth({
      invitedSupporters: calculator.invites,
      expectedVerificationRate: calculator.verificationRate,
      targetRecognitionLevel: portal.nextLevel,
      averageCreditsPerVerifiedSupporter: Math.max(1, portal.remainingCreditsNeeded / Math.max(1, portal.remainingReferralsNeeded || 1))
    });
    const verified = calculator.invites * (calculator.verificationRate / 100);
    return {
      ...result,
      projectedTreeSize: Math.round(
        Array.from({ length: Math.max(1, calculator.treeLevels) }).reduce<number>(
          (sum, _, index) => sum + Math.pow(Math.max(1, verified), index + 1),
          0
        )
      ),
      projectedCampaignInfluence: Math.round(verified * (1 + calculator.volunteerRate / 100) * Math.max(1, calculator.treeLevels))
    };
  }, [calculator, portal.nextLevel, portal.remainingCreditsNeeded, portal.remainingReferralsNeeded]);

  async function copy(value: string, label = "Copied") {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 2200);
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: portal.campaign.title,
          text: `Support ${portal.campaign.title} with me on VoiceUp.`,
          url: referralLink
        });
        return;
      } catch {
        // Fall back to copy if the native share sheet is dismissed or unavailable.
      }
    }
    await copy(referralLink, "Referral link copied");
  }

  return (
    <main className="supporter-portal-shell">
      <section className="supporter-portal-hero">
        <div className="supporter-avatar" aria-hidden="true">{firstInitial(displayName)}</div>
        <div>
          <span className="eyebrow">{journeyDisplayName}</span>
          <h1>{displayName}</h1>
          <p>{portal.campaign.title}</p>
          <div className="supporter-status-row">
            <span><BadgeCheck size={16} /> {portal.currentLevel?.badge ?? portal.currentLevel?.name ?? "Supporter"}</span>
            <span><WalletCards size={16} /> {formatNumber(portal.wallet.balance.walletCredits)} wallet credits</span>
            <span><Trophy size={16} /> Rank {portal.tree.currentRank ?? portal.leaderboards[0]?.rank ?? "New"}</span>
            <span><CalendarClock size={16} /> Joined {formatDate(portal.supporter.signedAt)}</span>
            <span><ShieldCheck size={16} /> {portal.supporter.otpVerified || portal.supporter.status === "verified" ? "Verified" : "Pending verification"}</span>
          </div>
        </div>
      </section>

      <section className="supporter-portal-grid">
        <article className="supporter-portal-card wide">
          <div className="supporter-card-heading">
            <Medal />
            <div>
              <span className="eyebrow">My Progress</span>
              <h2>{portal.currentLevel?.name ?? "Campaign Supporter"}</h2>
            </div>
          </div>
          <div className="supporter-progress-bar"><span style={{ width: `${progress}%` }} /></div>
          <div className="supporter-metric-grid">
            {metric("Next level", portal.nextLevel?.name ?? "Top level reached")}
            {metric("Wallet credits", portal.wallet.balance.walletCredits)}
            {metric("Promotion credits", portal.wallet.balance.promotionCredits)}
            {metric("Credits required", portal.creditsRequired)}
            {metric("Remaining referrals", portal.remainingReferralsNeeded)}
            {metric("Estimated promotion", portal.estimatedPromotionDate ? formatDate(portal.estimatedPromotionDate) : "Ready when criteria is met")}
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <QrCode />
            <div>
              <span className="eyebrow">My Referral Link</span>
              <h2>Invite supporters</h2>
            </div>
          </div>
          <ReferralQrPreview value={portal.portal.qrPayload} label="Personal QR" caption={portal.supporterCode} />
          <code className="supporter-referral-code">{referralLink}</code>
          <div className="supporter-share-grid">
            <button type="button" className="primary-button" onClick={shareNative}><Share2 size={16} /> Share</button>
            <button type="button" className="secondary-button" onClick={() => copy(referralLink, "Referral link copied")}><Copy size={16} /> Copy</button>
            <a className="secondary-link-button" href={whatsAppLink("", referralLink)} target="_blank" rel="noreferrer">WhatsApp</a>
            <a className="secondary-link-button" href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer">Telegram</a>
            <a className="secondary-link-button" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer">Facebook</a>
            <a className="secondary-link-button" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer">LinkedIn</a>
            <a className="secondary-link-button" href={smsLink("", referralLink)}>SMS</a>
            <a className="secondary-link-button" href={`mailto:?subject=${encodeURIComponent(portal.campaign.title)}&body=${encodeURIComponent(referralLink)}`}>Email</a>
            <button type="button" className="secondary-button" onClick={() => copy(`Support ${portal.campaign.title}: ${referralLink}`, "Instagram caption copied")}>Instagram</button>
            <button type="button" className="secondary-button" onClick={() => downloadReferralCardSvg({
              supporterName: displayName,
              campaignTitle: portal.campaign.title,
              currentLevelName: portal.currentLevel?.name,
              supporterCode: portal.supporterCode,
              referralLink,
              journeyDisplayName
            })}><Download size={16} /> Referral Card</button>
            <button type="button" className="secondary-button" onClick={() => downloadSupporterReferralPoster(portal)}><Download size={16} /> Poster</button>
          </div>
          {copied && <p className="success-message">{copied}</p>}
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <WalletCards />
            <div>
              <span className="eyebrow">My Wallet</span>
              <h2>{formatNumber(portal.wallet.balance.walletCredits)} credits</h2>
            </div>
          </div>
          <div className="supporter-metric-grid compact">
            {metric("Available", portal.wallet.balance.walletCredits)}
            {metric("Promotion", portal.wallet.balance.promotionCredits)}
            {metric("Contribution received", portal.wallet.balance.contributionCredits)}
            {metric("Contribution given", portal.wallet.balance.totalContributed)}
            {metric("Lifetime", portal.wallet.balance.totalEarned)}
            {metric("Pending", portal.wallet.balance.pendingPromotion)}
            {metric("Locked", 0)}
            {metric("Expired", 0)}
          </div>
          <div className="supporter-timeline compact-list">
            {portal.wallet.history.slice(0, 5).map((entry) => (
              <div key={entry.id}>
                <strong>{entry.delta >= 0 ? "+" : ""}{entry.delta} {entry.creditKind}</strong>
                <span>{formatDate(entry.timestamp)}</span>
              </div>
            ))}
            {portal.wallet.history.length === 0 && <p className="helper-text">Recent wallet transactions appear after growth activity.</p>}
          </div>
        </article>

        <article className="supporter-portal-card wide">
          <Suspense fallback={<div className="supporter-portal-skeleton"><span /><span /><span /><strong>Loading rewards</strong></div>}>
            <RewardCenter
              model={portal.rewardCenter}
              campaignId={portal.campaign.id}
              supporterId={portal.supporter.id}
              onAction={onRewardAction}
            />
          </Suspense>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <Award />
            <div>
              <span className="eyebrow">My Recognition</span>
              <h2>{portal.currentLevel?.name ?? "Supporter"}</h2>
            </div>
          </div>
          <p>{portal.currentLevel?.description ?? "Keep sharing your referral link to unlock recognition."}</p>
          <div className="supporter-pill-row">
            <span>{portal.currentLevel?.certificate ? "Certificate eligible" : "Certificate locked"}</span>
            <span>{portal.currentLevel?.prizeEligibility ? "Prize eligible" : "Prize locked"}</span>
            <span>Next badge: {portal.nextLevel?.badge ?? "Complete"}</span>
          </div>
          <ul className="supporter-benefit-list">
            {(portal.currentLevel?.privileges.length ? portal.currentLevel.privileges : ["Share link", "Build referral tree", "Track campaign impact"]).map((item) => (
              <li key={item}><Sparkles size={15} /> {item}</li>
            ))}
          </ul>
        </article>

        <SupporterPortalEngagementCard portal={portal} />

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <Gift />
            <div>
              <span className="eyebrow">My Achievements</span>
              <h2>{portal.achievements.length} unlocked</h2>
            </div>
          </div>
          <div className="supporter-timeline compact-list">
            {portal.achievements.slice(0, 5).map((achievement) => (
              <div key={achievement.id}>
                <strong>{achievement.prizeDescription}</strong>
                <span>Rank {achievement.rank} - {formatDate(achievement.qualifiedAt)}</span>
              </div>
            ))}
            {portal.achievements.length === 0 && <p className="helper-text">Achievements, certificates, badges, and prizes appear as your campaign influence grows.</p>}
          </div>
          <div className="supporter-pill-row">
            <span>{portal.prizes.length} prizes earned</span>
            <span>{portal.currentLevel?.certificate ? "Certificate ready" : "Certificate upcoming"}</span>
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <GitBranch />
            <div>
              <span className="eyebrow">My Referral Tree</span>
              <h2>{portal.tree.nodes.length} supporters</h2>
            </div>
          </div>
          <div className="supporter-tree-summary">
            {metric("Direct", portal.tree.network.directNetwork)}
            {metric("Indirect", portal.tree.network.indirectNetwork)}
            {metric("Depth", Math.max(...portal.tree.nodes.map((node) => node.depth), 0))}
          </div>
          <div className="supporter-tree">
            {portal.tree.nodes.slice(0, 12).map((node) => (
              <details key={`${node.supporterId}-${node.depth}`} open={node.depth < 2}>
                <summary><ChevronDown size={16} /> {node.depth === 0 ? "Me" : `Level ${node.depth}`} <span>{node.referralCode ?? node.supporterId}</span></summary>
                <p>{node.directChildren} direct referrals - {node.verifiedReferrals} verified</p>
              </details>
            ))}
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <CalendarClock />
            <div>
              <span className="eyebrow">My Timeline</span>
              <h2>Growth events</h2>
            </div>
          </div>
          <div className="supporter-timeline">
            {portal.timeline.slice(0, 8).map((event) => (
              <div key={event.id}>
                <strong>{event.title}</strong>
                <span>{event.description}</span>
                <small>{formatDate(event.timestamp)}</small>
              </div>
            ))}
            {portal.timeline.length === 0 && <p className="helper-text">Your joined, verified, referral, promotion, and wallet events will appear here.</p>}
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <BarChart3 />
            <div>
              <span className="eyebrow">Leaderboard</span>
              <h2>Campaign position</h2>
            </div>
          </div>
          <div className="supporter-leaderboards">
            {portal.leaderboards.slice(0, 5).map((leaderboard) => (
              <div key={leaderboard.filter}>
                <span>{leaderboard.label}</span>
                <strong>{leaderboard.rank ? `#${leaderboard.rank}` : "Building"}</strong>
                <small>{formatNumber(leaderboard.score)} score</small>
              </div>
            ))}
          </div>
        </article>

        <article className="supporter-portal-card wide">
          <div className="supporter-card-heading">
            <Sparkles />
            <div>
              <span className="eyebrow">Growth Calculator</span>
              <h2>What if I invite more people?</h2>
            </div>
          </div>
          <div className="supporter-calculator-grid">
            <label>Invites<input type="number" min="1" value={calculator.invites} onChange={(event) => setCalculator({ ...calculator, invites: Number(event.target.value) })} /></label>
            <label>Verify %<input type="number" min="0" max="100" value={calculator.verificationRate} onChange={(event) => setCalculator({ ...calculator, verificationRate: Number(event.target.value) })} /></label>
            <label>Volunteer %<input type="number" min="0" max="100" value={calculator.volunteerRate} onChange={(event) => setCalculator({ ...calculator, volunteerRate: Number(event.target.value) })} /></label>
            <label>Tree levels<input type="number" min="1" max="7" value={calculator.treeLevels} onChange={(event) => setCalculator({ ...calculator, treeLevels: Number(event.target.value) })} /></label>
          </div>
          <div className="supporter-metric-grid">
            {metric("Projected wallet", projected.expectedWallet)}
            {metric("Promotion progress", `${formatNumber(projected.expectedPromotion)}%`)}
            {metric("Contribution", projected.expectedContribution)}
            {metric("Recognition", projected.expectedRecognition ?? "Keep growing")}
            {metric("Tree size", projected.projectedTreeSize)}
            {metric("Campaign influence", projected.projectedCampaignInfluence)}
          </div>
          <p className="helper-text">Projection only. Calculator results never modify real balances.</p>
        </article>

        <article className="supporter-portal-card wide">
          <div className="supporter-card-heading">
            <Trophy />
            <div>
              <span className="eyebrow">My Impact</span>
              <h2>Campaign influence</h2>
            </div>
          </div>
          <div className="supporter-metric-grid">
            {metric("Verified referrals", portal.impact.verifiedReferrals)}
            {metric("Signatures influenced", portal.impact.signaturesInfluenced)}
            {metric("Volunteer influence", portal.impact.volunteerInfluence)}
            {metric("Events attended", portal.impact.eventsAttended)}
            {metric("Campaign reach", portal.impact.campaignReach)}
            {metric("Social reach", portal.impact.estimatedSocialReach)}
            {metric("Goal contribution", `${formatNumber(portal.impact.campaignGoalContribution)}%`)}
          </div>
        </article>
      </section>

      <nav className="supporter-bottom-share" aria-label="Supporter sharing">
        <button type="button" onClick={shareNative}><Share2 size={18} /> Share</button>
        <a href={whatsAppLink("", referralLink)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>
        <button type="button" onClick={() => copy(referralLink, "Referral link copied")}><Copy size={18} /> Copy</button>
        <a href={`mailto:?subject=${encodeURIComponent(portal.campaign.title)}&body=${encodeURIComponent(referralLink)}`}><Mail size={18} /> Email</a>
      </nav>
    </main>
  );
}
