import type { Campaign, Signer } from "../../types";
import { getCampaignReferralUrl, getSupporterReferralCode, normalizeReferralCode } from "../../utils/referrals";
import { evaluateContributionAdvancement } from "../services/contributionAdvancementService";
import { evaluateGrowthOperatingSystemActivity } from "../services/growthOperatingSystemService";
import { evaluateAchievementPeriod } from "../achievements";
import { buildSupporterGrowthAccounts } from "../contributions";
import type { ContributionActivity, SupporterGrowthAccount } from "../contributions";
import type { GrowthCreditActivity } from "../credits";
import type { GrowthEventIntent } from "../events";
import { GrowthEventPriority, GrowthEventType } from "../events";
import { buildContributionLeaderboard } from "../leaderboards";
import { evaluatePrizeQualifications } from "../prizes";
import { buildReferralDomain } from "../services/referralService";
import { buildRecognitionTree, buildSupporterGrowthPortal } from "../tree";
import type { SupporterGrowthPortalModel } from "../tree";
import { createGrowthWallet, type GrowthWallet } from "../wallet";
import { createRedemptionRuntimeState } from "../redemption";
import { simulateCampaignGrowth, simulateSupporterGrowth } from "../calculator";
import {
  createDefaultGrowthContributionSettings,
  createDefaultGrowthLifecycleConfiguration
} from "./configuration";
import type {
  GrowthLifecycleInput,
  GrowthLifecycleResult,
  GrowthRuntimeState,
  GrowthSupporterSnapshot
} from "./types";

function now() {
  return new Date().toISOString();
}

function round(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function daysAgo(dateValue: string | undefined) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / 86400_000);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function mergeConfiguration(configuration: GrowthLifecycleInput["configuration"]) {
  const defaults = createDefaultGrowthLifecycleConfiguration();
  if (!configuration) return defaults;
  return {
    features: { ...defaults.features, ...configuration.features },
    credits: {
      ...defaults.credits,
      ...configuration.credits,
      rules: configuration.credits?.rules ?? defaults.credits.rules
    },
    recognition: {
      ...defaults.recognition,
      ...configuration.recognition,
      levels: configuration.recognition?.levels ?? defaults.recognition.levels
    },
    promotion: {
      ...defaults.promotion,
      ...configuration.promotion,
      roundConfiguration: {
        ...defaults.promotion.roundConfiguration,
        ...configuration.promotion?.roundConfiguration
      },
      distributionConfiguration: {
        ...defaults.promotion.distributionConfiguration,
        ...configuration.promotion?.distributionConfiguration
      }
    }
  };
}

export function createEmptyGrowthRuntimeState(): GrowthRuntimeState {
  const rewardRuntime = createRedemptionRuntimeState();
  return {
    processedActivityKeys: [],
    creditLedger: [],
    wallets: [],
    timeline: [],
    eventIntents: [],
    contributionAudits: [],
    recognition: [],
    achievements: [],
    prizes: [],
    redemptions: rewardRuntime.redemptions,
    coupons: rewardRuntime.coupons,
    wishlists: rewardRuntime.wishlists,
    redemptionAudits: rewardRuntime.redemptionAudits,
    leaderboards: [],
    supporterSnapshots: [],
    supporterPortals: [],
    updatedAt: now()
  };
}

function getWallet(state: GrowthRuntimeState, campaignId: string, supporterId: string) {
  return state.wallets.find((wallet) => wallet.campaignId === campaignId && wallet.supporterId === supporterId);
}

function upsertWallet(wallets: GrowthWallet[], wallet: GrowthWallet) {
  const exists = wallets.some((item) => item.id === wallet.id);
  return exists ? wallets.map((item) => (item.id === wallet.id ? wallet : item)) : [...wallets, wallet];
}

function upsertById<T extends { id: string }>(items: T[], nextItems: T[]) {
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const merged = items.map((item) => nextById.get(item.id) ?? item);
  const existingIds = new Set(merged.map((item) => item.id));
  return [...merged, ...nextItems.filter((item) => !existingIds.has(item.id))];
}

function upsertSnapshot(items: GrowthSupporterSnapshot[], snapshot: GrowthSupporterSnapshot) {
  const exists = items.some(
    (item) => item.campaignId === snapshot.campaignId && item.supporterId === snapshot.supporterId
  );
  return exists
    ? items.map((item) =>
        item.campaignId === snapshot.campaignId && item.supporterId === snapshot.supporterId ? snapshot : item
      )
    : [...items, snapshot];
}

