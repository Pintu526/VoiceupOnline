import { useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  Gift,
  GitBranch,
  Mail,
  MessageCircle,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  WalletCards
} from "lucide-react";
import type { Campaign, Organization, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { ReferralQrPreview } from "../../components/ReferralQrPreview";
import { getCampaignGoalValue } from "../../utils/campaign";
import { smsLink, whatsAppLink } from "../../utils/links";
import type { GrowthShareContext, GrowthSupporterSnapshot } from "../lifecycle";
import type { SupporterGrowthPortalModel } from "../tree";
import { simulateSupporterGrowth } from "../calculator";
import {
  downloadReferralCardSvg,
  getCampaignJourneyDisplayName,
  getSupporterDisplayName
} from "./supporterPortalViewService";

interface ViralShareMessages {
  whatsapp: string;
  sms: string;
  emailSubject: string;
  emailBody: string;
  social: string;
  instagramCaption: string;
}

interface ViralPostSignExperienceProps {
  campaign: Campaign;
  organization?: Organization;
  signer: Signer;
  campaignSigners: Signer[];
  metrics: ReturnType<typeof getCampaignMetrics>;
  growthSnapshot?: GrowthSupporterSnapshot;
  growthPortal?: SupporterGrowthPortalModel;
  personalReferralUrl: string;
  personalReferralCode: string;
  shareMessages: ViralShareMessages;
  shareClicks: number;
  copiedReferral: string;
  publicMessage: string;
  onTrackShareClick: (channel: GrowthShareContext["channel"]) => void;
  onCopyReferralText: (label: string, value: string, channel?: GrowthShareContext["channel"]) => void;
  onShareNatively: () => void;
  onDownloadQrPoster: () => void;
  onPrintPoster: () => void;
  onDownloadAppealPdf: () => void;
}

function formatNumber(value: number | undefined) {
  return Math.max(0, Math.round(value ?? 0)).toLocaleString();
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] || "A supporter";
}

function getRecentActivity(signers: Signer[], campaignId: string) {
  return signers
    .filter((signer) => signer.campaignId === campaignId)
    .slice(0, 5)
    .map((signer) => ({
      id: signer.id,
      label: `${getFirstName(signer.name)} ${signer.otpVerified || signer.status === "verified" ? "verified" : "joined"}`,
      detail: signer.referredBy || signer.referredByPhoneOrCode ? "Referral activity" : "Campaign activity"
    }));
}

function getNextGoal(options: {
  growthSnapshot?: GrowthSupporterSnapshot;
  walletCredits: number;
  promotionCredits: number;
  levelName?: string;
  signer: Signer;
}) {
  if (!options.signer.email) return "Complete your profile with email";
  if ((options.growthSnapshot?.children.length ?? 0) < 3) return "Invite 3 more supporters";
  if (options.promotionCredits < 150) return `Earn ${formatNumber(150 - options.promotionCredits)} more promotion credits`;
  if (options.levelName) return `Reach the next level after ${options.levelName}`;
  return "Unlock your next badge";
}

