import { getSupporterAuthClient } from "./supporterAuth.ts";
import {
  getCampaignWorkspacePath,
  type CampaignAuthContext
} from "./campaignAuthContext.ts";

export type VoiceupWorkspaceRole =
  | "platform_owner"
  | "workspace_admin"
  | "campaign_admin"
  | "field_officer"
  | "viewer";

export interface SupporterOwnershipAccess {
  accountId: string;
  workspaceId: string;
  workspaceName: string;
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  supporterId: string;
  supporterName: string;
  referralCode: string;
  claimedAt: string;
}

export interface VolunteerAssignmentAccess {
  requestId: string;
  accountId: string;
  workspaceId: string;
  campaignId: string;
  supporterId: string;
  role: "volunteer";
  status: "approved" | "assigned";
  geographicScope: Record<string, unknown>;
  approvedAt: string;
}

export interface CoordinatorBindingAccess {
  coordinatorId: string;
  workspaceId: string;
  fullName: string;
  role: string;
  status: "active";
  geography: { id: string; level: string; name: string; path: string[] } | null;
  campaignIds: string[];
  workspaceRole: VoiceupWorkspaceRole | "";
  canOpenBusinessOs: boolean;
}

export interface CampaignAssignmentAccess {
  assignmentId: string;
  applicationKey: string;
  role: string;
  resourceType: string;
  resourceId: string;
  resourceSlug: string;
}

export interface WorkspaceMembershipAccess {
  workspaceId: string;
  workspaceName: string;
  role: VoiceupWorkspaceRole;
  permissions: string[];
  campaignAssignments: CampaignAssignmentAccess[];
}

export interface VoiceupAccessManifest {
  schemaVersion: 1;
  user: { id: string; email: string };
  platformAdmin: boolean;
  supporterOwnerships: SupporterOwnershipAccess[];
  volunteerAssignments: VolunteerAssignmentAccess[];
  coordinatorBindings: CoordinatorBindingAccess[];
  workspaceMemberships: WorkspaceMembershipAccess[];
  hasAuthorizedAccess: boolean;
}

export interface SupporterDashboardModel {
  schemaVersion: 1;
  account: {
    accountId: string;
    workspaceId: string;
    campaignId: string;
    supporterId: string;
    claimedAt: string;
  };
  workspace: { name: string };
  campaign: { id: string; slug: string; title: string; status: string };
  supporter: {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    signedAt: string;
    languagePreference: string;
    referralCode: string;
    location: Record<string, string>;
  };
  participationRequests: Array<{
    requestId: string;
    type: "volunteer" | "coordinator";
    role: "volunteer" | "coordinator";
    status: string;
    preferredLevel: string | null;
    minimumAcceptableLevel: string | null;
    geographicScope: Record<string, unknown>;
    submittedAt: string;
    updatedAt: string;
  }>;
  referralPath: string;
  campaignPath: string;
}

export type AccountAccessErrorCode =
  | "authentication_required"
  | "email_confirmation_required"
  | "access_manifest_unavailable"
  | "supporter_dashboard_not_authorized"
  | "supporter_dashboard_unavailable";

export class AccountAccessError extends Error {
  readonly code: AccountAccessErrorCode;

  constructor(code: AccountAccessErrorCode) {
    super(code);
    this.name = "AccountAccessError";
    this.code = code;
  }
}

interface AccountAccessRpcClient {
  rpc(name: string, parameters?: Record<string, unknown>): Promise<{
    data: unknown;
    error: unknown | null;
  }>;
}

function rpcClient(): AccountAccessRpcClient {
  return getSupporterAuthClient() as unknown as AccountAccessRpcClient;
}

function errorText(error: unknown): string {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  return String(error.message);
}