function upsertRecognition(
  items: GrowthRuntimeState["recognition"],
  recognition: GrowthRuntimeState["recognition"][number]
) {
  const exists = items.some(
    (item) => item.campaignId === recognition.campaignId && item.supporterId === recognition.supporterId
  );
  return exists
    ? items.map((item) =>
        item.campaignId === recognition.campaignId && item.supporterId === recognition.supporterId
          ? recognition
          : item
      )
    : [...items, recognition];
}

function upsertPortal(items: SupporterGrowthPortalModel[], portal: SupporterGrowthPortalModel) {
  const exists = items.some((item) => item.publicPath === portal.publicPath);
  return exists ? items.map((item) => (item.publicPath === portal.publicPath ? portal : item)) : [...items, portal];
}

function getActivityKind(input: GrowthLifecycleInput): GrowthCreditActivity["kind"] {
  if (input.kind === "share_completed") return "share";
  if (input.kind === "volunteer_joined") return "volunteer_activity";
  if (input.kind === "event_attended") return "attendance";
  if (input.kind === "referral_signed" || input.kind === "referral_verified") return "verified_referral";
  return "campaign_signature";
}

function getActivityKey(input: GrowthLifecycleInput, activityKind: GrowthCreditActivity["kind"], supporterId: string) {
  if (activityKind === "share") {
    return `${input.signer.campaignId}:${supporterId}:share:${input.share?.channel ?? "unknown"}:${input.occurredAt ?? now()}`;
  }
  if (activityKind === "verified_referral") {
    return `${input.signer.campaignId}:${supporterId}:verified-referral:${input.signer.id}`;
  }
  if (activityKind === "volunteer_activity" || activityKind === "attendance") {
    return `${input.signer.campaignId}:${supporterId}:${activityKind}:${input.occurredAt ?? now()}`;
  }
  return `${input.signer.campaignId}:${supporterId}:campaign-signature`;
}

function findParentReferrer(input: GrowthLifecycleInput) {
  const parentCode = normalizeReferralCode(input.signer.referredBy || input.signer.referredByPhoneOrCode);
  if (!parentCode) return undefined;
  return input.signers.find((signer) => getSupporterReferralCode(signer) === parentCode);
}

function buildActivities(input: GrowthLifecycleInput): GrowthCreditActivity[] {
  const activityKind = getActivityKind(input);
  const occurredAt = input.occurredAt ?? now();
  const activities: GrowthCreditActivity[] = [
    {
      id: `growth-${input.kind}-${input.signer.id}`,
      kind: activityKind,
      campaignId: input.signer.campaignId,
      supporterId: input.signer.id,
      occurredAt,
      duplicateKey: getActivityKey(input, activityKind, input.signer.id),
      metadata: {
        lifecycleEvent: input.kind,
        shareChannel: input.share?.channel ?? null
      }
    }
  ];

  const parentReferrer = findParentReferrer(input);
  if (
    parentReferrer &&
    parentReferrer.id !== input.signer.id &&
    ["supporter_signed", "supporter_verified", "referral_signed", "referral_verified"].includes(input.kind)
  ) {
    activities.push({
      id: `growth-referral-${parentReferrer.id}-${input.signer.id}`,
      kind: "verified_referral",
      campaignId: input.signer.campaignId,
      supporterId: parentReferrer.id,
      occurredAt,
      duplicateKey: getActivityKey(input, "verified_referral", parentReferrer.id),
      metadata: {
        lifecycleEvent: input.kind,
        referredSupporterId: input.signer.id,
        referredBy: getSupporterReferralCode(parentReferrer)
      }
    });
  }

  return activities;
}

function toContributionActivity(activity: GrowthCreditActivity): ContributionActivity {
  return {
    id: activity.id,
    type:
      activity.kind === "verified_referral"
        ? "verified_referral"
        : activity.kind === "volunteer_activity"
          ? "volunteer_participation"
          : activity.kind === "attendance"
            ? "event_attendance"
            : "campaign_sign_completion",
    campaignId: activity.campaignId,
    supporterId: activity.supporterId,
    points: activity.kind === "verified_referral" ? 10 : activity.kind === "share" ? 1 : 5,
    occurredAt: activity.occurredAt,
    duplicateKey: activity.duplicateKey,
    metadata: {
      growthActivityKind: activity.kind
    }
  };
}

