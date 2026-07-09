import { GrowthEventPriority, GrowthEventType, type GrowthEventIntent } from "../events";
import {
  executeCommand,
  getCommandDescriptor,
  getAllCommandDescriptors,
  undoCommand
} from "./commandRegistry";
import {
  addCertificateRecord,
  createEmptyExecutionStore,
  upsertChallengeRecord,
  upsertMissionRecord
} from "./storage";
import type {
  GrowthActionCard,
  GrowthActionCenterModel,
  GrowthCertificateRecord,
  GrowthCommandEnvironment,
  GrowthCommandExecutionContext,
  GrowthCommandId,
  GrowthCommandLog,
  GrowthExecutionStore
} from "./types";

function now() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function durationMs(startedAt: string, endedAt: string) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

function buildEventIntent(
  commandId: GrowthCommandId,
  context: GrowthCommandExecutionContext,
  eventType: GrowthEventType,
  status: string,
  message: string,
  retryCount: number
): GrowthEventIntent {
  return {
    type: eventType,
    priority: status === "failed" ? GrowthEventPriority.High : GrowthEventPriority.Normal,
    context: {
      campaignId: context.campaignId,
      supporterId: context.actor
    },
    metadata: {
      commandId,
      dedupeKey: context.dedupeKey,
      trigger: context.trigger,
      actor: context.actor,
      status,
      retryCount,
      message
    }
  };
}

function isDuplicateSuccessfulExecution(
  store: GrowthExecutionStore,
  commandId: GrowthCommandId,
  dedupeKey: string
) {
  return store.logs.some(
    (log) => log.commandId === commandId && log.dedupeKey === dedupeKey && log.status === "success"
  );
}

function appendLog(store: GrowthExecutionStore, log: GrowthCommandLog): GrowthExecutionStore {
  return {
    ...store,
    logs: [log, ...store.logs],
    audits: [
      {
        id: createId("audit"),
        commandId: log.commandId,
        status: log.status,
        actor: log.actor,
        createdAt: log.completedAt ?? log.startedAt,
        retryCount: log.retryCount,
        durationMs: log.durationMs
      },
      ...store.audits
    ],
    timeline: [
      {
        id: createId("timeline"),
        campaignId: log.dedupeKey.split(":")[0] || "campaign",
        commandId: log.commandId,
        title: `${getCommandDescriptor(log.commandId).title} ${log.status}`,
        description: log.message,
        timestamp: log.completedAt ?? log.startedAt,
        status: log.status
      },
      ...store.timeline
    ]
  };
}

function withProgress(log: GrowthCommandLog, progress: number): GrowthCommandLog {
  return {
    ...log,
    progress
  };
}

function applyBusinessSideEffects(
  store: GrowthExecutionStore,
  env: GrowthCommandEnvironment,
  commandId: GrowthCommandId,
  actor: string,
  source: "manual" | "automatic"
): GrowthExecutionStore {
  if (commandId === "launch_mission") {
    const mission = env.configuration.missions[0];
    if (!mission) return store;
    return upsertMissionRecord(store, mission.id, {
      missionId: mission.id,
      status: "running",
      progress: 0,
      startedAt: now()
    });
  }

  if (commandId === "launch_challenge") {
    const challenge = env.configuration.challenges[0];
    if (!challenge) return store;
    return upsertChallengeRecord(store, challenge.id, {
      challengeId: challenge.id,
      status: "running",
      progress: 0,
      participants: env.model.summary.totalSupporters,
      winners: [],
      startedAt: now()
    });
  }

  if (commandId === "issue_certificates") {
    const template = env.configuration.certificates.templates[0];
    if (!template) return store;
    const supporterIds = (env.runtime?.achievements ?? [])
      .filter((item) => item.campaignId === env.campaignId)
      .map((item) => item.supporterId);
    return supporterIds.reduce((nextStore, supporterId, index) => {
      const serialPrefix = env.campaignId.slice(0, 6).toUpperCase();
      const serialNumber = `${serialPrefix}-${String(index + 1).padStart(6, "0")}`;
      const record: GrowthCertificateRecord = {
        id: createId("cert"),
        campaignId: env.campaignId,
        supporterId,
        templateId: template.id,
        serialNumber,
        verificationId: createId("verify"),
        issuedAt: now(),
        issuedBy: actor,
        source
      };
      return addCertificateRecord(nextStore, record);
    }, store);
  }

  return store;
}

