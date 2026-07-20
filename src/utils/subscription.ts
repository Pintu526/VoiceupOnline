import { subscriptionPlans } from "../data.ts";
import { startOfToday } from "./campaign.ts";
import type {
  BillingCadence,
  BillingPlan,
  Campaign,
  Organization,
  ScanReviewItem,
  Signer
} from "../types";

export const pricingFeatureCatalog = [
  {
    key: "basic_templates",
    label: "Basic templates",
    includedFrom: "Starter" as BillingPlan,
    addOnPriceInr: 0,
    description: "Starter campaign templates for common public causes."
  },
  {
    key: "advanced_templates",
    label: "Advanced templates",
    includedFrom: "Growth" as BillingPlan,
    addOnPriceInr: 999,
    description: "Expanded templates for petitions, movements, authorities, and field teams."
  },
  {
    key: "ai_copilot",
    label: "AI Copilot",
    includedFrom: "Growth" as BillingPlan,
    addOnPriceInr: 1999,
    description: "Draft campaign copy, supporter updates, and authority letters."
  },
  {
    key: "authority_intelligence",
    label: "Authority intelligence",
    includedFrom: "Growth" as BillingPlan,
    addOnPriceInr: 1499,
    description: "Provider-ready routing recommendations and authority mapping."
  },
  {
    key: "field_collection",
    label: "Field collection",
    includedFrom: "Growth" as BillingPlan,
    addOnPriceInr: 999,
    description: "Offline and scan-assisted field supporter collection."
  },
  {
    key: "communication_hub",
    label: "Communication hub",
    includedFrom: "Growth" as BillingPlan,
    addOnPriceInr: 1999,
    description: "Provider-ready WhatsApp, SMS, email, and update workflows."
  },
  {
    key: "movement_crm",
    label: "Movement CRM",
    includedFrom: "Pro Movement" as BillingPlan,
    addOnPriceInr: 2999,
    description: "Supporter, volunteer, referral, and engagement graph."
  },
  {
    key: "growth_engine",
    label: "Growth Engine",
    includedFrom: "Pro Movement" as BillingPlan,
    addOnPriceInr: 2999,
    description: "Event-driven referral, ambassador, reward, and leaderboard foundation."
  },
  {
    key: "command_center",
    label: "Command Center",
    includedFrom: "Pro Movement" as BillingPlan,
    addOnPriceInr: 2999,
    description: "Live movement operations dashboard and task orchestration."
  },
  {
    key: "bulk_import",
    label: "Bulk import",
    includedFrom: "Pro Movement" as BillingPlan,
    addOnPriceInr: 1499,
    description: "CSV imports for supporters, authority masters, and field data."
  },
  {
    key: "advanced_reports",
    label: "Advanced reports",
    includedFrom: "Pro Movement" as BillingPlan,
    addOnPriceInr: 1999,
    description: "Regional, local, movement, and export-ready reporting."
  },
  {
    key: "custom_branding",
    label: "Custom branding",
    includedFrom: "Pro Movement" as BillingPlan,
    addOnPriceInr: 2499,
    description: "Customer logo, campaign identity, and domain readiness."
  },
  {
    key: "multi_organization",
    label: "Multi-organization",
    includedFrom: "Enterprise" as BillingPlan,
    addOnPriceInr: 0,
    description: "Enterprise-only parent and child workspace structure."
  },
  {
    key: "roles",
    label: "Roles",
    includedFrom: "Enterprise" as BillingPlan,
    addOnPriceInr: 0,
    description: "Owner, admin, campaign admin, reviewer, and viewer controls."
  },
  {
    key: "integrations",
    label: "Integrations",
    includedFrom: "Enterprise" as BillingPlan,
    addOnPriceInr: 0,
    description: "Custom provider contracts, webhooks, and implementation support."
  }
];

const cadenceLabels: Record<BillingCadence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  campaign_duration: "Campaign duration",
  supporter_count: "Supporter count",
  feature_based: "Feature based",
  enterprise_quote: "Enterprise quote"
};

export function getSubscriptionPlan(planName: BillingPlan) {
  const normalizedPlanName = planName === "Professional" ? "Growth" : planName;
  return subscriptionPlans.find((plan) => plan.name === normalizedPlanName) ?? subscriptionPlans[0];
}

export function getDefaultMessageLimit(planName: BillingPlan): number {
  return getSubscriptionPlan(planName).monthlyMessageLimit;
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
  campaigns: Campaign[],
  _isBackendConfigured = true
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
      ? getTrialCountdownLabel(organization)
      : "Trial active; publish starts 1-day window";
  }
  return organization.subscriptionStatus === "Active"
    ? "Subscription active"
    : "Publishing/signing may be blocked";
}

export function formatPlanLimit(limit: number | "Unlimited"): string {
  return limit === "Unlimited" ? "Unlimited" : String(limit);
}

