# FC-1A: Server-authoritative Field Collection approval

Status: Accepted for implementation on 2026-07-20.

## Context

Field Collection review items and scan-created supporters currently live inside
`voiceup_workspaces.data`. The browser plans an approval from its current React
snapshot and the complete workspace JSON is saved later. A component lock stops
rapid clicks in one tab, but it cannot make approval idempotent across retries,
tabs, operators, or delayed whole-workspace saves.

## Decision

Approval-owned data will be authoritative in normalized relational tables:

- `voiceup_scan_review_items` stores stable review/source identities, status,
  corrected fields, consent, version, and the approved supporter link.
- `voiceup_scan_supporters` stores the supporter created by an approval and
  enforces review, source-row, and same-campaign verified-phone uniqueness.
- `voiceup_scan_approval_ledger` stores deterministic approval outcomes and
  makes successful retries return the original supporter.
- `voiceup_field_collection_audit` stores server-authored operational events.

`approve_voiceup_scan_review_item` will authorize the authenticated actor,
serialize on the workspace/review row, validate the deterministic identities,
perform duplicate and consent checks, create at most one supporter, update the
review item, write the ledger and audit records, and update compatibility JSON
inside one PostgreSQL transaction.

The existing workspace JSON remains a compatibility projection for current UI,
reports, and public-signing consumers. A `before insert or update` trigger on
`voiceup_workspaces` merges authoritative approved reviews, scan supporters, and
Field Collection audit entries into every incoming JSON document. Therefore a
delayed browser save, Edge Function save, or other full-document upsert cannot
revert approval status, remove supporter linkage, delete an approved supporter,
or erase approval audit history.

## Stable identities

- New uploads use SHA-256 file content, size, workspace, campaign, and optional
  page number for the upload fingerprint.
- The current one-review-item-per-image flow uses source reference `row:0`.
  Future row segmentation can replace this with a row index or crop coordinates.
- Legacy reviews derive a deterministic fallback from their private file path,
  or from review ID when no private path exists. Filename alone is never used.
- Approval keys contain workspace, campaign, review ID, and source-row
  fingerprint using an unambiguous length-prefixed encoding.

## Compatibility and migration

Existing JSON records are not deleted. The migration backfills review rows and
links an already-approved review only when exactly one existing scan supporter
has the same `sourceScanItemId`. Ambiguous historical links are marked for manual
review and are never guessed. The backfill is conflict-safe and rerunnable.

## Consequences

- Approval becomes safe under retry and concurrent operators.
- Batch approval remains a sequence of independent single-row transactions.
- Review editing and OCR remain in the existing JSON workflow until approval.
- Whole-workspace persistence remains compatible, but normalized approval data
  wins whenever compatibility JSON is written.
- The current source identity is image-level (`row:0`) because OCR does not yet
  segment multiple rows. Row-level segmentation remains a documented follow-up.
