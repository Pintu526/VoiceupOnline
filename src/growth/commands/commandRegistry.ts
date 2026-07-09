import type {
  GrowthCommandDescriptor,
  GrowthCommandEnvironment,
  GrowthCommandExecutionContext,
  GrowthCommandExecutionResult,
  GrowthCommandId
} from "./types";

const descriptors: GrowthCommandDescriptor[] = [
  {
    id: "share_campaign",
    title: "Share Campaign",
    description: "Publish campaign sharing prompts across configured channels.",
    priority: "high",
    expectedImpact: "Boost supporter acquisition velocity",
    estimatedReach: 250,
    difficulty: "easy",
    timeRequiredMinutes: 3,
    undoSupported: false
  },
  {
    id: "launch_mission",
    title: "Launch Mission",
    description: "Start a mission lifecycle and notify eligible supporters.",
    priority: "high",
    expectedImpact: "Increase repeat supporter activity",
    estimatedReach: 150,
    difficulty: "moderate",
    timeRequiredMinutes: 5,
    undoSupported: true
  },
  {
    id: "launch_challenge",
    title: "Launch Challenge",
    description: "Publish a challenge with participation and winner tracking.",
    priority: "high",
    expectedImpact: "Lift referral competition",
    estimatedReach: 180,
    difficulty: "moderate",
    timeRequiredMinutes: 8,
    undoSupported: true
  },
  {
    id: "create_announcement",
    title: "Create Announcement",
    description: "Create a campaign announcement for all supporters.",
    priority: "medium",
    expectedImpact: "Reactivate inactive supporters",
    estimatedReach: 220,
    difficulty: "easy",
    timeRequiredMinutes: 4,
    undoSupported: true
  },
  {
    id: "send_reminder",
    title: "Send Reminder",
    description: "Send reminder notifications to inactive supporters.",
    priority: "high",
    expectedImpact: "Recover campaign momentum",
    estimatedReach: 120,
    difficulty: "easy",
    timeRequiredMinutes: 3,
    undoSupported: false
  },
  {
    id: "congratulate_winners",
    title: "Congratulate Winners",
    description: "Congratulate current top winners publicly.",
    priority: "medium",
    expectedImpact: "Increase community recognition",
    estimatedReach: 80,
    difficulty: "easy",
    timeRequiredMinutes: 2,
    undoSupported: false
  },
  {
    id: "recognize_volunteers",
    title: "Recognize Volunteers",
    description: "Publish recognition for active volunteers.",
    priority: "medium",
    expectedImpact: "Increase volunteer retention",
    estimatedReach: 90,
    difficulty: "easy",
    timeRequiredMinutes: 3,
    undoSupported: false
  },
  {
    id: "generate_qr",
    title: "Generate QR",
    description: "Generate campaign QR assets for online and offline distribution.",
    priority: "low",
    expectedImpact: "Improve scan funnel",
    estimatedReach: 160,
    difficulty: "easy",
    timeRequiredMinutes: 2,
    undoSupported: false
  },
  {
    id: "publish_leaderboard",
    title: "Publish Leaderboard",
    description: "Publish current leaderboard standings.",
    priority: "medium",
    expectedImpact: "Drive competitive participation",
    estimatedReach: 140,
    difficulty: "easy",
    timeRequiredMinutes: 4,
    undoSupported: false
  },
  {
    id: "publish_achievement",
    title: "Publish Achievement",
    description: "Publish latest achievement winners.",
    priority: "medium",
    expectedImpact: "Increase recognition visibility",
    estimatedReach: 120,
    difficulty: "easy",
    timeRequiredMinutes: 3,
    undoSupported: false
  },
  {
    id: "publish_milestone",
    title: "Publish Milestone",
    description: "Announce campaign milestone completion.",
    priority: "high",
    expectedImpact: "Strengthen social proof",
    estimatedReach: 300,
    difficulty: "easy",
    timeRequiredMinutes: 3,
    undoSupported: false
  },
  {
    id: "publish_weekly_summary",
    title: "Publish Weekly Summary",
    description: "Publish weekly campaign summary.",
    priority: "medium",
    expectedImpact: "Maintain supporter transparency",
    estimatedReach: 210,
    difficulty: "easy",
    timeRequiredMinutes: 5,
    undoSupported: false
  },
  {
    id: "reward_supporters",
    title: "Reward Supporters",
    description: "Distribute rewards for qualified supporters.",
    priority: "high",
    expectedImpact: "Improve conversion and retention",
    estimatedReach: 100,
    difficulty: "advanced",
    timeRequiredMinutes: 7,
    undoSupported: true
  },
  {
    id: "export_reports",
    title: "Export Reports",
    description: "Export campaign operations and growth reports.",
    priority: "low",
    expectedImpact: "Improve admin visibility",
    estimatedReach: 1,
    difficulty: "easy",
    timeRequiredMinutes: 4,
    undoSupported: false
  },
  {
    id: "issue_certificates",
    title: "Issue Certificates",
    description: "Issue certificates to qualified supporters.",
    priority: "high",
    expectedImpact: "Increase recognition trust",
    estimatedReach: 75,
    difficulty: "advanced",
    timeRequiredMinutes: 6,
    undoSupported: true
  }
];