function buildAccounts(signers: Signer[], wallets: GrowthWallet[]) {
  const referrals = buildReferralDomain(signers);
  const walletBySupporter = new Map(wallets.map((wallet) => [wallet.supporterId, wallet]));
  return buildSupporterGrowthAccounts(signers, referrals).map<SupporterGrowthAccount>((account) => {
    const wallet = walletBySupporter.get(account.supporterId);
    if (!wallet) return account;
    return {
      ...account,
      currentBalance: wallet.balance.walletCredits + wallet.balance.promotionCredits,
      lifetimeEarnedPoints: wallet.balance.totalEarned,
      lifetimeContributedPoints: wallet.balance.totalContributed,
      receivedContributionPoints: wallet.balance.contributionCredits,
      currentLevelId: account.currentLevelId,
      lastCalculatedAt: wallet.updatedAt
    };
  });
}

function getDepth(account: SupporterGrowthAccount, accountsByReferral: Map<string, SupporterGrowthAccount>) {
  let depth = 0;
  let nextCode = account.parentReferralCode;
  const seen = new Set<string>();
  while (nextCode && !seen.has(nextCode)) {
    seen.add(nextCode);
    const parent = accountsByReferral.get(nextCode);
    if (!parent) break;
    depth += 1;
    nextCode = parent.parentReferralCode;
  }
  return depth;
}

function growthForWindow(wallet: GrowthWallet, days: number) {
  return round(
    wallet.history
      .filter((entry) => daysAgo(entry.timestamp) <= days)
      .reduce((sum, entry) => sum + entry.delta, 0)
  );
}

function buildSupporterSnapshot(options: {
  account: SupporterGrowthAccount;
  accounts: SupporterGrowthAccount[];
  wallet: GrowthWallet;
  recognitionName?: string;
  recognitionLevelId?: string;
  leaderboardPosition?: number;
  portalPath?: string;
}) {
  const accountsByReferral = new Map(
    options.accounts
      .filter((account): account is SupporterGrowthAccount & { referralCode: string } => Boolean(account.referralCode))
      .map((account) => [account.referralCode, account])
  );
  const children = options.accounts
    .filter((account) => account.parentReferralCode && account.parentReferralCode === options.account.referralCode)
    .map((account) => account.supporterId);

  return {
    supporterId: options.account.supporterId,
    campaignId: options.account.campaignId,
    referralCode: options.account.referralCode,
    parentReferralCode: options.account.parentReferralCode,
    depth: getDepth(options.account, accountsByReferral),
    children,
    walletId: options.wallet.id,
    currentRecognitionLevelId: options.recognitionLevelId,
    currentRecognitionLevelName: options.recognitionName,
    contributionGiven: options.wallet.balance.totalContributed,
    contributionReceived: options.wallet.balance.contributionCredits,
    todayGrowth: growthForWindow(options.wallet, 1),
    weeklyGrowth: growthForWindow(options.wallet, 7),
    monthlyGrowth: growthForWindow(options.wallet, 31),
    lifetimeGrowth: options.wallet.balance.lifetimeGrowth,
    leaderboardPosition: options.leaderboardPosition,
    achievementBadges: options.recognitionName ? [options.recognitionName] : [],
    certificates: options.recognitionName ? [`${options.recognitionName} certificate-ready`] : [],
    prizeEligibility: Boolean(options.recognitionLevelId),
    portalPath: options.portalPath,
    updatedAt: now()
  };
}

export function appendGrowthLifecycleEventIntent(
  state: GrowthRuntimeState,
  intent: GrowthEventIntent
): GrowthRuntimeState {
  const duplicateKey = String(intent.metadata?.duplicateKey ?? `${intent.type}:${intent.context?.campaignId ?? ""}:${now()}`);
  const exists = state.eventIntents.some((event) => event.metadata?.duplicateKey === duplicateKey);
  if (exists) return state;
  return {
    ...state,
    eventIntents: [...state.eventIntents, { ...intent, metadata: { ...intent.metadata, duplicateKey } }],
    updatedAt: now()
  };
}

