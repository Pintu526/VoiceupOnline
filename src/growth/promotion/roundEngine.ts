import type { PromotionRoundConfiguration } from "./types";

export function resolvePromotionRounds(
  levelOrder: number,
  configuration: PromotionRoundConfiguration
): number[] {
  if (configuration.strategy === "custom") {
    return (configuration.customRounds ?? [])
      .filter((round) => Number.isFinite(round) && round > 0)
      .sort((left, right) => left - right);
  }

  const count = configuration.strategy === "fixed"
    ? Math.max(0, Math.floor(configuration.fixedRounds ?? 0))
    : Math.max(0, Math.floor(levelOrder));

  return Array.from({ length: count }, (_, index) => index + 1);
}
