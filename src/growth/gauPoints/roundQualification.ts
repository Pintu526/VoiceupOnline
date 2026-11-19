/**
 * N-branch round qualification based on distinct, verified
 * registrations in each fresh referral-tree generation.
 *
 * This is a pure calculator. It does not issue points,
 * modify wallets, or trigger round transitions.
 */

export interface GauPointRoundRequirement {
  round: number;
  requiredFreshRegistrations: number;
  cumulativeRequiredRegistrations: number;
}

export function calculateRoundRequirements(
  branchFactor: number,
  maximumRound: number
): GauPointRoundRequirement[] {
  if (!Number.isSafeInteger(branchFactor) || branchFactor < 2) {
    throw new Error("Branch factor must be an integer of at least 2.");
  }

  if (!Number.isSafeInteger(maximumRound) || maximumRound < 0) {
    throw new Error("Maximum round must be a nonnegative integer.");
  }

  const result: GauPointRoundRequirement[] = [];
  let fresh = 1;
  let cumulative = 0;

  for (let round = 1; round <= maximumRound; round++) {
    fresh *= branchFactor;
    cumulative += fresh;

    if (!Number.isSafeInteger(fresh) ||
        !Number.isSafeInteger(cumulative)) {
      throw new Error("Round registration count exceeds safe integer limits.");
    }

    result.push({
      round,
      requiredFreshRegistrations: fresh,
      cumulativeRequiredRegistrations: cumulative
    });
  }

  return result;
}

export function highestQualifiedRound(
  branchFactor: number,
  verifiedRegistrationsByGeneration: readonly number[]
): number {
  const requirements = calculateRoundRequirements(
    branchFactor,
    verifiedRegistrationsByGeneration.length
  );

  let qualified = 0;

  for (const requirement of requirements) {
    const count =
      verifiedRegistrationsByGeneration[requirement.round - 1] ?? 0;

    if (!Number.isSafeInteger(count) ||
        count < requirement.requiredFreshRegistrations) {
      break;
    }

    qualified = requirement.round;
  }

  return qualified;
}
