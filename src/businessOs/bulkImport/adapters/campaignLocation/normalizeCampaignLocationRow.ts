import {
  campaignLocationHierarchyFields,
  campaignLocationImportFields,
  campaignLocationNormalizedKeySeparator,
  type CampaignLocationImportRow
} from "./contracts.ts";

export function cleanCampaignLocationValue(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\t\n\r\f\v]/g, " ")
    .replace(/[\p{Cc}]/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
}

export function cleanCampaignLocationRow(row: CampaignLocationImportRow): CampaignLocationImportRow {
  return Object.fromEntries(
    campaignLocationImportFields.map((field) => [field, cleanCampaignLocationValue(row[field] ?? "")])
  ) as CampaignLocationImportRow;
}

export function buildCampaignLocationNormalizedKey(row: CampaignLocationImportRow): string {
  const geographicParts: string[] = [];

  for (const field of campaignLocationHierarchyFields) {
    const value = row[field];
    if (!value) break;
    geographicParts.push(value.toLowerCase());
  }

  const geographicKey = geographicParts.join(campaignLocationNormalizedKeySeparator);
  if (!row.postalCode) return geographicKey;

  return [geographicKey, row.postalCode.toLowerCase()].join(campaignLocationNormalizedKeySeparator);
}