export function formatInr(amount: number): string {
  return `INR ${Math.max(0, Math.round(amount)).toLocaleString()}`;
}

export function getTrialDaysRemaining(organization: Organization): number {
  if (!organization.trialEndsAt) return 0;
  const endTime = new Date(`${organization.trialEndsAt}T23:59:59`).getTime();
  const remainingMs = endTime - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 86_400_000));
}

export function getTrialCountdownLabel(organization: Organization): string {
  const days = getTrialDaysRemaining(organization);
  if (!organization.trialEndsAt) return "Trial active; publish starts 1-day window";
  if (days === 0) return `Trial ended on ${organization.trialEndsAt}`;
  if (days === 1) return `1 day trial remaining; ends on ${organization.trialEndsAt}`;
  return `${days} days trial remaining; ends on ${organization.trialEndsAt}`;
}

export function getPlanCadencePrice(planName: BillingPlan, cadence: BillingCadence): number | null {
  const plan = getSubscriptionPlan(planName);
  if (cadence === "enterprise_quote") return null;
  if (cadence === "quarterly") return plan.quarterlyPriceInr ?? plan.monthlyPriceInr;
  if (cadence === "yearly") return plan.yearlyPriceInr ?? plan.monthlyPriceInr;
  return plan.monthlyPriceInr;
}

export function isFeatureIncludedInPlan(planName: BillingPlan, featureKey: string): boolean {
  return getSubscriptionPlan(planName).featureKeys.includes(featureKey);
}

export function getEnabledFeatureAddOnTotal(organization: Organization): number {
  const enabled = new Set(organization.enabledFeatureKeys ?? []);
  return pricingFeatureCatalog.reduce((total, feature) => {
    if (!enabled.has(feature.key)) return total;
    if (isFeatureIncludedInPlan(organization.plan, feature.key)) return total;
    return total + feature.addOnPriceInr;
  }, 0);
}

export function calculateSubscriptionEstimate(organization: Organization) {
  const plan = getSubscriptionPlan(organization.plan);
  const cadence = organization.billingCadence ?? "monthly";
  const days = Math.max(1, organization.campaignDurationDays ?? 30);
  const supporters = Math.max(0, organization.supporterCountEstimate ?? 0);
  const featureAddOns = getEnabledFeatureAddOnTotal(organization);

  if (plan.name === "Enterprise" || cadence === "enterprise_quote") {
    return {
      amount: null as number | null,
      label: "Custom enterprise quote",
      cadenceLabel: cadenceLabels[cadence],
      lineItems: [
        "Custom limits, integrations, roles, and support",
        featureAddOns > 0 ? `${formatInr(featureAddOns)} selected feature add-ons noted for quote` : "Feature scope captured for quote"
      ]
    };
  }

  const monthlyPrice = plan.monthlyPriceInr ?? 0;
  let amount = monthlyPrice;
  let basis = "Monthly subscription";

  if (cadence === "quarterly") {
    amount = plan.quarterlyPriceInr ?? monthlyPrice * 3;
    basis = "Quarterly subscription";
  }
  if (cadence === "yearly") {
    amount = plan.yearlyPriceInr ?? monthlyPrice * 12;
    basis = "Yearly subscription";
  }
  if (cadence === "campaign_duration") {
    amount = Math.max(0, Math.round((plan.campaignDurationPriceInr ?? monthlyPrice / 30) * days));
    basis = `${days.toLocaleString()} campaign day(s)`;
  }
  if (cadence === "supporter_count") {
    amount = Math.max(0, Math.round((plan.supporterPriceInr ?? 0) * supporters));
    basis = `${supporters.toLocaleString()} supporter estimate`;
  }
  if (cadence === "feature_based") {
    amount = monthlyPrice + featureAddOns;
    basis = "Base plan plus selected feature add-ons";
  }

  const total = amount + (cadence === "feature_based" ? 0 : featureAddOns);
  return {
    amount: total,
    label: formatInr(total),
    cadenceLabel: cadenceLabels[cadence],
    lineItems: [
      basis,
      featureAddOns > 0 ? `${formatInr(featureAddOns)} feature add-ons` : "No billable feature add-ons",
      plan.pricePerSignatureInr ? `${formatInr(plan.pricePerSignatureInr)} configured per-sign benchmark` : "No per-sign benchmark"
    ]
  };
}

export function getSignatureWalletCapacity(organization: Organization): number {
  const price = organization.signaturePriceInr ?? getSubscriptionPlan(organization.plan).pricePerSignatureInr ?? 0;
  if (price <= 0) return 0;
  return Math.floor((organization.signatureWalletBalanceInr ?? 0) / price);
}

export function createProviderReadySignaturePin(prefix: string): string {
  const cleanPrefix = (prefix || "VUP").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "VUP";
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${cleanPrefix}-${Date.now().toString().slice(-6)}-${randomPart}`;
}
