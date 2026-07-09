import { useCallback, useEffect, useMemo } from "react";
import { normalizeCampaignGrowthConfiguration } from "../configuration";
import { usePersistentState } from "../../hooks/usePersistentState";
import type { GrowthRuntimeState } from "../lifecycle";
import type { GrowthDashboardModel } from "../types";
import { useGrowth } from "../hooks/useGrowth";
import {
  buildGrowthActionCenterModel,
  createCommandEnvironment,
  executeGrowthCommand,
  runAutomations,
  updateMissionAndChallengeProgress,
  undoGrowthCommand
} from "./commandService";
import { createEmptyExecutionStore, createExecutionStoreKey, normalizeExecutionStore, upsertNotificationState } from "./storage";
import type { GrowthActionCenterModel, GrowthCommandId, GrowthExecutionStore } from "./types";

interface UseGrowthActionCenterOptions {
  model: GrowthDashboardModel;
  runtime?: GrowthRuntimeState;
  activeCampaignId?: string;
}

export function useGrowthActionCenter(options: UseGrowthActionCenterOptions): {
  model: GrowthActionCenterModel;
  store: GrowthExecutionStore;
  execute: (commandId: GrowthCommandId, trigger?: "manual" | "automation" | "recommendation") => Promise<void>;
  undo: (commandId: GrowthCommandId) => Promise<void>;
  dismissAction: (actionId: string) => void;
  markNotificationRead: (id: string) => void;
  toggleNotificationPin: (id: string) => void;
  dismissNotification: (id: string) => void;
  archiveNotification: (id: string) => void;
  markAllNotificationsRead: (ids: string[]) => void;
} {
  const { events, growthContext } = useGrowth();
  const campaignId = options.activeCampaignId ?? options.model.scope.campaign?.id ?? "campaign";
  const [store, setStore] = usePersistentState<GrowthExecutionStore>(
    createExecutionStoreKey(campaignId),
    createEmptyExecutionStore()
  );

  const normalizedStore = useMemo(() => normalizeExecutionStore(store), [store]);
  const configuration = useMemo(
    () => normalizeCampaignGrowthConfiguration(options.model.scope.campaign),
    [options.model.scope.campaign]
  );

  useEffect(() => {
    const env = createCommandEnvironment({
      campaignId,
      model: options.model,
      runtime: options.runtime,
      configuration,
      store: normalizedStore
    });
    const withProgress = updateMissionAndChallengeProgress(env);
    if (JSON.stringify(withProgress) !== JSON.stringify(normalizedStore)) {
      setStore(withProgress);
    }
  }, [campaignId, configuration, normalizedStore, options.model, options.runtime, setStore]);

  useEffect(() => {
    const env = createCommandEnvironment({
      campaignId,
      model: options.model,
      runtime: options.runtime,
      configuration,
      store: normalizedStore
    });
    const automations = runAutomations(env);
    if (automations.length === 0) return;
    automations.forEach(async (item) => {
      const result = await executeGrowthCommand({
        commandId: item.commandId,
        context: {
          campaignId,
          actor: growthContext.actorId ?? "automation",
          trigger: "automation",
          dedupeKey: item.dedupeKey,
          metadata: {
            reason: item.reason
          }
        },
        env,
        publishIntent: events.publishIntent
      });
      setStore(result.store);
    });
  }, [campaignId, configuration, events.publishIntent, growthContext.actorId, options.model, options.runtime, setStore]);

  const actionCenterModel = useMemo(
    () =>
      buildGrowthActionCenterModel({
        env: createCommandEnvironment({
          campaignId,
          model: options.model,
          runtime: options.runtime,
          configuration,
          store: normalizedStore
        })
      }),
    [campaignId, configuration, normalizedStore, options.model, options.runtime]
  );

  const execute = useCallback(
    async (commandId: GrowthCommandId, trigger: "manual" | "automation" | "recommendation" = "manual") => {
      const dedupeKey = `${campaignId}:${commandId}:${trigger}:${new Date().toISOString().slice(0, 16)}`;
      const env = createCommandEnvironment({
        campaignId,
        model: options.model,
        runtime: options.runtime,
        configuration,
        store: normalizedStore
      });
      const result = await executeGrowthCommand({
        commandId,
        context: {
          campaignId,
          actor: growthContext.actorId ?? "admin",
          trigger,
          dedupeKey
        },
        env,
        publishIntent: events.publishIntent
      });
      setStore(result.store);
    },
    [campaignId, configuration, events.publishIntent, growthContext.actorId, normalizedStore, options.model, options.runtime, setStore]
  );

  const undo = useCallback(
    async (commandId: GrowthCommandId) => {
      const env = createCommandEnvironment({
        campaignId,
        model: options.model,
        runtime: options.runtime,
        configuration,
        store: normalizedStore
      });
      const result = await undoGrowthCommand({
        commandId,
        context: {
          campaignId,
          actor: growthContext.actorId ?? "admin",
          trigger: "manual",
          dedupeKey: `${campaignId}:${commandId}:undo:${new Date().toISOString().slice(0, 16)}`
        },
        env,
        publishIntent: events.publishIntent
      });
      setStore(result.store);
    },
    [campaignId, configuration, events.publishIntent, growthContext.actorId, normalizedStore, options.model, options.runtime, setStore]
  );

  const dismissAction = useCallback(
    (actionId: string) => {
      setStore((current) => {
        const next = normalizeExecutionStore(current);
        if (next.dismissedActionIds.includes(actionId)) return next;
        return {
          ...next,
          dismissedActionIds: [actionId, ...next.dismissedActionIds]
        };
      });
    },
    [setStore]
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      setStore((current) => upsertNotificationState(normalizeExecutionStore(current), id, { read: true }));
    },
    [setStore]
  );

  const toggleNotificationPin = useCallback(
    (id: string) => {
      setStore((current) => {
        const next = normalizeExecutionStore(current);
        const previous = next.notificationState[id];
        return upsertNotificationState(next, id, { pinned: !previous?.pinned });
      });
    },
    [setStore]
  );

  const dismissNotification = useCallback(
    (id: string) => {
      setStore((current) => upsertNotificationState(normalizeExecutionStore(current), id, { dismissed: true }));
    },
    [setStore]
  );

  const archiveNotification = useCallback(
    (id: string) => {
      setStore((current) => upsertNotificationState(normalizeExecutionStore(current), id, { archived: true }));
    },
    [setStore]
  );

  const markAllNotificationsRead = useCallback(
    (ids: string[]) => {
      setStore((current) => {
        let next = normalizeExecutionStore(current);
        for (const id of ids) {
          next = upsertNotificationState(next, id, { read: true });
        }
        return next;
      });
    },
    [setStore]
  );

  return {
    model: actionCenterModel,
    store: normalizedStore,
    execute,
    undo,
    dismissAction,
    markNotificationRead,
    toggleNotificationPin,
    dismissNotification,
    archiveNotification,
    markAllNotificationsRead
  };
}
