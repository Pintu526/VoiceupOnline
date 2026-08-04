import type {
  ComparableImportRowResult,
  ImportResultComparisonMismatch,
  ImportResultComparisonResult,
  ImportResultMismatchField,
  ImportResultRowSummary
} from "./contracts.ts";
import { locationImportCleanedFields } from "./contracts.ts";

function normalizeOptionalText(value: string | undefined): string {
  return value ?? "";
}

function toSummary(row: ComparableImportRowResult): ImportResultRowSummary {
  return {
    rowNumber: row.rowNumber,
    normalizedKey: row.normalizedKey,
    outcome: row.outcome,
    errorCode: row.errorCode,
    cleaned: {
      country: row.cleaned.country,
      state: row.cleaned.state,
      district: row.cleaned.district,
      block: row.cleaned.block,
      panchayat: row.cleaned.panchayat,
      village: row.cleaned.village,
      postalCode: row.cleaned.postalCode
    }
  };
}

function compareOptionalText(left: string | undefined, right: string | undefined): boolean {
  return normalizeOptionalText(left) === normalizeOptionalText(right);
}

function compareRowPair(
  legacy: ComparableImportRowResult | undefined,
  businessOs: ComparableImportRowResult | undefined
): ImportResultMismatchField[] {
  const mismatchFields: ImportResultMismatchField[] = [];

  if (!legacy) {
    mismatchFields.push("missing_legacy");
  }
  if (!businessOs) {
    mismatchFields.push("missing_business_os");
  }
  if (!legacy || !businessOs) {
    return mismatchFields;
  }

  if (!compareOptionalText(legacy.normalizedKey, businessOs.normalizedKey)) {
    mismatchFields.push("normalized_key");
  }
  if (legacy.outcome !== businessOs.outcome) {
    mismatchFields.push("outcome");
  }
  if (!compareOptionalText(legacy.errorCode, businessOs.errorCode)) {
    mismatchFields.push("error_code");
  }

  for (const field of locationImportCleanedFields) {
    if (!compareOptionalText(legacy.cleaned[field], businessOs.cleaned[field])) {
      mismatchFields.push(field);
    }
  }

  return mismatchFields;
}

function indexResultsByRowNumber(
  results: readonly ComparableImportRowResult[]
): Map<number, ComparableImportRowResult> {
  const indexed = new Map<number, ComparableImportRowResult>();
  for (const row of results) {
    indexed.set(row.rowNumber, row);
  }
  return indexed;
}

export function compareImportResults(
  legacyResults: readonly ComparableImportRowResult[],
  businessOsResults: readonly ComparableImportRowResult[]
): ImportResultComparisonResult {
  const legacyByRowNumber = indexResultsByRowNumber(legacyResults);
  const businessOsByRowNumber = indexResultsByRowNumber(businessOsResults);

  const rowNumbers = [
    ...new Set([...legacyByRowNumber.keys(), ...businessOsByRowNumber.keys()])
  ].sort((left, right) => left - right);

  const mismatches: ImportResultComparisonMismatch[] = [];
  let matchedRows = 0;
  let missingLegacyRows = 0;
  let missingBusinessOsRows = 0;

  for (const rowNumber of rowNumbers) {
    const legacy = legacyByRowNumber.get(rowNumber);
    const businessOs = businessOsByRowNumber.get(rowNumber);
    const mismatchFields = compareRowPair(legacy, businessOs);

    if (!legacy) {
      missingLegacyRows += 1;
    }
    if (!businessOs) {
      missingBusinessOsRows += 1;
    }

    if (mismatchFields.length === 0) {
      matchedRows += 1;
      continue;
    }

    mismatches.push({
      rowNumber,
      mismatchFields,
      legacy: legacy ? toSummary(legacy) : null,
      businessOs: businessOs ? toSummary(businessOs) : null
    });
  }

  const rowCountMatches = legacyResults.length === businessOsResults.length;
  const matches = rowCountMatches && mismatches.length === 0;

  return {
    matches,
    totalRows: rowNumbers.length,
    matchedRows,
    mismatchedRows: mismatches.length,
    missingLegacyRows,
    missingBusinessOsRows,
    mismatches
  };
}
