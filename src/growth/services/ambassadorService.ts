import type { Signer } from "../../types";
import { getSafeReferrerLabel, getSupporterReferralCode } from "../../utils/referrals";
import { buildSupporterGrowthAccounts } from "../contributions/accountBuilder";
import type {
  AmbassadorDomainModel,
  AmbassadorLevel,
  AmbassadorProfile,
  ReferralDomainModel
} from "../types";

function getAmbassadorLevel(points: number): AmbassadorLevel {
  if (points >= 100) return "Movement Ambassador";
  if (points >= 70) return "District Champion";
  if (points >= 40) return "Top Referrer";
  if (points >= 15) return "Community Promoter";
  return "Supporter";
}

function getLocationLabel(signer: Signer) {
  return [signer.panchayat, signer.block, signer.district, signer.state, signer.country]
    .filter(Boolean)
    .join(", ") || "Location not captured";
}

export function buildAmbassadorDomain(
  signers: Signer[],
  referralDomain: ReferralDomainModel
): AmbassadorDomainModel {
  const accountsBySupporter = new Map(
    buildSupporterGrowthAccounts(signers, referralDomain).map((account) => [account.supporterId, account])
  );

  const profiles = signers.map<AmbassadorProfile>((signer) => {
    const code = getSupporterReferralCode(signer);
    const account = accountsBySupporter.get(signer.id);
    const directReferrals = account?.verifiedReferrals ?? 0;
    const verifiedSignatures = account?.conversions ?? 0;
    const fieldSignatures = signer.source === "field" || signer.source === "scan" ? 1 : 0;
    const totalPoints = account?.currentBalance ?? 0;

    return {
      id: `${code}-${signer.id}`,
      signerId: signer.id,
      name: getSafeReferrerLabel(signer) || signer.name || "Unnamed supporter",
      code,
      level: getAmbassadorLevel(totalPoints),
      location: getLocationLabel(signer),
      directReferrals,
      verifiedSignatures,
      fieldSignatures,
      totalPoints,
      lastActivityAt: signer.signedAt
    };
  });

  const sortedProfiles = profiles.sort((left, right) => {
    if (right.totalPoints !== left.totalPoints) return right.totalPoints - left.totalPoints;
    return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
  });

  return {
    profiles: sortedProfiles,
    activeAmbassadors: sortedProfiles.filter((profile) => profile.totalPoints > 0).length,
    topLevel: sortedProfiles[0]?.level ?? "Supporter"
  };
}
