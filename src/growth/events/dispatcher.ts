import { GrowthEventAudit } from "./audit";
import { GrowthEventHistory } from "./history";
import { GrowthEventHooks } from "./hooks";
import { GrowthEventQueue } from "./queue";
import { GrowthEventRegistry } from "./registry";
import { GrowthEventStatus, type GrowthEvent, type GrowthEventListener } from "./types";
import { GrowthEventUtilities } from "./utilities";
import { GrowthEventValidator } from "./validator";

export interface GrowthEventDispatcherOptions {
  registry?: GrowthEventRegistry;
  queue?: GrowthEventQueue;
  history?: GrowthEventHistory;
  audit?: GrowthEventAudit;
  hooks?: GrowthEventHooks;
}

export class GrowthEventDispatcher {
  readonly registry: GrowthEventRegistry;
  readonly queue: GrowthEventQueue;
  readonly history: GrowthEventHistory;
  readonly audit: GrowthEventAudit;
  readonly hooks: GrowthEventHooks;

  constructor(options: GrowthEventDispatcherOptions = {}) {
    this.registry = options.registry ?? new GrowthEventRegistry();
    this.queue = options.queue ?? new GrowthEventQueue();
    this.history = options.history ?? new GrowthEventHistory();
    this.audit = options.audit ?? new GrowthEventAudit();
    this.hooks = options.hooks ?? new GrowthEventHooks();
  }

  subscribe(listener: GrowthEventListener) {
    return this.registry.register(listener);
  }

  unsubscribe(listenerId: string) {
    this.registry.unregister(listenerId);
  }

  async publish(event: GrowthEvent) {
    try {
      GrowthEventValidator.assertValid(event);
    } catch (error) {
      this.audit.record({
        event,
        action: "validation.failed",
        message: error instanceof Error ? error.message : "Growth event validation failed."
      });
      throw error;
    }

    await this.hooks.runBeforePublish(event);
    const queuedEvent = this.queue.enqueue(event);
    this.audit.record({ event: queuedEvent, action: "queued", message: "Growth event queued." });

    const dispatchEvent = GrowthEventUtilities.withStatus(queuedEvent, GrowthEventStatus.Processing);
    const listeners = this.registry.dispatchableFor(dispatchEvent);

    for (const listener of listeners) {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        await listener.handle(dispatchEvent);
        const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.audit.record({
          event: dispatchEvent,
          action: "listener.completed",
          message: `Listener ${listener.name} completed.`,
          listenerId: listener.id,
          durationMs: Math.round(finishedAt - startedAt)
        });
      } catch (error) {
        const failedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.audit.record({
          event: dispatchEvent,
          action: "listener.failed",
          message: error instanceof Error ? error.message : `Listener ${listener.name} failed.`,
          listenerId: listener.id,
          durationMs: Math.round(failedAt - startedAt)
        });
        this.hooks.runListenerError(dispatchEvent, listener, error);
      }
    }

    this.queue.dequeue();
    const completedEvent = GrowthEventUtilities.withStatus(dispatchEvent, GrowthEventStatus.Completed);
    this.history.append(completedEvent);
    this.audit.record({ event: completedEvent, action: "published", message: "Growth event published." });
    await this.hooks.runAfterPublish(completedEvent);
    return completedEvent;
  }
}
