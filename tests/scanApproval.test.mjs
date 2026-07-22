import assert from "node:assert/strict";
import test from "node:test";
import {
  createScanApprovalLock,
  planScanApprovals
} from "../src/scanApproval.ts";

function makeScan(id, status = "Needs review") {
  return {
    id,
    campaignId: "campaign-1",
    fileName: `${id}.jpg`,
    extractedText: "",
    parsedSigner: {
      name: `Supporter ${id}`,
      email: "",
      phone: id,
      whatsappNumber: "",
      telegramHandle: "",
      otpVerified: false,
      selectedAuthorityId: "",
      selectedAuthorityName: "",
      state: "Odisha",
      district: "Puri",
      block: "",
      panchayat: "",
      address: "",
      postalCode: "",
      comment: ""
    },
    status,
    createdAt: "2026-07-16T00:00:00.000Z"
  };
}

function makeSigner(id, sourceScanItemId) {
  return {
    id: `signer-${id}`,
    campaignId: "campaign-1",
    ...makeScan(id).parsedSigner,
    source: "scan",
    status: "pending",
    signedAt: "2026-07-16T00:00:00.000Z",
    sourceScanItemId
  };
}

function plan(scans, signers = [], createSigner = (scan) => makeSigner(scan.id, scan.id)) {
  return planScanApprovals({
    campaignId: "campaign-1",
    requestedScanItemIds: scans.map((scan) => scan.id),
    scanItems: scans,
    signers,
    createSigner
  });
}

test("single approval creates one supporter and repeating it creates none", () => {
  const scan = makeScan("scan-1");
  const first = plan([scan]);
  assert.equal(first.newSigners.length, 1);
  assert.deepEqual(first.approvedScanItemIds, [scan.id]);

  const approvedScan = { ...scan, status: "Approved" };
  const repeated = plan([approvedScan], first.newSigners);
  assert.equal(repeated.newSigners.length, 0);
  assert.equal(repeated.counts.skippedAlreadyApproved, 1);
});

test("batch approval creates five supporters and preserves existing supporters", () => {
  const scans = Array.from({ length: 5 }, (_, index) => makeScan(`scan-${index + 1}`));
  const existing = makeSigner("existing", "older-scan");
  const result = plan(scans, [existing]);
  const sharedSignerArray = [...result.newSigners, existing];

  assert.equal(result.counts.approved, 5);
  assert.equal(result.newSigners.length, 5);
  assert.equal(sharedSignerArray.length, 6);
  assert.ok(sharedSignerArray.includes(existing));
});

test("already-approved and already-linked scans are skipped without new supporters", () => {
  const approved = makeScan("approved", "Approved");
  const linked = makeScan("linked");
  const result = plan([approved, linked], [makeSigner("linked", "linked")]);

  assert.equal(result.newSigners.length, 0);
  assert.equal(result.counts.skippedAlreadyApproved, 1);
  assert.equal(result.counts.skippedDuplicate, 1);
  assert.deepEqual(result.approvedScanItemIds, [linked.id]);
});

test("a failed scan remains in review and only successful scans are approved", () => {
  const successful = makeScan("successful");
  const failed = makeScan("failed");
  const result = plan([successful, failed], [], (scan) => {
    if (scan.id === failed.id) throw new Error("simulated supporter creation failure");
    return makeSigner(scan.id, scan.id);
  });
  const nextScans = [successful, failed].map((scan) =>
    result.approvedScanItemIds.includes(scan.id) ? { ...scan, status: "Approved" } : scan
  );

  assert.equal(result.counts.approved, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(nextScans.find((scan) => scan.id === successful.id).status, "Approved");
  assert.equal(nextScans.find((scan) => scan.id === failed.id).status, "Needs review");
});

test("rapid single clicks and concurrent batch starts are rejected by the operation lock", () => {
  const lock = createScanApprovalLock();
  assert.equal(lock.startSingle("scan-1"), true);
  assert.equal(lock.startSingle("scan-1"), false);
  assert.equal(lock.startBatch(["scan-1", "scan-2"]), false);
  lock.finishSingle("scan-1");

  assert.equal(lock.startBatch(["scan-1", "scan-2"]), true);
  assert.equal(lock.startBatch(["scan-1", "scan-2"]), false);
  assert.equal(lock.startSingle("scan-1"), false);
  lock.finishBatch();
  assert.equal(lock.isBatchLocked(), false);
});

test("legacy supporters without sourceScanItemId remain valid inputs", () => {
  const legacySigner = makeSigner("legacy", undefined);
  const scan = makeScan("new-scan");
  const result = plan([scan], [legacySigner]);

  assert.equal(result.counts.approved, 1);
  assert.ok(legacySigner.sourceScanItemId === undefined);
});
