import { classifyDuplicateRow } from "../../classifyDuplicates.ts";
import type { BulkImportNormalizedRow } from "../../contracts.ts";
import type {
  CampaignLocationImportInput,
  CampaignLocationImportResult,
  CampaignLocationImportRow
} from "./contracts.ts";
import { validateCampaignLocationRow } from "./validateCampaignLocationRow.ts";

export function classifyCampaignLocationRows(
  rows: readonly CampaignLocationImportInput[]
): CampaignLocationImportResult[] {
  const seenKeys = new Set<string>();

  return rows.map((entry) => {
    const validation = validateCampaignLocationRow(entry.row);

    if (!validation.ok) {
      return {
        rowNumber: entry.rowNumber,
        cleaned: validation.cleaned,
        outcome: "validation_failed",
        errorCode: validation.errorCode,
        reason: validation.reason
      };
    }

    const normalizedRow: BulkImportNormalizedRow<CampaignLocationImportRow, CampaignLocationImportRow> = {
      rowNumber: entry.rowNumber,
      input: validation.cleaned,
      normalized: validation.cleaned,
      normalizedKey: validation.normalizedKey
    };

    const classified = classifyDuplicateRow(normalizedRow, seenKeys);

    return {
      rowNumber: entry.rowNumber,
      cleaned: validation.cleaned,
      normalizedKey: classified.normalizedKey,
      outcome: classified.outcome
    };
  });
}
