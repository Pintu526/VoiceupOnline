/**
 * GauPoint-only, noncash, nonredeemable ledger foundation.
 *
 * Pure immutable state transitions. Persistence, authorization,
 * atomic database writes and fraud reconciliation are separate.
 */

export type GauPointLedgerEntryKind =
  | "verified_signing"
  | "verified_registration_referral"
  | "round_contribution"
  | "upstream_receipt"
  | "pending_contribution"
  | "pending_refund"
  | "fraud_reversal"
  | "round_completion";

export interface GauPointLedgerEntry {
  idempotencyKey: string;
  supporterId: string;
  kind: GauPointLedgerEntryKind;
  points: number;
  referenceId: string;
  /** Canonical round request identity, recorded on completion marker. */
  requestFingerprint?: string;
}

export interface GauPointLedgerState {
  entries: readonly GauPointLedgerEntry[];
}

export interface GauPointLedgerResult {
  state: GauPointLedgerState;
  applied: boolean;
}

export function createEmptyGauPointLedger(): GauPointLedgerState {
  return { entries: [] };
}

export function getGauPointBalance(
  state: GauPointLedgerState,
  supporterId: string
): number {
  const balance = state.entries
    .filter(entry => entry.supporterId === supporterId &&
      entry.kind !== "pending_contribution")
    .reduce((sum, entry) => sum + entry.points, 0);

  if (!Number.isSafeInteger(balance)) {
    throw new Error("GauPoint balance exceeds safe integer limits.");
  }

  return balance;
}

export function appendGauPointLedgerEntry(
  state: GauPointLedgerState,
  entry: GauPointLedgerEntry
): GauPointLedgerResult {
  if (!entry.idempotencyKey?.trim() ||
      !entry.supporterId?.trim() ||
      !entry.referenceId?.trim()) {
    throw new Error("Ledger identifiers must be nonempty.");
  }

  if (!Number.isSafeInteger(entry.points) ||
      (entry.points === 0 && entry.kind !== "round_completion") ||
      (entry.kind === "round_completion" && entry.points !== 0)) {
    throw new Error("Ledger points must be a nonzero safe integer.");
  }

  const allowedKinds: readonly GauPointLedgerEntryKind[] = [
    "verified_signing",
    "verified_registration_referral",
    "round_contribution",
    "upstream_receipt",
    "pending_contribution",
    "pending_refund",
    "fraud_reversal",
    "round_completion"
  ];

  if (!allowedKinds.includes(entry.kind)) {
    throw new Error("Unsupported GauPoint ledger entry kind.");
  }

  const creditKinds: readonly GauPointLedgerEntryKind[] = [
    "verified_signing",
    "verified_registration_referral",
    "upstream_receipt",
    "pending_refund"
  ];

  const debitKinds: readonly GauPointLedgerEntryKind[] = [
    "round_contribution"
  ];

  if (creditKinds.includes(entry.kind) && entry.points < 0) {
    throw new Error("Credit entry cannot be negative.");
  }

  if (debitKinds.includes(entry.kind) && entry.points > 0) {
    throw new Error("Contribution entry must be negative.");
  }

  const existing = state.entries.find(
    item => item.idempotencyKey === entry.idempotencyKey
  );

  if (existing) {
    if (existing.supporterId !== entry.supporterId ||
        existing.kind !== entry.kind ||
        existing.points !== entry.points ||
        existing.referenceId !== entry.referenceId ||
        existing.requestFingerprint !== entry.requestFingerprint) {
      throw new Error("Conflicting GauPoint idempotency key.");
    }

    return { state, applied: false };
  }

  const balance = getGauPointBalance(state, entry.supporterId);
  const nextBalance = balance + entry.points;

  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
    throw new Error("Insufficient GauPoint balance or integer overflow.");
  }

  const storedEntry = Object.freeze({ ...entry });

  return {
    state: {
      entries: Object.freeze([...state.entries, storedEntry])
    },
    applied: true
  };
}

