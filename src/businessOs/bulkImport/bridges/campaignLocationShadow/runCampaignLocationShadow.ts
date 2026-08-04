import type {
  ComparableImportRowResult,
  ImportResultComparisonResult,
  LocationImportCleanedField
} from "../../comparison/contracts.ts";
import { locationImportCleanedFields } from "../../comparison/contracts.ts";
import type {
  CampaignLocationParsedRow,
  CampaignLocationShadowDiagnosticMismatch,
  CampaignLocationShadowResult,
  CampaignLocationShadowServerComparison,
  LegacyServerImportRow,
  ShadowComparisonSummary,
  ShadowNotComparedField
} from "./contracts.ts";
import { parseShadowNotComparedFields, serverShadowNotComparedFields } from "./contracts.ts";

type CampaignLocationImportRow = {
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  village: string;
  postalCode: string;
};

type CampaignLocationAdapterResult = {
  rowNumber: number;
  cleaned: CampaignLocationImportRow;
  normalizedKey?: string;
  outcome: ComparableImportRowResult["outcome"];
  errorCode?: string;
};

async function loadShadowDependencies() {
  const [adapterModule, comparisonModule] = await Promise.all([
    import(new URL(["..", "..", "adapters", "campaignLocation", "index.ts"].join("/"), import.meta.url).href),
    import(new URL(["..", "..", "comparison", "index.ts"].join("/"), import.meta.url).href)
  ]);

  return {
    classifyCampaignLocationRows: adapterModule.classifyCampaignLocationRows as (
      rows: readonly { rowNumber: number; row: CampaignLocationImportRow }[]
    ) => CampaignLocationAdapterResult[],
    compareImportResults: comparisonModule.compareImportResults as (
      legacyResults: readonly ComparableImportRowResult[],
      businessOsResults: readonly ComparableImportRowResult[]
    ) => ImportResultComparisonResult
  };
}

function normalizeOptionalText(value: string | undefined | null): string {
  return value ?? "";
}

function toCampaignLocationImportRow(row: CampaignLocationParsedRow): CampaignLocationImportRow {
  return {
    country: row.country ?? "",
    state: row.state ?? "",
    district: row.district ?? "",
    block: row.block ?? "",
    panchayat: row.panchayat ?? "",
    village: row.village ?? "",
    postalCode: row.postalCode ?? ""
  };
}

function toComparableFromBusinessOs(results: readonly CampaignLocationAdapterResult[]): ComparableImportRowResult[] {
  return results.map((entry) => ({
    rowNumber: entry.rowNumber,
    cleaned: {
      country: entry.cleaned.country,
      state: entry.cleaned.state,
      district: entry.cleaned.district,
      block: entry.cleaned.block,
      panchayat: entry.cleaned.panchayat,
      village: entry.cleaned.village,
      postalCode: entry.cleaned.postalCode
    },
    normalizedKey: entry.normalizedKey,
    outcome: entry.outcome,
    errorCode: entry.errorCode
  }));
}

function toLegacyParseComparable(parsedRows: readonly CampaignLocationParsedRow[]): ComparableImportRowResult[] {
  return parsedRows.map((row, index) => ({
    rowNumber: index + 1,
    cleaned: toCampaignLocationImportRow(row),
    outcome: "valid"
  }));
}

function compareCleanedField(
  left: ComparableImportRowResult | undefined,
  right: ComparableImportRowResult | undefined
): LocationImportCleanedField[] {
  if (!left || !right) {
    return [];
  }

  const mismatchFields: LocationImportCleanedField[] = [];
  for (const field of locationImportCleanedFields) {
    if (normalizeOptionalText(left.cleaned[field]) !== normalizeOptionalText(right.cleaned[field])) {
      mismatchFields.push(field);
    }
  }
  return mismatchFields;
}

function compareCleanedFieldsOnly(
  legacyResults: readonly ComparableImportRowResult[],
  businessOsResults: readonly ComparableImportRowResult[]
): ShadowComparisonSummary {
  const legacyByRowNumber = new Map(legacyResults.map((row) => [row.rowNumber, row]));
  const businessOsByRowNumber = new Map(businessOsResults.map((row) => [row.rowNumber, row]));
  const rowNumbers = [
    ...new Set([...legacyByRowNumber.keys(), ...businessOsByRowNumber.keys()])
  ].sort((left, right) => left - right);

  const mismatches: CampaignLocationShadowDiagnosticMismatch[] = [];
  let matchedRows = 0;
  let missingLegacyRows = 0;
  let missingBusinessOsRows = 0;

  for (const rowNumber of rowNumbers) {
    const legacy = legacyByRowNumber.get(rowNumber);
    const businessOs = businessOsByRowNumber.get(rowNumber);
    const mismatchFields: string[] = [];

    if (!legacy) {
      mismatchFields.push("missing_legacy");
      missingLegacyRows += 1;
    }
    if (!businessOs) {
      mismatchFields.push("missing_business_os");
      missingBusinessOsRows += 1;
    }

    mismatchFields.push(...compareCleanedField(legacy, businessOs));

    if (mismatchFields.length === 0) {
      matchedRows += 1;
      continue;
    }

    mismatches.push({ rowNumber, mismatchFields });
  }

  const rowCountMatches = legacyResults.length === businessOsResults.length;

  return {
    matches: rowCountMatches && mismatches.length === 0,
    totalRows: rowNumbers.length,
    matchedRows,
    mismatchedRows: mismatches.length,
    missingLegacyRows,
    missingBusinessOsRows,
    notComparedFields: [...parseShadowNotComparedFields],
    mismatches
  };
}

