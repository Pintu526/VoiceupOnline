import { GrowthEventPriority, GrowthEventSource, GrowthEventStatus, GrowthEventType, type GrowthEvent } from "./types";

export interface GrowthEventValidationResult {
  valid: boolean;
  errors: string[];
}

function enumIncludes<T extends Record<string, string>>(target: T, value: string) {
  return Object.values(target).includes(value);
}

export class GrowthEventValidator {
  static validate(event: GrowthEvent): GrowthEventValidationResult {
    const errors: string[] = [];
    if (!event.eventId) errors.push("eventId is required.");
    if (!event.timestamp) errors.push("timestamp is required.");
    if (!event.workspaceId) errors.push("workspaceId is required.");
    if (!enumIncludes(GrowthEventType, event.type)) errors.push("type is not a valid GrowthEventType.");
    if (!enumIncludes(GrowthEventSource, event.source)) errors.push("source is not a valid GrowthEventSource.");
    if (!enumIncludes(GrowthEventStatus, event.status)) errors.push("status is not a valid GrowthEventStatus.");
    if (!enumIncludes(GrowthEventPriority, event.priority)) errors.push("priority is not a valid GrowthEventPriority.");
    if (!event.correlationId) errors.push("correlationId is required.");
    if (!event.traceId) errors.push("traceId is required.");
    if (!event.metadata || typeof event.metadata !== "object") errors.push("metadata must be an object.");
    return { valid: errors.length === 0, errors };
  }

  static assertValid(event: GrowthEvent) {
    const result = GrowthEventValidator.validate(event);
    if (!result.valid) {
      throw new Error(`Invalid growth event: ${result.errors.join(" ")}`);
    }
  }
}
