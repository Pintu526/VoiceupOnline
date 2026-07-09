import type { Signer } from "../../types";
import {
  getSupporterReferralCode,
  normalizeReferralCode,
  REFERRAL_SIGNATURE_POINTS
} from "../../utils/referrals";
import type { ReferralDomainModel } from "../types";
import type { SupporterGrowthAccount } from "./types";

export function buildSupporterGrowthAccounts(
  signers: Signer[],
  referralDomain: ReferralDomainModel
): SupporterGrowthAccount[] {
  const referralByCode = new Map(referralDomain.nodes.map((node) => [node.code, node]));

  return signers.map((signer) => {
    const referralCode = getSupporterReferralCode(signer);
    const referralNode = referralByCode.get(referralCode);
    const verifiedSignaturePoints = signer.status === "verified" || signer.otpVerified ? 5 : 0;
    const fieldParticipationPoints = signer.source === "field" || signer.source === "scan" ? 4 : 0;
    const directReferralPoints = (referralNode?.directSignatures ?? 0) * REFERRAL_SIGNATURE_POINTS;
    const currentBalance = directReferralPoints + verifiedSignaturePoints + fieldParticipationPoints;

    return {
      supporterId: signer.id,
      campaignId: signer.campaignId,
      referralCode,
      parentReferralCode: normalizeReferralCode(signer.referredBy || signer.referredByPhoneOrCode) || undefined,
      currentBalance,
      lifetimeEarnedPoints: currentBalance,
      lifetimeContributedPoints: 0,
      receivedContributionPoints: 0,
      verifiedReferrals: referralNode?.directSignatures ?? 0,
      conversions: signer.status === "verified" || signer.otpVerified ? 1 : 0,
      volunteerParticipations: signer.source === "field" ? 1 : 0,
      campaignParticipations: 1,
      lastCalculatedAt: signer.signedAt,
      metadata: {
        source: signer.source,
        status: signer.status
      }
    };
  });
}
