import type { Signer } from "../../types";
import {
  getSafeReferrerLabel,
  getSupporterReferralCode,
  normalizeReferralCode,
  REFERRAL_SIGNATURE_POINTS
} from "../../utils/referrals";
import type { GrowthChannel, ReferralDomainModel, ReferralEdge, ReferralNode } from "../types";

function getLocationLabel(signer: Signer | undefined) {
  if (!signer) return "External or manual referral";
  return [signer.panchayat, signer.block, signer.district, signer.state, signer.country]
    .filter(Boolean)
    .join(", ") || "Location not captured";
}

export function getGrowthChannel(signer: Signer): GrowthChannel {
  if (signer.referredBy || signer.referredByPhoneOrCode) return "referral";
  if (signer.source === "field") return "field";
  if (signer.source === "scan") return "scan";
  return "direct";
}

export function buildReferralDomain(signers: Signer[]): ReferralDomainModel {
  const edges = signers.reduce<ReferralEdge[]>((items, signer) => {
    const referrerCode = normalizeReferralCode(signer.referredBy || signer.referredByPhoneOrCode);
    if (!referrerCode) return items;
    return [
      ...items,
      {
        referrerCode,
        signerId: signer.id,
        signerName: signer.name || "Unnamed supporter",
        signedAt: signer.signedAt,
        channel: "referral"
      }
    ];
  }, []);

  const nodes = edges.reduce<Record<string, ReferralNode>>((items, edge) => {
    const referrer = signers.find((signer) => getSupporterReferralCode(signer) === edge.referrerCode);
    const current = items[edge.referrerCode] ?? {
      code: edge.referrerCode,
      label: referrer ? getSafeReferrerLabel(referrer) : edge.referrerCode,
      signerId: referrer?.id,
      location: getLocationLabel(referrer),
      directSignatures: 0,
      points: 0
    };
    return {
      ...items,
      [edge.referrerCode]: {
        ...current,
        directSignatures: current.directSignatures + 1,
        points: current.points + REFERRAL_SIGNATURE_POINTS
      }
    };
  }, {});

  const sortedNodes = Object.values(nodes).sort((left, right) => right.points - left.points);
  return {
    nodes: sortedNodes,
    edges,
    referredSignatures: edges.length,
    referralRate: signers.length ? Math.round((edges.length / signers.length) * 100) : 0,
    strongestCode: sortedNodes[0]?.code ?? ""
  };
}
