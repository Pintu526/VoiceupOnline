import type { GrowthEvent, GrowthEventType, GrowthTimelineEntry } from "./types";
import { GrowthEventUtilities } from "./utilities";

export class GrowthEventHistory {
  private events: GrowthEvent[] = [];
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  append(event: GrowthEvent) {
    this.events = [event, ...this.events].slice(0, this.maxEntries);
  }

  list(filter?: { type?: GrowthEventType; campaignId?: string; supporterId?: string }) {
    return this.events.filter((event) => {
      if (filter?.type && event.type !== filter.type) return false;
      if (filter?.campaignId && event.campaignId !== filter.campaignId) return false;
      if (filter?.supporterId && event.supporterId !== filter.supporterId) return false;
      return true;
    });
  }

  timeline(): GrowthTimelineEntry[] {
    return this.events.map((event) => GrowthEventUtilities.toTimelineEntry(event));
  }

  clear() {
    this.events = [];
  }
}
