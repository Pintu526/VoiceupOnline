import type { AchievementPeriodConfig } from "../achievements/types";
import type { AchievementEvaluationResult } from "../achievements/types";
import { evaluateAchievementPeriod } from "../achievements/achievementEngine";
import type { AdvancementConfiguration, AdvancementEvaluationResult } from "../advancement/types";
import { createEmptyAdvancementConfiguration, evaluateAdvancement } from "../advancement/advancementEngine";
import type {
  ContributionActivity,
  ContributionCalculationResult,
  ContributionEngineState,
  ContributionRuleViolation,
  PointContributionSettings,
  SupporterGrowthAccount
} from "../contributions/types";
import {
  calculatePointContribution,
  createDisabledContributionSettings
} from "../contributions/contributionEngine";
import type { GrowthEventIntent } from "../events";
import type { PrizeConfig, PrizeEvaluationResult } from "../prizes/types";
import { evaluatePrizeQualifications } from "../prizes/prizeEngine";

export interface ContributionAdvancementConfiguration {
  contribution: PointContributionSettings;
  advancement: AdvancementConfiguration;
  achievementPeriods: AchievementPeriodConfig[];
  prizes: PrizeConfig[];
}

export interface ContributionAdvancementEvaluationInput {
  activity: ContributionActivity;
  state: ContributionEngineState;
  configuration: ContributionAdvancementConfiguration;
  existingAchievementKeys?: string[];
  existingPrizeQualificationKeys?: string[];
}

export interface ContributionAdvancementEvaluationResult {
  contribution: ContributionCalculationResult;
  advancement: AdvancementEvaluationResult[];
  achievements: AchievementEvaluationResult[];
  prizes: PrizeEvaluationResult;
  events: GrowthEventIntent[];
  violations: ContributionRuleViolation[];
}

export function createEmptyContributionAdvancementConfiguration(): ContributionAdvancementConfiguration {
  return {
    contribution: createDisabledContributionSettings(),
    advancement: createEmptyAdvancementConfiguration(),
    achievementPeriods: [],
    prizes: []
  };
}

function applyBalanceChanges(
  accounts: SupporterGrowthAccount[],
  contribution: ContributionCalculationResult
): SupporterGrowthAccount[] {
  const changesBySupporter = new Map(contribution.balanceChanges.map((change) => [change.supporterId, change]));

  return accounts.map((account) => {
    const change = changesBySupporter.get(account.supporterId);
    if (!change) return account;
    return {
      ...account,
      currentBalance: change.currentBalance,
      lifetimeEarnedPoints: account.lifetimeEarnedPoints + change.earnedPoints,
      lifetimeContributedPoints: account.lifetimeContributedPoints + change.contributedPoints,
      receivedContributionPoints: account.receivedContributionPoints + change.receivedContributionPoints,
      lastCalculatedAt: contribution.activity.occurredAt
    };
  });
}

export function evaluateContributionAdvancement(
  input: ContributionAdvancementEvaluationInput
): ContributionAdvancementEvaluationResult {
  const contribution = calculatePointContribution(
    input.activity,
    input.configuration.contribution,
    input.state
  );

  const updatedAccounts = applyBalanceChanges(input.state.accounts, contribution);
  const affectedSupporterIds = new Set([
    input.activity.supporterId,
    ...contribution.balanceChanges.map((change) => change.supporterId)
  ]);

  const advancement = updatedAccounts
    .filter((account) => affectedSupporterIds.has(account.supporterId))
    .map((account) =>
      evaluateAdvancement({
        account,
        configuration: input.configuration.advancement,
        previousLevelId: account.currentLevelId,
        asOf: input.activity.occurredAt
      })
    );

  const achievementResults = input.configuration.achievementPeriods.map((period) =>
    evaluateAchievementPeriod({
      period,
      accounts: updatedAccounts,
      levels: input.configuration.advancement.levels,
      asOf: input.activity.occurredAt,
      existingQualificationKeys: input.existingAchievementKeys
    })
  );

  const prizeQualifications = evaluatePrizeQualifications({
    qualifications: achievementResults.flatMap((result) => result.qualifications),
    prizes: input.configuration.prizes,
    existingPrizeQualificationKeys: input.existingPrizeQualificationKeys
  });

  const events = [
    ...contribution.events,
    ...advancement.flatMap((result) => result.events),
    ...achievementResults.flatMap((result) => result.events),
    ...prizeQualifications.events
  ];

  const violations = [
    ...contribution.violations,
    ...advancement.flatMap((result) => result.violations),
    ...achievementResults.flatMap((result) => result.violations),
    ...prizeQualifications.violations
  ];

  return {
    contribution,
    advancement,
    achievements: achievementResults,
    prizes: prizeQualifications,
    events,
    violations
  };
}
