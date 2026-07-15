import type { Campaign, Signer } from "../../types";
import {
  downloadQrPosterSvg,
  getCampaignReferralUrl,
  getSafeReferrerLabel,
  getSupporterReferralCode,
  normalizeReferralCode
} from "../../utils/referrals";
import { createQrSvgFragment, isValidQrDestination } from "../../utils/qr";
import { getCanonicalBaseUrl } from "../../utils/links";
import { getCampaignGoalValue } from "../../utils/campaign";
import { simulateSupporterGrowth } from "../calculator";
import { buildSupporterGrowthAccounts } from "../contributions";
import { normalizeCampaignGrowthConfiguration } from "../configuration";
import { buildContributionLeaderboard } from "../leaderboards";
import { evaluateRecognition } from "../recognition";
import { buildRewardCenterModel } from "../rewards";
import { buildReferralDomain } from "../services";
import { buildRecognitionTree, buildSupporterGrowthPortal } from "../tree";
import { createGrowthWallet } from "../wallet";
import type {
  SupporterGrowthPortalResolveInput,
  SupporterGrowthPortalResolveResult,
  SupporterGrowthPortalViewModel,
  SupporterImpactSummary,
  SupporterLeaderboardSummary,
  SupporterGrowthProjection
} from "./types";

interface ReferralCardDownloadOptions {
  supporterName: string;
  campaignTitle: string;
  currentLevelName?: string;
  supporterCode: string;
  referralLink: string;
  journeyDisplayName: string;
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function byNewest<T extends { timestamp?: string; qualifiedAt?: string; updatedAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.timestamp ?? left.qualifiedAt ?? left.updatedAt ?? 0).getTime();
    const rightTime = new Date(right.timestamp ?? right.qualifiedAt ?? right.updatedAt ?? 0).getTime();
    return rightTime - leftTime;
  });
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(1, Math.ceil(days)));
  return date.toISOString();
}

