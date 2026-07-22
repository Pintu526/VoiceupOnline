import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  countScanApprovalResult,
  createScanApprovalCounts
} from "../src/scanApproval.ts";
import {
  buildApprovalKey,
  buildSourceRowFingerprint,
  buildSupporterIdentityKey,
  buildUploadFingerprint,
  normalizeEmail,
  normalizeIndianPhone,
  normalizePersonNameForComparison
} from "../src/shared/deduplication/supporterIdentity.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260720010000_field_collection_atomic_approval.sql", import.meta.url),
  "utf8"
);

test("Indian phone normalization canonicalizes +91, 91, spaces and dashes", () => {
  for (const raw of ["+91 98765-43210", "91(98765)43210", "98765 43210"]) {
    const phone = normalizeIndianPhone(raw);
    assert.equal(phone.normalized, "9876543210");
    assert.equal(phone.verified, true);
    assert.equal(phone.raw, raw);
  }
});

test("invalid Indian phones stay unverified and preserve their raw value", () => {
  for (const raw of ["12345", "5123456789", "+1 9876543210", "98765x43210"]) {
    const phone = normalizeIndianPhone(raw);
    assert.equal(phone.normalized, "");
    assert.equal(phone.verified, false);
    assert.equal(phone.raw, raw);
  }
});

test("Unicode name normalization preserves display spelling and normalizes comparison only", () => {
  const name = normalizePersonNameForComparison("  DEBASIS   Pátra  ");
  assert.equal(name.raw, "  DEBASIS   Pátra  ");
  assert.equal(name.display, "DEBASIS Pátra");
  assert.equal(name.comparison, "debasis pátra");
});

test("supporter identity prioritizes verified phone, then verified email", () => {
  const common = {
    workspaceId: "default",
    campaignId: "campaign-1",
    name: normalizePersonNameForComparison("Same Name"),
    sourceRowFingerprint: "source-1"
  };
  const byPhone = buildSupporterIdentityKey({
    ...common,
    phone: normalizeIndianPhone("+91 9876543210"),
    email: normalizeEmail("first@example.com")
  });
  const samePhone = buildSupporterIdentityKey({
    ...common,
    phone: normalizeIndianPhone("9876543210"),
    email: normalizeEmail("other@example.com")
  });
  const byEmail = buildSupporterIdentityKey({
    ...common,
    phone: normalizeIndianPhone("invalid"),
    email: normalizeEmail(" Person@Example.COM ")
  });

  assert.equal(byPhone, samePhone);
  assert.match(byEmail, /person@example\.com/);
});

test("name-only identity remains source-row scoped instead of becoming a confirmed person duplicate", () => {
  const input = {
    workspaceId: "default",
    campaignId: "campaign-1",
    phone: normalizeIndianPhone(""),
    email: normalizeEmail(""),
    name: normalizePersonNameForComparison("Same Name")
  };
  const first = buildSupporterIdentityKey({ ...input, sourceRowFingerprint: "source-1" });
  const second = buildSupporterIdentityKey({ ...input, sourceRowFingerprint: "source-2" });
  assert.notEqual(first, second);
});

test("upload, source-row and approval identities are deterministic and scope-sensitive", () => {
  const upload = buildUploadFingerprint({
    workspaceId: "default",
    campaignId: "campaign-1",
    fileSha256: "ABC123",
    fileSize: 4096
  });
  const source = buildSourceRowFingerprint({
    workspaceId: "default",
    campaignId: "campaign-1",
    uploadFingerprint: upload,
    sourceReference: "row:0"
  });
  const approval = buildApprovalKey({
    workspaceId: "default",
    campaignId: "campaign-1",
    reviewItemId: "scan-1",
    sourceRowFingerprint: source
  });

  assert.equal(upload, buildUploadFingerprint({
    workspaceId: "default",
    campaignId: "campaign-1",
    fileSha256: "abc123",
    fileSize: 4096
  }));
  assert.equal(source, buildSourceRowFingerprint({
    workspaceId: "default",
    campaignId: "campaign-1",
    uploadFingerprint: upload,
    sourceReference: "row:0"
  }));
  assert.equal(approval, buildApprovalKey({
    workspaceId: "default",
    campaignId: "campaign-1",
    reviewItemId: "scan-1",
    sourceRowFingerprint: source
  }));
  assert.notEqual(approval, buildApprovalKey({
    workspaceId: "default",
    campaignId: "campaign-2",
    reviewItemId: "scan-1",
    sourceRowFingerprint: source
  }));
});

