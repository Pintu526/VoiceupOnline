import {
  GrowthEventPriority,
  GrowthEventStatus,
  GrowthEventType,
  type GrowthEvent,
  type GrowthTimelineEntry
} from "./types";
import { growthEventDefinitions } from "./definitions";

function randomToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export const GrowthEventUtilities = {
  createEventId(prefix = "gev") {
    return `${prefix}-${randomToken()}`;
  },

  createTraceId() {
    return `trace-${randomToken()}`;
  },

  createCorrelationId() {
    return `corr-${randomToken()}`;
  },

  now() {
    return new Date().toISOString();
  },

  isHighPriority(priority: GrowthEventPriority) {
    return priority === GrowthEventPriority.High || priority === GrowthEventPriority.Critical;
  },

  toTimelineEntry(event: GrowthEvent): GrowthTimelineEntry {
    const definition = growthEventDefinitions[event.type];
    return {
      id: `timeline-${event.eventId}`,
      eventId: event.eventId,
      type: event.type,
      title: definition?.label ?? event.type,
      description: String(event.metadata.description ?? definition?.description ?? event.type),
      timestamp: event.timestamp,
      campaignId: event.campaignId,
      supporterId: event.supporterId,
      priority: event.priority,
      status: event.status
    };
  },

  isSystemEvent(type: GrowthEventType) {
    return type === GrowthEventType.Error || type === GrowthEventType.Warning || type === GrowthEventType.SystemEvent;
  },

  withStatus(event: GrowthEvent, status: GrowthEventStatus): GrowthEvent {
    return { ...event, status };
  }
};
