import type { ScanReviewItem, Signer } from "./types";
import type { ScanApprovalResultCode } from "./backend";

export interface ScanApprovalCounts {
  approved: number;
  skippedAlreadyApproved: number;
  skippedDuplicate: number;
  validationFailed: number;
  consentMissing: number;
  staleConflict: number;
  failed: number;
  operatorMessage?: string;
}

export function createScanApprovalCounts(): ScanApprovalCounts {
  return {
    approved: 0,
    skippedAlreadyApproved: 0,
    skippedDuplicate: 0,
    validationFailed: 0,
    consentMissing: 0,
    staleConflict: 0,
    failed: 0
  };
}

export function countScanApprovalResult(
  counts: ScanApprovalCounts,
  code: ScanApprovalResultCode
): void {
  if (code === "approval_completed") counts.approved += 1;
  else if (
    code === "approval_already_completed"
    || code === "existing_supporter_returned"
    || code === "already_approved"
  ) counts.skippedAlreadyApproved += 1;
  else if (code === "exact_phone_duplicate_blocked" || code === "same_source_row_blocked") {
    counts.skippedDuplicate += 1;
  } else if (code === "validation_failed") counts.validationFailed += 1;
  else if (code === "consent_missing") counts.consentMissing += 1;
  else if (code === "stale_review_version") counts.staleConflict += 1;
  else counts.failed += 1;
}

interface PlanScanApprovalsInput {
  campaignId: string;
  requestedScanItemIds: string[];
  scanItems: ScanReviewItem[];
  signers: Signer[];
  createSigner: (scan: ScanReviewItem, currentSigners: Signer[]) => Signer;
}

export interface ScanApprovalPlan {
  newSigners: Signer[];
  approvedScanItemIds: string[];
  counts: ScanApprovalCounts;
}

export function planScanApprovals({
  campaignId,
  requestedScanItemIds,
  scanItems,
  signers,
  createSigner
}: PlanScanApprovalsInput): ScanApprovalPlan {
  const counts = createScanApprovalCounts();
  const newSigners: Signer[] = [];
  const approvedScanItemIds = new Set<string>();
  const processedRequestIds = new Set<string>();
  const scanItemsById = new Map(scanItems.map((item) => [item.id, item]));
  const workingSigners = [...signers];

  for (const requestedScanItemId of requestedScanItemIds) {
    if (processedRequestIds.has(requestedScanItemId)) {
      counts.skippedDuplicate += 1;
      continue;
    }
    processedRequestIds.add(requestedScanItemId);

    const scan = scanItemsById.get(requestedScanItemId);
    if (!scan || scan.campaignId !== campaignId || scan.status === "Rejected") {
      counts.failed += 1;
      continue;
    }
    if (scan.status === "Approved") {
      counts.skippedAlreadyApproved += 1;
      continue;
    }

    const linkedSigner = workingSigners.find(
      (signer) =>
        signer.campaignId === campaignId &&
        signer.source === "scan" &&
        signer.sourceScanItemId === scan.id
    );
    if (linkedSigner) {
      counts.skippedDuplicate += 1;
      approvedScanItemIds.add(scan.id);
      continue;
    }

    try {
      const signer = createSigner(scan, workingSigners);
      if (signer.sourceScanItemId !== scan.id) {
        throw new Error("Created scan supporter is missing its source scan item identifier.");
      }
      newSigners.push(signer);
      workingSigners.unshift(signer);
      approvedScanItemIds.add(scan.id);
      counts.approved += 1;
    } catch {
      counts.failed += 1;
    }
  }

  return {
    newSigners,
    approvedScanItemIds: [...approvedScanItemIds],
    counts
  };
}

export interface ScanApprovalLock {
  startSingle: (scanItemId: string) => boolean;
  finishSingle: (scanItemId: string) => void;
  startBatch: (scanItemIds: string[]) => boolean;
  finishBatch: () => void;
  isScanLocked: (scanItemId: string) => boolean;
  isBatchLocked: () => boolean;
  hasSingleLocks: () => boolean;
}

export function createScanApprovalLock(): ScanApprovalLock {
  const lockedScanItemIds = new Set<string>();
  let batchLocked = false;

  return {
    startSingle(scanItemId) {
      if (batchLocked || lockedScanItemIds.has(scanItemId)) return false;
      lockedScanItemIds.add(scanItemId);
      return true;
    },
    finishSingle(scanItemId) {
      if (!batchLocked) lockedScanItemIds.delete(scanItemId);
    },
    startBatch(scanItemIds) {
      if (batchLocked || lockedScanItemIds.size > 0) return false;
      batchLocked = true;
      scanItemIds.forEach((scanItemId) => lockedScanItemIds.add(scanItemId));
      return true;
    },
    finishBatch() {
      if (!batchLocked) return;
      batchLocked = false;
      lockedScanItemIds.clear();
    },
    isScanLocked(scanItemId) {
      return lockedScanItemIds.has(scanItemId);
    },
    isBatchLocked() {
      return batchLocked;
    },
    hasSingleLocks() {
      return !batchLocked && lockedScanItemIds.size > 0;
    }
  };
}
