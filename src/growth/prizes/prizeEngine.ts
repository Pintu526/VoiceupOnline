import { GrowthEventPriority, GrowthEventType } from "../events";
import type { ContributionRuleViolation } from "../contributions/types";
import type {
  PrizeConfig,
  PrizeEvaluationInput,
  PrizeEvaluationResult,
  PrizeQualificationResult
} from "./types";

function makeDuplicateViolation(duplicateKey: string): ContributionRuleViolation {
  return {
    code: "duplicate_calculation",
    message: `Prize qualification ${duplicateKey} has already been calculated.`,
    severity: "warning"
  };
}

function getEligiblePrizes(prizes: PrizeConfig[], prizeIds?: string[]) {
  const allowedIds = prizeIds ? new Set(prizeIds) : undefined;
  return prizes.filter((prize) => prize.active).filter((prize) => !allowedIds || allowedIds.has(prize.id));
}

export function evaluatePrizeQualifications(input: PrizeEvaluationInput): PrizeEvaluationResult {
  const existingKeys = new Set(input.existingPrizeQualificationKeys ?? []);
  const prizes = getEligiblePrizes(input.prizes, input.prizeIds);
  const violations: ContributionRuleViolation[] = [];

  const qualifications = input.qualifications.flatMap<PrizeQualificationResult>((qualification) =>
    prizes.reduce<PrizeQualificationResult[]>((items, prize) => {
      const duplicateKey = `${qualification.duplicateKey}:${prize.id}`;
      if (existingKeys.has(duplicateKey)) {
        violations.push(makeDuplicateViolation(duplicateKey));
        return items;
      }

      return [
        ...items,
        {
          id: `prize-${duplicateKey}`,
          prizeId: prize.id,
          qualificationId: qualification.id,
          supporterId: qualification.supporterId,
          campaignId: qualification.campaignId,
          qualifiedAt: qualification.qualifiedAt,
          duplicateKey
        }
      ];
    }, [])
  );

  return {
    qualifications,
    events: qualifications.map((qualification) => ({
      type: GrowthEventType.PrizeQualified,
      priority: GrowthEventPriority.High,
      context: {
        campaignId: qualification.campaignId,
        supporterId: qualification.supporterId
      },
      metadata: {
        prizeId: qualification.prizeId,
        qualificationId: qualification.qualificationId,
        duplicateKey: qualification.duplicateKey
      }
    })),
    violations
  };
}
