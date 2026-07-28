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
import { useTranslation } from "../../i18n/useTranslation";
import { isGoudhanProductionCampaign } from "../../config/goudhanProduction";
import { goudhanCampaignBlueprint } from "../../config/goudhanCampaignBlueprint";

const RewardCenter = lazy(() => import("../rewards/components/RewardCenter"));

interface SupporterGrowthPortalPageProps {
  portal: SupporterGrowthPortalViewModel;
  onRewardAction: (action: import("../rewards/rewardRuntimeService").RewardRuntimeAction) => void;
}

interface SupporterGrowthPortalNotFoundProps {
  message?: string;
  onRetry: () => void;
}

function formatDate(value?: string, fallback = "Not available") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
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
  const { t } = useTranslation();
  return (
    <main className="supporter-portal-shell">
      <section className="supporter-portal-empty">
        <UserRound size={42} />
        <span className="eyebrow">{t("supporters.portal.journey")}</span>
        <h1>{t("supporters.portal.notFound")}</h1>
        <p>{message ?? t("supporters.portal.notConnected")}</p>
        <button className="primary-button" type="button" onClick={onRetry}>{t("supporters.portal.retry")}</button>
      </section>
    </main>
  );
}

export function SupporterGrowthPortalLoading() {
  const { t } = useTranslation();
  return (
    <main className="supporter-portal-shell">
      <section className="supporter-portal-skeleton" aria-live="polite" role="status">
        <span />
        <span />
        <span />
        <strong>{t("supporters.portal.loadingJourney")}</strong>
      </section>
    </main>
  );
}