export async function executeGrowthCommand(options: {
  commandId: GrowthCommandId;
  context: GrowthCommandExecutionContext;
  env: GrowthCommandEnvironment;
  publishIntent?: (intent: GrowthEventIntent) => Promise<unknown>;
  onProgress?: (progress: number) => void;
}): Promise<{ store: GrowthExecutionStore; log: GrowthCommandLog; idempotent: boolean }> {
  const { commandId, context, env, publishIntent, onProgress } = options;
  const descriptor = getCommandDescriptor(commandId);
  const startedAt = now();
  const retryCount = env.store.logs.filter((log) => log.commandId === commandId && log.dedupeKey === context.dedupeKey).length;

  if (isDuplicateSuccessfulExecution(env.store, commandId, context.dedupeKey)) {
    const endedAt = now();
    const idempotentLog: GrowthCommandLog = {
      id: createId("cmd"),
      commandId,
      dedupeKey: context.dedupeKey,
      status: "success",
      actor: context.actor,
      trigger: context.trigger,
      startedAt,
      completedAt: endedAt,
      durationMs: durationMs(startedAt, endedAt),
      progress: 100,
      retryCount,
      message: "Skipped due to idempotency guard.",
      undoSupported: descriptor.undoSupported
    };
    const nextStore = appendLog(env.store, idempotentLog);
    if (publishIntent) {
      await publishIntent(
        buildEventIntent(commandId, context, GrowthEventType.SystemEvent, "idempotent_skip", idempotentLog.message, retryCount)
      );
    }
    return {
      store: nextStore,
      log: idempotentLog,
      idempotent: true
    };
  }

  const runningLog = withProgress(
    {
      id: createId("cmd"),
      commandId,
      dedupeKey: context.dedupeKey,
      status: "running",
      actor: context.actor,
      trigger: context.trigger,
      startedAt,
      progress: 0,
      retryCount,
      message: "Command execution started.",
      undoSupported: descriptor.undoSupported
    },
    20
  );
  onProgress?.(20);

  try {
    const executionResult = await executeCommand(commandId, context, env);
    onProgress?.(65);

    const endedAt = now();
    const completedLog: GrowthCommandLog = {
      ...runningLog,
      status: executionResult.status,
      progress: executionResult.progress,
      completedAt: endedAt,
      durationMs: durationMs(startedAt, endedAt),
      message: executionResult.message,
      undoToken: executionResult.undoToken,
      error: executionResult.status === "failed" ? executionResult.message : undefined
    };

    let nextStore = appendLog(env.store, completedLog);
    if (executionResult.status === "success") {
      nextStore = applyBusinessSideEffects(nextStore, env, commandId, context.actor, context.trigger === "automation" ? "automatic" : "manual");
    }

    onProgress?.(100);
    if (publishIntent) {
      await publishIntent(
        buildEventIntent(
          commandId,
          context,
          executionResult.status === "failed" ? GrowthEventType.Warning : GrowthEventType.SystemEvent,
          executionResult.status,
          executionResult.message,
          retryCount
        )
      );
    }

    return {
      store: nextStore,
      log: completedLog,
      idempotent: false
    };
  } catch (error) {
    const endedAt = now();
    const failedLog: GrowthCommandLog = {
      ...runningLog,
      status: "failed",
      completedAt: endedAt,
      durationMs: durationMs(startedAt, endedAt),
      progress: 100,
      message: error instanceof Error ? error.message : "Command failed.",
      error: error instanceof Error ? error.message : "Command failed."
    };
    const nextStore = appendLog(env.store, failedLog);
    if (publishIntent) {
      await publishIntent(
        buildEventIntent(commandId, context, GrowthEventType.Warning, "failed", failedLog.message, retryCount)
      );
    }
    return {
      store: nextStore,
      log: failedLog,
      idempotent: false
    };
  }
}