function mapRpcError(error: unknown, fallback: AccountAccessErrorCode): AccountAccessError {
  const message = errorText(error);
  if (message.includes("voiceup:authentication_required")) {
    return new AccountAccessError("authentication_required");
  }
  if (message.includes("voiceup:verified_email_required")) {
    return new AccountAccessError("email_confirmation_required");
  }
  if (message.includes("voiceup:supporter_dashboard_not_authorized")) {
    return new AccountAccessError("supporter_dashboard_not_authorized");
  }
  if (message.includes("voiceup:supporter_dashboard_unavailable")) {
    return new AccountAccessError("supporter_dashboard_unavailable");
  }
  return new AccountAccessError(fallback);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseManifest(value: unknown): VoiceupAccessManifest | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.user)) return null;
  const userId = stringValue(value.user.id);
  const email = stringValue(value.user.email);
  if (!userId || !email) return null;

  const supporterOwnerships = records(value.supporterOwnerships).map((row) => ({
    accountId: stringValue(row.accountId),
    workspaceId: stringValue(row.workspaceId),
    workspaceName: stringValue(row.workspaceName),
    campaignId: stringValue(row.campaignId),
    campaignSlug: stringValue(row.campaignSlug),
    campaignTitle: stringValue(row.campaignTitle),
    supporterId: stringValue(row.supporterId),
    supporterName: stringValue(row.supporterName),
    referralCode: stringValue(row.referralCode),
    claimedAt: stringValue(row.claimedAt)
  })).filter((row) => row.accountId && row.workspaceId && row.campaignId && row.supporterId);

  const volunteerAssignments = records(value.volunteerAssignments).map((row) => ({
    requestId: stringValue(row.requestId),
    accountId: stringValue(row.accountId),
    workspaceId: stringValue(row.workspaceId),
    campaignId: stringValue(row.campaignId),
    supporterId: stringValue(row.supporterId),
    role: "volunteer" as const,
    status: row.status === "assigned" ? "assigned" as const : "approved" as const,
    geographicScope: isRecord(row.geographicScope) ? row.geographicScope : {},
    approvedAt: stringValue(row.approvedAt)
  })).filter((row) => row.requestId && row.accountId && row.workspaceId && row.supporterId);

  const coordinatorBindings = records(value.coordinatorBindings).map((row) => {
    const geography = isRecord(row.geography) ? {
      id: stringValue(row.geography.id),
      level: stringValue(row.geography.level),
      name: stringValue(row.geography.name),
      path: stringArray(row.geography.path)
    } : null;
    return {
      coordinatorId: stringValue(row.coordinatorId),
      workspaceId: stringValue(row.workspaceId),
      fullName: stringValue(row.fullName),
      role: stringValue(row.role),
      status: "active" as const,
      geography,
      campaignIds: stringArray(row.campaignIds),
      workspaceRole: stringValue(row.workspaceRole) as CoordinatorBindingAccess["workspaceRole"],
      canOpenBusinessOs: row.canOpenBusinessOs === true
    };
  }).filter((row) => row.coordinatorId && row.workspaceId);

  const workspaceMemberships = records(value.workspaceMemberships).map((row) => ({
    workspaceId: stringValue(row.workspaceId),
    workspaceName: stringValue(row.workspaceName),
    role: stringValue(row.role) as VoiceupWorkspaceRole,
    permissions: stringArray(row.permissions),
    campaignAssignments: records(row.campaignAssignments).map((assignment) => ({
      assignmentId: stringValue(assignment.assignmentId),
      applicationKey: stringValue(assignment.applicationKey),
      role: stringValue(assignment.role),
      resourceType: stringValue(assignment.resourceType),
      resourceId: stringValue(assignment.resourceId),
      resourceSlug: stringValue(assignment.resourceSlug)
    })).filter((assignment) => assignment.assignmentId && assignment.resourceId)
  })).filter((row) => row.workspaceId && [
    "platform_owner", "workspace_admin", "campaign_admin", "field_officer", "viewer"
  ].includes(row.role));

  return {
    schemaVersion: 1,
    user: { id: userId, email },
    platformAdmin: value.platformAdmin === true,
    supporterOwnerships,
    volunteerAssignments,
    coordinatorBindings,
    workspaceMemberships,
    hasAuthorizedAccess: value.hasAuthorizedAccess === true
  };
}

