import type { GrowthEvent, GrowthEventHookSet, GrowthEventListener } from "./types";

export class GrowthEventHooks {
  private hooks: GrowthEventHookSet[] = [];

  register(hookSet: GrowthEventHookSet) {
    this.hooks = [...this.hooks, hookSet];
    return () => this.unregister(hookSet);
  }

  unregister(hookSet: GrowthEventHookSet) {
    this.hooks = this.hooks.filter((item) => item !== hookSet);
  }

  async runBeforePublish(event: GrowthEvent) {
    for (const hookSet of this.hooks) {
      await hookSet.beforePublish?.(event);
    }
  }

  async runAfterPublish(event: GrowthEvent) {
    for (const hookSet of this.hooks) {
      await hookSet.afterPublish?.(event);
    }
  }

  runListenerError(event: GrowthEvent, listener: GrowthEventListener, error: unknown) {
    this.hooks.forEach((hookSet) => hookSet.onListenerError?.(event, listener, error));
  }

  clear() {
    this.hooks = [];
  }
}