function metric(label: string, value: string | number, detail?: string) {
  return (
    <div className="viral-metric">
      <span>{label}</span>
      <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function ViralPostSignExperience({
  campaign,
  organization,
  signer,
  campaignSigners,
  metrics,
  growthSnapshot,
  growthPortal,
  personalReferralUrl,
  personalReferralCode,
  shareMessages,
  shareClicks,
  copiedReferral,
  publicMessage,
  onTrackShareClick,
  onCopyReferralText,
  onShareNatively,
  onDownloadQrPoster,
  onPrintPoster,
  onDownloadAppealPdf
}: ViralPostSignExperienceProps) {
  const [projectionInvites, setProjectionInvites] = useState(10);
  const [contactConsent, setContactConsent] = useState(false);
  const [contactMessage, setContactMessage] = useState(shareMessages.sms);
  const [contactStatus, setContactStatus] = useState("");
  const journeyDisplayName = getCampaignJourneyDisplayName(campaign);
  const supporterName = getSupporterDisplayName(signer);
  const wallet = growthPortal?.wallet.balance;
  const walletCredits = wallet?.walletCredits ?? growthSnapshot?.lifetimeGrowth ?? 5;
  const promotionCredits = wallet?.promotionCredits ?? 0;
  const contributionCredits = wallet?.contributionCredits ?? growthSnapshot?.contributionReceived ?? 0;
  const lifetimeCredits = wallet?.totalEarned ?? growthSnapshot?.lifetimeGrowth ?? walletCredits;
  const pendingCredits = wallet?.pendingPromotion ?? 0;
  const earnedCredits = Math.max(5, Math.round(growthSnapshot?.todayGrowth || walletCredits || 5));
  const levelName = growthSnapshot?.currentRecognitionLevelName ?? growthPortal?.tree.currentRecognition ?? "Campaign Starter";
  const rank = growthSnapshot?.leaderboardPosition ?? growthPortal?.tree.currentRank;
  const campaignGoal = getCampaignGoalValue(campaign);
  const recentActivity = getRecentActivity(campaignSigners, campaign.id);
  const progress = Math.min(100, Math.max(metrics.progress, growthPortal?.tree.promotionProgress ?? 0));
  const projection = useMemo(
    () =>
      simulateSupporterGrowth({
        invitedSupporters: projectionInvites,
        expectedVerificationRate: 50,
        averageCreditsPerVerifiedSupporter: 10
      }),
    [projectionInvites]
  );
  const treeSize = growthPortal?.tree.nodes.length ?? growthSnapshot?.children.length ?? 1;
  const peopleJoinedBecauseOfYou = growthSnapshot?.children.length ?? growthPortal?.tree.network.directNetwork ?? 0;
  const impactScore = Math.round(walletCredits + peopleJoinedBecauseOfYou * 12 + metrics.progress);
  const nextGoal = getNextGoal({ growthSnapshot, walletCredits, promotionCredits, levelName, signer });
  const journeyPath = growthPortal?.publicPath ?? (personalReferralCode ? `/r/${personalReferralCode}` : "");

  return (
    <div className="viral-post-sign">
      <section className="viral-celebration-card" aria-live="polite">
        <div className="celebration-sparkles" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <span className="eyebrow">Congratulations</span>
          <h2>{supporterName}, your voice is live.</h2>
          <p>{publicMessage || `You have joined ${campaign.title}. Keep the momentum going by inviting people you trust.`}</p>
        </div>
        <div className="viral-credit-burst">
          <Sparkles size={20} />
          <strong>+{formatNumber(earnedCredits)}</strong>
          <span>Credits Earned</span>
        </div>
        <div className="viral-badge-strip">
          <span><Award size={16} /> {levelName}</span>
          <span><WalletCards size={16} /> {formatNumber(walletCredits)} available</span>
          <span><Trophy size={16} /> {rank ? `Rank #${rank}` : "Rank building"}</span>
        </div>
        <div className="viral-progress">
          <div><span style={{ width: `${progress}%` }} /></div>
          <small>{formatNumber(metrics.verified)} verified of {formatNumber(campaignGoal)} goal</small>
        </div>
      </section>

      <section className="viral-grid">
        <article className="viral-card viral-next-goal">
          <div className="viral-card-heading">
            <Target />
            <div>
              <span className="eyebrow">Next goal</span>
              <h3>{nextGoal}</h3>
            </div>
          </div>
          <p>One clear action keeps your campaign journey moving.</p>
        </article>

        <article className="viral-card">
          <div className="viral-card-heading">
            <WalletCards />
            <div>
              <span className="eyebrow">Wallet</span>
              <h3>Credits summary</h3>
            </div>
          </div>
          <div className="viral-metric-grid">
            {metric("Available Credits", walletCredits)}
            {metric("Promotion Credits", promotionCredits)}
            {metric("Contribution Credits", contributionCredits)}
            {metric("Lifetime Credits", lifetimeCredits)}
            {metric("Pending Credits", pendingCredits)}
          </div>
        </article>

        <article className="viral-card viral-referral-preview">
          <div className="viral-card-heading">
            <QrCode />
            <div>
              <span className="eyebrow">Referral experience</span>
              <h3>Your personal invite</h3>
            </div>
          </div>
          <ReferralQrPreview value={personalReferralUrl} label="Personal QR" caption={personalReferralCode} compact />
          <code>{personalReferralUrl}</code>
          <div className="viral-referral-card-preview">
            <strong>{supporterName} invited you</strong>
            <p>{shareMessages.social}</p>
          </div>
          <div className="viral-share-grid">
            <a className="secondary-link-button" href={whatsAppLink("", shareMessages.whatsapp)} target="_blank" rel="noreferrer" onClick={() => onTrackShareClick("whatsapp")}>WhatsApp</a>
            <a className="secondary-link-button" href={smsLink("", shareMessages.sms)} onClick={() => onTrackShareClick("sms")}>SMS</a>
            <a className="secondary-link-button" href={`https://t.me/share/url?url=${encodeURIComponent(personalReferralUrl)}&text=${encodeURIComponent(shareMessages.social)}`} target="_blank" rel="noreferrer" onClick={() => onTrackShareClick("telegram")}>Telegram</a>
            <a className="secondary-link-button" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(personalReferralUrl)}`} target="_blank" rel="noreferrer" onClick={() => onTrackShareClick("facebook")}>Facebook</a>
            <a className="secondary-link-button" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(personalReferralUrl)}`} target="_blank" rel="noreferrer" onClick={() => onTrackShareClick("linkedin")}>LinkedIn</a>
            <a className="secondary-link-button" href={`mailto:?subject=${encodeURIComponent(shareMessages.emailSubject)}&body=${encodeURIComponent(shareMessages.emailBody)}`} onClick={() => onTrackShareClick("email")}>Email</a>
            <button className="secondary-button" type="button" onClick={() => onCopyReferralText("Referral link", personalReferralUrl, "copy")}><Copy size={16} /> Copy Link</button>
            <button className="secondary-button" type="button" onClick={onShareNatively}><Share2 size={16} /> Native Share</button>
          </div>
          <div className="viral-asset-actions">
            <button className="secondary-button" type="button" onClick={onDownloadQrPoster}><Download size={16} /> Download QR</button>
            <button className="secondary-button" type="button" onClick={() => downloadReferralCardSvg({
              supporterName,
              campaignTitle: campaign.title,
              currentLevelName: levelName,
              supporterCode: personalReferralCode,
              referralLink: personalReferralUrl,
              journeyDisplayName
            })}><Download size={16} /> Download Referral Card</button>
            <button className="secondary-button" type="button" onClick={onPrintPoster}><Download size={16} /> Generate Poster</button>
          </div>
          {copiedReferral && <p className="success-message">{copiedReferral}</p>}
        </article>

        <article className="viral-card">
          <div className="viral-card-heading">
            <BarChart3 />
            <div>
              <span className="eyebrow">Campaign impact</span>
              <h3>Your influence</h3>
            </div>
          </div>
          <div className="viral-metric-grid">
            {metric("People joined because of you", peopleJoinedBecauseOfYou)}
            {metric("Verified supporters", metrics.verified)}
            {metric("Campaign influence", impactScore)}
            {metric("Estimated social reach", Math.max(shareClicks * 8, treeSize * 10))}
            {metric("Volunteer influence", campaignSigners.filter((item) => item.source === "field").length)}
            {metric("Tree size", treeSize)}
          </div>
        </article>

        <article className="viral-card">
          <div className="viral-card-heading">
            <GitBranch />
            <div>
              <span className="eyebrow">Live campaign</span>
              <h3>Recent movement</h3>
            </div>
          </div>
          <div className="viral-live-list">
            {recentActivity.length > 0 ? recentActivity.map((item) => (
              <div key={item.id}>
                <CheckCircle2 size={16} />
                <span>{item.label}</span>
                <small>{item.detail}</small>
              </div>
            )) : (
              <p className="helper-text">Live updates appear as supporters join, verify, volunteer, and unlock growth events.</p>
            )}
          </div>
        </article>

        <article className="viral-card">
          <div className="viral-card-heading">
            <Trophy />
            <div>
              <span className="eyebrow">Leaderboard</span>
              <h3>{rank ? `Current rank #${rank}` : "Rank building"}</h3>
            </div>
          </div>
          <div className="viral-metric-grid">
            {metric("Nearby rank", rank ? `#${rank}` : "New")}
            {metric("Top supporters", Math.max(1, campaignSigners.length))}
            {metric("Progress to next rank", `${Math.min(100, progress + shareClicks * 3)}%`)}
          </div>
        </article>

        <article className="viral-card">
          <div className="viral-card-heading">
            <Sparkles />
            <div>
              <span className="eyebrow">Projection</span>
              <h3>What if I invite...</h3>
            </div>
          </div>
          <div className="viral-projection-buttons">
            {[5, 10, 25, 50, 100].map((count) => (
              <button key={count} className={projectionInvites === count ? "selected" : ""} type="button" onClick={() => setProjectionInvites(count)}>
                {count}
              </button>
            ))}
          </div>
          <div className="viral-metric-grid">
            {metric("Projected Wallet", projection.expectedWallet)}
            {metric("Projected Recognition", projection.expectedRecognition ?? "Keep growing")}
            {metric("Tree Growth", projectionInvites * 2)}
            {metric("Campaign Influence", projection.expectedRankScore)}
            {metric("Achievements", projection.expectedPrizeEligibility ? "Prize ready" : "Progressing")}
          </div>
          <p className="helper-text">Simulation only. No wallet or leaderboard values are changed.</p>
        </article>

        <article className="viral-card">
          <div className="viral-card-heading">
            <Gift />
            <div>
              <span className="eyebrow">Achievements</span>
              <h3>Celebrate milestones</h3>
            </div>
          </div>
          <div className="viral-toast-stack" role="status" aria-live="polite">
            <span><BadgeCheck size={16} /> Badge progress started</span>
            <span><ShieldCheck size={16} /> Verification protects campaign quality</span>
            <span><Award size={16} /> Certificate eligibility grows with participation</span>
          </div>
        </article>

        <article className="viral-card">
          <div className="viral-card-heading">
            <MessageCircle />
            <div>
              <span className="eyebrow">Contact invitations</span>
              <h3>Invite with permission</h3>
            </div>
          </div>
          <p>Contact access is optional. Messages are never sent automatically.</p>
          <label className="check-row">
            <input type="checkbox" checked={contactConsent} onChange={(event) => setContactConsent(event.target.checked)} />
            I want to choose contacts and edit the invitation first.
          </label>
          <textarea value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} rows={3} />
          <button
            className="secondary-button"
            type="button"
            disabled={!contactConsent}
            onClick={() => setContactStatus("Contact selection is ready. Your device must ask permission before any contact is selected or message is sent.")}
          >
            Prepare contact invite
          </button>
          {contactStatus && <p className="info-message">{contactStatus}</p>}
        </article>
      </section>

      <div className="viral-secondary-actions">
        <button className="secondary-button" type="button" onClick={onDownloadAppealPdf}>Download signed appeal PDF</button>
        {journeyPath && <a className="primary-link-button" href={journeyPath}><Sparkles size={16} /> Open {journeyDisplayName}</a>}
        <button className="secondary-button" type="button" onClick={() => onCopyReferralText("Instagram caption", shareMessages.instagramCaption, "poster")}>
          <Copy size={16} /> Copy Instagram Caption
        </button>
      </div>

      <nav className="viral-bottom-share" aria-label="One tap sharing">
        <a href={whatsAppLink("", shareMessages.whatsapp)} target="_blank" rel="noreferrer" onClick={() => onTrackShareClick("whatsapp")}><MessageCircle size={18} /> WhatsApp</a>
        <a href={smsLink("", shareMessages.sms)} onClick={() => onTrackShareClick("sms")}><Mail size={18} /> SMS</a>
        <button type="button" onClick={() => onCopyReferralText("Referral link", personalReferralUrl, "copy")}><Copy size={18} /> Copy</button>
        <button type="button" onClick={onShareNatively}><Share2 size={18} /> Share</button>
      </nav>
    </div>
  );
}
