import { subscriptionPlans } from "../data";
import { startOfToday } from "./campaign";
import type {
  BillingPlan,
  Campaign,
  Organization,
  ScanReviewItem,
  Signer
} from "../types";

export function getSubscriptionPlan(planName: BillingPlan) {
  return subscriptionPlans.find((plan) => plan.name === planName) ?? subscriptionPlans[0];
}

export function getDefaultMessageLimit(planName: BillingPlan): number {
  if (planName === "Enterprise") return 50000;
  if (planName === "Professional") return 10000;
  return 500;
}

export function getEffectiveSignatureLimit(organization: Organization): number {
  return organization.monthlySignatureLimit + (organization.bonusSignatureCredits ?? 0);
}

export function getEffectiveScanLimit(organization: Organization): number {
  return organization.monthlyScanLimit + (organization.bonusScanCredits ?? 0);
}

export function getEffectiveMessageLimit(organization: Organization): number {
  return (organization.monthlyMessageLimit ?? 0) + (organization.bonusMessageCredits ?? 0);
}

export function getActiveCampaignCount(campaigns: Campaign[]): number {
  return campaigns.filter(
    (campaign) => campaign.status === "Published" || campaign.status === "Paused"
  ).length;
}

export function getMonthlySignerCount(signers: Signer[]): number {
  const monthKey = new Date().toISOString().slice(0, 7);
  return signers.filter((signer) => signer.signedAt.slice(0, 7) === monthKey).length;
}

export function getMonthlyScanCount(scanItems: ScanReviewItem[]): number {
  const monthKey = new Date().toISOString().slice(0, 7);
  return scanItems.filter((item) => item.createdAt.slice(0, 7) === monthKey).length;
}

export function getSubscriptionBlockReason(organization: Organization): string {
  if (organization.subscriptionStatus === "Active") return "";
  if (organization.subscriptionStatus === "Trial") {
    if (!organization.trialEndsAt) return "";
    return new Date(organization.trialEndsAt).getTime() >= startOfToday().getTime()
      ? ""
      : "Your 1-day trial has ended. Activate a subscription to keep campaigns published.";
  }
  if (organization.subscriptionStatus === "Past due")
    return "Subscription is past due. Activate payment to continue.";
  if (organization.subscriptionStatus === "Cancelled")
    return "Subscription is cancelled. Activate subscription to continue.";
  return "Subscription is not active.";
}

export function getCreateCampaignBlockReason(
  organization: Organization,
  campaigns: Campaign[]
): string {
  const subscriptionReason = getSubscriptionBlockReason(organization);
  if (subscriptionReason) return subscriptionReason;
  const plan = getSubscriptionPlan(organization.plan);
  if (plan.campaignLimit !== "Unlimited" && campaigns.length >= plan.campaignLimit) {
    return `Your ${organization.plan} plan allows ${plan.campaignLimit} campaign(s). Upgrade or close an old campaign.`;
  }
  return "";
}

export function getPublishCampaignBlockReason(
  campaign: Campaign,
  organization: Organization,
  campaigns: Campaign[]
): string {
  const subscriptionReason = getSubscriptionBlockReason(organization);
  if (subscriptionReason) return subscriptionReason;
  const plan = getSubscriptionPlan(organization.plan);
  const activeOtherCampaigns = campaigns.filter(
    (item) =>
      item.id !== campaign.id &&
      (item.status === "Published" || item.status === "Paused")
  ).length;
  if (
    plan.campaignLimit !== "Unlimited" &&
    activeOtherCampaigns >= plan.campaignLimit &&
    campaign.status !== "Published"
  ) {
    return `Your ${organization.plan} plan allows ${plan.campaignLimit} active campaign(s). Upgrade to publish more.`;
  }
  return "";
}

export function getSigningBlockReason(
  campaign: Campaign,
  organization: Organization,
  signers: Signer[]
): string {
  if (campaign.status !== "Published")
    return "This campaign is not currently open for signing.";
  const subscriptionReason = getSubscriptionBlockReason(organization);
  if (subscriptionReason) return subscriptionReason;
  if (getMonthlySignerCount(signers) >= getEffectiveSignatureLimit(organization)) {
    return "This campaign owner has reached the monthly signer limit for the current plan.";
  }
  return "";
}

export function getSubscriptionStatusDetail(organization: Organization): string {
  if (organization.subscriptionStatus === "Trial") {
    return organization.trialEndsAt
      ? `Trial ends on ${organization.trialEndsAt}`
      : "Trial active; publish starts 1-day window";
  }
  return organization.subscriptionStatus === "Active"
    ? "Subscription active"
    : "Publishing/signing may be blocked";
}

export function formatPlanLimit(limit: number | "Unlimited"): string {
  return limit === "Unlimited" ? "Unlimited" : String(limit);
}