export function applyGrowthLifecycleEvent(
  state: GrowthRuntimeState,
  input: GrowthLifecycleInput
): GrowthLifecycleResult {
  const configuration = mergeConfiguration(input.configuration);
  const contributionSettings = input.contribution ?? createDefaultGrowthContributionSettings();
  const achievementPeriods = input.achievements?.length
    ? input.achievements
    : [
        {
          id: `campaign-overall-${input.signer.campaignId}`,
          label: "Campaign overall growth",
          kind: "campaign_duration" as const,
          startAt: "1970-01-01T00:00:00.000Z",
          endAt: "2999-12-31T23:59:59.999Z",
          minimumPoints: 1,
          minimumVerifiedReferrals: 0,
          minimumConversions: 0,
          prizeDescription: "Campaign recognition",
          numberOfWinners: 10,
          selectionCriteria: "top_points" as const,
          active: true
        }
      ];
  const prizes = input.rewards ?? [];
  const activities = buildActivities(input);
  const duplicateKeys = activities.map((activity) => activity.duplicateKey ?? activity.id);
  const allAlreadyProcessed = duplicateKeys.every((key) => state.processedActivityKeys.includes(key));
  if (allAlreadyProcessed) {
    return {
      state,
      eventIntents: [],
      skipped: true,
      skippedReason: "Growth lifecycle event already processed."
    };
  }

  let nextState = { ...state };
  let eventIntents: GrowthEventIntent[] = [];

  activities.forEach((activity) => {
    const operatingResult = evaluateGrowthOperatingSystemActivity({
      activity,
      configuration,
      wallet: getWallet(nextState, activity.campaignId, activity.supporterId),
      existingLedgerKeys: nextState.creditLedger.map((entry) => entry.duplicateKey),
      existingWalletHistoryKeys: nextState.wallets.flatMap((wallet) => wallet.history.map((entry) => entry.duplicateKey)),
      timelineRecords: nextState.timeline
    });

    const accounts = buildAccounts(input.signers, nextState.wallets);
    const contributionResult = configuration.features.contributionEngineEnabled
      ? evaluateContributionAdvancement({
          activity: toContributionActivity(activity),
          state: {
            accounts,
            existingAuditKeys: nextState.contributionAudits.map((audit) => audit.duplicateKey)
          },
          configuration: {
            contribution: contributionSettings,
            advancement: {
              enabled: false,
              levels: []
            },
            achievementPeriods,
            prizes
          }
        })
      : undefined;

    nextState = {
      ...nextState,
      processedActivityKeys: unique([
        ...nextState.processedActivityKeys,
        ...(operatingResult.creditCalculation.applied ? [activity.duplicateKey ?? activity.id] : [])
      ]),
      creditLedger: upsertById(nextState.creditLedger, operatingResult.creditCalculation.ledger),
      wallets: operatingResult.walletUpdate
        ? upsertWallet(nextState.wallets, operatingResult.walletUpdate.wallet)
        : nextState.wallets,
      timeline: operatingResult.timeline,
      eventIntents: [...nextState.eventIntents, ...operatingResult.events, ...(contributionResult?.events ?? [])],
      contributionAudits: contributionResult
        ? upsertById(nextState.contributionAudits, [contributionResult.contribution.audit])
        : nextState.contributionAudits,
      recognition: operatingResult.recognition
        ? upsertRecognition(nextState.recognition, operatingResult.recognition)
        : nextState.recognition,
      updatedAt: now()
    };

    eventIntents = [...eventIntents, ...operatingResult.events, ...(contributionResult?.events ?? [])];
  });

  const wallets = nextState.wallets;
  const accounts = buildAccounts(input.signers, wallets);
  const defaultLeaderboardFilters = [
    "current_campaign",
    "this_week",
    "this_month",
    "overall",
    "current_level",
    "highest_growth",
    "highest_contribution",
    "highest_verified_referrals",
    "highest_campaign_influence"
  ] as const;
  const leaderboardFilters = input.leaderboardFilters?.length ? input.leaderboardFilters : defaultLeaderboardFilters;
  const leaderboards = leaderboardFilters.map((filter) =>
    buildContributionLeaderboard({
      accounts,
      filter,
      campaignId: input.signer.campaignId,
      limit: 25
    })
  );
  const overallLeaderboard = leaderboards.find((leaderboard) => leaderboard.filter === "overall");
  const achievementResults = configuration.features.achievementEngineEnabled
    ? achievementPeriods.map((period) =>
        evaluateAchievementPeriod({
          period,
          accounts,
          levels: [],
          existingQualificationKeys: nextState.achievements.map((achievement) => achievement.duplicateKey)
        })
      )
    : [];
  const prizeResult = evaluatePrizeQualifications({
    qualifications: achievementResults.flatMap((result) => result.qualifications),
    prizes,
    existingPrizeQualificationKeys: nextState.prizes.map((prize) => prize.duplicateKey)
  });

  let supporterSnapshot: GrowthSupporterSnapshot | undefined;
  let supporterPortal = nextState.supporterPortals.find((portal) => portal.supporterId === input.signer.id);
  accounts.forEach((account) => {
    const wallet = getWallet(nextState, account.campaignId, account.supporterId) ?? createGrowthWallet(account.campaignId, account.supporterId);
    const recognition = nextState.recognition.find(
      (item) => item.campaignId === account.campaignId && item.supporterId === account.supporterId
    );
    const leaderboardPosition = overallLeaderboard?.entries.find((entry) => entry.supporterId === account.supporterId)?.rank;
    const tree = configuration.features.recognitionTreeEnabled
      ? buildRecognitionTree({
          supporter: account,
          accounts,
          wallet,
          recognition:
            recognition ?? {
              campaignId: account.campaignId,
              supporterId: account.supporterId,
              promotionReady: false,
              progressPercentage: 0,
              events: [],
              violations: []
            },
          currentRank: leaderboardPosition
        })
      : undefined;
    const portal = tree
      ? buildSupporterGrowthPortal(
          account.referralCode ?? getSupporterReferralCode(input.signers.find((signer) => signer.id === account.supporterId) ?? input.signer),
          input.baseUrl,
          input.campaignSlug,
          tree,
          wallet
        )
      : undefined;
    const snapshot = buildSupporterSnapshot({
      account,
      accounts,
      wallet,
      recognitionName: recognition?.currentLevel?.name,
      recognitionLevelId: recognition?.currentLevel?.id,
      leaderboardPosition,
      portalPath: portal?.publicPath
    });

    nextState.supporterSnapshots = upsertSnapshot(nextState.supporterSnapshots, snapshot);
    if (portal) {
      nextState.supporterPortals = upsertPortal(nextState.supporterPortals, portal);
      if (account.supporterId === input.signer.id) supporterPortal = portal;
    }
    if (account.supporterId === input.signer.id) supporterSnapshot = snapshot;
  });

  const campaignProjection = simulateCampaignGrowth({
    campaignDurationDays: 30,
    participants: accounts.length,
    verificationRate: 80,
    averageReferrals: accounts.length ? accounts.reduce((sum, account) => sum + account.verifiedReferrals, 0) / accounts.length : 0,
    promotionRules: configuration.recognition.levels,
    contributionRules: configuration.promotion.distributionConfiguration
  });
  const supporterProjection = simulateSupporterGrowth({
    invitedSupporters: 5,
    expectedVerificationRate: 80,
    targetRecognitionLevel: configuration.recognition.levels[0],
    averageCreditsPerVerifiedSupporter: 10
  });

  const projectionEvents: GrowthEventIntent[] = [
    {
      type: GrowthEventType.GrowthCalculationSimulated,
      priority: GrowthEventPriority.Low,
      context: { campaignId: input.signer.campaignId, supporterId: input.signer.id },
      metadata: {
        duplicateKey: `${input.signer.campaignId}:${input.signer.id}:projection:${input.occurredAt ?? now()}`,
        projectedReach: campaignProjection.projectedReach,
        expectedWallet: supporterProjection.expectedWallet
      }
    },
    {
      type: GrowthEventType.LeaderboardUpdated,
      priority: GrowthEventPriority.Normal,
      context: { campaignId: input.signer.campaignId, supporterId: input.signer.id },
      metadata: {
        duplicateKey: `${input.signer.campaignId}:leaderboard:${input.occurredAt ?? now()}`,
        filters: leaderboards.map((leaderboard) => leaderboard.filter)
      }
    }
  ];

  nextState = {
    ...nextState,
    leaderboards,
    achievements: upsertById(nextState.achievements, achievementResults.flatMap((result) => result.qualifications)),
    prizes: upsertById(nextState.prizes, prizeResult.qualifications),
    eventIntents: [...nextState.eventIntents, ...achievementResults.flatMap((result) => result.events), ...prizeResult.events, ...projectionEvents],
    updatedAt: now()
  };

  return {
    state: nextState,
    eventIntents: [...eventIntents, ...achievementResults.flatMap((result) => result.events), ...prizeResult.events, ...projectionEvents],
    supporterSnapshot,
    supporterPortal,
    skipped: false
  };
}

export function getSupporterGrowthSnapshot(
  state: GrowthRuntimeState,
  campaignId: string,
  supporterId: string
) {
  return state.supporterSnapshots.find(
    (snapshot) => snapshot.campaignId === campaignId && snapshot.supporterId === supporterId
  );
}

export function getSupporterGrowthPortal(
  state: GrowthRuntimeState,
  supporterId: string
) {
  return state.supporterPortals.find((portal) => portal.supporterId === supporterId);
}

export function getCampaignGrowthShareUrl(
  campaign: Pick<Campaign, "slug">,
  supporter: Signer,
  baseUrl: string
) {
  return getCampaignReferralUrl(undefined, campaign, getSupporterReferralCode(supporter)).replace(/^https?:\/\/[^/]+/, baseUrl.replace(/\/$/, ""));
}
