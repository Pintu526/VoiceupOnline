import type { GrowthEvent, GrowthEventAuditEntry, GrowthEventMetadata, GrowthEventObservability } from "./types";
import { GrowthEventUtilities } from "./utilities";

export class GrowthEventAudit {
  private entries: GrowthEventAuditEntry[] = [];
  private observability?: GrowthEventObservability;

  constructor(observability?: GrowthEventObservability) {
    this.observability = observability;
  }

  record(options: {
    event: GrowthEvent;
    action: GrowthEventAuditEntry["action"];
    message: string;
    listenerId?: string;
    durationMs?: number;
    metadata?: GrowthEventMetadata;
  }) {
    const entry: GrowthEventAuditEntry = {
      id: GrowthEventUtilities.createEventId("gea"),
      eventId: options.event.eventId,
      action: options.action,
      message: options.message,
      timestamp: GrowthEventUtilities.now(),
      listenerId: options.listenerId,
      durationMs: options.durationMs,
      metadata: options.metadata
    };
    this.entries = [entry, ...this.entries].slice(0, 500);
    this.observability?.structuredLog?.(entry);
    if (typeof options.durationMs === "number") {
      this.observability?.performanceMetric?.("growth.listener.duration_ms", options.durationMs, options.event);
    }
    return entry;
  }

  list() {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
  }
}
