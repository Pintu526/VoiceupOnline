import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { LocationLevel } from "../../geography/LocationApiTypes.ts";
import {
  CanonicalLocationUiController,
  type CanonicalLocationCatalogReader,
  type CanonicalLocationUiState
} from "./CanonicalLocationUiModel.ts";

export interface UseCanonicalLocationUiOptions {
  client: CanonicalLocationCatalogReader;
  rootNodeId: string;
  resultLimit?: number;
  disabled?: boolean;
  autoLoad?: boolean;
}

export interface CanonicalLocationUiActions {
  initialize(): Promise<void>;
  select(branchIndex: number, nodeId: string): Promise<void>;
  search(query: string, expectedLevel?: LocationLevel): Promise<void>;
  resolve(query: {
    nodeId?: string;
    officialCode?: string;
    normalizedName?: string;
    expectedLevel?: LocationLevel;
  }): Promise<void>;
  confirmResolution(nodeId: string): Promise<void>;
  clearResolution(): void;
  clear(): void;
  retry(): Promise<void>;
}

export function useCanonicalLocationUi(
  options: UseCanonicalLocationUiOptions
): { state: CanonicalLocationUiState; actions: CanonicalLocationUiActions } {
  const { client, rootNodeId, resultLimit, disabled = false, autoLoad = true } = options;
  const controller = useMemo(() => new CanonicalLocationUiController({
    client,
    rootNodeId,
    resultLimit,
    disabled
  }), [client, rootNodeId, resultLimit]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.setDisabled(disabled);
    if (autoLoad && !disabled && controller.getSnapshot().status === "idle") void controller.initialize();
  }, [autoLoad, controller, disabled]);

  useEffect(() => () => controller.dispose(), [controller]);

  const actions = useMemo<CanonicalLocationUiActions>(() => ({
    initialize: () => controller.initialize(),
    select: (branchIndex, nodeId) => controller.select(branchIndex, nodeId),
    search: (query, expectedLevel) => controller.search(query, expectedLevel),
    resolve: (query) => controller.resolve(query),
    confirmResolution: (nodeId) => controller.confirmResolution(nodeId),
    clearResolution: () => controller.clearResolution(),
    clear: () => controller.clear(),
    retry: () => controller.retry()
  }), [controller]);

  return { state, actions };
}
