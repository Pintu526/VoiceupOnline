import type { ImportResultComparisonResult } from "../../comparison/contracts.ts";

export type CampaignLocationParsedRow = {
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  village: string;
  postalCode: string;
};

export interface LegacyServerImportRow {
  rowNumber: number;
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  village: string;
  postalCode: string;
  normalizedPath?: string;
  classification: string;
  errorCode?: string | null;
}

export type ShadowNotComparedField = "normalized_key" | "outcome" | "error_code";

export interface CampaignLocationShadowDiagnosticMismatch {
  rowNumber: number;
  mismatchFields: string[];
}

export interface ShadowComparisonSummary {
  matches: boolean;
  totalRows: number;
  matchedRows: number;
  mismatchedRows: number;
  missingLegacyRows: number;
  missingBusinessOsRows: number;
  notComparedFields: ShadowNotComparedField[];
  mismatches: CampaignLocationShadowDiagnosticMismatch[];
}

export interface CampaignLocationShadowServerComparison extends ShadowComparisonSummary {
  comparatorResult: ImportResultComparisonResult;
}

export type CampaignLocationShadowResult =
  | {
      ok: true;
      parseComparison: ShadowComparisonSummary;
      serverComparison: CampaignLocationShadowServerComparison | null;
    }
  | {
      ok: false;
    };

export const parseShadowNotComparedFields: ShadowNotComparedField[] = [
  "normalized_key",
  "outcome",
  "error_code"
];

export const serverShadowNotComparedFields: ShadowNotComparedField[] = ["normalized_key"];