test("normalized schema owns reviews, supporters, approval ledger and audit without deleting workspace JSON", () => {
  assert.match(migration, /create table if not exists public\.voiceup_scan_review_items/);
  assert.match(migration, /create table if not exists public\.voiceup_scan_supporters/);
  assert.match(migration, /create table if not exists public\.voiceup_scan_approval_ledger/);
  assert.match(migration, /create table if not exists public\.voiceup_field_collection_audit/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.voiceup_workspaces/i);
  assert.doesNotMatch(migration, /drop\s+(table|column)/i);
});

test("database constraints enforce one approval, supporter and source row", () => {
  assert.match(migration, /approval_key text primary key/);
  assert.match(migration, /unique \(review_item_id\)/);
  assert.match(migration, /unique \(workspace_id, campaign_id, source_row_fingerprint\)/);
  assert.match(migration, /unique \(supporter_id\)/);
  assert.match(migration, /voiceup_scan_supporters_campaign_phone_unique_idx[\s\S]*workspace_id, campaign_id, normalized_phone/);
  assert.doesNotMatch(migration, /unique[^;]*normalized_name/i);
});

test("approval RPC authenticates and authorizes the exact workspace campaign", () => {
  const rpc = migration.slice(
    migration.indexOf("create or replace function public.approve_voiceup_scan_review_item"),
    migration.indexOf("create or replace function public.record_voiceup_scan_batch_audit")
  );
  assert.match(rpc, /actor_id uuid := auth\.uid\(\)/);
  assert.match(rpc, /voiceup_can_approve_field_collection\(p_workspace_id, p_campaign_id\)/);
  assert.match(migration, /voiceup_has_active_resource_assignment\([\s\S]*target_campaign_id/);
  assert.match(rpc, /'code', 'unauthorized'/);
});

test("single approval is one transaction with a workspace lock and supporter-before-review ordering", () => {
  const rpc = migration.slice(
    migration.indexOf("create or replace function public.approve_voiceup_scan_review_item"),
    migration.indexOf("create or replace function public.record_voiceup_scan_batch_audit")
  );
  const lock = rpc.indexOf("for update");
  const supporterInsert = rpc.indexOf("insert into public.voiceup_scan_supporters");
  const reviewApproval = rpc.indexOf("update public.voiceup_scan_review_items", supporterInsert);
  const ledgerInsert = rpc.indexOf("insert into public.voiceup_scan_approval_ledger", reviewApproval);
  assert.ok(lock >= 0);
  assert.ok(supporterInsert > lock);
  assert.ok(reviewApproval > supporterInsert);
  assert.ok(ledgerInsert > reviewApproval);
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
});

test("identical retry and already-approved review return the existing supporter", () => {
  const rpc = migration.slice(
    migration.indexOf("create or replace function public.approve_voiceup_scan_review_item"),
    migration.indexOf("create or replace function public.record_voiceup_scan_batch_audit")
  );
  assert.match(rpc, /where ledger\.approval_key = p_approval_key/);
  assert.match(rpc, /'code', 'approval_already_completed'/);
  assert.match(rpc, /review\.status = 'approved' and review\.supporter_id is not null/);
  assert.match(rpc, /'code', 'already_approved'/);
});

test("validation, consent, stale version and supporter failure cannot mark review approved", () => {
  const rpc = migration.slice(
    migration.indexOf("create or replace function public.approve_voiceup_scan_review_item"),
    migration.indexOf("create or replace function public.record_voiceup_scan_batch_audit")
  );
  assert.match(rpc, /review\.version <> coalesce\(p_expected_version, 1\)[\s\S]*'stale_review_version'/);
  assert.match(rpc, /v_normalized_name is null or v_normalized_name = ''[\s\S]*'validation_failed'/);
  assert.match(rpc, /paperConsentRecorded'[\s\S]*'consent_missing'/);
  assert.ok(
    rpc.indexOf("insert into public.voiceup_scan_supporters")
      < rpc.indexOf("set status = 'approved'")
  );
});

test("same source and same-campaign normalized phone block while another campaign remains independent", () => {
  const rpc = migration.slice(
    migration.indexOf("create or replace function public.approve_voiceup_scan_review_item"),
    migration.indexOf("create or replace function public.record_voiceup_scan_batch_audit")
  );
  assert.match(rpc, /supporter\.source_row_fingerprint = p_source_row_fingerprint[\s\S]*same_source_row_blocked/);
  assert.match(rpc, /supporter\.campaign_id = p_campaign_id[\s\S]*supporter\.normalized_phone = v_normalized_phone/);
  assert.match(rpc, /exact_phone_duplicate_blocked/);
  assert.match(migration, /if compact ~ '\^\[6-9\]\[0-9\]\{9\}\$'[\s\S]*return compact;[\s\S]*return null;/);
});

test("stale workspace writes are reconciled by a database trigger for every writer", () => {
  assert.match(migration, /before insert or update of data on public\.voiceup_workspaces/);
  assert.match(migration, /voiceup_merge_authoritative_field_collection_state\(new\.id, new\.data\)/);
  assert.match(migration, /'status', 'Approved'/);
  assert.match(migration, /'supporterId', review\.supporter_id/);
  assert.match(migration, /select supporter\.supporter_payload/);
  assert.match(migration, /select audit\.audit_payload/);
});

test("compatibility backfill is rerunnable and links only one unambiguous historical supporter", () => {
  assert.match(migration, /cross join lateral jsonb_array_elements[\s\S]*workspace\.data -> 'scanItems'/);
  assert.match(migration, /match_count = 1/);
  assert.match(migration, /historical_link_uncertain = true/);
  assert.match(migration, /on conflict \(review_item_id\) do nothing/);
  assert.match(migration, /on conflict do nothing/);
  assert.doesNotMatch(migration, /update public\.voiceup_workspaces[\s\S]*data\s*=\s*'\{\}'/);
});

test("structured outcomes produce exact independent batch totals", () => {
  const counts = createScanApprovalCounts();
  for (const code of [
    "approval_completed",
    "approval_completed",
    "approval_already_completed",
    "exact_phone_duplicate_blocked",
    "validation_failed",
    "consent_missing",
    "stale_review_version",
    "system_error"
  ]) countScanApprovalResult(counts, code);
  assert.deepEqual(counts, {
    approved: 2,
    skippedAlreadyApproved: 1,
    skippedDuplicate: 1,
    validationFailed: 1,
    consentMissing: 1,
    staleConflict: 1,
    failed: 1
  });
});

test("client approval uses the RPC per row and only reconciles server-authoritative results", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const approvalSource = appSource.slice(
    appSource.indexOf("async function approveScan"),
    appSource.indexOf("async function openPrivateScan")
  );
  assert.match(approvalSource, /for \(const scan of requestedScans\)/);
  assert.match(approvalSource, /await approveScanReviewItem\(/);
  assert.match(approvalSource, /await loadAuthoritativeFieldCollectionState\(/);
  assert.doesNotMatch(approvalSource, /planScanApprovals|detectDuplicate|id: createId\("sig"\)/);
  assert.doesNotMatch(approvalSource, /status:\s*"Approved"/);
});

test("batch integration uses independent single-row transactions and authoritative batch audit", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const approvalSource = appSource.slice(
    appSource.indexOf("async function approveScan"),
    appSource.indexOf("async function openPrivateScan")
  );
  assert.match(approvalSource, /recordScanApprovalBatchAudit\([\s\S]*batch_started/);
  assert.match(approvalSource, /for \(const scan of requestedScans\)[\s\S]*await approveScanReviewItem/);
  assert.match(approvalSource, /batch_partial_failure/);
  assert.doesNotMatch(approvalSource, /Promise\.all\(requestedScans/);
});

test("upload, OCR, review creation, public signing and authentication remain isolated", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const uploadSource = appSource.slice(
    appSource.indexOf("async function uploadScan"),
    appSource.indexOf("function createManualScanItem")
  );
  const publicSource = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("../src/utils/auth.ts", import.meta.url), "utf8");
  const providerSource = readFileSync(
    new URL("../src/documentIntelligence/providers/tesseract.ts", import.meta.url),
    "utf8"
  );
  assert.match(uploadSource, /uploadPrivateFileToStorage\("campaign-private"/);
  assert.match(uploadSource, /analyzeBusinessOsDocument\(file, ocrDiagnosticId\)/);
  assert.doesNotMatch(uploadSource, /tesseract\.js|recognize\(/);
  assert.match(providerSource, /import\("tesseract\.js"\)/);
  assert.match(uploadSource, /createScanReviewItem/);
  assert.doesNotMatch(publicSource, /approve_voiceup_scan_review_item|voiceup_scan_review_items/);
  assert.doesNotMatch(authSource, /approve_voiceup_scan_review_item|voiceup_scan_review_items/);
});
