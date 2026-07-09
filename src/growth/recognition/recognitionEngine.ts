import { GrowthEventPriority, GrowthEventType } from "../events";
import type {
  RecognitionEngineConfiguration,
  RecognitionEvaluationInput,
  RecognitionEvaluationResult,
  RecognitionLevelConfiguration
} from "./types";

function violation(message: string) {
  return {
    code: "invalid_configuration" as const,
    message,
    severity: "error" as const
  };
}

function byOrder(left: RecognitionLevelConfiguration, right: RecognitionLevelConfiguration) {
  return left.order - right.order;
}

function isActive(level: RecognitionLevelConfiguration, asOf: string) {
  const asOfTime = new Date(asOf).getTime();
  const startTime = level.effectiveStartAt ? new Date(level.effectiveStartAt).getTime() : undefined;
  const endTime = level.effectiveEndAt ? new Date(level.effectiveEndAt).getTime() : undefined;
  if (Number.isFinite(startTime) && asOfTime < Number(startTime)) return false;
  if (Number.isFinite(endTime) && asOfTime > Number(endTime)) return false;
  return true;
}

function progress(current: number, required: number) {
  if (required <= 0) return 100;
  return Math.min(100, Math.round((current / required) * 100));
}

export function createEmptyRecognitionConfiguration(): RecognitionEngineConfiguration {
  return {
    enabled: false,
    levels: []
  };
}

export function validateRecognitionConfiguration(configuration: RecognitionEngineConfiguration) {
  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  return configuration.levels.reduce<ReturnType<typeof violation>[]>((items, level) => {
    const nextItems = [...items];
    if (!level.id.trim()) nextItems.push(violation("Recognition level id is required."));
    if (!level.name.trim()) nextItems.push(violation(`Recognition level ${level.id || level.order} needs a name.`));
    if (seenIds.has(level.id)) nextItems.push(violation(`Recognition level ${level.id} is duplicated.`));
    if (seenOrders.has(level.order)) nextItems.push(violation(`Recognition level order ${level.order} is duplicated.`));
    if (level.order < 1) nextItems.push(violation(`Recognition level ${level.id} order must be positive.`));
    if (level.promotionCreditsRequired < 0) {
      nextItems.push(violation(`Recognition level ${level.id} cannot require negative promotion credits.`));
    }
    if ((level.minimumWalletCredits ?? 0) < 0) {
      nextItems.push(violation(`Recognition level ${level.id} cannot require negative wallet credits.`));
    }
    if (level.promotionPercentage < 0 || level.promotionPercentage > 100) {
      nextItems.push(violation(`Recognition level ${level.id} promotion percentage must be between 0 and 100.`));
    }
    seenIds.add(level.id);
    seenOrders.add(level.order);
    return nextItems;
  }, []);
}

export function evaluateRecognition(input: RecognitionEvaluationInput): RecognitionEvaluationResult {
  const asOf = input.asOf ?? new Date().toISOString();
  const violations = validateRecognitionConfiguration(input.configuration);
  const activeLevels = input.configuration.levels
    .filter((level) => isActive(level, asOf))
    .filter((level) => level.visible !== false)
    .sort(byOrder);

  const currentLevel = activeLevels
    .filter((level) => input.wallet.balance.promotionCredits >= level.promotionCreditsRequired)
    .filter((level) => input.wallet.balance.walletCredits >= (level.minimumWalletCredits ?? 0))
    .reduce<RecognitionLevelConfiguration | undefined>((selected, level) => {
      if (!selected || level.order > selected.order) return level;
      return selected;
    }, undefined);

  const nextLevel = activeLevels.find((level) => !currentLevel || level.order > currentLevel.order);
  const promotionTarget = nextLevel ?? currentLevel;
  const promotionReady = Boolean(
    input.configuration.enabled &&
      promotionTarget &&
      input.wallet.balance.promotionCredits >= promotionTarget.promotionCreditsRequired
  );
  const previousLevelId = input.currentLevelId;
  const changed = Boolean(currentLevel?.id && currentLevel.id !== previousLevelId);

  return {
    supporterId: input.wallet.supporterId,
    campaignId: input.wallet.campaignId,
    currentLevel,
    nextLevel,
    promotionReady,
    progressPercentage: progress(input.wallet.balance.promotionCredits, promotionTarget?.promotionCreditsRequired ?? 0),
    events: [
      {
        type: GrowthEventType.GrowthRecognitionEvaluated,
        priority: changed ? GrowthEventPriority.High : GrowthEventPriority.Normal,
        context: {
          campaignId: input.wallet.campaignId,
          supporterId: input.wallet.supporterId
        },
        metadata: {
          previousLevelId,
          currentLevelId: currentLevel?.id,
          nextLevelId: nextLevel?.id,
          promotionReady,
          progressPercentage: progress(input.wallet.balance.promotionCredits, promotionTarget?.promotionCreditsRequired ?? 0)
        }
      },
      ...(changed
        ? [
            {
              type: GrowthEventType.GrowthRecognitionChanged,
              priority: GrowthEventPriority.High,
              context: {
                campaignId: input.wallet.campaignId,
                supporterId: input.wallet.supporterId
              },
              metadata: {
                fromLevelId: previousLevelId,
                toLevelId: currentLevel?.id,
                name: currentLevel?.name
              }
            }
          ]
        : [])
    ],
    violations
  };
}