export function getCommandDescriptor(commandId: GrowthCommandId): GrowthCommandDescriptor {
  const descriptor = descriptors.find((item) => item.id === commandId);
  if (!descriptor) {
    throw new Error(`Unknown command descriptor: ${commandId}`);
  }
  return descriptor;
}

export function getAllCommandDescriptors(): GrowthCommandDescriptor[] {
  return descriptors;
}

function missionStatusFromSchedule(startAt?: string, endAt?: string) {
  const now = Date.now();
  const start = startAt ? new Date(startAt).getTime() : Number.NaN;
  const end = endAt ? new Date(endAt).getTime() : Number.NaN;
  if (Number.isFinite(end) && now > end) return "expired" as const;
  if (Number.isFinite(start) && now < start) return "scheduled" as const;
  return "running" as const;
}

export async function executeCommand(
  commandId: GrowthCommandId,
  context: GrowthCommandExecutionContext,
  env: GrowthCommandEnvironment
): Promise<GrowthCommandExecutionResult> {
  const descriptor = getCommandDescriptor(commandId);
  if (commandId === "launch_mission") {
    const mission = env.configuration.missions[0];
    if (!mission) {
      return {
        status: "failed",
        message: "No missions configured in Growth Configuration Studio.",
        progress: 0,
        eventType: "growth.command.failed",
        timelineTitle: "Mission launch failed",
        timelineDescription: "No mission definition available.",
        retryable: false
      };
    }
    const status = missionStatusFromSchedule(undefined, mission.expiresAt);
    return {
      status: "success",
      message: `Mission ${mission.name} is now ${status}.`,
      progress: 100,
      eventType: "growth.command.executed",
      timelineTitle: "Mission lifecycle updated",
      timelineDescription: `Mission ${mission.name} moved to ${status}.`,
      retryable: false,
      undoToken: descriptor.undoSupported ? `${context.dedupeKey}:undo` : undefined
    };
  }

  if (commandId === "launch_challenge") {
    const challenge = env.configuration.challenges[0];
    if (!challenge) {
      return {
        status: "failed",
        message: "No challenges configured in Growth Configuration Studio.",
        progress: 0,
        eventType: "growth.command.failed",
        timelineTitle: "Challenge launch failed",
        timelineDescription: "No challenge definition available.",
        retryable: false
      };
    }
    const status = missionStatusFromSchedule(challenge.startAt, challenge.endAt);
    return {
      status: "success",
      message: `Challenge ${challenge.name} is now ${status}.`,
      progress: 100,
      eventType: "growth.command.executed",
      timelineTitle: "Challenge lifecycle updated",
      timelineDescription: `Challenge ${challenge.name} moved to ${status}.`,
      retryable: false,
      undoToken: descriptor.undoSupported ? `${context.dedupeKey}:undo` : undefined
    };
  }

  if (commandId === "issue_certificates") {
    const template = env.configuration.certificates.templates[0];
    if (!env.configuration.certificates.enabled || !template) {
      return {
        status: "failed",
        message: "Certificate issuance is disabled or no template is configured.",
        progress: 0,
        eventType: "growth.command.failed",
        timelineTitle: "Certificate issuance failed",
        timelineDescription: "Enable certificates and configure a template to issue.",
        retryable: false
      };
    }
    const eligibleCount = env.runtime?.achievements.filter((item) => item.campaignId === env.campaignId).length ?? 0;
    return {
      status: "success",
      message: `Certificate issuance processed for ${eligibleCount.toLocaleString()} qualified supporters.`,
      progress: 100,
      eventType: "growth.command.executed",
      timelineTitle: "Certificates issued",
      timelineDescription: `Certificate template ${template.name} processed for qualified supporters.`,
      retryable: false,
      undoToken: descriptor.undoSupported ? `${context.dedupeKey}:undo` : undefined
    };
  }

  return {
    status: "success",
    message: `${descriptor.title} completed successfully.`,
    progress: 100,
    eventType: "growth.command.executed",
    timelineTitle: `${descriptor.title} completed`,
    timelineDescription: `${descriptor.description} completed through ${context.trigger} execution.`,
    retryable: false,
    undoToken: descriptor.undoSupported ? `${context.dedupeKey}:undo` : undefined
  };
}

export async function undoCommand(
  commandId: GrowthCommandId,
  context: GrowthCommandExecutionContext
): Promise<GrowthCommandExecutionResult> {
  return {
    status: "success",
    message: `Undo completed for ${commandId}.`,
    progress: 100,
    eventType: "growth.command.undone",
    timelineTitle: "Command undone",
    timelineDescription: `${commandId} was reversed by ${context.actor}.`,
    retryable: false
  };
}
