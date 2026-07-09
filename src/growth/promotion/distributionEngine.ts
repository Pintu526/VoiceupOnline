import type {
  ContributionDistributionConfiguration,
  PromotionRoundAllocation
} from "./types";

function roundCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizePercentages(percentages: number[], desiredLength: number) {
  const cleaned = percentages.slice(0, desiredLength).map((percentage) => Math.max(0, percentage));
  const total = cleaned.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Array.from({ length: desiredLength }, () => 0);
  return cleaned.map((percentage) => (percentage / total) * 100);
}

function progressivePercentages(rounds: number[]) {
  const weights = rounds.map((round) => Math.max(1, rounds.length - round + 1));
  return normalizePercentages(weights, rounds.length);
}

export function calculatePromotionDistribution(
  promotionPool: number,
  rounds: number[],
  configuration: ContributionDistributionConfiguration
): PromotionRoundAllocation[] {
  if (!configuration.enabled || promotionPool <= 0 || rounds.length === 0) return [];

  const cappedRounds = rounds.slice(0, Math.max(0, Math.min(configuration.depth, configuration.maximumLevels)));
  const poolForDistribution = roundCredits((promotionPool * Math.max(0, configuration.contributionPercentage)) / 100);
  if (poolForDistribution <= 0 || cappedRounds.length === 0) return [];

  const percentages = (() => {
    if (configuration.formula === "equal") {
      return Array.from({ length: cappedRounds.length }, () => 100 / cappedRounds.length);
    }
    if (configuration.formula === "progressive") {
      return progressivePercentages(cappedRounds);
    }
    if (configuration.formula === "custom" || configuration.formula === "percentage") {
      return normalizePercentages(configuration.customPercentages ?? [], cappedRounds.length);
    }
    return [];
  })();

  let usedCredits = 0;
  return cappedRounds.map((round, index) => {
    const isLast = index === cappedRounds.length - 1;
    const credits = isLast
      ? roundCredits(poolForDistribution - usedCredits)
      : roundCredits((poolForDistribution * percentages[index]) / 100);
    usedCredits += credits;
    return {
      round,
      percentage: roundCredits(percentages[index] ?? 0),
      credits
    };
  });
}
