export type {
  CampaignLocationHierarchyField,
  CampaignLocationImportField,
  CampaignLocationImportInput,
  CampaignLocationImportResult,
  CampaignLocationImportRow,
  CampaignLocationValidationErrorCode
} from "./contracts.ts";

export {
  campaignLocationHierarchyFields,
  campaignLocationImportFields,
  campaignLocationNormalizedKeySeparator,
  campaignLocationValidationMessages
} from "./contracts.ts";

export {
  buildCampaignLocationNormalizedKey,
  cleanCampaignLocationRow,
  cleanCampaignLocationValue
} from "./normalizeCampaignLocationRow.ts";

export {
  validateCampaignLocationRow,
  type CampaignLocationRowValidationFailure,
  type CampaignLocationRowValidationResult,
  type CampaignLocationRowValidationSuccess
} from "./validateCampaignLocationRow.ts";

export { classifyCampaignLocationRows } from "./classifyCampaignLocationRows.ts";
