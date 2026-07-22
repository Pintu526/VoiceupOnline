import type { BusinessOsApplicationStatus } from "../components/ApplicationStatusCard";

export type MarketingApplicationKey =
  | "voiceup"
  | "campaign"
  | "goudhan"
  | "panditOnline"
  | "teachToday"
  | "homeNurseHub"
  | "cateringHub";

export interface MarketingApplicationDefinition {
  key: MarketingApplicationKey;
  status: BusinessOsApplicationStatus;
  enabled: boolean;
}

export const marketingApplicationDefinitions: MarketingApplicationDefinition[] = [
  {
    key: "voiceup",
    status: "IN PROGRESS",
    enabled: false
  },
  {
    key: "campaign",
    status: "LIVE",
    enabled: true
  },
  {
    key: "goudhan",
    status: "IN PROGRESS",
    enabled: false
  },
  {
    key: "panditOnline",
    status: "IN PROGRESS",
    enabled: false
  },
  {
    key: "teachToday",
    status: "IN PROGRESS",
    enabled: false
  },
  {
    key: "homeNurseHub",
    status: "COMING SOON",
    enabled: false
  },
  {
    key: "cateringHub",
    status: "COMING SOON",
    enabled: false
  }
];

export function findMarketingApplication(applicationKey: string | undefined) {
  if (!applicationKey) return undefined;
  return marketingApplicationDefinitions.find((application) => application.key === applicationKey);
}