function friendlyLeaderboardLabel(filter: string) {
  return filter
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getBaseUrl(input: SupporterGrowthPortalResolveInput) {
  return getCanonicalBaseUrl() || input.baseUrl.replace(/\/$/, "");
}

function findSupporter(input: SupporterGrowthPortalResolveInput) {
  const code = normalizeReferralCode(input.supporterCode);
  const existingPortal = input.runtime.supporterPortals.find(
    (portal) => normalizeReferralCode(portal.supporterCode) === code || portal.publicPath === `/r/${code}`
  );
  const signer =
    input.signers.find((item) => getSupporterReferralCode(item) === code) ??
    input.signers.find((item) => item.id === existingPortal?.supporterId);
  return { code, existingPortal, signer };
}

function buildLeaderboardSummaries(
  input: SupporterGrowthPortalResolveInput,
  supporterId: string,
  campaignId: string
): SupporterLeaderboardSummary[] {
  const runtimeLeaderboards = input.runtime.leaderboards.length
    ? input.runtime.leaderboards
    : [
        buildContributionLeaderboard({
          accounts: buildSupporterGrowthAccounts(
            input.signers.filter((signer) => signer.campaignId === campaignId),
            buildReferralDomain(input.signers.filter((signer) => signer.campaignId === campaignId))
          ),
          campaignId,
          filter: "overall",
          limit: 25
        })
      ];

  return runtimeLeaderboards
    .filter((leaderboard) => leaderboard.entries.some((entry) => entry.campaignId === campaignId))
    .map((leaderboard) => {
      const entryIndex = leaderboard.entries.findIndex((entry) => entry.supporterId === supporterId);
      const entry = entryIndex >= 0 ? leaderboard.entries[entryIndex] : undefined;
      const start = Math.max(0, entryIndex - 2);
      const nearby = entryIndex >= 0 ? leaderboard.entries.slice(start, start + 5) : leaderboard.entries.slice(0, 5);
      return {
        filter: leaderboard.filter,
        label: friendlyLeaderboardLabel(leaderboard.filter),
        rank: entry?.rank,
        score: entry?.score ?? 0,
        nearby
      };
    });
}

function buildProjection(options: {
  invites: number;
  verificationRate: number;
  volunteerRate: number;
  treeLevels: number;
  targetLevel: SupporterGrowthPortalViewModel["nextLevel"];
  averageCreditsPerVerifiedSupporter: number;
}): SupporterGrowthProjection {
  const calculator = simulateSupporterGrowth({
    invitedSupporters: options.invites,
    expectedVerificationRate: options.verificationRate,
    targetRecognitionLevel: options.targetLevel,
    averageCreditsPerVerifiedSupporter: options.averageCreditsPerVerifiedSupporter
  });
  const verified = options.invites * (options.verificationRate / 100);
  const volunteerMultiplier = 1 + options.volunteerRate / 100;
  const projectedTreeSize = Math.round(
    Array.from({ length: Math.max(1, options.treeLevels) }).reduce<number>(
      (sum, _, index) => sum + Math.pow(Math.max(1, verified), index + 1),
      0
    )
  );

  return {
    invitedSupporters: options.invites,
    verificationRate: options.verificationRate,
    volunteerRate: options.volunteerRate,
    treeLevels: options.treeLevels,
    expectedWallet: calculator.expectedWallet,
    expectedPromotion: calculator.expectedPromotion,
    expectedContribution: calculator.expectedContribution,
    expectedRecognition: calculator.expectedRecognition,
    expectedRankScore: calculator.expectedRankScore,
    expectedPrizeEligibility: calculator.expectedPrizeEligibility,
    projectedTreeSize,
    projectedCampaignInfluence: Math.round(projectedTreeSize * volunteerMultiplier)
  };
}

function buildImpact(campaign: Campaign, signers: Signer[], supporter: Signer, treeSize: number): SupporterImpactSummary {
  const supporterCode = getSupporterReferralCode(supporter);
  const influenced = signers.filter(
    (signer) => normalizeReferralCode(signer.referredBy || signer.referredByPhoneOrCode) === supporterCode
  );
  const verifiedReferrals = influenced.filter((signer) => signer.status === "verified" || signer.otpVerified).length;
  const campaignGoal = getCampaignGoalValue(campaign);
  return {
    verifiedReferrals,
    signaturesInfluenced: influenced.length,
    volunteerInfluence: influenced.filter((signer) => signer.source === "field").length,
    eventsAttended: influenced.filter((signer) => signer.source === "scan").length,
    campaignReach: treeSize,
    estimatedSocialReach: Math.max(treeSize * 8, influenced.length * 12),
    campaignGoalContribution: campaignGoal > 0 ? Math.round((Math.max(1, influenced.length) / campaignGoal) * 100) : 0
  };
}

export function resolveSupporterGrowthPortal(
  input: SupporterGrowthPortalResolveInput
): SupporterGrowthPortalResolveResult {
  const { code, existingPortal, signer } = findSupporter(input);
  if (!code || !signer) {
    return {
      status: "not_found",
      message: "We could not find a campaign journey for this referral code yet."
    };
  }

  const campaign = input.campaigns.find((item) => item.id === signer.campaignId);
  if (!campaign) {
    return {
      status: "not_found",
      message: "This supporter exists, but the campaign connected to this portal was not found."
    };
  }

  const campaignSigners = input.signers.filter((item) => item.campaignId === campaign.id);
  const wallet =
    existingPortal?.wallet ??
    input.runtime.wallets.find((item) => item.campaignId === campaign.id && item.supporterId === signer.id) ??
    createGrowthWallet(campaign.id, signer.id);
  const config = normalizeCampaignGrowthConfiguration(campaign);
  const recognition =
    input.runtime.recognition.find((item) => item.campaignId === campaign.id && item.supporterId === signer.id) ??
    evaluateRecognition({
      wallet,
      configuration: config.operatingSystem.recognition
    });
  const accounts = buildSupporterGrowthAccounts(campaignSigners, buildReferralDomain(campaignSigners)).map((account) => {
    const accountWallet = input.runtime.wallets.find(
      (item) => item.campaignId === account.campaignId && item.supporterId === account.supporterId
    );
    if (!accountWallet) return account;
    return {
      ...account,
      currentBalance: accountWallet.balance.currentBalance,
      lifetimeEarnedPoints: accountWallet.balance.totalEarned,
      lifetimeContributedPoints: accountWallet.balance.totalContributed,
      receivedContributionPoints: accountWallet.balance.contributionCredits,
      lastCalculatedAt: accountWallet.updatedAt
    };
  });
  const supporterAccount = accounts.find((account) => account.supporterId === signer.id) ?? accounts[0];
  const overallRank = input.runtime.leaderboards
    .find((leaderboard) => leaderboard.filter === "overall")
    ?.entries.find((entry) => entry.supporterId === signer.id)?.rank;
  const tree =
    existingPortal?.tree ??
    buildRecognitionTree({
      supporter: supporterAccount,
      accounts,
      wallet,
      recognition,
      currentRank: overallRank
    });
  const canonicalPortal = buildSupporterGrowthPortal(code, getBaseUrl(input), campaign.slug, tree, wallet);
  const portal = existingPortal
    ? {
        ...existingPortal,
        referralLink: canonicalPortal.referralLink,
        qrPayload: canonicalPortal.qrPayload,
        shareActions: canonicalPortal.shareActions
      }
    : canonicalPortal;
  const snapshot = input.runtime.supporterSnapshots.find(
    (item) => item.campaignId === campaign.id && item.supporterId === signer.id
  );
  const currentLevel = recognition.currentLevel;
  const nextLevel = recognition.nextLevel;
  const creditsRequired = nextLevel?.promotionCreditsRequired ?? 0;
  const remainingCreditsNeeded = Math.max(0, creditsRequired - wallet.balance.promotionCredits);
  const averageReferralCredits =
    config.operatingSystem.credits.rules.find(
      (rule) => rule.enabled && rule.activityKind === "verified_referral" && rule.creditKind === "promotion"
    )?.credits ?? 10;
  const remainingReferralsNeeded = averageReferralCredits > 0
    ? Math.ceil(remainingCreditsNeeded / averageReferralCredits)
    : 0;
  const timeline = byNewest(
    input.runtime.timeline.filter(
      (item) => item.campaignId === campaign.id && (!item.supporterId || item.supporterId === signer.id)
    )
  ).slice(0, 40);
  const achievements = byNewest(
    input.runtime.achievements.filter((item) => item.campaignId === campaign.id && item.supporterId === signer.id)
  );
  const prizes = byNewest(
    input.runtime.prizes.filter((item) => item.campaignId === campaign.id && item.supporterId === signer.id)
  );
  const contributionAudits = byNewest(
    input.runtime.contributionAudits.filter((item) => item.campaignId === campaign.id && item.supporterId === signer.id)
  );
  const leaderboards = buildLeaderboardSummaries(input, signer.id, campaign.id);
  const projection = buildProjection({
    invites: 10,
    verificationRate: 50,
    volunteerRate: 20,
    treeLevels: 3,
    targetLevel: nextLevel,
    averageCreditsPerVerifiedSupporter: averageReferralCredits
  });
  const impact = buildImpact(campaign, campaignSigners, signer, tree.nodes.length);
  const rewardCenter = buildRewardCenterModel({
    campaign,
    merchants: config.merchants,
    redemptions: input.runtime.redemptions.filter((item) => item.campaignId === campaign.id),
    coupons: input.runtime.coupons.filter((item) => item.campaignId === campaign.id),
    wishlists: input.runtime.wishlists.filter((item) => item.campaignId === campaign.id),
    wallet,
    supporterId: signer.id,
    wallets: input.runtime.wallets.filter((item) => item.campaignId === campaign.id)
  });

  return {
    status: "ready",
    portal: {
      supporterCode: code,
      supporter: signer,
      campaign,
      organization: input.organization,
      portal,
      wallet,
      snapshot,
      recognition,
      currentLevel,
      nextLevel,
      progressPercentage: recognition.progressPercentage,
      creditsRequired,
      remainingCreditsNeeded,
      remainingReferralsNeeded,
      estimatedPromotionDate: remainingCreditsNeeded > 0 ? addDays(remainingCreditsNeeded / Math.max(1, averageReferralCredits)) : undefined,
      tree,
      timeline,
      achievements,
      prizes,
      contributionAudits,
      rewardCenter,
      leaderboards,
      projection,
      impact
    }
  };
}

export function downloadSupporterReferralPoster(portal: SupporterGrowthPortalViewModel) {
  const canonicalReferralUrl = getCampaignReferralUrl(portal.organization, portal.campaign, portal.supporterCode);
  downloadQrPosterSvg({
    campaign: portal.campaign,
    organizationName: portal.organization?.name ?? "VoiceUp",
    url: canonicalReferralUrl,
    referralCode: portal.supporterCode
  });
}

export function getSupporterDisplayName(signer: Signer) {
  return signer.name || getSafeReferrerLabel(signer) || "VoiceUp supporter";
}

export function getCampaignJourneyDisplayName(campaign: Campaign) {
  return normalizeCampaignGrowthConfiguration(campaign).sharing.journeyDisplayName || "My Campaign Journey";
}

export function downloadReferralCardSvg(options: ReferralCardDownloadOptions) {
  if (!isValidQrDestination(options.referralLink)) return false;
  const qrGraphic = createQrSvgFragment(options.referralLink, 56, 208, 248);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1680" viewBox="0 0 360 560">
  <rect width="360" height="560" rx="28" fill="#f8fafc"/>
  <rect x="22" y="22" width="316" height="516" rx="24" fill="#ffffff" stroke="#d7dce6"/>
  <text x="44" y="70" font-family="Inter, Arial" font-size="13" font-weight="700" fill="#0f7a3b">${escapeSvg(options.journeyDisplayName).slice(0, 34)}</text>
  <text x="44" y="112" font-family="Inter, Arial" font-size="28" font-weight="800" fill="#071f4e">${escapeSvg(options.supporterName).slice(0, 28)}</text>
  <text x="44" y="144" font-family="Inter, Arial" font-size="15" fill="#475569">${escapeSvg(options.campaignTitle).slice(0, 42)}</text>
  <text x="44" y="178" font-family="Inter, Arial" font-size="13" fill="#667085">${escapeSvg(options.currentLevelName ?? "Campaign Supporter")} - ${escapeSvg(options.supporterCode)}</text>
  ${qrGraphic}
  <text x="180" y="494" text-anchor="middle" font-family="Inter, Arial" font-size="13" fill="#475569">${escapeSvg(options.referralLink).slice(0, 54)}</text>
  <text x="180" y="520" text-anchor="middle" font-family="Inter, Arial" font-size="12" font-weight="800" fill="#123a8c">Scan to sign and join my referral tree</text>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${options.supporterCode.toLowerCase()}-referral-card.svg`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
