import {
  appendGauPointLedgerEntry,
  getGauPointBalance,
  type GauPointLedgerEntry,
  type GauPointLedgerState
} from "./ledger";
import { calculateGauPointRoundContribution } from "./roundContribution";

export interface GauPointRoundTransferRequest {
  campaignId: string;
  supporterId: string;
  round: number;
  contributionPercentage: number;
  upstreamAncestors: readonly (string | null)[];
}
export interface GauPointRoundTransferResult {
  state: GauPointLedgerState;
  applied: boolean;
  contributedPoints: number;
  allocatedPoints: number;
  pendingPoints: number;
}

/** Pure in-memory atomic transition; NOT a database transaction. */
export function applyGauPointRoundTransfer(
  state: GauPointLedgerState,
  request: GauPointRoundTransferRequest
): GauPointRoundTransferResult {
  if (!request.campaignId?.trim() || !request.supporterId?.trim()) {
    throw new Error("Campaign and supporter IDs are required.");
  }
  if (!Number.isSafeInteger(request.round) || request.round < 1 ||
      !Number.isFinite(request.contributionPercentage) ||
      request.contributionPercentage < 0 || request.contributionPercentage > 100 ||
      request.upstreamAncestors.length !== request.round) {
    throw new Error("Invalid round request.");
  }
  if (request.upstreamAncestors.includes(request.supporterId)) {
    throw new Error("Contributor cannot receive own upstream contribution.");
  }
  const seen = new Set<string>();
  for (const ancestor of request.upstreamAncestors) {
    if (ancestor === null) continue;
    if (!ancestor.trim() || seen.has(ancestor)) {
      throw new Error("Ancestors must be distinct nonempty IDs.");
    }
    seen.add(ancestor);
  }
  const prefix = JSON.stringify(["gaupoint-round", request.campaignId,
    request.supporterId, request.round]);
  const fingerprint = JSON.stringify([request.contributionPercentage,
    [...request.upstreamAncestors]]);
  const existing = state.entries.filter(entry => entry.referenceId === prefix);
  if (existing.length) {
    const marker = existing.find(entry => entry.idempotencyKey === `${prefix}:debit`);
    if (!marker || marker.supporterId !== request.supporterId ||
        marker.requestFingerprint !== fingerprint) {
      throw new Error("Conflicting or legacy round replay; manual review required.");
    }
    if (marker.kind === "round_completion" && marker.points === 0 && existing.length === 1) {
      return { state, applied: false, contributedPoints: 0, allocatedPoints: 0, pendingPoints: 0 };
    }
    if (marker.kind !== "round_contribution" || marker.points >= 0) {
      throw new Error("Invalid round completion marker.");
    }
    const expected = new Map<string, { kind: string; supporterId: string; points: number }>();
    let allocated = 0;
    let pending = 0;
    for (let i = 0; i < request.round; i++) {
      const key = `${prefix}:share:${i + 1}`;
      const recorded = existing.find(entry => entry.idempotencyKey === key);
      if (!recorded) continue; // zero-value shares are intentionally omitted
      const ancestor = request.upstreamAncestors[i];
      const kind = ancestor === null ? "pending_contribution" : "upstream_receipt";
      const recipient = ancestor ?? request.supporterId;
      if (recorded.kind !== kind || recorded.supporterId !== recipient ||
          recorded.points <= 0 || expected.has(key)) {
        throw new Error("Corrupt round share.");
      }
      expected.set(key, { kind, supporterId: recipient, points: recorded.points });
      if (ancestor === null) pending += recorded.points;
      else allocated += recorded.points;
    }
    if (existing.length !== expected.size + 1 || -marker.points !== allocated + pending ||
        !Number.isSafeInteger(allocated + pending)) {
      throw new Error("Incomplete or inconsistent round transaction.");
    }
    return { state, applied: false, contributedPoints: -marker.points,
      allocatedPoints: allocated, pendingPoints: pending };
  }
  const calculation = calculateGauPointRoundContribution(request.round,
    getGauPointBalance(state, request.supporterId), request.contributionPercentage,
    request.upstreamAncestors);
  const entries: GauPointLedgerEntry[] = [{
    idempotencyKey: `${prefix}:debit`, supporterId: request.supporterId,
    kind: calculation.contributionPoints === 0 ? "round_completion" : "round_contribution",
    points: -calculation.contributionPoints, referenceId: prefix,
    requestFingerprint: fingerprint
  }];
  calculation.shares.forEach((share, index) => {
    if (!share.points) return;
    entries.push({
      idempotencyKey: `${prefix}:share:${index + 1}`,
      supporterId: share.ancestorSupporterId ?? request.supporterId,
      kind: share.status === "allocated" ? "upstream_receipt" : "pending_contribution",
      points: share.points, referenceId: prefix
    });
  });
  let next = state;
  for (const entry of entries) next = appendGauPointLedgerEntry(next, entry).state;
  return { state: next, applied: true, contributedPoints: calculation.contributionPoints,
    allocatedPoints: calculation.allocatedPoints, pendingPoints: calculation.pendingPoints };
}
