import type { GrowthEvent, GrowthEventIntent } from "../events";

export type GrowthTimelineRecordKind =
  | "source_activity"
  | "credits"
  | "wallet"
  | "promotion"
  | "contribution"
  | "recognition"
  | "achievement"
  | "prize"
  | "system";

export interface GrowthTimelineRecord {
  id: string;
  campaignId: string;
  supporterId?: string;
  kind: GrowthTimelineRecordKind;
  title: string;
  description: string;
  timestamp: string;
  sourceEventId?: string;
  duplicateKey: string;
  metadata?: Record<string, unknown>;
}

export interface GrowthTimelineInput {
  records: GrowthTimelineRecord[];
  event?: GrowthEvent;
  intent?: GrowthEventIntent;
  existingKeys?: string[];
}

export interface GrowthTimelineResult {
  records: GrowthTimelineRecord[];
  skippedDuplicateKeys: string[];
}
