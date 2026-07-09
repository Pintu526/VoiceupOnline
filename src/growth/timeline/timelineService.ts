import { GrowthEventType } from "../events";
import type { GrowthTimelineInput, GrowthTimelineRecord, GrowthTimelineResult } from "./types";

function labelForType(type: GrowthEventType | undefined) {
  if (!type) return "Growth event";
  return type
    .split(".")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function createTimelineRecordFromEvent(input: GrowthTimelineInput): GrowthTimelineResult {
  const existingKeys = new Set(input.existingKeys ?? input.records.map((record) => record.duplicateKey));
  const event = input.event;
  const intent = input.intent;
  const type = event?.type ?? intent?.type;
  const campaignId = event?.campaignId ?? intent?.context?.campaignId;
  const supporterId = event?.supporterId ?? intent?.context?.supporterId;
  const duplicateKey = event?.eventId ?? String(intent?.metadata?.duplicateKey ?? `${type}:${campaignId}:${supporterId}`);

  if (!campaignId) {
    return {
      records: input.records,
      skippedDuplicateKeys: []
    };
  }

  if (existingKeys.has(duplicateKey)) {
    return {
      records: input.records,
      skippedDuplicateKeys: [duplicateKey]
    };
  }

  const record: GrowthTimelineRecord = {
    id: `timeline-${duplicateKey}`,
    campaignId,
    supporterId,
    kind: "system",
    title: labelForType(type),
    description: "Growth engine event recorded.",
    timestamp: event?.timestamp ?? new Date().toISOString(),
    sourceEventId: event?.eventId,
    duplicateKey,
    metadata: event?.metadata ?? intent?.metadata
  };

  return {
    records: [...input.records, record],
    skippedDuplicateKeys: []
  };
}
