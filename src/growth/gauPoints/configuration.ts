/**
 * Campaign-scoped, noncash recognition configuration.
 * Initial values are configurable defaults, not permanent reward constants.
 */
export interface GauPointConfiguration {
  enabled: boolean;
  verifiedSigningPoints: number;
  verifiedRegistrationReferralPoints: number;
  branchFactor: number;
  maximumRound: number;
  roundContributionPercentage: number;
  distributionFormula: "equal";
  redeemable: false;
}

export function createDefaultGauPointConfiguration(): GauPointConfiguration {
  return {
    enabled: false,
    verifiedSigningPoints: 500,
    verifiedRegistrationReferralPoints: 300,
    branchFactor: 2,
    maximumRound: 12,
    roundContributionPercentage: 50,
    distributionFormula: "equal",
    redeemable: false
  };
}

export function validateGauPointConfiguration(
  config: GauPointConfiguration
): string[] {
  const errors: string[] = [];

  if (!Number.isSafeInteger(config.verifiedSigningPoints) ||
      config.verifiedSigningPoints < 0) {
    errors.push("Signing points must be a nonnegative integer.");
  }

  if (!Number.isSafeInteger(config.verifiedRegistrationReferralPoints) ||
      config.verifiedRegistrationReferralPoints < 0) {
    errors.push("Referral points must be a nonnegative integer.");
  }

  if (!Number.isSafeInteger(config.branchFactor) ||
      config.branchFactor < 2 || config.branchFactor > 10) {
    errors.push("Branch factor must be an integer from 2 to 10.");
  }

  if (!Number.isSafeInteger(config.maximumRound) ||
      config.maximumRound < 1 || config.maximumRound > 12) {
    errors.push("Maximum round must be an integer from 1 to 12.");
  }

  if (!Number.isFinite(config.roundContributionPercentage) ||
      config.roundContributionPercentage < 0 ||
      config.roundContributionPercentage > 100) {
    errors.push("Round contribution percentage must be between 0 and 100.");
  }

  if (config.distributionFormula !== "equal") {
    errors.push("Only equal distribution is supported.");
  }

  if (config.redeemable !== false) {
    errors.push("GauPoints must remain nonredeemable.");
  }

  return errors;
}
