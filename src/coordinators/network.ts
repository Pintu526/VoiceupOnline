import {
  coordinatorGeographyLevels,
  coordinatorRoles,
  coordinatorStatuses
} from "./types.ts";
import type {
  Coordinator,
  CoordinatorActivity,
  CoordinatorCampaignLink,
  CoordinatorDashboardMetrics,
  CoordinatorGeography,
  CoordinatorNetworkSnapshot,
  CoordinatorReferral,
  CoordinatorTreeNode
} from "./types.ts";

const commandCenterListLimit = 5;

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildCoordinatorTree(coordinators: Coordinator[]): CoordinatorTreeNode[] {
  const nodes = new Map(coordinators.map((coordinator) => [
    coordinator.id,
    { coordinator, children: [] as CoordinatorTreeNode[] }
  ]));
  const roots: CoordinatorTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.coordinator.reportsToCoordinatorId
      ? nodes.get(node.coordinator.reportsToCoordinatorId)
      : undefined;
    if (parent && parent.coordinator.id !== node.coordinator.id) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (items: CoordinatorTreeNode[]) => {
    items.sort((left, right) => left.coordinator.fullName.localeCompare(right.coordinator.fullName));
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

export function coordinatorGeographyLabel(
  coordinator: Coordinator,
  geographies: CoordinatorGeography[]
): string {
  const geography = geographies.find((item) => item.id === coordinator.geographyId);
  return geography?.path.join(" › ") ?? "";
}

export function getCoordinatorDashboardMetrics(
  coordinators: Coordinator[],
  campaignLinks: CoordinatorCampaignLink[],
  referrals: CoordinatorReferral[]
): CoordinatorDashboardMetrics {
  return {
    total: coordinators.length,
    active: coordinators.filter((item) => item.status === "active").length,
    mobileVerified: coordinators.filter((item) => Boolean(item.mobileVerifiedAt)).length,
    linkedToCampaign: new Set(campaignLinks.map((item) => item.coordinatorId)).size,
    geographyCoverage: new Set(coordinators.map((item) => item.geographyId).filter(Boolean)).size,
    referralLinks: referrals.filter((item) => item.status === "accepted").length
  };
}

export function getCoordinatorCommandCenter(snapshot: CoordinatorNetworkSnapshot) {
  const metrics = getCoordinatorDashboardMetrics(
    snapshot.coordinators,
    snapshot.campaignLinks,
    snapshot.referrals
  );
  const percentage = (count: number) => metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
  const statusCounts = new Map(coordinatorStatuses.map((status) => [status, 0]));
  const roleCounts = new Map(coordinatorRoles.map((role) => [role, 0]));
  for (const coordinator of snapshot.coordinators) {
    statusCounts.set(coordinator.status, (statusCounts.get(coordinator.status) ?? 0) + 1);
    roleCounts.set(coordinator.role, (roleCounts.get(coordinator.role) ?? 0) + 1);
  }
  const statusDistribution = coordinatorStatuses.map((status) => {
    const count = statusCounts.get(status) ?? 0;
    return { status, count, percentage: percentage(count) };
  });
  const roleDistribution = coordinatorRoles.map((role) => {
    const count = roleCounts.get(role) ?? 0;
    return { role, count, percentage: percentage(count) };
  });

  const geographyById = new Map(snapshot.geographies.map((geography) => [geography.id, geography]));
  const coveredGeographyIds = new Set<string>();
  for (const coordinator of snapshot.coordinators) {
    const visited = new Set<string>();
    let geography = geographyById.get(coordinator.geographyId);
    while (geography && !visited.has(geography.id)) {
      coveredGeographyIds.add(geography.id);
      visited.add(geography.id);
      geography = geography.parentId ? geographyById.get(geography.parentId) : undefined;
    }
  }
  const coverageByLevel = coordinatorGeographyLevels.flatMap((level) => {
    const known = snapshot.geographies.filter((geography) => geography.level === level);
    if (known.length === 0) return [];
    return [{
      level,
      known: known.length,
      covered: known.filter((geography) => coveredGeographyIds.has(geography.id)).length,
      coordinators: snapshot.coordinators.filter((coordinator) => geographyById.get(coordinator.geographyId)?.level === level).length
    }];
  });
  const coverageGaps = snapshot.geographies
    .filter((geography) => !coveredGeographyIds.has(geography.id))
    .sort((left, right) => left.path.join("/").localeCompare(right.path.join("/")));

  const recentActivity = [...snapshot.activity]
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
    .slice(0, commandCenterListLimit);
  const recentlyAdded = [...snapshot.coordinators]
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
    .slice(0, commandCenterListLimit);
  const recentStatusChanges: CoordinatorActivity[] = snapshot.activity
    .filter((activity) => activity.action === "coordinator.status_changed")
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))
    .slice(0, commandCenterListLimit);

  return {
    metrics,
    statusDistribution,
    roleDistribution,
    coverage: {
      known: snapshot.geographies.length,
      covered: coveredGeographyIds.size,
      byLevel: coverageByLevel,
      gaps: coverageGaps
    },
    recentActivity,
    recentlyAdded,
    recentStatusChanges
  };
}