export async function undoGrowthCommand(options: {
  commandId: GrowthCommandId;
  context: GrowthCommandExecutionContext;
  env: GrowthCommandEnvironment;
  publishIntent?: (intent: GrowthEventIntent) => Promise<unknown>;
}): Promise<{ store: GrowthExecutionStore; log: GrowthCommandLog }> {
  const { commandId, context, env, publishIntent } = options;
  const descriptor = getCommandDescriptor(commandId);
  const startedAt = now();
  const result = await undoCommand(commandId, context);
  const endedAt = now();

  const undoLog: GrowthCommandLog = {
    id: createId("cmd"),
    commandId,
    dedupeKey: `${context.dedupeKey}:undo`,
    status: result.status,
    actor: context.actor,
    trigger: context.trigger,
    startedAt,
    completedAt: endedAt,
    durationMs: durationMs(startedAt, endedAt),
    progress: 100,
    retryCount: 0,
    message: result.message,
    undoSupported: descriptor.undoSupported
  };

  const nextStore = appendLog(env.store, undoLog);
  if (publishIntent) {
    await publishIntent(
      buildEventIntent(commandId, context, GrowthEventType.SystemEvent, "undone", result.message, 0)
    );
  }
  return {
    store: nextStore,
    log: undoLog
  };
}

function actionId(trigger: string, commandId: string, reason: string) {
  return `${trigger}:${commandId}:${reason}`;
}

function toActionCard(
  commandId: GrowthCommandId,
  trigger: "manual" | "automation" | "recommendation",
  reason: string,
  execution: GrowthCommandLog | undefined,
  scheduledAt?: string
): GrowthActionCard {
  return {
    actionId: actionId(trigger, commandId, reason),
    descriptor: getCommandDescriptor(commandId),
    trigger,
    reason,
    scheduledAt,
    execution
  };
}

function mostRecentLog(logs: GrowthCommandLog[], commandId: GrowthCommandId): GrowthCommandLog | undefined {
  return logs.find((log) => log.commandId === commandId);
}

