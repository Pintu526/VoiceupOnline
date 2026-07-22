export const coordinatorRoles = [
  "national_coordinator",
  "state_coordinator",
  "district_coordinator",
  "block_coordinator",
  "panchayat_coordinator",
  "ward_coordinator",
  "field_coordinator"
] as const;

export const coordinatorStatuses = ["invited", "active", "inactive", "suspended"] as const;

export const coordinatorGeographyLevels = [
  "country",
  "state",
  "district",
  "block",
  "panchayat",
  "ward"
] as const;

export type CoordinatorRole = (typeof coordinatorRoles)[number];
export type CoordinatorStatus = (typeof coordinatorStatuses)[number];
export type CoordinatorGeographyLevel = (typeof coordinatorGeographyLevels)[number];

export interface CoordinatorGeographyInput {
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  ward: string;
  postalCode: string;
}

export interface CoordinatorGeography {
  id: string;
  workspaceId: string;
  parentId?: string;
  level: CoordinatorGeographyLevel;
  name: string;
  path: string[];
  depth: number;
}

export interface Coordinator {
  id: string;
  workspaceId: string;
  authUserId?: string;
  fullName: string;
  phone: string;
  email?: string;
  photoPath?: string;
  role: CoordinatorRole;
  status: CoordinatorStatus;
  geographyId: string;
  postalCode?: string;
  reportsToCoordinatorId?: string;
  referralCode: string;
  referredByCoordinatorId?: string;
  mobileVerifiedAt?: string;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CoordinatorCampaignLink {
  coordinatorId: string;
  campaignId: string;
  assignedAt: string;
}

export interface CoordinatorReferral {
  id: string;
  inviterCoordinatorId: string;
  referredCoordinatorId: string;
  referralCode: string;
  status: "accepted" | "revoked";
  acceptedAt?: string;
}

export interface CoordinatorActivity {
  id: number;
  coordinatorId?: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CoordinatorNetworkSnapshot {
  workspaceId: string;
  canManage: boolean;
  coordinators: Coordinator[];
  geographies: CoordinatorGeography[];
  campaignLinks: CoordinatorCampaignLink[];
  referrals: CoordinatorReferral[];
  activity: CoordinatorActivity[];
}

export interface CoordinatorDraft {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  photoPath: string;
  role: CoordinatorRole;
  status: CoordinatorStatus;
  reportsToCoordinatorId: string;
  referredByCode: string;
  notes: string;
  version: number;
  geography: CoordinatorGeographyInput;
  campaignIds: string[];
}

export interface CoordinatorTreeNode {
  coordinator: Coordinator;
  children: CoordinatorTreeNode[];
}

export interface CoordinatorDashboardMetrics {
  total: number;
  active: number;
  mobileVerified: number;
  linkedToCampaign: number;
  geographyCoverage: number;
  referralLinks: number;
}
