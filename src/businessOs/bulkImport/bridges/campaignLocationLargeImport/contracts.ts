import type { BulkImportProgress } from "../../contracts.ts";

export const campaignLocationLargeImportChunkSize = 500;
export const campaignLocationLargeImportMaxRows = 50000;

export type CampaignLocationLargeImportOutcome =
  | "valid"
  | "skipped_duplicate"
  | "skipped_protected"
  | "validation_failed"
  | "persistence_failed";

export interface CampaignLocationLargeImportRow {
  rowNumber: number;
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  village: string;
  postalCode: string;
}

export interface CampaignLocationLargeImportIssueRow extends CampaignLocationLargeImportRow {
  outcome: CampaignLocationLargeImportOutcome;
  errorCode?: string;
  reason?: string;
  chunkIndex: number;
}

export interface CampaignLocationLargeImportSummary {
  totalRows: number;
  totalChunks: number;
  chunkSize: number;
  importableRows: number;
  skippedDuplicateRows: number;
  skippedProtectedRows: number;
  validationFailedRows: number;
  persistenceFailedRows: number;
  ready: boolean;
  blockingFailure: boolean;
}

export interface CampaignLocationLargeImportSessionState {
  importId: string;
  contentHash: string;
  idempotencyKey: string;
  summary: CampaignLocationLargeImportSummary;
  progress: BulkImportProgress;
  issueRows: CampaignLocationLargeImportIssueRow[];
}

export interface CampaignLocationLargeImportApi {
  beginLargeImport(input: {
    idempotencyKey: string;
    contentHash: string;
    totalRows: number;
    chunkSize: number;
    totalChunks: number;
  }): Promise<{ importId: string; status: string }>;
  validateImportChunk(input: {
    importId: string;
    chunkIndex: number;
    idempotencyKey: string;
    contentHash: string;
    rows: CampaignLocationLargeImportRow[];
  }): Promise<Record<string, unknown>>;
  commitImportChunk(input: {
    importId: string;
    chunkIndex: number;
    idempotencyKey: string;
    contentHash: string;
  }): Promise<{ configurationVersion: number; importStatus: string; completedChunks: number; totalChunks: number }>;
  readImportErrors(input: { importId: string }): Promise<{ rows: Array<Record<string, unknown>> }>;
}
