/**
 * Pure GauPoint round-transition contribution calculator.
 *
 * Monetary value: none.
 * Redeemability: none.
 * No wallet mutations or ledger writes occur here.
 *
 * Amounts are integer GauPoints. The contribution total is
 * rounded down, and division remainders are assigned in
 * upstream-level order to preserve every point.
 */

export interface GauPointContributionShare {
  level: number;
  ancestorSupporterId: string | null;
  points: number;
  status: "allocated" | "pending";
}

export interface GauPointRoundContribution {
  round: number;
  openingBalance: number;
  contributionPoints: number;
  remainingBalance: number;
  allocatedPoints: number;
  pendingPoints: number;
  shares: GauPointContributionShare[];
}

export function calculateGauPointRoundContribution(
  round: number,
  availableBalance: number,
  contributionPercentage: number,
  upstreamAncestors: readonly (string | null)[]
): GauPointRoundContribution {
  if (!Number.isSafeInteger(round) || round < 1) {
    throw new Error("Round must be a positive integer.");
  }

  if (!Number.isSafeInteger(availableBalance) || availableBalance < 0) {
    throw new Error("Available balance must be a nonnegative safe integer.");
  }

  if (!Number.isFinite(contributionPercentage) ||
      contributionPercentage < 0 ||
      contributionPercentage > 100) {
    throw new Error("Contribution percentage must be between 0 and 100.");
  }

  if (upstreamAncestors.length !== round) {
    throw new Error("Upstream ancestor slots must equal the round.");
  }

  const seen = new Set<string>();

  for (const ancestor of upstreamAncestors) {
    if (ancestor === null) continue;

    if (!ancestor.trim() || seen.has(ancestor)) {
      throw new Error("Upstream ancestors must be distinct nonempty IDs.");
    }

    seen.add(ancestor);
  }

  const contributionPoints = Math.floor(
    (availableBalance / 100) * contributionPercentage
  );

  const baseShare = Math.floor(contributionPoints / round);
  const remainder = contributionPoints % round;

  const shares: GauPointContributionShare[] = upstreamAncestors.map(
    (ancestorSupporterId, index) => ({
      level: index + 1,
      ancestorSupporterId,
      points: baseShare + (index < remainder ? 1 : 0),
      status: ancestorSupporterId === null ? "pending" : "allocated"
    })
  );

  const allocatedPoints = shares
    .filter(share => share.status === "allocated")
    .reduce((total, share) => total + share.points, 0);

  const pendingPoints = contributionPoints - allocatedPoints;

  return {
    round,
    openingBalance: availableBalance,
    contributionPoints,
    remainingBalance: availableBalance - contributionPoints,
    allocatedPoints,
    pendingPoints,
    shares
  };
}
