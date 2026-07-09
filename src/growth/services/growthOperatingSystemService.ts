import type {
  GrowthCreditActivity,
  GrowthCreditEngineConfiguration,
  GrowthRuleViolation
} from "../credits";
import {
  calculateGrowthCredits,
  createEmptyGrowthCreditConfiguration
} from "../credits";
import type { GrowthEventIntent } from "../events";
import { GrowthEventPriority, GrowthEventType } from "../events";
import type {
  PromotionEngineConfiguration,
  PromotionEvaluationResult
} from "../promotion";
import {
  createDisabledPromotionConfiguration,
  evaluatePromotion
} from "../promotion";
import type {
  RecognitionEngineConfiguration,
  RecognitionEvaluationResult
} from "../recognition";
import {
  createEmptyRecognitionConfiguration,
  evaluateRecognition
} from "../recognition";
import type { GrowthWallet, GrowthWalletUpdateResult } from "../wallet";
import {
  applyGrowthCreditsToWallet,
  createGrowthWallet
} from "../wallet";
import type { GrowthTimelineRecord } from "../timeline";
import { createTimelineRecordFromEvent } from "../timeline";

export interface GrowthAdminFeatureConfiguration {
  growthEngineEnabled: boolean;
  recognitionEnabled: boolean;
  leaderboardEnabled: boolean;
  contributionEngineEnabled: boolean;
  promotionEngineEnabled: boolean;
  growthCalculatorEnabled: boolean;
  recognitionTreeEnabled: boolean;
  achievementEngineEnabled: boolean;
  walletEnabled: boolean;
  timelineEnabled: boolean;
}

export interface GrowthOperatingSystemConfiguration {
  features: GrowthAdminFeatureConfiguration;
  credits: GrowthCreditEngineConfiguration;
  recognition: RecognitionEngineConfiguration;
  promotion: PromotionEngineConfiguration;
}

export interface GrowthOperatingSystemInput {
  activity: GrowthCreditActivity;
  configuration: GrowthOperatingSystemConfiguration;
  wallet?: GrowthWallet;
  currentLevelId?: string;
  existingLedgerKeys?: string[];
  existingWalletHistoryKeys?: string[];
  timelineRecords?: GrowthTimelineRecord[];
}

export interface GrowthOperatingSystemResult {
  creditCalculation: ReturnType<typeof calculateGrowthCredits>;
  walletUpdate?: GrowthWalletUpdateResult;
  recognition?: RecognitionEvaluationResult;
  promotion?: PromotionEvaluationResult;
  timeline: GrowthTimelineRecord[];
  events: GrowthEventIntent[];
  violations: GrowthRuleViolation[];
}

export function createDisabledGrowthAdminFeatureConfiguration(): GrowthAdminFeatureConfiguration {
  return {
    growthEngineEnabled: false,
    recognitionEnabled: false,
    leaderboardEnabled: false,
    contributionEngineEnabled: false,
    promotionEngineEnabled: false,
    growthCalculatorEnabled: false,
    recognitionTreeEnabled: false,
    achievementEngineEnabled: false,
    walletEnabled: false,
    timelineEnabled: false
  };
}

export function createEmptyGrowthOperatingSystemConfiguration(): GrowthOperatingSystemConfiguration {
  return {
    features: createDisabledGrowthAdminFeatureConfiguration(),
    credits: createEmptyGrowthCreditConfiguration(),
    recognition: createEmptyRecognitionConfiguration(),
    promotion: createDisabledPromotionConfiguration()
  };
}

