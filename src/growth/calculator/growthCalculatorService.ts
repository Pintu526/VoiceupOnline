import type {
  CampaignGrowthCalculatorInput,
  CampaignGrowthCalculatorOutput,
  SupporterGrowthCalculatorInput,
  SupporterGrowthCalculatorOutput
} from "./types";
import { GrowthEventPriority, GrowthEventType, type GrowthEventIntent } from "../events";

function positive(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function ratio(value: number) {
  return Math.min(1, positive(value) / 100);
}

function round(value: number) {
  return Math.round(positive(value) * 100) / 100;
}

export function simulateCampaignGrowth(
  input: CampaignGrowthCalculatorInput
): CampaignGrowthCalculatorOutput {
  const verifiedParticipants = input.participants * ratio(input.verificationRate);
  const referralReach = verifiedParticipants * positive(input.averageReferrals);
  const projectedReach = round(input.participants + referralReach);
  const averagePromotionRequirement =
    input.promotionRules.length > 0
      ? input.promotionRules.reduce((sum, rule) => sum + rule.promotionCreditsRequired, 0) / input.promotionRules.length
      : 0;
  const projectedCredits = round(verifiedParticipants * Math.max(1, input.averageReferrals));
  const projectedPromotions = averagePromotionRequirement > 0
    ? Math.floor(projectedCredits / averagePromotionRequirement)
    : 0;
  const projectedContribution = round(
    projectedCredits * ratio(input.contributionRules.contributionPercentage)
  );

  return {
    projectedReach,
    projectedCredits,
    projectedPromotions,
    projectedContribution,
    projectedLeaderboardSize: Math.min(Math.round(projectedReach), 100),
    projectedPrizeBudget: projectedPromotions,
    projectedViralMultiplier: input.participants > 0 ? round(projectedReach / input.participants) : 0
  };
}

export function simulateSupporterGrowth(
  input: SupporterGrowthCalculatorInput
): SupporterGrowthCalculatorOutput {
  const verifiedSupporters = input.invitedSupporters * ratio(input.expectedVerificationRate);
  const expectedWallet = round(verifiedSupporters * input.averageCreditsPerVerifiedSupporter);
  const targetRequirement = input.targetRecognitionLevel?.promotionCreditsRequired ?? 0;
  const expectedPromotion = targetRequirement > 0 ? Math.min(100, round((expectedWallet / targetRequirement) * 100)) : 0;
  const expectedContribution = round(expectedWallet * ratio(input.targetRecognitionLevel?.promotionPercentage ?? 0));

  return {
    expectedWallet,
    expectedPromotion,
    expectedContribution,
    expectedRecognition:
      targetRequirement > 0 && expectedWallet >= targetRequirement ? input.targetRecognitionLevel?.name : undefined,
    expectedRankScore: round(expectedWallet + verifiedSupporters),
    expectedPrizeEligibility: Boolean(
      input.targetRecognitionLevel?.prizeEligibility && targetRequirement > 0 && expectedWallet >= targetRequirement
    )
  };
}

export function createCampaignGrowthSimulationEvent(
  input: CampaignGrowthCalculatorInput,
  output: CampaignGrowthCalculatorOutput,
  campaignId?: string
): GrowthEventIntent {
  return {
    type: GrowthEventType.GrowthCalculationSimulated,
    priority: GrowthEventPriority.Low,
    context: { campaignId },
    metadata: {
      calculator: "campaign_admin",
      participants: input.participants,
      projectedReach: output.projectedReach,
      projectedPromotions: output.projectedPromotions,
      projectedViralMultiplier: output.projectedViralMultiplier
    }
  };
}

export function createSupporterGrowthSimulationEvent(
  input: SupporterGrowthCalculatorInput,
  output: SupporterGrowthCalculatorOutput,
  campaignId?: string,
  supporterId?: string
): GrowthEventIntent {
  return {
    type: GrowthEventType.GrowthCalculationSimulated,
    priority: GrowthEventPriority.Low,
    context: { campaignId, supporterId },
    metadata: {
      calculator: "supporter",
      invitedSupporters: input.invitedSupporters,
      expectedWallet: output.expectedWallet,
      expectedPromotion: output.expectedPromotion,
      expectedPrizeEligibility: output.expectedPrizeEligibility
    }
  };
}