export function SupporterGrowthPortalPage({ portal, onRewardAction }: SupporterGrowthPortalPageProps) {
  const { t } = useTranslation();
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
  const isGoudhanExperience = isGoudhanProductionCampaign(portal.campaign, portal.organization);
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

  async function copy(value: string, label = t("common.copied")) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 2200);
  }

  async function shareNative(
    title = portal.campaign.title,
    text = `Support ${portal.campaign.title} with me on VoiceUp.`
  ) {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: referralLink
        });
        return;
      } catch {
        // Fall back to copy if the native share sheet is dismissed or unavailable.
      }
    }
    await copy(referralLink, t("referrals.linkCopied"));
  }

  if (isGoudhanExperience) {
    const location = [
      portal.supporter.panchayat,
      portal.supporter.block,
      portal.supporter.district,
      portal.supporter.state,
      portal.supporter.country
    ].filter(Boolean).join(", ") || t("supporters.common.notAvailable");
    const isCoordinator =
      portal.supporter.coordinatorApplication?.status === "Approved";
    const role = isCoordinator
      ? t("goudhanCampaign.profileCoordinator")
      : t("goudhanCampaign.profileSupporter");
    const joinedDate = portal.supporter.signedAt
      ? portal.supporter.signedAt.slice(0, 10)
      : t("supporters.common.notAvailable");
    const contribution = 1 + portal.impact.signaturesInfluenced;
    const coordinatorMail = portal.campaign.adminEmail
      ? `mailto:${portal.campaign.adminEmail}?subject=${encodeURIComponent(
          t("goudhanCampaign.profileInviteCoordinator")
        )}&body=${encodeURIComponent(t("goudhanCampaign.profileCoordinatorEmailBody"))}`
      : "";
    const shareText = `${t("goudhanCampaign.share")} ${referralLink}`;

    return (
      <main className="supporter-portal-shell goudhan-supporter-profile">
        <section className="supporter-portal-hero">
          <div className="supporter-avatar" aria-label={t("goudhanCampaign.profilePhotoPrivate")}>
            {firstInitial(displayName)}
          </div>
          <div>
            <img
              className="goudhan-supporter-logo"
              src={goudhanCampaignBlueprint.branding.logoUrl}
              alt={t("goudhanCampaign.brandName")}
            />
            <span className="eyebrow">{t("goudhanCampaign.title")}</span>
            <h1>{displayName}</h1>
            <div className="supporter-status-row">
              <span><BadgeCheck size={16} /> {role}</span>
              <span><CalendarClock size={16} /> {t("goudhanCampaign.profileJoined")} {joinedDate}</span>
              <span><ShieldCheck size={16} /> {t("supporters.status.verified")}</span>
            </div>
          </div>
        </section>

        <section className="supporter-portal-grid">
          <article className="supporter-portal-card wide">
            <div className="supporter-card-heading">
              <UserRound />
              <div>
                <span className="eyebrow">{t("goudhanCampaign.myProfile")}</span>
                <h2>{t("goudhanCampaign.profileCampaignContribution")}</h2>
              </div>
            </div>
            <div className="supporter-metric-grid">
              {metric(t("goudhanCampaign.profileRole"), role)}
              {metric(t("goudhanCampaign.profileLocation"), location)}
              {metric(t("goudhanCampaign.profileMyTeam"), Math.max(0, portal.tree.nodes.length - 1))}
              {metric(t("goudhanCampaign.profileMySupporters"), portal.tree.network.directNetwork)}
              {metric(t("goudhanCampaign.profileCampaignContribution"), contribution)}
              {metric(t("goudhanCampaign.profileVerifiedSupport"), portal.impact.verifiedReferrals)}
            </div>
          </article>

          <article className="supporter-portal-card">
            <div className="supporter-card-heading">
              <QrCode />
              <div>
                <span className="eyebrow">{t("goudhanCampaign.profileReferralLink")}</span>
                <h2>{t("goudhanCampaign.shareCampaign")}</h2>
              </div>
            </div>
            <ReferralQrPreview
              value={portal.portal.qrPayload}
              label={t("public.campaignQr")}
              caption={portal.supporterCode}
            />
            <code className="supporter-referral-code">{referralLink}</code>
            <div className="supporter-share-grid">
              <button
                type="button"
                className="primary-button"
                onClick={() => void shareNative(t("goudhanCampaign.title"), t("goudhanCampaign.share"))}
              >
                <Share2 size={16} /> {t("goudhanCampaign.shareCampaign")}
              </button>
              <button type="button" className="secondary-button" onClick={() => copy(referralLink, t("referrals.linkCopied"))}>
                <Copy size={16} /> {t("common.copy")}
              </button>
              <a className="secondary-link-button" href={whatsAppLink("", shareText)} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
              {coordinatorMail && (
                <a className="secondary-link-button" href={coordinatorMail}>
                  <Mail size={16} /> {t("goudhanCampaign.profileInviteCoordinator")}
                </a>
              )}
            </div>
            {copied && <p className="success-message" role="status">{copied}</p>}
          </article>

          <article className="supporter-portal-card">
            <div className="supporter-card-heading">
              <GitBranch />
              <div>
                <span className="eyebrow">{t("goudhanCampaign.profileMyTeam")}</span>
                <h2>{portal.tree.network.directNetwork} {t("goudhanCampaign.profileMySupporters")}</h2>
              </div>
            </div>
            <div className="supporter-tree">
              {portal.tree.nodes.slice(1, 12).map((node) => (
                <div key={`${node.supporterId}-${node.depth}`}>
                  <strong>{node.referralCode ?? node.supporterId}</strong>
                  <span>{t("goudhanCampaign.profileLevel")} {node.depth}</span>
                </div>
              ))}
              {portal.tree.nodes.length <= 1 && (
                <p className="helper-text">{t("goudhanCampaign.profileTeamEmpty")}</p>
              )}
            </div>
          </article>
        </section>
      </main>
    );
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
            <span><BadgeCheck size={16} /> {portal.currentLevel?.badge ?? portal.currentLevel?.name ?? t("supporters.common.supporter")}</span>
            <span><WalletCards size={16} /> {formatNumber(portal.wallet.balance.walletCredits)} {t("growth.wallet.walletCredits").toLowerCase()}</span>
            <span><Trophy size={16} /> {t("supporters.portal.rank")} {portal.tree.currentRank ?? portal.leaderboards[0]?.rank ?? t("growth.status.new")}</span>
            <span><CalendarClock size={16} /> {t("supporters.portal.joined")} {formatDate(portal.supporter.signedAt, t("supporters.common.notAvailable"))}</span>
            <span><ShieldCheck size={16} /> {t(portal.supporter.otpVerified || portal.supporter.status === "verified" ? "supporters.status.verified" : "supporters.status.pendingVerification")}</span>
          </div>
        </div>
      </section>

      <section className="supporter-portal-grid">
        <article className="supporter-portal-card wide">
          <div className="supporter-card-heading">
            <Medal />
            <div>
              <span className="eyebrow">{t("supporters.portal.myProgress")}</span>
              <h2>{portal.currentLevel?.name ?? t("supporters.portal.campaignSupporter")}</h2>
            </div>
          </div>
          <div className="supporter-progress-bar"><span style={{ width: `${progress}%` }} /></div>
          <div className="supporter-metric-grid">
            {metric(t("supporters.portal.nextLevel"), portal.nextLevel?.name ?? t("supporters.portal.topLevel"))}
            {metric(t("growth.wallet.walletCredits"), portal.wallet.balance.walletCredits)}
            {metric(t("growth.wallet.promotionCredits"), portal.wallet.balance.promotionCredits)}
            {metric(t("supporters.portal.creditsRequired"), portal.creditsRequired)}
            {metric(t("supporters.portal.remainingReferrals"), portal.remainingReferralsNeeded)}
            {metric(t("supporters.portal.estimatedPromotion"), portal.estimatedPromotionDate ? formatDate(portal.estimatedPromotionDate, t("supporters.common.notAvailable")) : t("supporters.portal.readyWhenMet"))}
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <QrCode />
            <div>
              <span className="eyebrow">{t("referrals.myLink")}</span>
              <h2>{t("referrals.inviteSupporters")}</h2>
            </div>
          </div>
          <ReferralQrPreview value={portal.portal.qrPayload} label={t("referrals.personalQr")} caption={portal.supporterCode} />
          <code className="supporter-referral-code">{referralLink}</code>
          <div className="supporter-share-grid">
            <button type="button" className="primary-button" onClick={() => void shareNative()}><Share2 size={16} /> {t("public.share")}</button>
            <button type="button" className="secondary-button" onClick={() => copy(referralLink, t("referrals.linkCopied"))}><Copy size={16} /> {t("common.copy")}</button>
            <a className="secondary-link-button" href={whatsAppLink("", referralLink)} target="_blank" rel="noreferrer">WhatsApp</a>
            <a className="secondary-link-button" href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer">Telegram</a>
            <a className="secondary-link-button" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer">Facebook</a>
            <a className="secondary-link-button" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer">LinkedIn</a>
            <a className="secondary-link-button" href={smsLink("", referralLink)}>SMS</a>
            <a className="secondary-link-button" href={`mailto:?subject=${encodeURIComponent(portal.campaign.title)}&body=${encodeURIComponent(referralLink)}`}>Email</a>
            <button type="button" className="secondary-button" onClick={() => copy(`Support ${portal.campaign.title}: ${referralLink}`, t("referrals.instagramCopied"))}>Instagram</button>
            <button type="button" className="secondary-button" onClick={() => downloadReferralCardSvg({
              supporterName: displayName,
              campaignTitle: portal.campaign.title,
              currentLevelName: portal.currentLevel?.name,
              supporterCode: portal.supporterCode,
              referralLink,
              journeyDisplayName
            })}><Download size={16} /> {t("referrals.card")}</button>
            <button type="button" className="secondary-button" onClick={() => downloadSupporterReferralPoster(portal)}><Download size={16} /> {t("referrals.poster")}</button>
          </div>
          {copied && <p className="success-message">{copied}</p>}
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <WalletCards />
            <div>
              <span className="eyebrow">{t("supporters.portal.myWallet")}</span>
              <h2>{formatNumber(portal.wallet.balance.walletCredits)} {t("supporters.portal.credits")}</h2>
            </div>
          </div>
          <div className="supporter-metric-grid compact">
            {metric(t("supporters.portal.available"), portal.wallet.balance.walletCredits)}
            {metric(t("supporters.portal.promotion"), portal.wallet.balance.promotionCredits)}
            {metric(t("supporters.portal.contributionReceived"), portal.wallet.balance.contributionCredits)}
            {metric(t("supporters.portal.contributionGiven"), portal.wallet.balance.totalContributed)}
            {metric(t("supporters.portal.lifetime"), portal.wallet.balance.totalEarned)}
            {metric(t("supporters.portal.pending"), portal.wallet.balance.pendingPromotion)}
            {metric(t("supporters.portal.locked"), 0)}
            {metric(t("supporters.portal.expired"), 0)}
          </div>
          <div className="supporter-timeline compact-list">
            {portal.wallet.history.slice(0, 5).map((entry) => (
              <div key={entry.id}>
                <strong>{entry.delta >= 0 ? "+" : ""}{entry.delta} {entry.creditKind}</strong>
                <span>{formatDate(entry.timestamp)}</span>
              </div>
            ))}
            {portal.wallet.history.length === 0 && <p className="helper-text">{t("supporters.portal.walletHistoryEmpty")}</p>}
          </div>
        </article>

        <article className="supporter-portal-card wide">
          <Suspense fallback={<div className="supporter-portal-skeleton"><span /><span /><span /><strong>{t("growth.rewards.loading")}</strong></div>}>
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
              <span className="eyebrow">{t("supporters.portal.myRecognition")}</span>
              <h2>{portal.currentLevel?.name ?? t("supporters.common.supporter")}</h2>
            </div>
          </div>
          <p>{portal.currentLevel?.description ?? t("supporters.portal.unlockRecognition")}</p>
          <div className="supporter-pill-row">
            <span>{t(portal.currentLevel?.certificate ? "supporters.portal.certificateEligible" : "supporters.portal.certificateLocked")}</span>
            <span>{t(portal.currentLevel?.prizeEligibility ? "supporters.portal.prizeEligible" : "supporters.portal.prizeLocked")}</span>
            <span>{t("supporters.portal.nextBadge")}: {portal.nextLevel?.badge ?? t("growth.rewards.complete")}</span>
          </div>
          <ul className="supporter-benefit-list">
            {(portal.currentLevel?.privileges.length ? portal.currentLevel.privileges : [t("supporters.portal.shareLink"), t("supporters.portal.buildTree"), t("supporters.portal.trackImpact")]).map((item) => (
              <li key={item}><Sparkles size={15} /> {item}</li>
            ))}
          </ul>
        </article>

        <SupporterPortalEngagementCard portal={portal} />

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <Gift />
            <div>
              <span className="eyebrow">{t("supporters.portal.myAchievements")}</span>
              <h2>{portal.achievements.length} {t("supporters.portal.unlocked")}</h2>
            </div>
          </div>
          <div className="supporter-timeline compact-list">
            {portal.achievements.slice(0, 5).map((achievement) => (
              <div key={achievement.id}>
                <strong>{achievement.prizeDescription}</strong>
                <span>{t("supporters.portal.rank")} {achievement.rank} - {formatDate(achievement.qualifiedAt, t("supporters.common.notAvailable"))}</span>
              </div>
            ))}
            {portal.achievements.length === 0 && <p className="helper-text">{t("supporters.portal.achievementsEmpty")}</p>}
          </div>
          <div className="supporter-pill-row">
            <span>{portal.prizes.length} {t("supporters.portal.prizesEarned")}</span>
            <span>{t(portal.currentLevel?.certificate ? "supporters.portal.certificateReady" : "supporters.portal.certificateUpcoming")}</span>
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <GitBranch />
            <div>
              <span className="eyebrow">{t("supporters.portal.myReferralTree")}</span>
              <h2>{portal.tree.nodes.length} {t("growth.common.supporters").toLowerCase()}</h2>
            </div>
          </div>
          <div className="supporter-tree-summary">
            {metric(t("supporters.portal.direct"), portal.tree.network.directNetwork)}
            {metric(t("supporters.portal.indirect"), portal.tree.network.indirectNetwork)}
            {metric(t("supporters.portal.depth"), Math.max(...portal.tree.nodes.map((node) => node.depth), 0))}
          </div>
          <div className="supporter-tree">
            {portal.tree.nodes.slice(0, 12).map((node) => (
              <details key={`${node.supporterId}-${node.depth}`} open={node.depth < 2}>
                <summary><ChevronDown size={16} /> {node.depth === 0 ? t("supporters.portal.me") : `${t("supporters.portal.level")} ${node.depth}`} <span>{node.referralCode ?? node.supporterId}</span></summary>
                <p>{node.directChildren} {t("supporters.portal.directReferrals")} - {node.verifiedReferrals} {t("supporters.status.verified").toLowerCase()}</p>
              </details>
            ))}
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <CalendarClock />
            <div>
              <span className="eyebrow">{t("supporters.portal.myTimeline")}</span>
              <h2>{t("supporters.portal.growthEvents")}</h2>
            </div>
          </div>
          <div className="supporter-timeline">
            {portal.timeline.slice(0, 8).map((event) => (
              <div key={event.id}>
                <strong>{event.title}</strong>
                <span>{event.description}</span>
                <small>{formatDate(event.timestamp, t("supporters.common.notAvailable"))}</small>
              </div>
            ))}
            {portal.timeline.length === 0 && <p className="helper-text">{t("supporters.portal.timelineEmpty")}</p>}
          </div>
        </article>

        <article className="supporter-portal-card">
          <div className="supporter-card-heading">
            <BarChart3 />
            <div>
              <span className="eyebrow">{t("growth.leaderboard.title")}</span>
              <h2>{t("supporters.portal.campaignPosition")}</h2>
            </div>
          </div>
          <div className="supporter-leaderboards">
            {portal.leaderboards.slice(0, 5).map((leaderboard) => (
              <div key={leaderboard.filter}>
                <span>{leaderboard.label}</span>
                <strong>{leaderboard.rank ? `#${leaderboard.rank}` : t("supporters.portal.building")}</strong>
                <small>{formatNumber(leaderboard.score)} {t("supporters.portal.score")}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="supporter-portal-card wide">
          <div className="supporter-card-heading">
            <Sparkles />
            <div>
              <span className="eyebrow">{t("supporters.calculator.title")}</span>
              <h2>{t("supporters.calculator.question")}</h2>
            </div>
          </div>
          <div className="supporter-calculator-grid">
            <label>{t("supporters.calculator.invites")}<input type="number" min="1" value={calculator.invites} onChange={(event) => setCalculator({ ...calculator, invites: Number(event.target.value) })} /></label>
            <label>{t("supporters.calculator.verify")} %<input type="number" min="0" max="100" value={calculator.verificationRate} onChange={(event) => setCalculator({ ...calculator, verificationRate: Number(event.target.value) })} /></label>
            <label>{t("supporters.calculator.volunteer")} %<input type="number" min="0" max="100" value={calculator.volunteerRate} onChange={(event) => setCalculator({ ...calculator, volunteerRate: Number(event.target.value) })} /></label>
            <label>{t("supporters.calculator.treeLevels")}<input type="number" min="1" max="7" value={calculator.treeLevels} onChange={(event) => setCalculator({ ...calculator, treeLevels: Number(event.target.value) })} /></label>
          </div>
          <div className="supporter-metric-grid">
            {metric(t("supporters.calculator.projectedWallet"), projected.expectedWallet)}
            {metric(t("supporters.calculator.promotionProgress"), `${formatNumber(projected.expectedPromotion)}%`)}
            {metric(t("supporters.calculator.contribution"), projected.expectedContribution)}
            {metric(t("supporters.calculator.recognition"), projected.expectedRecognition ?? t("supporters.calculator.keepGrowing"))}
            {metric(t("supporters.calculator.treeSize"), projected.projectedTreeSize)}
            {metric(t("growth.engagement.influence"), projected.projectedCampaignInfluence)}
          </div>
          <p className="helper-text">{t("supporters.calculator.disclaimer")}</p>
        </article>

        <article className="supporter-portal-card wide">
          <div className="supporter-card-heading">
            <Trophy />
            <div>
              <span className="eyebrow">{t("supporters.impact.title")}</span>
              <h2>{t("growth.engagement.influence")}</h2>
            </div>
          </div>
          <div className="supporter-metric-grid">
            {metric(t("supporters.impact.verifiedReferrals"), portal.impact.verifiedReferrals)}
            {metric(t("supporters.impact.signaturesInfluenced"), portal.impact.signaturesInfluenced)}
            {metric(t("supporters.impact.volunteerInfluence"), portal.impact.volunteerInfluence)}
            {metric(t("supporters.impact.eventsAttended"), portal.impact.eventsAttended)}
            {metric(t("supporters.impact.campaignReach"), portal.impact.campaignReach)}
            {metric(t("supporters.impact.socialReach"), portal.impact.estimatedSocialReach)}
            {metric(t("supporters.impact.goalContribution"), `${formatNumber(portal.impact.campaignGoalContribution)}%`)}
          </div>
        </article>
      </section>

      <nav className="supporter-bottom-share" aria-label={t("supporters.portal.sharingAria")}>
        <button type="button" onClick={() => void shareNative()}><Share2 size={18} /> {t("public.share")}</button>
        <a href={whatsAppLink("", referralLink)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>
        <button type="button" onClick={() => copy(referralLink, t("referrals.linkCopied"))}><Copy size={18} /> {t("common.copy")}</button>
        <a href={`mailto:?subject=${encodeURIComponent(portal.campaign.title)}&body=${encodeURIComponent(referralLink)}`}><Mail size={18} /> Email</a>
      </nav>
    </main>
  );
}
