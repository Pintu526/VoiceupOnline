export type RedemptionStatus =
  | "pending"
  | "reserved"
  | "approved"
  | "rejected"
  | "redeemed"
  | "completed"
  | "expired"
  | "cancelled"
  | "refunded";

export type DigitalCouponStatus = "active" | "redeemed" | "expired" | "cancelled";

export interface RedemptionRecord {
  id: string;
  campaignId: string;
  supporterId: string;
  rewardId: string;
  merchantId?: string;
  couponId?: string;
  status: RedemptionStatus;
  pointsCost: number;
  quantity: number;
  reservedAt?: string;
  approvedAt?: string;
  redeemedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  cancelledAt?: string;
  refundedAt?: string;
  notes?: string;
  dedupeKey: string;
}

export interface DigitalCouponRecord {
  id: string;
  campaignId: string;
  supporterId: string;
  rewardId: string;
  merchantId?: string;
  status: DigitalCouponStatus;
  qrPayload: string;
  barcodePlaceholder: string;
  verificationId: string;
  expiresAt?: string;
  usageCount: number;
  maxUsageCount: number;
  redemptionId: string;
}

export interface RewardWishlistEntry {
  id: string;
  campaignId: string;
  supporterId: string;
  rewardId: string;
  createdAt: string;
}

export interface RedemptionNotificationCounts {
  available: number;
  reserved: number;
  redeemed: number;
  expired: number;
  refunded: number;
  approved: number;
  rejected: number;
}

export interface RedemptionAuditEvent {
  id: string;
  campaignId: string;
  supporterId: string;
  rewardId: string;
  action: RedemptionStatus | "wishlist_added" | "wishlist_removed";
  createdAt: string;
  dedupeKey: string;
}