import type {
  GrowthCertificateRecord,
  GrowthChallengeExecutionRecord,
  GrowthExecutionStore,
  GrowthMissionExecutionRecord,
  GrowthNotificationActionState
} from "./types";

const EMPTY_STORE: GrowthExecutionStore = {
  logs: [],
  audits: [],
  timeline: [],
  dismissedActionIds: [],
  notificationState: {},
  certificates: [],
  missions: {},
  challenges: {}
};

export function createExecutionStoreKey(campaignId: string) {
  return `growth-execution-store:${campaignId}`;
}

export function createEmptyExecutionStore(): GrowthExecutionStore {
  return {
    ...EMPTY_STORE,
    logs: [],
    audits: [],
    timeline: [],
    dismissedActionIds: [],
    notificationState: {},
    certificates: [],
    missions: {},
    challenges: {}
  };
}

export function normalizeExecutionStore(input?: Partial<GrowthExecutionStore> | null): GrowthExecutionStore {
  return {
    ...createEmptyExecutionStore(),
    ...input,
    logs: input?.logs ?? [],
    audits: input?.audits ?? [],
    timeline: input?.timeline ?? [],
    dismissedActionIds: input?.dismissedActionIds ?? [],
    notificationState: input?.notificationState ?? {},
    certificates: input?.certificates ?? [],
    missions: input?.missions ?? {},
    challenges: input?.challenges ?? {}
  };
}

export function upsertNotificationState(
  store: GrowthExecutionStore,
  notificationId: string,
  patch: Partial<GrowthNotificationActionState>
): GrowthExecutionStore {
  const previous = store.notificationState[notificationId] ?? {
    id: notificationId,
    read: false,
    archived: false,
    pinned: false,
    dismissed: false
  };
  return {
    ...store,
    notificationState: {
      ...store.notificationState,
      [notificationId]: {
        ...previous,
        ...patch
      }
    }
  };
}

export function upsertMissionRecord(
  store: GrowthExecutionStore,
  missionId: string,
  patch: Partial<GrowthMissionExecutionRecord>
): GrowthExecutionStore {
  const previous: GrowthMissionExecutionRecord =
    store.missions[missionId] ?? {
      missionId,
      status: "draft",
      progress: 0
    };
  return {
    ...store,
    missions: {
      ...store.missions,
      [missionId]: {
        ...previous,
        ...patch
      }
    }
  };
}

export function upsertChallengeRecord(
  store: GrowthExecutionStore,
  challengeId: string,
  patch: Partial<GrowthChallengeExecutionRecord>
): GrowthExecutionStore {
  const previous: GrowthChallengeExecutionRecord =
    store.challenges[challengeId] ?? {
      challengeId,
      status: "draft",
      progress: 0,
      participants: 0,
      winners: []
    };
  return {
    ...store,
    challenges: {
      ...store.challenges,
      [challengeId]: {
        ...previous,
        ...patch
      }
    }
  };
}

export function addCertificateRecord(
  store: GrowthExecutionStore,
  record: GrowthCertificateRecord
): GrowthExecutionStore {
  const exists = store.certificates.some(
    (item) =>
      item.campaignId === record.campaignId &&
      item.supporterId === record.supporterId &&
      item.templateId === record.templateId
  );
  if (exists) return store;
  return {
    ...store,
    certificates: [record, ...store.certificates]
  };
}
