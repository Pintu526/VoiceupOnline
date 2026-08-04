import { chunkRows } from "../../chunkRows.ts";
import {
  createBulkImportProgress,
  isBulkImportProgressConsistent,
  recordBulkImportOutcome,
  type BulkImportProgress,
  type BulkImportRowOutcome
} from "../../contracts.ts";
import type {
  CampaignLocationLargeImportIssueRow,
  CampaignLocationLargeImportOutcome,
  CampaignLocationLargeImportRow,
  CampaignLocationLargeImportSessionState,
  CampaignLocationLargeImportSummary
} from "./contracts.ts";
import { campaignLocationLargeImportChunkSize } from "./contracts.ts";

type ParsedImportRow = {
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  village: string;
  postalCode: string;
};

type AdapterResult = {
  rowNumber: number;
  cleaned: ParsedImportRow;
  normalizedKey?: string;
  outcome: BulkImportRowOutcome;
  errorCode?: string;
  reason?: string;
};

function mapOutcome(outcome: BulkImportRowOutcome): CampaignLocationLargeImportOutcome {
  switch (outcome) {
    case "valid":
      return "valid";
    case "skipped_duplicate":
      return "skipped_duplicate";
    case "skipped_protected":
      return "skipped_protected";
    case "persistence_failed":
      return "persistence_failed";
    default:
      return "validation_failed";
  }
}

function toImportRow(row: ParsedImportRow, rowNumber: number): CampaignLocationLargeImportRow {
  return {
    rowNumber,
    country: row.country ?? "",
    state: row.state ?? "",
    district: row.district ?? "",
    block: row.block ?? "",
    panchayat: row.panchayat ?? "",
    village: row.village ?? "",
    postalCode: row.postalCode ?? ""
  };
}

async function loadAdapter() {
  return import(new URL(["..", "..", "adapters", "campaignLocation", "index.ts"].join("/"), import.meta.url).href);
}

export function buildLargeImportChunks(
  rows: readonly ParsedImportRow[],
  chunkSize = campaignLocationLargeImportChunkSize
): CampaignLocationLargeImportRow[][] {
  const numbered = rows.map((row, index) => toImportRow(row, index + 1));
  return chunkRows(numbered, chunkSize);
}

export function createLargeImportSummary(totalRows: number, chunkSize = campaignLocationLargeImportChunkSize): CampaignLocationLargeImportSummary {
  const totalChunks = totalRows === 0 ? 0 : Math.ceil(totalRows / chunkSize);
  return {
    totalRows,
    totalChunks,
    chunkSize,
    importableRows: 0,
    skippedDuplicateRows: 0,
    skippedProtectedRows: 0,
    validationFailedRows: 0,
    persistenceFailedRows: 0,
    ready: false,
    blockingFailure: false
  };
}

export async function classifyLargeImportRows(rows: readonly ParsedImportRow[]): Promise<AdapterResult[]> {
  const { classifyCampaignLocationRows } = await loadAdapter();
  return classifyCampaignLocationRows(
    rows.map((row, index) => ({ rowNumber: index + 1, row }))
  );
}

export async function dryRunLargeCampaignLocationImport(
  rows: readonly ParsedImportRow[],
  chunkSize = campaignLocationLargeImportChunkSize
): Promise<{
  summary: CampaignLocationLargeImportSummary;
  progress: BulkImportProgress;
  issueRows: CampaignLocationLargeImportIssueRow[];
}> {
  const chunks = buildLargeImportChunks(rows, chunkSize);
  const classified = await classifyLargeImportRows(rows);
  let progress = createBulkImportProgress(rows.length);
  const issueRows: CampaignLocationLargeImportIssueRow[] = [];
  const summary = createLargeImportSummary(rows.length, chunkSize);

  for (const result of classified) {
    progress = recordBulkImportOutcome(progress, result.outcome);
    const outcome = mapOutcome(result.outcome);
    if (outcome === "valid") {
      summary.importableRows += 1;
      continue;
    }
    if (outcome === "skipped_duplicate") summary.skippedDuplicateRows += 1;
    if (outcome === "skipped_protected") summary.skippedProtectedRows += 1;
    if (outcome === "validation_failed") summary.validationFailedRows += 1;
    issueRows.push({
      ...toImportRow(result.cleaned, result.rowNumber),
      outcome,
      errorCode: result.errorCode,
      reason: result.reason,
      chunkIndex: Math.floor((result.rowNumber - 1) / chunkSize)
    });
  }

  summary.ready = summary.importableRows > 0;
  summary.blockingFailure = false;

  if (!isBulkImportProgressConsistent(progress)) {
    throw new Error("large_import_progress_inconsistent");
  }

  return { summary, progress, issueRows };
}

export function updateLargeImportProgress(
  progress: BulkImportProgress,
  currentChunk: number,
  totalChunks: number
): BulkImportProgress & { currentChunk: number; totalChunks: number } {
  return {
    ...progress,
    currentChunk,
    totalChunks
  };
}