export function getCoordinatorProfileWorkspace(
  snapshot: CoordinatorNetworkSnapshot,
  coordinatorId: string
) {
  const coordinatorById = new Map(snapshot.coordinators.map((coordinator) => [coordinator.id, coordinator]));
  const geographyById = new Map(snapshot.geographies.map((geography) => [geography.id, geography]));
  const coordinator = coordinatorById.get(coordinatorId);
  if (!coordinator) return null;

  const geographyChain: CoordinatorGeography[] = [];
  const visitedGeographies = new Set<string>();
  let geography = geographyById.get(coordinator.geographyId);
  while (geography && !visitedGeographies.has(geography.id)) {
    geographyChain.unshift(geography);
    visitedGeographies.add(geography.id);
    geography = geography.parentId ? geographyById.get(geography.parentId) : undefined;
  }

  const reportingChain: Coordinator[] = [];
  const visitedCoordinators = new Set([coordinator.id]);
  let manager = coordinator.reportsToCoordinatorId
    ? coordinatorById.get(coordinator.reportsToCoordinatorId)
    : undefined;
  while (manager && !visitedCoordinators.has(manager.id)) {
    reportingChain.unshift(manager);
    visitedCoordinators.add(manager.id);
    manager = manager.reportsToCoordinatorId
      ? coordinatorById.get(manager.reportsToCoordinatorId)
      : undefined;
  }

  const directReports = snapshot.coordinators
    .filter((candidate) => candidate.reportsToCoordinatorId === coordinator.id)
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const campaignLinks = snapshot.campaignLinks
    .filter((link) => link.coordinatorId === coordinator.id)
    .sort((left, right) => timestamp(right.assignedAt) - timestamp(left.assignedAt));
  const activity = snapshot.activity
    .filter((entry) => entry.coordinatorId === coordinator.id)
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
  const timeline = [
    ...activity.map((entry) => ({
      kind: "audit" as const,
      id: `audit-${entry.id}`,
      createdAt: entry.createdAt,
      activity: entry
    })),
    ...campaignLinks.map((link) => ({
      kind: "assignment" as const,
      id: `assignment-${link.campaignId}-${link.assignedAt}`,
      createdAt: link.assignedAt,
      campaignLink: link
    }))
  ].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));

  return {
    coordinator,
    manager: coordinator.reportsToCoordinatorId
      ? coordinatorById.get(coordinator.reportsToCoordinatorId)
      : undefined,
    reportingChain,
    directReports,
    geography: geographyById.get(coordinator.geographyId),
    geographyChain,
    campaignLinks,
    activity,
    timeline,
    lastActivityAt: timeline[0]?.createdAt,
    scorecard: {
      assignments: campaignLinks.length,
      activityEvents: activity.length,
      coverageLevels: geographyChain.length,
      directReports: directReports.length,
      mobileVerified: Boolean(coordinator.mobileVerifiedAt)
    }
  };
}

export function coordinatorMatchesSearch(
  coordinator: Coordinator,
  geographyLabel: string,
  search: string
): boolean {
  const query = search.trim().toLocaleLowerCase("en-IN");
  if (!query) return true;
  return [
    coordinator.fullName,
    coordinator.phone,
    coordinator.email ?? "",
    coordinator.referralCode,
    coordinator.role,
    coordinator.status,
    geographyLabel
  ].some((value) => value.toLocaleLowerCase("en-IN").includes(query));
}