function parseDashboard(value: unknown): SupporterDashboardModel | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!isRecord(value.account) || !isRecord(value.workspace) || !isRecord(value.campaign) || !isRecord(value.supporter)) {
    return null;
  }
  const location = isRecord(value.supporter.location)
    ? Object.fromEntries(Object.entries(value.supporter.location).map(([key, item]) => [key, stringValue(item)]))
    : {};
  const dashboard: SupporterDashboardModel = {
    schemaVersion: 1,
    account: {
      accountId: stringValue(value.account.accountId),
      workspaceId: stringValue(value.account.workspaceId),
      campaignId: stringValue(value.account.campaignId),
      supporterId: stringValue(value.account.supporterId),
      claimedAt: stringValue(value.account.claimedAt)
    },
    workspace: { name: stringValue(value.workspace.name) },
    campaign: {
      id: stringValue(value.campaign.id),
      slug: stringValue(value.campaign.slug),
      title: stringValue(value.campaign.title),
      status: stringValue(value.campaign.status)
    },
    supporter: {
      id: stringValue(value.supporter.id),
      name: stringValue(value.supporter.name),
      email: stringValue(value.supporter.email),
      phone: stringValue(value.supporter.phone),
      status: stringValue(value.supporter.status),
      signedAt: stringValue(value.supporter.signedAt),
      languagePreference: stringValue(value.supporter.languagePreference),
      referralCode: stringValue(value.supporter.referralCode),
      location
    },
    participationRequests: records(value.participationRequests).map((request) => ({
      requestId: stringValue(request.requestId),
      type: request.type === "coordinator" ? "coordinator" as const : "volunteer" as const,
      role: request.role === "coordinator" ? "coordinator" as const : "volunteer" as const,
      status: stringValue(request.status),
      preferredLevel: typeof request.preferredLevel === "string" ? request.preferredLevel : null,
      minimumAcceptableLevel: typeof request.minimumAcceptableLevel === "string" ? request.minimumAcceptableLevel : null,
      geographicScope: isRecord(request.geographicScope) ? request.geographicScope : {},
      submittedAt: stringValue(request.submittedAt),
      updatedAt: stringValue(request.updatedAt)
    })).filter((request) => request.requestId),
    referralPath: stringValue(value.referralPath),
    campaignPath: stringValue(value.campaignPath)
  };
  return dashboard.account.accountId && dashboard.account.supporterId ? dashboard : null;
}

export async function loadVoiceupAccessManifest(
  client = rpcClient()
): Promise<VoiceupAccessManifest> {
  const { data, error } = await client.rpc("voiceup_get_access_manifest");
  if (error) throw mapRpcError(error, "access_manifest_unavailable");
  const manifest = parseManifest(data);
  if (!manifest) throw new AccountAccessError("access_manifest_unavailable");
  return manifest;
}

export async function loadOwnedSupporterDashboard(
  accountId: string,
  client = rpcClient()
): Promise<SupporterDashboardModel> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
    throw new AccountAccessError("supporter_dashboard_not_authorized");
  }
  const { data, error } = await client.rpc("voiceup_read_owned_supporter_dashboard", {
    p_account_id: accountId
  });
  if (error) throw mapRpcError(error, "supporter_dashboard_unavailable");
  const dashboard = parseDashboard(data);
  if (!dashboard || dashboard.account.accountId !== accountId) {
    throw new AccountAccessError("supporter_dashboard_unavailable");
  }
  return dashboard;
}

export interface AccessDestination {
  id: string;
  kind: "platform" | "workspace" | "campaign_admin" | "supporter" | "coordinator";
  path: string;
  workspaceId?: string;
  title: string;
  detail: string;
}