export function mergeServerIssueRows(
  localIssues: CampaignLocationLargeImportIssueRow[],
  serverRows: Array<Record<string, unknown>>,
  chunkSize = campaignLocationLargeImportChunkSize
): CampaignLocationLargeImportIssueRow[] {
  const merged = [...localIssues];
  for (const row of serverRows) {
    const rowNumber = Number(row.rowNumber);
    if (!Number.isInteger(rowNumber)) continue;
    const classification = String(row.classification ?? "invalid");
    const outcome: CampaignLocationLargeImportOutcome =
      classification === "duplicate_in_file" || classification === "existing" ? "skipped_duplicate"
        : classification === "master_conflict" ? "skipped_protected"
          : classification === "invalid" ? "validation_failed"
            : "validation_failed";
    merged.push({
      rowNumber,
      country: String(row.country ?? ""),
      state: String(row.state ?? ""),
      district: String(row.district ?? ""),
      block: String(row.block ?? ""),
      panchayat: String(row.panchayat ?? ""),
      village: String(row.village ?? ""),
      postalCode: String(row.postalCode ?? ""),
      outcome,
      errorCode: row.errorCode ? String(row.errorCode) : undefined,
      reason: row.errorCode ? String(row.errorCode) : classification,
      chunkIndex: Math.floor((rowNumber - 1) / chunkSize)
    });
  }
  return merged.sort((left, right) => left.rowNumber - right.rowNumber);
}

export type { CampaignLocationLargeImportSessionState };

export async function validateLargeCampaignLocationImport(
  rows: readonly ParsedImportRow[],
  api: import("./contracts.ts").CampaignLocationLargeImportApi,
  idempotencyKey: string,
  contentHash: string,
  onProgress?: (progress: BulkImportProgress & { currentChunk: number; totalChunks: number }) => void
): Promise<CampaignLocationLargeImportSessionState> {
  const dryRun = await dryRunLargeCampaignLocationImport(rows);
  const chunks = buildLargeImportChunks(rows);
  const begin = await api.beginLargeImport({
    idempotencyKey,
    contentHash,
    totalRows: rows.length,
    chunkSize: campaignLocationLargeImportChunkSize,
    totalChunks: chunks.length
  });

  let progress = dryRun.progress;
  let issueRows = [...dryRun.issueRows];
  let blockingFailure = false;

  for (const [chunkIndex, chunk] of chunks.entries()) {
    onProgress?.(updateLargeImportProgress(progress, chunkIndex + 1, chunks.length));
    try {
      await api.validateImportChunk({
        importId: begin.importId,
        chunkIndex,
        idempotencyKey: `${idempotencyKey}:chunk:${chunkIndex}`,
        contentHash,
        rows: chunk
      });
    } catch {
      blockingFailure = true;
      break;
    }
  }

  if (!blockingFailure) {
    try {
      const serverErrors = await api.readImportErrors({ importId: begin.importId });
      issueRows = mergeServerIssueRows(issueRows, serverErrors.rows);
    } catch {
      blockingFailure = true;
    }
  }

  const summary: CampaignLocationLargeImportSummary = {
    ...dryRun.summary,
    ready: dryRun.summary.importableRows > 0 && !blockingFailure,
    blockingFailure
  };

  return {
    importId: begin.importId,
    contentHash,
    idempotencyKey,
    summary,
    progress: updateLargeImportProgress(progress, chunks.length, chunks.length),
    issueRows
  };
}

export async function commitLargeCampaignLocationImport(
  rows: readonly ParsedImportRow[],
  session: CampaignLocationLargeImportSessionState,
  api: import("./contracts.ts").CampaignLocationLargeImportApi,
  onProgress?: (progress: BulkImportProgress & { currentChunk: number; totalChunks: number }) => void
): Promise<{ configurationVersion: number; issueRows: CampaignLocationLargeImportIssueRow[] }> {
  const chunks = buildLargeImportChunks(rows);
  let progress = createBulkImportProgress(rows.length);
  let configurationVersion = 0;
  let issueRows = [...session.issueRows];

  for (const [chunkIndex] of chunks.entries()) {
    onProgress?.(updateLargeImportProgress(progress, chunkIndex + 1, chunks.length));
    const result = await api.commitImportChunk({
      importId: session.importId,
      chunkIndex,
      idempotencyKey: `${session.idempotencyKey}:chunk:${chunkIndex}`,
      contentHash: session.contentHash
    });
    configurationVersion = result.configurationVersion;
    if (result.importStatus === "failed") {
      issueRows.push({
        rowNumber: 0,
        country: "",
        state: "",
        district: "",
        block: "",
        panchayat: "",
        village: "",
        postalCode: "",
        outcome: "persistence_failed",
        errorCode: "persistence_failed",
        reason: "Chunk commit failed.",
        chunkIndex
      });
      break;
    }
    progress = {
      ...progress,
      processed: Math.min(rows.length, (chunkIndex + 1) * campaignLocationLargeImportChunkSize),
      remaining: Math.max(0, rows.length - (chunkIndex + 1) * campaignLocationLargeImportChunkSize)
    };
  }

  try {
    const serverErrors = await api.readImportErrors({ importId: session.importId });
    issueRows = mergeServerIssueRows(issueRows, serverErrors.rows);
  } catch {
    // keep local issue rows
  }

  return { configurationVersion, issueRows };
}
