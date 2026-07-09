import type { GrowthEvent, GrowthEventListener, GrowthEventType } from "./types";

export class GrowthEventRegistry {
  private listeners = new Map<string, GrowthEventListener>();

  register(listener: GrowthEventListener) {
    this.listeners.set(listener.id, listener);
    return () => this.unregister(listener.id);
  }

  unregister(listenerId: string) {
    this.listeners.delete(listenerId);
  }

  getListeners(eventType?: GrowthEventType) {
    const listeners = Array.from(this.listeners.values());
    if (!eventType) return listeners;
    return listeners.filter(
      (listener) => !listener.supportedTypes || listener.supportedTypes.includes(eventType)
    );
  }

  getListener(listenerId: string) {
    return this.listeners.get(listenerId);
  }

  clear() {
    this.listeners.clear();
  }

  dispatchableFor(event: GrowthEvent) {
    return this.getListeners(event.type);
  }
}
