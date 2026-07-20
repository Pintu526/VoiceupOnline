import type {
  Coordinator,
  CoordinatorCampaignLink,
  CoordinatorDashboardMetrics,
  CoordinatorGeography,
  CoordinatorReferral,
  CoordinatorTreeNode
} from "./types.ts";

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