export function evaluateGrowthOperatingSystemActivity(
  input: GrowthOperatingSystemInput
): GrowthOperatingSystemResult {
  const disabledEvents: GrowthEventIntent[] = input.configuration.features.growthEngineEnabled
    ? []
    : [
        {
          type: GrowthEventType.Warning,
          priority: GrowthEventPriority.Low,
          context: {
            campaignId: input.activity.campaignId,
            supporterId: input.activity.supporterId
          },
          metadata: {
            reason: "Growth Engine is disabled by campaign configuration.",
            activityId: input.activity.id
          }
        }
      ];

  if (!input.configuration.features.growthEngineEnabled) {
    const creditCalculation = calculateGrowthCredits({
      activity: input.activity,
      configuration: { ...input.configuration.credits, enabled: false },
      existingLedgerKeys: input.existingLedgerKeys
    });
    return {
      creditCalculation,
      timeline: input.timelineRecords ?? [],
      events: disabledEvents,
      violations: creditCalculation.violations
    };
  }

  const creditCalculation = calculateGrowthCredits({
    activity: input.activity,
    configuration: input.configuration.credits,
    existingLedgerKeys: input.existingLedgerKeys
  });

  const baseWallet = input.wallet ?? createGrowthWallet(input.activity.campaignId, input.activity.supporterId);
  const walletUpdate = input.configuration.features.walletEnabled
    ? applyGrowthCreditsToWallet({
        wallet: baseWallet,
        ledger: creditCalculation.ledger,
        existingHistoryKeys: input.existingWalletHistoryKeys
      })
    : undefined;

  const walletForRecognition = walletUpdate?.wallet ?? baseWallet;
  const recognition = input.configuration.features.recognitionEnabled
    ? evaluateRecognition({
        wallet: walletForRecognition,
        configuration: input.configuration.recognition,
        currentLevelId: input.currentLevelId,
        asOf: input.activity.occurredAt
      })
    : undefined;

  const promotionTarget = recognition?.nextLevel ?? recognition?.currentLevel;
  const promotion = input.configuration.features.promotionEngineEnabled && promotionTarget
    ? evaluatePromotion(
        {
          campaignId: input.activity.campaignId,
          supporterId: input.activity.supporterId,
          currentLevelId: recognition?.currentLevel?.id,
          targetLevelId: promotionTarget.id,
          targetLevelOrder: promotionTarget.order,
          promotionCreditsAvailable: walletForRecognition.balance.promotionCredits,
          promotionCreditsRequired: promotionTarget.promotionCreditsRequired,
          promotionPercentage: promotionTarget.promotionPercentage,
          occurredAt: input.activity.occurredAt,
          duplicateKey: input.activity.duplicateKey
        },
        {
          ...input.configuration.promotion,
          roundConfiguration: promotionTarget.roundStrategy,
          distributionConfiguration: promotionTarget.distributionStrategy
        }
      )
    : undefined;

  const baseEvents = [
    ...creditCalculation.events,
    ...(walletUpdate?.events ?? []),
    ...(recognition?.events ?? []),
    ...(promotion?.events ?? [])
  ];

  const timeline = input.configuration.features.timelineEnabled
    ? baseEvents.reduce(
        (records, intent) =>
          createTimelineRecordFromEvent({
            records,
            intent
          }).records,
        input.timelineRecords ?? []
      )
    : input.timelineRecords ?? [];
  const previousTimelineCount = input.timelineRecords?.length ?? 0;
  const timelineEvents: GrowthEventIntent[] = input.configuration.features.timelineEnabled
    ? timeline.slice(previousTimelineCount).map((record) => ({
        type: GrowthEventType.GrowthTimelineRecorded,
        priority: GrowthEventPriority.Low,
        context: {
          campaignId: record.campaignId,
          supporterId: record.supporterId
        },
        metadata: {
          timelineRecordId: record.id,
          kind: record.kind,
          duplicateKey: record.duplicateKey
        }
      }))
    : [];
  const events = [...baseEvents, ...timelineEvents];

  return {
    creditCalculation,
    walletUpdate,
    recognition,
    promotion,
    timeline,
    events,
    violations: [
      ...creditCalculation.violations,
      ...(walletUpdate?.violations ?? []),
      ...(recognition?.violations ?? []),
      ...(promotion?.violations ?? [])
    ]
  };
}
