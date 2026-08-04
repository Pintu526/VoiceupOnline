export type BulkImportRowOutcome =
  | "valid"
  | "skipped_duplicate"
  | "skipped_protected"
  | "validation_failed"
  | "persistence_failed";

export interface BulkImportProgress {
  total: number;
  validated: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  remaining: number;
}

export interface BulkImportRow<TInput> {
  rowNumber: number;
  input: TInput;
}

export interface BulkImportNormalizedRow<TInput, TNormalized> {
  rowNumber: number;
  input: TInput;
  normalized: TNormalized;
  normalizedKey: string;
}

export interface BulkImportClassifiedRow<TInput, TNormalized>
  extends BulkImportNormalizedRow<TInput, TNormalized> {
  outcome: BulkImportRowOutcome;
}

export interface BulkImportCancellationToken {
  readonly cancelled: boolean;
  throwIfCancelled(): void;
}

export interface BulkImportParseAdapter<TInput> {
  parse(source: string): readonly BulkImportRow<TInput>[];
}

export interface BulkImportNormalizeAdapter<TInput, TNormalized> {
  normalize(row: BulkImportRow<TInput>): BulkImportNormalizedRow<TInput, TNormalized> | null;
  normalizedKey(normalized: TNormalized): string;
}

export interface BulkImportValidateAdapter<TInput, TNormalized> {
  validate(row: BulkImportNormalizedRow<TInput, TNormalized>): BulkImportRowOutcome | "valid";
}

export interface BulkImportClassifyAdapter<TInput, TNormalized> {
  classify(
    row: BulkImportNormalizedRow<TInput, TNormalized>
  ): Extract<BulkImportRowOutcome, "valid" | "skipped_protected">;
}

export interface BulkImportPersistAdapter<TInput, TNormalized> {
  persist(
    rows: readonly BulkImportClassifiedRow<TInput, TNormalized>[]
  ): Promise<readonly BulkImportClassifiedRow<TInput, TNormalized>[]>;
}

export interface BulkImportReportAdapter<TInput, TNormalized> {
  report(rows: readonly BulkImportClassifiedRow<TInput, TNormalized>[]): string;
}

export interface BulkImportAdapters<TInput, TNormalized> {
  parse: BulkImportParseAdapter<TInput>;
  normalize: BulkImportNormalizeAdapter<TInput, TNormalized>;
  validate: BulkImportValidateAdapter<TInput, TNormalized>;
  classify: BulkImportClassifyAdapter<TInput, TNormalized>;
  persist: BulkImportPersistAdapter<TInput, TNormalized>;
  report: BulkImportReportAdapter<TInput, TNormalized>;
}

export interface BulkImportCancellationController extends BulkImportCancellationToken {
  cancel(): void;
}

export function createBulkImportProgress(total: number): BulkImportProgress {
  const safeTotal = Math.max(0, total);
  return {
    total: safeTotal,
    validated: 0,
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    remaining: safeTotal
  };
}

export function isBulkImportProgressConsistent(progress: BulkImportProgress): boolean {
  if (progress.total < 0 || progress.validated < 0 || progress.processed < 0) return false;
  if (progress.imported < 0 || progress.skipped < 0 || progress.failed < 0 || progress.remaining < 0) {
    return false;
  }
  if (progress.processed + progress.remaining !== progress.total) return false;
  if (progress.imported + progress.skipped + progress.failed !== progress.processed) return false;
  if (progress.validated > progress.processed) return false;
  return true;
}

export function recordBulkImportOutcome(
  progress: BulkImportProgress,
  outcome: BulkImportRowOutcome
): BulkImportProgress {
  const next: BulkImportProgress = {
    ...progress,
    processed: progress.processed + 1,
    remaining: Math.max(0, progress.remaining - 1)
  };

  switch (outcome) {
    case "valid":
      return {
        ...next,
        validated: next.validated + 1,
        imported: next.imported + 1
      };
    case "skipped_duplicate":
    case "skipped_protected":
      return {
        ...next,
        validated: next.validated + 1,
        skipped: next.skipped + 1
      };
    case "validation_failed":
    case "persistence_failed":
      return {
        ...next,
        failed: next.failed + 1
      };
    default:
      return next;
  }
}

export function createBulkImportCancellationToken(): BulkImportCancellationController {
  let cancelled = false;
  return {
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
    },
    throwIfCancelled() {
      if (cancelled) {
        throw new Error("bulk_import_cancelled");
      }
    }
  };
}
