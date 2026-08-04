import {
  campaignLocationHierarchyFields,
  campaignLocationValidationMessages,
  type CampaignLocationImportRow,
  type CampaignLocationValidationErrorCode
} from "./contracts.ts";
import { buildCampaignLocationNormalizedKey, cleanCampaignLocationRow } from "./normalizeCampaignLocationRow.ts";

export interface CampaignLocationRowValidationSuccess {
  ok: true;
  cleaned: CampaignLocationImportRow;
  normalizedKey: string;
}

export interface CampaignLocationRowValidationFailure {
  ok: false;
  cleaned: CampaignLocationImportRow;
  errorCode: CampaignLocationValidationErrorCode;
  reason: string;
}

export type CampaignLocationRowValidationResult =
  | CampaignLocationRowValidationSuccess
  | CampaignLocationRowValidationFailure;

export function validateCampaignLocationRow(
  row: CampaignLocationImportRow
): CampaignLocationRowValidationResult {
  const cleaned = cleanCampaignLocationRow(row);
  const geographicValues = campaignLocationHierarchyFields.map((field) => cleaned[field]);
  const hasAnyValue = geographicValues.some(Boolean) || Boolean(cleaned.postalCode);

  if (!hasAnyValue) {
    return failure(cleaned, "missing_country");
  }

  if (!cleaned.country) {
    if (geographicValues.slice(1).some(Boolean) || cleaned.postalCode) {
      return failure(cleaned, "hierarchy_gap");
    }
    return failure(cleaned, "missing_country");
  }

  if (!cleaned.state) {
    if (geographicValues.slice(2).some(Boolean) || cleaned.postalCode) {
      return failure(cleaned, "hierarchy_gap");
    }
    return failure(cleaned, "missing_state");
  }

  const firstEmptyIndex = geographicValues.findIndex((value) => !value);
  if (firstEmptyIndex >= 0 && geographicValues.slice(firstEmptyIndex + 1).some(Boolean)) {
    return failure(cleaned, "hierarchy_gap");
  }

  return {
    ok: true,
    cleaned,
    normalizedKey: buildCampaignLocationNormalizedKey(cleaned)
  };
}

function failure(
  cleaned: CampaignLocationImportRow,
  errorCode: CampaignLocationValidationErrorCode
): CampaignLocationRowValidationFailure {
  return {
    ok: false,
    cleaned,
    errorCode,
    reason: campaignLocationValidationMessages[errorCode]
  };
}
