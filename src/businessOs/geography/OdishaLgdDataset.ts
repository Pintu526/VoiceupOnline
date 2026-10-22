import type { GeographyDataset } from "./types.ts";
import { INDIA_LGD_SOURCE } from "./IndiaAdministrativeHierarchy.ts";

export const ODISHA_LGD_DATASET_VERSION = "lgd-2026-08-27";

export const odishaLgdDataset: GeographyDataset = {
  schemaVersion: 1,
  datasetVersion: ODISHA_LGD_DATASET_VERSION,
  generatedAt: "2026-08-27",
  countryCode: "IN",
  source: INDIA_LGD_SOURCE,
  coverage: [
    { level: "district", status: "complete", recordCount: 33 },
    { level: "block", status: "complete", recordCount: 637 },
    { level: "local_body", status: "complete", recordCount: 7141 },
    { level: "village", status: "complete", recordCount: 51803 },
    { level: "ward", status: "complete", recordCount: 111683 }
  ],
  nodes: []
};