export function buildGrowthActionCenterModel(options: {
  env: GrowthCommandEnvironment;
}): GrowthActionCenterModel {
  const { env } = options;
  const logs = env.store.logs;
  const completed = logs.filter((log) => log.status === "success");
  const dismissedSet = new Set(env.store.dismissedActionIds);

  const recommendationActions = env.model.summary.growthScore < 60
    ? [
        toActionCard("send_reminder", "recommendation", "Growth score below healthy threshold", mostRecentLog(logs, "send_reminder")),
        toActionCard("create_announcement", "recommendation", "Momentum recovery recommendation", mostRecentLog(logs, "create_announcement"))
      ]
    : [
        toActionCard("publish_leaderboard", "recommendation", "Momentum is healthy; highlight supporter leaders", mostRecentLog(logs, "publish_leaderboard")),
        toActionCard("congratulate_winners", "recommendation", "Top supporters detected in current cycle", mostRecentLog(logs, "congratulate_winners"))
      ];

  const urgentActions = [
    toActionCard("send_reminder", "manual", "Inactive supporters detected", mostRecentLog(logs, "send_reminder")),
    toActionCard("publish_milestone", "manual", "Milestone communication pending", mostRecentLog(logs, "publish_milestone")),
    toActionCard("issue_certificates", "manual", "Qualified supporters ready for issuance", mostRecentLog(logs, "issue_certificates"))
  ];

  const scheduledActions = env.configuration.automationRules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const mappedCommand: GrowthCommandId = rule.id.includes("milestone")
        ? "publish_milestone"
        : rule.id.includes("summary")
          ? "publish_weekly_summary"
          : rule.id.includes("congratulations")
            ? "congratulate_winners"
            : "send_reminder";
      const scheduleText = `${rule.schedule.frequency} ${rule.schedule.time}`;
      return toActionCard(
        mappedCommand,
        "automation",
        rule.label,
        mostRecentLog(logs, mappedCommand),
        scheduleText
      );
    });

  const commandActions = getAllCommandDescriptors().map((descriptor) =>
    toActionCard(descriptor.id, "manual", "Available command", mostRecentLog(logs, descriptor.id))
  );

  const recommendedActions = [...recommendationActions, ...commandActions]
    .filter((action) => !dismissedSet.has(action.actionId))
    .slice(0, 12);

  return {
    recommendedActions,
    urgentActions: urgentActions.filter((action) => !dismissedSet.has(action.actionId)),
    scheduledActions: scheduledActions.filter((action) => !dismissedSet.has(action.actionId)),
    completedActions: completed.slice(0, 20).map((log) => toActionCard(log.commandId, log.trigger, log.message, log)),
    dismissedActions: [...recommendationActions, ...urgentActions, ...scheduledActions, ...commandActions].filter((action) => dismissedSet.has(action.actionId)),
    auditTrail: env.store.audits.slice(0, 50),
    timeline: env.store.timeline.slice(0, 50)
  };
}

export function updateMissionAndChallengeProgress(env: GrowthCommandEnvironment): GrowthExecutionStore {
  let nextStore = env.store;
  for (const mission of env.configuration.missions) {
    const previous = nextStore.missions[mission.id];
    const status = mission.active
      ? mission.expiresAt && new Date(mission.expiresAt).getTime() < Date.now()
        ? "expired"
        : "running"
      : "cancelled";
    const progress = Math.min(100, Math.round((env.model.summary.referralSignatures / Math.max(1, mission.points)) * 100));
    const completed = progress >= 100 && status === "running";
    nextStore = upsertMissionRecord(nextStore, mission.id, {
      missionId: mission.id,
      status: completed ? "completed" : status,
      progress,
      completedAt: completed ? previous?.completedAt ?? now() : previous?.completedAt
    });
  }

  for (const challenge of env.configuration.challenges) {
    const previous = nextStore.challenges[challenge.id];
    const start = new Date(challenge.startAt).getTime();
    const end = new Date(challenge.endAt).getTime();
    const nowMs = Date.now();
    const status = !challenge.active
      ? "cancelled"
      : nowMs < start
        ? "scheduled"
        : nowMs > end
          ? "expired"
          : "running";
    const participants = env.model.summary.totalSupporters;
    const progress = Math.min(100, Math.round((env.model.summary.referralSignatures / Math.max(1, challenge.winnerCount * 10)) * 100));
    const winners = env.model.leaderboards.overall.slice(0, challenge.winnerCount).map((item) => item.id);
    const completed = progress >= 100 && status === "running";
    nextStore = upsertChallengeRecord(nextStore, challenge.id, {
      challengeId: challenge.id,
      status: completed ? "completed" : status,
      progress,
      participants,
      winners,
      completedAt: completed ? previous?.completedAt ?? now() : previous?.completedAt
    });
  }

  return nextStore;
}

