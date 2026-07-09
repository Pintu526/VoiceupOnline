import { GrowthEventPriority, GrowthEventType } from "../events";
import type {
  ContributionActivity,
  ContributionBalanceChange,
  ContributionCalculationAudit,
  ContributionCalculationResult,
  ContributionDistribution,
  ContributionEngineState,
  ContributionLevelConfig,
  ContributionRuleViolation,
  PointContributionSettings,
  SupporterGrowthAccount
} from "./types";
import { CONTRIBUTION_ENGINE_LIMITS } from "./types";

function now() {
  return new Date().toISOString();
}

function toPoints(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function makeViolation(
  code: ContributionRuleViolation["code"],
  message: string,
  severity: ContributionRuleViolation["severity"] = "error"
): ContributionRuleViolation {
  return { code, message, severity };
}

function isInEffectiveWindow(settings: PointContributionSettings, occurredAt: string) {
  const occurredTime = new Date(occurredAt).getTime();
  const startTime = settings.effectiveStartAt ? new Date(settings.effectiveStartAt).getTime() : undefined;
  const endTime = settings.effectiveEndAt ? new Date(settings.effectiveEndAt).getTime() : undefined;
  if (Number.isFinite(startTime) && occurredTime < Number(startTime)) return false;
  if (Number.isFinite(endTime) && occurredTime > Number(endTime)) return false;
  return true;
}

function getSortedLevels(levels: ContributionLevelConfig[]) {
  return levels
    .filter((level) => level.enabled !== false)
    .slice()
    .sort((left, right) => left.level - right.level);
}

function buildAccountIndexes(accounts: SupporterGrowthAccount[]) {
  const bySupporterId = new Map(accounts.map((account) => [account.supporterId, account]));
  const byReferralCode = new Map(
    accounts
      .filter((account): account is SupporterGrowthAccount & { referralCode: string } => Boolean(account.referralCode))
      .map((account) => [account.referralCode, account])
  );
  return { bySupporterId, byReferralCode };
}

function buildReferralChain(
  account: SupporterGrowthAccount,
  accountsByReferralCode: Map<string, SupporterGrowthAccount>
) {
  const chain: SupporterGrowthAccount[] = [];
  const seenCodes = new Set<string>();
  let nextCode = account.parentReferralCode;

  while (nextCode) {
    if (account.referralCode && nextCode === account.referralCode) {
      return { chain, circular: true, selfReference: true };
    }
    if (seenCodes.has(nextCode)) {
      return { chain, circular: true, selfReference: false };
    }

    seenCodes.add(nextCode);
    const parent = accountsByReferralCode.get(nextCode);
    if (!parent) break;
    chain.push(parent);
    nextCode = parent.parentReferralCode;
  }

  return { chain, circular: false, selfReference: false };
}

function makeAudit(
  activity: ContributionActivity,
  distribution: ContributionDistribution[],
  currentBalance: number,
  violations: ContributionRuleViolation[],
  duplicateKey: string
): ContributionCalculationAudit {
  return {
    id: `audit-${activity.id}-${duplicateKey}`,
    sourceActivity: activity,
    earnedPoints: toPoints(activity.points),
    contributionDistribution: distribution,
    currentBalance,
    timestamp: now(),
    campaignId: activity.campaignId,
    supporterId: activity.supporterId,
    duplicateKey,
    violations
  };
}

function skippedResult(
  activity: ContributionActivity,
  reason: string,
  violations: ContributionRuleViolation[],
  duplicateKey: string
): ContributionCalculationResult {
  const audit = makeAudit(activity, [], 0, violations, duplicateKey);
  return {
    applied: false,
    skippedReason: reason,
    activity,
    distribution: [],
    balanceChanges: [],
    audit,
    events: [
      {
        type: GrowthEventType.ContributionCalculated,
        priority: GrowthEventPriority.Normal,
        context: { campaignId: activity.campaignId, supporterId: activity.supporterId },
        metadata: {
          applied: false,
          reason,
          activityId: activity.id,
          activityType: activity.type,
          earnedPoints: toPoints(activity.points),
          violations
        }
      }
    ],
    violations
  };
}

export function createDisabledContributionSettings(): PointContributionSettings {
  return {
    enabled: false,
    levels: [],
    eligibleActivities: []
  };
}

export function validateContributionSettings(settings: PointContributionSettings): ContributionRuleViolation[] {
  const violations: ContributionRuleViolation[] = [];
  const levels = getSortedLevels(settings.levels);
  const seenLevels = new Set<number>();

  if (settings.enabled && settings.eligibleActivities.length === 0) {
    violations.push(
      makeViolation("invalid_configuration", "Contribution is enabled but no eligible activities are configured.")
    );
  }

  if (levels.length > CONTRIBUTION_ENGINE_LIMITS.maxLevels) {
    violations.push(
      makeViolation("invalid_configuration", "Contribution levels cannot exceed seven configured levels.")
    );
  }

  levels.forEach((level) => {
    if (level.level < CONTRIBUTION_ENGINE_LIMITS.minLevels || level.level > CONTRIBUTION_ENGINE_LIMITS.maxLevels) {
      violations.push(makeViolation("invalid_configuration", `Contribution level ${level.level} is outside 1 to 7.`));
    }
    if (seenLevels.has(level.level)) {
      violations.push(makeViolation("invalid_configuration", `Contribution level ${level.level} is duplicated.`));
    }
    if (level.percentage < 0 || level.percentage > 100 || !Number.isFinite(level.percentage)) {
      violations.push(
        makeViolation("invalid_configuration", `Contribution level ${level.level} has an invalid percentage.`)
      );
    }
    seenLevels.add(level.level);
  });

  if (settings.maxContributionCap !== undefined && settings.maxContributionCap < 0) {
    violations.push(makeViolation("invalid_configuration", "Maximum contribution cap cannot be negative."));
  }

  return violations;
}

export function calculatePointContribution(
  activity: ContributionActivity,
  settings: PointContributionSettings,
  state: ContributionEngineState
): ContributionCalculationResult {
  const duplicateKey = activity.duplicateKey ?? `${activity.campaignId}:${activity.supporterId}:${activity.id}`;
  const configurationViolations = validateContributionSettings(settings);
  const existingAuditKeys = new Set(state.existingAuditKeys ?? []);

  if (existingAuditKeys.has(duplicateKey)) {
    return skippedResult(activity, "Duplicate contribution calculation skipped.", [
      makeViolation("duplicate_calculation", "This activity has already been calculated.", "warning")
    ], duplicateKey);
  }

  if (!settings.enabled) {
    return skippedResult(activity, "Point contribution is disabled for this campaign.", [], duplicateKey);
  }

  if (configurationViolations.some((violation) => violation.severity === "error")) {
    return skippedResult(activity, "Contribution configuration is invalid.", configurationViolations, duplicateKey);
  }

  if (!settings.eligibleActivities.includes(activity.type)) {
    return skippedResult(activity, "Activity is not eligible for point contribution.", [
      makeViolation("ineligible_activity", `${activity.type} is not configured as an eligible contribution activity.`, "info")
    ], duplicateKey);
  }

  if (!isInEffectiveWindow(settings, activity.occurredAt)) {
    return skippedResult(activity, "Activity is outside the configured contribution window.", [
      makeViolation("inactive_window", "The activity timestamp is outside the contribution effective period.", "info")
    ], duplicateKey);
  }

  if (activity.points < 0) {
    return skippedResult(activity, "Negative points are not allowed.", [
      makeViolation("negative_points", "Point-generating activity cannot have a negative value.")
    ], duplicateKey);
  }

  const { bySupporterId, byReferralCode } = buildAccountIndexes(state.accounts);
  const sourceAccount = bySupporterId.get(activity.supporterId);

  if (!sourceAccount) {
    return skippedResult(activity, "Supporter growth account was not found.", [
      makeViolation("missing_account", "The supporter must have a growth account before point calculation.")
    ], duplicateKey);
  }

  const chain = buildReferralChain(sourceAccount, byReferralCode);
  const violations: ContributionRuleViolation[] = [...configurationViolations];

  if (chain.circular) {
    violations.push(
      makeViolation(
        "circular_referral_chain",
        chain.selfReference
          ? "Self-contribution is blocked because the supporter references their own referral code."
          : "Circular referral chain detected and blocked."
      )
    );
  }

  if (chain.circular) {
    return skippedResult(activity, "Circular referral chain blocked.", violations, duplicateKey);
  }

  const levels = getSortedLevels(settings.levels);
  const maxCap = settings.maxContributionCap ?? Number.POSITIVE_INFINITY;
  let usedCap = 0;
  let usedEarnedPoints = 0;

  const distribution = levels.reduce<ContributionDistribution[]>((items, levelConfig) => {
    const parentAccount = chain.chain[levelConfig.level - 1];
    if (!parentAccount) return items;

    if (parentAccount.supporterId === sourceAccount.supporterId) {
      violations.push(
        makeViolation("self_contribution", "A supporter cannot contribute points to themselves.", "warning")
      );
      return items;
    }

    const rawPoints = toPoints((activity.points * levelConfig.percentage) / 100);
    const remainingCap = Math.max(0, maxCap - usedCap);
    const remainingEarnedPoints = Math.max(0, activity.points - usedEarnedPoints);
    const points = toPoints(Math.min(rawPoints, remainingCap, remainingEarnedPoints));
    if (points <= 0) return items;

    usedCap += points;
    usedEarnedPoints += points;

    return [
      ...items,
      {
        id: `contribution-${activity.id}-l${levelConfig.level}-${parentAccount.supporterId}`,
        activityId: activity.id,
        campaignId: activity.campaignId,
        fromSupporterId: sourceAccount.supporterId,
        toSupporterId: parentAccount.supporterId,
        fromReferralCode: sourceAccount.referralCode,
        toReferralCode: parentAccount.referralCode,
        level: levelConfig.level,
        percentage: levelConfig.percentage,
        points,
        capped: points < rawPoints
      }
    ];
  }, []);

  const contributedPoints = toPoints(distribution.reduce((sum, item) => sum + item.points, 0));
  const retainedPoints = toPoints(activity.points - contributedPoints);

  if (retainedPoints < 0) {
    return skippedResult(activity, "Calculation would create a negative balance.", [
      ...violations,
      makeViolation("negative_balance", "Contribution distribution cannot exceed earned points.")
    ], duplicateKey);
  }

  const balanceChanges = new Map<string, ContributionBalanceChange>();
  balanceChanges.set(sourceAccount.supporterId, {
    supporterId: sourceAccount.supporterId,
    previousBalance: sourceAccount.currentBalance,
    earnedPoints: toPoints(activity.points),
    contributedPoints,
    receivedContributionPoints: 0,
    currentBalance: toPoints(sourceAccount.currentBalance + retainedPoints)
  });

  distribution.forEach((item) => {
    const parentAccount = bySupporterId.get(item.toSupporterId);
    const existingChange = balanceChanges.get(item.toSupporterId);
    const previousBalance = existingChange?.previousBalance ?? parentAccount?.currentBalance ?? 0;
    const receivedContributionPoints = toPoints((existingChange?.receivedContributionPoints ?? 0) + item.points);

    balanceChanges.set(item.toSupporterId, {
      supporterId: item.toSupporterId,
      previousBalance,
      earnedPoints: existingChange?.earnedPoints ?? 0,
      contributedPoints: existingChange?.contributedPoints ?? 0,
      receivedContributionPoints,
      currentBalance: toPoints(previousBalance + receivedContributionPoints)
    });
  });

  const sourceBalance = balanceChanges.get(sourceAccount.supporterId)?.currentBalance ?? sourceAccount.currentBalance;
  const audit = makeAudit(activity, distribution, sourceBalance, violations, duplicateKey);

  return {
    applied: true,
    activity,
    distribution,
    balanceChanges: Array.from(balanceChanges.values()),
    audit,
    events: [
      {
        type: GrowthEventType.PointsEarned,
        priority: GrowthEventPriority.High,
        context: { campaignId: activity.campaignId, supporterId: activity.supporterId },
        metadata: {
          activityId: activity.id,
          activityType: activity.type,
          earnedPoints: toPoints(activity.points),
          retainedPoints,
          duplicateKey
        }
      },
      ...distribution.map((item) => ({
        type: GrowthEventType.PointsContributed,
        priority: GrowthEventPriority.High,
        context: { campaignId: activity.campaignId, supporterId: item.toSupporterId },
        metadata: {
          activityId: activity.id,
          fromSupporterId: item.fromSupporterId,
          toSupporterId: item.toSupporterId,
          level: item.level,
          percentage: item.percentage,
          points: item.points,
          capped: item.capped,
          duplicateKey
        }
      })),
      {
        type: GrowthEventType.ContributionCalculated,
        priority: GrowthEventPriority.Normal,
        context: { campaignId: activity.campaignId, supporterId: activity.supporterId },
        metadata: {
          applied: true,
          activityId: activity.id,
          activityType: activity.type,
          distributionCount: distribution.length,
          contributedPoints,
          retainedPoints,
          currentBalance: sourceBalance,
          duplicateKey
        }
      }
    ],
    violations
  };
}
