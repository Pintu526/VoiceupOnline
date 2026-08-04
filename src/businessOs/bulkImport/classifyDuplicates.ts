import type {
  BulkImportClassifiedRow,
  BulkImportNormalizedRow,
  BulkImportRowOutcome
} from "./contracts.ts";

export function classifyDuplicateRows<TInput, TNormalized>(
  rows: readonly BulkImportNormalizedRow<TInput, TNormalized>[],
  seenKeys: Set<string> = new Set<string>()
): BulkImportClassifiedRow<TInput, TNormalized>[] {
  return rows.map((row) => classifyDuplicateRow(row, seenKeys));
}

export function classifyDuplicateRow<TInput, TNormalized>(
  row: BulkImportNormalizedRow<TInput, TNormalized>,
  seenKeys: Set<string>
): BulkImportClassifiedRow<TInput, TNormalized> {
  if (seenKeys.has(row.normalizedKey)) {
    return withOutcome(row, "skipped_duplicate");
  }

  seenKeys.add(row.normalizedKey);
  return withOutcome(row, "valid");
}

function withOutcome<TInput, TNormalized>(
  row: BulkImportNormalizedRow<TInput, TNormalized>,
  outcome: BulkImportRowOutcome
): BulkImportClassifiedRow<TInput, TNormalized> {
  return {
    rowNumber: row.rowNumber,
    input: row.input,
    normalized: row.normalized,
    normalizedKey: row.normalizedKey,
    outcome
  };
}
