import { GrowthEventPriority, GrowthEventType } from "../events";
import type {
  PromotionCandidate,
  PromotionEngineConfiguration,
  PromotionEvaluationResult
} from "./types";
import { calculatePromotionDistribution } from "./distributionEngine";
import { resolvePromotionRounds } from "./roundEngine";

function violation(message: string) {
  return {
    code: "invalid_configuration" as const,
    message,
    severity: "error" as const
  };
}

function roundCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

export function createDisabledPromotionConfiguration(): PromotionEngineConfiguration {
  return {
    enabled: false,
    roundConfiguration: {
      strategy: "level_number"
    },
    distributionConfiguration: {
      enabled: false,
      depth: 0,
      maximumLevels: 0,
      contributionPercentage: 0,
      strategy: "recognition_tree",
      formula: "equal"
    }
  };
}

export function evaluatePromotion(
  candidate: PromotionCandidate,
  configuration: PromotionEngineConfiguration
): PromotionEvaluationResult {
  if (!configuration.enabled) {
    return {
      qualified: false,
      candidate,
      promotionPool: 0,
      walletRetainedCredits: 0,
      rounds: [],
      allocations: [],
      events: [],
      violations: []
    };
  }

  const violations = [];
  if (candidate.promotionCreditsRequired < 0) {
    violations.push(violation("Promotion credits required cannot be negative."));
  }
  if (candidate.promotionPercentage < 0 || candidate.promotionPercentage > 100) {
    violations.push(violation("Promotion percentage must be between 0 and 100."));
  }
  if (configuration.distributionConfiguration.depth < 0 || configuration.distributionConfiguration.maximumLevels < 0) {
    violations.push(violation("Contribution depth and maximum levels cannot be negative."));
  }

  const qualified = violations.length === 0 && candidate.promotionCreditsAvailable >= candidate.promotionCreditsRequired;
  const promotionBase = qualified ? candidate.promotionCreditsRequired : 0;
  const promotionPool = roundCredits((promotionBase * candidate.promotionPercentage) / 100);
  const walletRetainedCredits = roundCredits(promotionBase - promotionPool);
  const rounds = qualified ? resolvePromotionRounds(candidate.targetLevelOrder, configuration.roundConfiguration) : [];
  const allocations = calculatePromotionDistribution(
    promotionPool,
    rounds,
    configuration.distributionConfiguration
  );

  return {
    qualified,
    candidate,
    promotionPool,
    walletRetainedCredits,
    rounds,
    allocations,
    events: qualified
      ? [
          {
            type: GrowthEventType.GrowthPromotionQualified,
            priority: GrowthEventPriority.High,
            context: {
              campaignId: candidate.campaignId,
              supporterId: candidate.supporterId
            },
            metadata: {
              currentLevelId: candidate.currentLevelId,
              targetLevelId: candidate.targetLevelId,
              promotionCreditsRequired: candidate.promotionCreditsRequired,
              promotionCreditsAvailable: candidate.promotionCreditsAvailable,
              promotionPool,
              walletRetainedCredits,
              rounds: rounds.length,
              duplicateKey: candidate.duplicateKey
            }
          },
          {
            type: GrowthEventType.GrowthPromotionCompleted,
            priority: GrowthEventPriority.High,
            context: {
              campaignId: candidate.campaignId,
              supporterId: candidate.supporterId
            },
            metadata: {
              targetLevelId: candidate.targetLevelId,
              promotionPool,
              allocations,
              duplicateKey: candidate.duplicateKey
            }
          }
        ]
      : [],
    violations
  };
}
