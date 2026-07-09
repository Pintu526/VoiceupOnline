import { GrowthEventPriority, GrowthEventType } from "../events";
import type { AdvancementLevelConfig } from "../advancement/types";
import type { ContributionRuleViolation, SupporterGrowthAccount } from "../contributions/types";
import type {
  AchievementEvaluationInput,
  AchievementEvaluationResult,
  AchievementPeriodConfig,
  AchievementQualification,
  AchievementSelectionCriteria
} from "./types";

function makeViolation(message: string, severity: ContributionRuleViolation["severity"] = "warning") {
  return {
    code: "duplicate_calculation" as const,
    message,
    severity
  };
}

function isPeriodActive(period: AchievementPeriodConfig, asOf: string) {
  if (!period.active) return false;
  const asOfTime = new Date(asOf).getTime();
  const startTime = new Date(period.startAt).getTime();
  const endTime = new Date(period.endAt).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return false;
  return asOfTime >= startTime && asOfTime <= endTime;
}

function getCampaignInfluence(account: SupporterGrowthAccount) {
  return account.currentBalance + account.verifiedReferrals * 10 + account.conversions * 5 + account.campaignParticipations;
}

function sorterFor(criteria: AchievementSelectionCriteria) {
  return (left: SupporterGrowthAccount, right: SupporterGrowthAccount) => {
    if (criteria === "top_verified_referrals") return right.verifiedReferrals - left.verifiedReferrals;
    if (criteria === "top_conversions") return right.conversions - left.conversions;
    if (criteria === "most_active_volunteer") return right.volunteerParticipations - left.volunteerParticipations;
    if (criteria === "highest_contribution") return right.lifetimeContributedPoints - left.lifetimeContributedPoints;
    if (criteria === "highest_campaign_influence") return getCampaignInfluence(right) - getCampaignInfluence(left);
    if (criteria === "fastest_to_level") {
      return new Date(left.lastCalculatedAt ?? "").getTime() - new Date(right.lastCalculatedAt ?? "").getTime();
    }
    return right.currentBalance - left.currentBalance;
  };
}

function accountMeetsTargetLevel(
  account: SupporterGrowthAccount,
  levels: AdvancementLevelConfig[],
  targetLevelId?: string
) {
  if (!targetLevelId) return true;
  const targetLevel = levels.find((level) => level.id === targetLevelId);
  if (!targetLevel) return false;
  return (
    account.currentBalance >= targetLevel.minimumPoints &&
    account.verifiedReferrals >= targetLevel.minimumVerifiedReferrals &&
    (!targetLevel.volunteerRequired || account.volunteerParticipations > 0) &&
    account.campaignParticipations >= (targetLevel.minimumCampaignParticipations ?? 0)
  );
}

function buildQualification(
  period: AchievementPeriodConfig,
  account: SupporterGrowthAccount,
  rank: number,
  asOf: string
): AchievementQualification {
  const duplicateKey = `${period.id}:${account.supporterId}`;
  return {
    id: `achievement-${duplicateKey}`,
    periodId: period.id,
    supporterId: account.supporterId,
    campaignId: account.campaignId,
    rank,
    selectionCriteria: period.selectionCriteria,
    prizeDescription: period.prizeDescription,
    qualifiedAt: asOf,
    duplicateKey
  };
}

export function evaluateAchievementPeriod(input: AchievementEvaluationInput): AchievementEvaluationResult {
  const asOf = input.asOf ?? new Date().toISOString();
  const existingKeys = new Set(input.existingQualificationKeys ?? []);
  const violations: ContributionRuleViolation[] = [];

  if (!isPeriodActive(input.period, asOf)) {
    return {
      periodId: input.period.id,
      qualifications: [],
      events: [],
      violations
    };
  }

  const candidateAccounts = input.accounts
    .filter((account) => account.currentBalance >= input.period.minimumPoints)
    .filter((account) => account.verifiedReferrals >= input.period.minimumVerifiedReferrals)
    .filter((account) => account.conversions >= input.period.minimumConversions)
    .filter((account) => accountMeetsTargetLevel(account, input.levels, input.period.targetLevelId))
    .sort(sorterFor(input.period.selectionCriteria))
    .slice(0, Math.max(0, input.period.numberOfWinners));

  const qualifications = candidateAccounts.reduce<AchievementQualification[]>((items, account, index) => {
    const qualification = buildQualification(input.period, account, index + 1, asOf);
    if (existingKeys.has(qualification.duplicateKey)) {
      violations.push(
        makeViolation(`Achievement qualification ${qualification.duplicateKey} has already been calculated.`)
      );
      return items;
    }
    return [...items, qualification];
  }, []);

  return {
    periodId: input.period.id,
    qualifications,
    events: qualifications.map((qualification) => ({
      type: GrowthEventType.AchievementQualified,
      priority: GrowthEventPriority.High,
      context: {
        campaignId: qualification.campaignId,
        supporterId: qualification.supporterId
      },
      metadata: {
        achievementPeriodId: qualification.periodId,
        rank: qualification.rank,
        selectionCriteria: qualification.selectionCriteria,
        prizeDescription: qualification.prizeDescription,
        duplicateKey: qualification.duplicateKey
      }
    })),
    violations
  };
}