function mapServerClassification(classification: string): ComparableImportRowResult["outcome"] {
  switch (classification) {
    case "valid":
      return "valid";
    case "duplicate_in_file":
      return "skipped_duplicate";
    case "master_conflict":
      return "skipped_protected";
    default:
      return "validation_failed";
  }
}

function mapServerRowsToComparable(rows: readonly LegacyServerImportRow[]): ComparableImportRowResult[] {
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    cleaned: {
      country: row.country ?? "",
      state: row.state ?? "",
      district: row.district ?? "",
      block: row.block ?? "",
      panchayat: row.panchayat ?? "",
      village: row.village ?? "",
      postalCode: row.postalCode ?? ""
    },
    normalizedKey: row.normalizedPath,
    outcome: mapServerClassification(row.classification),
    errorCode: row.errorCode ?? undefined
  }));
}

function filterComparisonResult(
  result: ImportResultComparisonResult,
  notComparedFields: readonly ShadowNotComparedField[]
): ShadowComparisonSummary {
  const excluded = new Set<string>(notComparedFields);
  const mismatches = result.mismatches
    .map((entry) => ({
      rowNumber: entry.rowNumber,
      mismatchFields: entry.mismatchFields.filter((field) => !excluded.has(field))
    }))
    .filter((entry) => entry.mismatchFields.length > 0);

  const matchedRows = result.totalRows - mismatches.length;

  return {
    matches:
      mismatches.length === 0 &&
      result.missingLegacyRows === 0 &&
      result.missingBusinessOsRows === 0,
    totalRows: result.totalRows,
    matchedRows,
    mismatchedRows: mismatches.length,
    missingLegacyRows: result.missingLegacyRows,
    missingBusinessOsRows: result.missingBusinessOsRows,
    notComparedFields: [...notComparedFields],
    mismatches
  };
}

function buildServerComparison(
  serverRows: readonly LegacyServerImportRow[],
  businessOsResults: readonly ComparableImportRowResult[],
  compareImportResults: (
    legacyResults: readonly ComparableImportRowResult[],
    businessOsResults: readonly ComparableImportRowResult[]
  ) => ImportResultComparisonResult
): CampaignLocationShadowServerComparison {
  const comparatorResult = compareImportResults(
    mapServerRowsToComparable(serverRows),
    businessOsResults
  );

  return {
    ...filterComparisonResult(comparatorResult, serverShadowNotComparedFields),
    comparatorResult
  };
}

export async function runCampaignLocationShadow(
  parsedRows: readonly CampaignLocationParsedRow[],
  serverRows?: readonly LegacyServerImportRow[]
): Promise<CampaignLocationShadowResult> {
  try {
    if (!parsedRows || !Array.isArray(parsedRows)) {
      return { ok: false };
    }

    const { classifyCampaignLocationRows, compareImportResults } = await loadShadowDependencies();
    const inputs = parsedRows.map((row, index) => ({
      rowNumber: index + 1,
      row: toCampaignLocationImportRow(row)
    }));

    const adapterResults = classifyCampaignLocationRows(inputs);
    const businessOsComparable = toComparableFromBusinessOs(adapterResults);
    const legacyParseComparable = toLegacyParseComparable(parsedRows);
    const parseComparison = compareCleanedFieldsOnly(legacyParseComparable, businessOsComparable);
    const serverComparison = serverRows?.length
      ? buildServerComparison(serverRows, businessOsComparable, compareImportResults)
      : null;

    return {
      ok: true,
      parseComparison,
      serverComparison
    };
  } catch {
    return { ok: false };
  }
}

export function summarizeCampaignLocationShadow(result: CampaignLocationShadowResult) {
  if (!result.ok) {
    return {
      status: "shadow_failed" as const
    };
  }

  const activeComparison = result.serverComparison ?? result.parseComparison;

  return {
    status: activeComparison.matches ? ("match" as const) : ("mismatch" as const),
    totalRows: activeComparison.totalRows,
    matchedRows: activeComparison.matchedRows,
    mismatchedRows: activeComparison.mismatchedRows,
    missingLegacyRows: activeComparison.missingLegacyRows,
    missingBusinessOsRows: activeComparison.missingBusinessOsRows,
    notComparedFields: activeComparison.notComparedFields,
    mismatchPreview: activeComparison.mismatches.slice(0, 5)
  };
}