export function getAuthorizedDestinations(manifest: VoiceupAccessManifest): AccessDestination[] {
  const destinations: AccessDestination[] = [];
  if (manifest.platformAdmin) {
    destinations.push({
      id: "platform-admin",
      kind: "platform",
      path: "/admin",
      title: "VoiceUp platform administration",
      detail: "Platform owner"
    });
  }

  for (const membership of manifest.workspaceMemberships) {
    const campaignAssignments = membership.campaignAssignments.filter((assignment) =>
      assignment.applicationKey === "voiceup"
      && assignment.role === "campaign_admin"
      && assignment.resourceType === "campaign"
      && assignment.resourceSlug
    );
    if (membership.role === "campaign_admin" && campaignAssignments.length > 0) {
      for (const assignment of campaignAssignments) {
        destinations.push({
          id: `campaign-admin:${assignment.assignmentId}`,
          kind: "campaign_admin",
          path: `/admin/${encodeURIComponent(assignment.resourceSlug)}`,
          workspaceId: membership.workspaceId,
          title: membership.workspaceName,
          detail: `Campaign administrator · ${assignment.resourceSlug}`
        });
      }
    } else if (
      membership.role !== "campaign_admin"
      && (membership.role !== "platform_owner" || !manifest.platformAdmin)
    ) {
      destinations.push({
        id: `workspace:${membership.workspaceId}`,
        kind: "workspace",
        path: "/app",
        workspaceId: membership.workspaceId,
        title: membership.workspaceName,
        detail: membership.role.replace(/_/g, " ")
      });
    }
  }

  for (const supporter of manifest.supporterOwnerships) {
    const isVolunteer = manifest.volunteerAssignments.some((assignment) => assignment.accountId === supporter.accountId);
    destinations.push({
      id: `supporter:${supporter.accountId}`,
      kind: "supporter",
      path: `/account/supporter/${encodeURIComponent(supporter.accountId)}`,
      workspaceId: supporter.workspaceId,
      title: supporter.campaignTitle || supporter.workspaceName,
      detail: isVolunteer ? "Supporter · approved volunteer" : "Supporter"
    });
  }

  for (const coordinator of manifest.coordinatorBindings) {
    if (destinations.some((destination) =>
      destination.workspaceId === coordinator.workspaceId
      && (destination.kind === "workspace" || destination.kind === "campaign_admin")
    )) continue;
    destinations.push({
      id: `coordinator:${coordinator.coordinatorId}`,
      kind: "coordinator",
      path: "/account",
      workspaceId: coordinator.workspaceId,
      title: coordinator.fullName,
      detail: coordinator.canOpenBusinessOs
        ? coordinator.role.replace(/_/g, " ")
        : `${coordinator.role.replace(/_/g, " ")} · identity bound, no workspace privilege`
    });
  }

  return destinations.filter((destination, index, all) =>
    all.findIndex((candidate) => candidate.id === destination.id) === index
  );
}

export function resolveAutomaticDestination(manifest: VoiceupAccessManifest): AccessDestination | null {
  const destinations = getAuthorizedDestinations(manifest);
  return destinations.length === 1 ? destinations[0] : null;
}

export type CampaignAccessRole = "supporter" | "approved_volunteer" | "coordinator" | "admin";

export interface CampaignAccessDestination extends AccessDestination {
  campaignRoles: CampaignAccessRole[];
  priority: number;
}

function normalizedSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function getCampaignAuthorizedDestinations(
  manifest: VoiceupAccessManifest,
  context: CampaignAuthContext
): CampaignAccessDestination[] {
  const destinations: CampaignAccessDestination[] = [];

  for (const supporter of manifest.supporterOwnerships) {
    if (
      supporter.campaignId !== context.campaignId
      || (supporter.campaignSlug && normalizedSlug(supporter.campaignSlug) !== normalizedSlug(context.campaignSlug))
    ) continue;
    const approvedVolunteer = manifest.volunteerAssignments.some((assignment) =>
      assignment.accountId === supporter.accountId
      && assignment.campaignId === context.campaignId
      && (assignment.status === "approved" || assignment.status === "assigned")
    );
    destinations.push({
      id: `campaign-supporter:${supporter.accountId}`,
      kind: "supporter",
      path: `/account/supporter/${encodeURIComponent(supporter.accountId)}`,
      workspaceId: supporter.workspaceId,
      title: supporter.campaignTitle || supporter.workspaceName,
      detail: approvedVolunteer ? "Supporter · approved volunteer" : "Supporter",
      campaignRoles: approvedVolunteer ? ["supporter", "approved_volunteer"] : ["supporter"],
      priority: 0
    });
  }

  for (const coordinator of manifest.coordinatorBindings) {
    if (!coordinator.canOpenBusinessOs || !coordinator.campaignIds.includes(context.campaignId)) continue;
    const membership = manifest.workspaceMemberships.find((item) =>
      item.workspaceId === coordinator.workspaceId
      && item.role !== "campaign_admin"
    );
    if (!membership) continue;
    destinations.push({
      id: `campaign-coordinator:${coordinator.coordinatorId}`,
      kind: "coordinator",
      path: getCampaignWorkspacePath(context),
      workspaceId: coordinator.workspaceId,
      title: coordinator.fullName,
      detail: coordinator.role.replace(/_/g, " "),
      campaignRoles: ["coordinator"],
      priority: 2
    });
  }

  for (const membership of manifest.workspaceMemberships) {
    for (const assignment of membership.campaignAssignments) {
      if (
        assignment.applicationKey !== "voiceup"
        || assignment.role !== "campaign_admin"
        || assignment.resourceType !== "campaign"
        || assignment.resourceId !== context.campaignId
        || normalizedSlug(assignment.resourceSlug) !== normalizedSlug(context.campaignSlug)
      ) continue;
      destinations.push({
        id: `campaign-admin:${assignment.assignmentId}`,
        kind: "campaign_admin",
        path: `/admin/${encodeURIComponent(assignment.resourceSlug)}`,
        workspaceId: membership.workspaceId,
        title: membership.workspaceName,
        detail: "Campaign administrator",
        campaignRoles: ["admin"],
        priority: 3
      });
    }
  }

  return destinations.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function resolveCampaignAutomaticDestination(
  manifest: VoiceupAccessManifest,
  context: CampaignAuthContext
): CampaignAccessDestination | null {
  return getCampaignAuthorizedDestinations(manifest, context)[0] ?? null;
}

const selectedWorkspaceKey = "voiceup-customer-workspace-v1";
const unifiedLoginHandoffKey = "voiceup-unified-login-handoff-v1";

export function selectVoiceupWorkspace(workspaceId: string): void {
  if (typeof window === "undefined" || !workspaceId) return;
  window.localStorage.setItem(selectedWorkspaceKey, workspaceId);
}

export interface UnifiedLoginHandoff {
  userId: string;
  workspaceId: string;
  resourceId: string;
  resourceSlug: string;
  issuedAt: string;
}

export function writeUnifiedLoginHandoff(
  manifest: VoiceupAccessManifest,
  destination: AccessDestination
): void {
  if (typeof window === "undefined" || destination.kind !== "campaign_admin") return;
  const membership = manifest.workspaceMemberships.find((item) => item.workspaceId === destination.workspaceId);
  const assignment = membership?.campaignAssignments.find((item) =>
    item.role === "campaign_admin"
    && item.resourceType === "campaign"
    && destination.path.endsWith(`/${encodeURIComponent(item.resourceSlug)}`)
  );
  if (!assignment || !destination.workspaceId) return;
  const handoff: UnifiedLoginHandoff = {
    userId: manifest.user.id,
    workspaceId: destination.workspaceId,
    resourceId: assignment.resourceId,
    resourceSlug: assignment.resourceSlug,
    issuedAt: new Date().toISOString()
  };
  window.sessionStorage.setItem(unifiedLoginHandoffKey, JSON.stringify(handoff));
}

export function consumeUnifiedLoginHandoff(
  expected: Omit<UnifiedLoginHandoff, "issuedAt">,
  now = Date.now()
): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.sessionStorage.getItem(unifiedLoginHandoffKey);
  window.sessionStorage.removeItem(unifiedLoginHandoffKey);
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as Partial<UnifiedLoginHandoff>;
    const issuedAt = Date.parse(value.issuedAt ?? "");
    return Number.isFinite(issuedAt)
      && now - issuedAt >= 0
      && now - issuedAt <= 2 * 60 * 1000
      && value.userId === expected.userId
      && value.workspaceId === expected.workspaceId
      && value.resourceId === expected.resourceId
      && value.resourceSlug === expected.resourceSlug;
  } catch {
    return false;
  }
}
