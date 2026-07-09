import { GrowthEventPriority, GrowthEventStatus, type GrowthEvent } from "./types";
import { GrowthEventUtilities } from "./utilities";

export class GrowthEventQueue {
  private events: GrowthEvent[] = [];

  enqueue(event: GrowthEvent) {
    const queuedEvent = GrowthEventUtilities.withStatus(event, GrowthEventStatus.Queued);
    this.events = [...this.events, queuedEvent].sort((left, right) => {
      const priorityOrder: Record<GrowthEvent["priority"], number> = {
        [GrowthEventPriority.Critical]: 4,
        [GrowthEventPriority.High]: 3,
        [GrowthEventPriority.Normal]: 2,
        [GrowthEventPriority.Low]: 1
      };
      return priorityOrder[right.priority] - priorityOrder[left.priority];
    });
    return queuedEvent;
  }

  dequeue() {
    const [nextEvent, ...remainingEvents] = this.events;
    this.events = remainingEvents;
    return nextEvent;
  }

  peek() {
    return this.events[0];
  }

  list() {
    return [...this.events];
  }

  clear() {
    this.events = [];
  }

  size() {
    return this.events.length;
  }
}
