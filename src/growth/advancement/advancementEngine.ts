import { GrowthEventPriority, GrowthEventType } from "../events";
import type { ContributionRuleViolation, SupporterGrowthAccount } from "../contributions/types";
import type {
  AdvancementConfiguration,
  AdvancementEvaluationInput,
  AdvancementEvaluationResult,
  AdvancementLevelConfig
} from "./types";

const MAX_ADVANCEMENT_LEVELS = 7;

function makeViolation(
  message: string,
  severity: ContributionRuleViolation["severity"] = "error"
): ContributionRuleViolation {
  return { code: "invalid_configuration", message, severity };
}

function isActiveLevel(level: AdvancementLevelConfig, asOf: string) {
  const asOfTime = new Date(asOf).getTime();
  const startTime = level.effectiveStartAt ? new Date(level.effectiveStartAt).getTime() : undefined;
  const endTime = level.effectiveEndAt ? new Date(level.effectiveEndAt).getTime() : undefined;
  if (Number.isFinite(startTime) && asOfTime < Number(startTime)) return false;
  if (Number.isFinite(endTime) && asOfTime > Number(endTime)) return false;
  return true;
}

function isEligible(account: SupporterGrowthAccount, level: AdvancementLevelConfig, asOf: string) {
  if (!isActiveLevel(level, asOf)) return false;
  if (account.currentBalance < level.minimumPoints) return false;
  if (account.verifiedReferrals < level.minimumVerifiedReferrals) return false;
  if (level.volunteerRequired && account.volunteerParticipations <= 0) return false;
  if ((level.minimumCampaignParticipations ?? 0) > account.campaignParticipations) return false;
  return true;
}

function byOrder(left: AdvancementLevelConfig, right: AdvancementLevelConfig) {
  return left.order - right.order;
}

export function createEmptyAdvancementConfiguration(): AdvancementConfiguration {
  return {
    enabled: false,
    levels: []
  };
}

export function validateAdvancementConfiguration(
  configuration: AdvancementConfiguration
): ContributionRuleViolation[] {
  const violations: ContributionRuleViolation[] = [];
  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();

  if (configuration.levels.length > MAX_ADVANCEMENT_LEVELS) {
    violations.push(makeViolation("Advancement hierarchy cannot exceed seven levels."));
  }

  configuration.levels.forEach((level) => {
    if (!level.id.trim()) violations.push(makeViolation("Every advancement level must have an id."));
    if (!level.displayName.trim()) violations.push(makeViolation(`Level ${level.id || level.order} needs a display name.`));
    if (seenIds.has(level.id)) violations.push(makeViolation(`Advancement level id ${level.id} is duplicated.`));
    if (seenOrders.has(level.order)) violations.push(makeViolation(`Advancement order ${level.order} is duplicated.`));
    if (level.order < 1 || level.order > MAX_ADVANCEMENT_LEVELS) {
      violations.push(makeViolation(`Advancement level ${level.id} order must be between 1 and 7.`));
    }
    if (level.minimumPoints < 0 || level.minimumVerifiedReferrals < 0) {
      violations.push(makeViolation(`Advancement level ${level.id} cannot use negative thresholds.`));
    }
    if ((level.minimumCampaignParticipations ?? 0) < 0) {
      violations.push(makeViolation(`Advancement level ${level.id} cannot use negative participation requirements.`));
    }
    seenIds.add(level.id);
    seenOrders.add(level.order);
  });

  return violations;
}

export function getQualifiedAdvancementLevel(
  account: SupporterGrowthAccount,
  levels: AdvancementLevelConfig[],
  asOf = new Date().toISOString()
) {
  const qualifiedLevels = levels
    .filter((level) => isEligible(account, level, asOf))
    .sort(byOrder);
  return qualifiedLevels[qualifiedLevels.length - 1];
}

export function getNextAdvancementLevel(
  account: SupporterGrowthAccount,
  levels: AdvancementLevelConfig[],
  currentLevel?: AdvancementLevelConfig,
  asOf = new Date().toISOString()
) {
  return levels
    .filter((level) => isActiveLevel(level, asOf))
    .filter((level) => !currentLevel || level.order > currentLevel.order)
    .sort(byOrder)
    .find((level) => {
      if (account.currentBalance < level.minimumPoints) return true;
      if (account.verifiedReferrals < level.minimumVerifiedReferrals) return true;
      if (level.volunteerRequired && account.volunteerParticipations <= 0) return true;
      if ((level.minimumCampaignParticipations ?? 0) > account.campaignParticipations) return true;
      return false;
    });
}

export function evaluateAdvancement(input: AdvancementEvaluationInput): AdvancementEvaluationResult {
  const asOf = input.asOf ?? new Date().toISOString();
  const violations = validateAdvancementConfiguration(input.configuration);
  const validLevels = input.configuration.levels.slice().sort(byOrder);
  const currentLevel = input.configuration.enabled
    ? getQualifiedAdvancementLevel(input.account, validLevels, asOf)
    : undefined;
  const nextLevel = input.configuration.enabled
    ? getNextAdvancementLevel(input.account, validLevels, currentLevel, asOf)
    : validLevels[0];

  const changed = input.configuration.enabled && currentLevel?.id !== input.previousLevelId;
  const levelChange = changed
    ? {
        supporterId: input.account.supporterId,
        fromLevelId: input.previousLevelId,
        toLevelId: currentLevel?.id,
        changed: true,
        reason: currentLevel
          ? "Supporter met campaign-defined advancement requirements."
          : "Supporter no longer qualifies for a configured level."
      }
    : undefined;

  return {
    supporterId: input.account.supporterId,
    currentLevel,
    nextLevel,
    levelChange,
    certificateEligible: Boolean(currentLevel?.certificateEligible),
    badge: currentLevel?.badge,
    specialPrivileges: currentLevel?.specialPrivileges ?? [],
    prizeEligible: Boolean(currentLevel?.prizeEligible),
    prizeIds: currentLevel?.prizeIds ?? [],
    events: [
      {
        type: GrowthEventType.AdvancementEvaluated,
        priority: changed ? GrowthEventPriority.High : GrowthEventPriority.Normal,
        context: {
          campaignId: input.account.campaignId,
          supporterId: input.account.supporterId
        },
        metadata: {
          enabled: input.configuration.enabled,
          previousLevelId: input.previousLevelId,
          currentLevelId: currentLevel?.id,
          nextLevelId: nextLevel?.id,
          changed,
          pointsBalance: input.account.currentBalance,
          verifiedReferrals: input.account.verifiedReferrals
        }
      },
      ...(changed
        ? [
            {
              type: GrowthEventType.GrowthLevelChanged,
              priority: GrowthEventPriority.High,
              context: {
                campaignId: input.account.campaignId,
                supporterId: input.account.supporterId
              },
              metadata: {
                fromLevelId: input.previousLevelId,
                toLevelId: currentLevel?.id,
                displayName: currentLevel?.displayName
              }
            }
          ]
        : [])
    ],
    violations
  };
}
