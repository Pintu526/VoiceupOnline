import type { BulkImportRowOutcome } from "../../contracts.ts";

export const campaignLocationImportFields = [
  "country",
  "state",
  "district",
  "block",
  "panchayat",
  "village",
  "postalCode"
] as const;

export type CampaignLocationImportField = (typeof campaignLocationImportFields)[number];

export type CampaignLocationImportRow = Record<CampaignLocationImportField, string>;

export const campaignLocationHierarchyFields = [
  "country",
  "state",
  "district",
  "block",
  "panchayat",
  "village"
] as const;

export type CampaignLocationHierarchyField = (typeof campaignLocationHierarchyFields)[number];

export type CampaignLocationValidationErrorCode =
  | "missing_country"
  | "missing_state"
  | "hierarchy_gap"
  | "empty_location_path";

export interface CampaignLocationImportInput {
  rowNumber: number;
  row: CampaignLocationImportRow;
}

export interface CampaignLocationImportResult {
  rowNumber: number;
  cleaned: CampaignLocationImportRow;
  normalizedKey?: string;
  outcome: BulkImportRowOutcome;
  errorCode?: CampaignLocationValidationErrorCode;
  reason?: string;
}

export const campaignLocationValidationMessages: Record<CampaignLocationValidationErrorCode, string> = {
  missing_country: "Country is required.",
  missing_state: "State is required.",
  hierarchy_gap: "Each location level requires its parent level.",
  empty_location_path: "At least country and state are required."
};

export const campaignLocationNormalizedKeySeparator = "\u001f";
