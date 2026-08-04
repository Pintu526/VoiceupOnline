export type BulkImportRowOutcome =
  | "valid"
  | "skipped_duplicate"
  | "skipped_protected"
  | "validation_failed"
  | "persistence_failed";

export const locationImportCleanedFields = [
  "country",
  "state",
  "district",
  "block",
  "panchayat",
  "village",
  "postalCode"
] as const;

export type LocationImportCleanedField = (typeof locationImportCleanedFields)[number];

export type LocationImportCleanedRow = Record<LocationImportCleanedField, string>;

export interface ComparableImportRowResult {
  rowNumber: number;
  cleaned: LocationImportCleanedRow;
  normalizedKey?: string;
  outcome: BulkImportRowOutcome;
  errorCode?: string;
}

export type ImportResultMismatchField =
  | "missing_legacy"
  | "missing_business_os"
  | "normalized_key"
  | "outcome"
  | "error_code"
  | LocationImportCleanedField;

export interface ImportResultRowSummary {
  rowNumber: number;
  normalizedKey?: string;
  outcome: BulkImportRowOutcome;
  errorCode?: string;
  cleaned: LocationImportCleanedRow;
}

export interface ImportResultComparisonMismatch {
  rowNumber: number;
  mismatchFields: ImportResultMismatchField[];
  legacy: ImportResultRowSummary | null;
  businessOs: ImportResultRowSummary | null;
}

export interface ImportResultComparisonResult {
  matches: boolean;
  totalRows: number;
  matchedRows: number;
  mismatchedRows: number;
  missingLegacyRows: number;
  missingBusinessOsRows: number;
  mismatches: ImportResultComparisonMismatch[];
}
