import type { CampaignGrowthConfiguration } from "../configuration";
import type { GrowthRuntimeState } from "../lifecycle";
import type { GrowthDashboardModel } from "../types";

export type GrowthCommandId =
  | "share_campaign"
  | "launch_mission"
  | "launch_challenge"
  | "create_announcement"
  | "send_reminder"
  | "congratulate_winners"
  | "recognize_volunteers"
  | "generate_qr"
  | "publish_leaderboard"
  | "publish_achievement"
  | "publish_milestone"
  | "publish_weekly_summary"
  | "reward_supporters"
  | "export_reports"
  | "issue_certificates";

export type GrowthCommandPriority = "high" | "medium" | "low";
export type GrowthCommandDifficulty = "easy" | "moderate" | "advanced";
export type GrowthExecutionStatus = "queued" | "running" | "success" | "failed" | "cancelled" | "dismissed";

export interface GrowthCommandExecutionContext {
  campaignId: string;
  actor: string;
  trigger: "manual" | "automation" | "recommendation";
  dedupeKey: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GrowthCommandDescriptor {
  id: GrowthCommandId;
  title: string;
  description: string;
  priority: GrowthCommandPriority;
  expectedImpact: string;
  estimatedReach: number;
  difficulty: GrowthCommandDifficulty;
  timeRequiredMinutes: number;
  undoSupported: boolean;
}

export interface GrowthCommandExecutionResult {
  status: GrowthExecutionStatus;
  message: string;
  progress: number;
  eventType:
    | "growth.command.executed"
    | "growth.command.failed"
    | "growth.command.undone"
    | "growth.command.idempotent_skip";
  timelineTitle: string;
  timelineDescription: string;
  retryable: boolean;
  undoToken?: string;
}

export interface GrowthCommandLog {
  id: string;
  commandId: GrowthCommandId;
  dedupeKey: string;
  status: GrowthExecutionStatus;
  actor: string;
  trigger: "manual" | "automation" | "recommendation";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  progress: number;
  retryCount: number;
  message: string;
  undoSupported: boolean;
  undoToken?: string;
  error?: string;
}

export interface GrowthCommandAuditRecord {
  id: string;
  commandId: GrowthCommandId;
  status: GrowthExecutionStatus;
  actor: string;
  createdAt: string;
  retryCount: number;
  durationMs?: number;
}

export interface GrowthCommandTimelineRecord {
  id: string;
  campaignId: string;
  commandId: GrowthCommandId;
  title: string;
  description: string;
  timestamp: string;
  status: GrowthExecutionStatus;
}

export interface GrowthNotificationActionState {
  id: string;
  read: boolean;
  archived: boolean;
  pinned: boolean;
  dismissed: boolean;
}

export interface GrowthCertificateRecord {
  id: string;
  campaignId: string;
  supporterId: string;
  templateId: string;
  serialNumber: string;
  verificationId: string;
  issuedAt: string;
  issuedBy: string;
  source: "manual" | "automatic";
}

export interface GrowthMissionExecutionRecord {
  missionId: string;
  status: "draft" | "scheduled" | "running" | "completed" | "expired" | "cancelled";
  progress: number;
  startedAt?: string;
  completedAt?: string;
}

export interface GrowthChallengeExecutionRecord {
  challengeId: string;
  status: "draft" | "scheduled" | "running" | "completed" | "expired" | "cancelled";
  progress: number;
  participants: number;
  winners: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface GrowthExecutionStore {
  logs: GrowthCommandLog[];
  audits: GrowthCommandAuditRecord[];
  timeline: GrowthCommandTimelineRecord[];
  dismissedActionIds: string[];
  notificationState: Record<string, GrowthNotificationActionState>;
  certificates: GrowthCertificateRecord[];
  missions: Record<string, GrowthMissionExecutionRecord>;
  challenges: Record<string, GrowthChallengeExecutionRecord>;
}

export interface GrowthCommandEnvironment {
  campaignId: string;
  model: GrowthDashboardModel;
  runtime?: GrowthRuntimeState;
  configuration: CampaignGrowthConfiguration;
  store: GrowthExecutionStore;
}

export interface GrowthActionCard {
  actionId: string;
  descriptor: GrowthCommandDescriptor;
  trigger: "manual" | "automation" | "recommendation";
  reason: string;
  scheduledAt?: string;
  execution?: GrowthCommandLog;
}

export interface GrowthActionCenterModel {
  recommendedActions: GrowthActionCard[];
  urgentActions: GrowthActionCard[];
  scheduledActions: GrowthActionCard[];
  completedActions: GrowthActionCard[];
  dismissedActions: GrowthActionCard[];
  auditTrail: GrowthCommandAuditRecord[];
  timeline: GrowthCommandTimelineRecord[];
}
