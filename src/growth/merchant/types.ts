export type MerchantStatus = "active" | "inactive" | "pending" | "verified";

export type MerchantRole =
  | "merchant"
  | "branch"
  | "brand"
  | "store"
  | "partner"
  | "reward_provider"
  | "campaign_sponsor";

export type MerchantCategory =
  | "food"
  | "retail"
  | "digital"
  | "education"
  | "health"
  | "travel"
  | "lifestyle"
  | "community"
  | "services"
  | "entertainment"
  | "nonprofit"
  | "other";

export interface MerchantRecord {
  id: string;
  name: string;
  role: MerchantRole;
  status: MerchantStatus;
  categories: MerchantCategory[];
  description: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  imageUrl?: string;
  locationLabel?: string;
  parentId?: string;
  campaignIds?: string[];
  notes?: string;
  featured?: boolean;
  visibility?: "public" | "supporter" | "admin";
  createdAt?: string;
  updatedAt?: string;
}

export interface MerchantDashboardCampaignPerformance {
  campaignId: string;
  campaignLabel: string;
  issued: number;
  redeemed: number;
}

export interface MerchantDashboardSupporterPerformance {
  supporterId: string;
  supporterLabel: string;
  redeemedCount: number;
  pointsBurned: number;
}

export interface MerchantDashboardModel {
  merchants: MerchantRecord[];
  issued: number;
  redeemed: number;
  pending: number;
  cancelled: number;
  topCampaigns: MerchantDashboardCampaignPerformance[];
  topSupporters: MerchantDashboardSupporterPerformance[];
  redemptionRate: number;
}