export function runAutomations(env: GrowthCommandEnvironment): Array<{
  commandId: GrowthCommandId;
  dedupeKey: string;
  reason: string;
}> {
  const nowAt = new Date();
  return env.configuration.automationRules
    .filter((rule) => rule.enabled)
    .filter((rule) => {
      const [hourText, minuteText] = rule.schedule.time.split(":");
      const hour = Number(hourText);
      const minute = Number(minuteText);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
      return nowAt.getHours() === hour && nowAt.getMinutes() === minute;
    })
    .map((rule) => {
      const commandId: GrowthCommandId = rule.id.includes("milestone")
        ? "publish_milestone"
        : rule.id.includes("summary")
          ? "publish_weekly_summary"
          : rule.id.includes("congratulations")
            ? "congratulate_winners"
            : rule.id.includes("mission")
              ? "launch_mission"
              : rule.id.includes("challenge")
                ? "launch_challenge"
                : "send_reminder";
      return {
        commandId,
        dedupeKey: `${env.campaignId}:${commandId}:automation:${nowAt.toISOString().slice(0, 16)}`,
        reason: rule.label
      };
    });
}

export function createCommandEnvironment(options: Partial<GrowthCommandEnvironment>): GrowthCommandEnvironment {
  return {
    campaignId: options.campaignId ?? "campaign",
    model: options.model ?? {
      scope: { campaignCount: 0, signerCount: 0, label: "Campaign" },
      summary: {
        stage: "Launch",
        growthScore: 0,
        totalSupporters: 0,
        referralSignatures: 0,
        referralRate: 0,
        ambassadorCount: 0,
        earnedRewards: 0
      },
      referrals: { nodes: [], edges: [], referredSignatures: 0, referralRate: 0, strongestCode: "" },
      ambassadors: { profiles: [], activeAmbassadors: 0, topLevel: "Supporter" },
      analytics: { stage: "Launch", growthScore: 0, newSupporters7d: 0, verifiedSupporters: 0, conversionRate: 0, trends: [], channels: [] },
      rewards: { rules: [], ledger: [], earnedRewards: 0, availableRewards: 0, catalogCount: 0, merchantCount: 0, featuredRewardCount: 0 },
      leaderboards: { overall: [], referral: [], field: [] },
      contributionAdvancement: { accounts: [], contributionEnabled: false, advancementLevelsConfigured: 0, leaderboardFilters: [] }
    },
    runtime: options.runtime,
    configuration: options.configuration ?? {
      enabled: true,
      merchants: [],
      operatingSystem: {
        features: {
          growthEngineEnabled: true,
          recognitionEnabled: true,
          leaderboardEnabled: true,
          contributionEngineEnabled: true,
          promotionEngineEnabled: true,
          growthCalculatorEnabled: true,
          recognitionTreeEnabled: true,
          achievementEngineEnabled: true,
          walletEnabled: true,
          timelineEnabled: true
        },
        credits: { enabled: false, rules: [] },
        recognition: { enabled: false, levels: [] },
        promotion: {
          enabled: false,
          roundConfiguration: { strategy: "level_number" },
          distributionConfiguration: {
            enabled: false,
            depth: 0,
            maximumLevels: 0,
            contributionPercentage: 0,
            strategy: "recognition_tree",
            formula: "equal"
          }
        }
      },
      contribution: { enabled: false, levels: [], eligibleActivities: [] },
      achievements: [],
      leaderboard: { enabled: false, filters: [] },
      rewards: [],
      sharing: {
        journeyDisplayName: "",
        whatsappMessage: "",
        smsTemplate: "",
        emailSubject: "",
        emailTemplate: "",
        nativeShareMessage: "",
        referralPosterHeadline: "",
        qrBranding: "",
        campaignSlogan: "",
        dynamicVariables: []
      },
      analytics: {
        viralityScore: true,
        referralFunnel: true,
        growthFunnel: true,
        dropOffFunnel: true,
        treeDepth: true,
        walletDistribution: true,
        contributionDistribution: true,
        promotionStatistics: true,
        growthVelocity: true,
        dailyActiveSupporters: true
      },
      customActivities: [],
      automationRules: [],
      missions: [],
      challenges: [],
      notifications: { enabled: true, categories: [] },
      certificates: { enabled: false, templates: [] }
    },
    store: options.store ?? createEmptyExecutionStore()
  };
}
